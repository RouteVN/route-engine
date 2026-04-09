import { current, isDraft } from "immer";
import {
  createStore,
  getDefaultVariablesFromProjectData,
  validateVariableScope,
  validateVariableOperation,
  applyVariableOperation,
  filterVariablesByScope,
  diffPresentationState,
  normalizePersistentPresentationState,
} from "../util.js";
import { constructPresentationState } from "./constructPresentationState.js";
import { constructRenderState } from "./constructRenderState.js";

const DEFAULT_NEXT_LINE_CONFIG = {
  manual: {
    enabled: true,
    requireLineCompleted: false,
  },
  auto: {
    enabled: false,
  },
  applyMode: "persistent",
};

const CURRENT_SAVE_FORMAT_VERSION = 1;

const createDefaultNextLineConfig = () => ({
  manual: { ...DEFAULT_NEXT_LINE_CONFIG.manual },
  auto: { ...DEFAULT_NEXT_LINE_CONFIG.auto },
  applyMode: DEFAULT_NEXT_LINE_CONFIG.applyMode,
});

const resetNextLineConfigIfSingleLine = (state) => {
  const applyMode = state.global.nextLineConfig?.applyMode ?? "persistent";
  if (applyMode !== "singleLine") {
    return;
  }

  const wasAutoEnabled = state.global.nextLineConfig?.auto?.enabled === true;

  state.global.nextLineConfig = {
    ...createDefaultNextLineConfig(),
  };

  // Ensure stale timers cannot fire after single-line config is consumed.
  if (wasAutoEnabled) {
    state.global.pendingEffects.push({
      name: "clearNextLineConfigTimer",
    });
  }
};

const cloneStateValue = (value) => {
  const source = isDraft(value) ? current(value) : value;
  return structuredClone(source);
};

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const toSlotStorageKey = (slotId) => String(slotId);

const createDefaultViewedRegistry = () => ({
  sections: [],
  resources: [],
});

const createDefaultHistoryPointer = () => ({
  sectionId: undefined,
  lineId: undefined,
});

const buildDialogueHistoryText = (content) => {
  if (!Array.isArray(content)) {
    return "";
  }

  return content.map((item) => item?.text ?? "").join("");
};

const createDefaultBgmState = () => ({
  resourceId: undefined,
});

const normalizeLegacyManualNextLineConfig = (manual) => {
  if (!isRecord(manual)) {
    return manual;
  }

  const normalizedManual = { ...manual };
  if (
    Object.prototype.hasOwnProperty.call(normalizedManual, "requireComplete") &&
    !Object.prototype.hasOwnProperty.call(
      normalizedManual,
      "requireLineCompleted",
    )
  ) {
    normalizedManual.requireLineCompleted = normalizedManual.requireComplete;
  }

  delete normalizedManual.requireComplete;
  return normalizedManual;
};

const findSectionInProjectData = (projectData, sectionId) => {
  const scenes = projectData?.story?.scenes ?? {};

  for (const [sceneId, scene] of Object.entries(scenes)) {
    if (scene?.sections?.[sectionId]) {
      return {
        sceneId,
        section: scene.sections[sectionId],
      };
    }
  }

  return {
    sceneId: undefined,
    section: undefined,
  };
};

const assertUniqueSectionIds = (projectData) => {
  const scenes = projectData?.story?.scenes ?? {};
  const seenSectionIds = new Map();

  for (const [sceneId, scene] of Object.entries(scenes)) {
    const sections = scene?.sections ?? {};
    for (const sectionId of Object.keys(sections)) {
      const previousSceneId = seenSectionIds.get(sectionId);
      if (previousSceneId !== undefined) {
        throw new Error(
          `Duplicate sectionId "${sectionId}" found in scenes "${previousSceneId}" and "${sceneId}". Section IDs must be globally unique.`,
        );
      }
      seenSectionIds.set(sectionId, sceneId);
    }
  }
};

const normalizeStoredSlotId = (slotId) => {
  if (typeof slotId === "number") {
    return slotId;
  }

  if (typeof slotId !== "string") {
    return slotId;
  }

  const numericSlotId = Number(slotId);
  return Number.isFinite(numericSlotId) ? numericSlotId : slotId;
};

const normalizeSaveSlotFormatVersion = (formatVersion) => {
  if (!Number.isInteger(formatVersion) || formatVersion < 1) {
    throw new Error("Malformed save slot formatVersion.");
  }

  if (formatVersion !== CURRENT_SAVE_FORMAT_VERSION) {
    throw new Error(`Unsupported save slot formatVersion "${formatVersion}".`);
  }

  return formatVersion;
};

const normalizeStoredSaveSlot = (storageKey, saveSlot = {}) => {
  let formatVersion;
  try {
    formatVersion = normalizeSaveSlotFormatVersion(saveSlot.formatVersion);
  } catch (error) {
    throw new Error(
      `Hydrated save slot "${storageKey}" failed validation: ${error.message}`,
    );
  }

  const normalizedSaveSlot = {
    ...saveSlot,
    formatVersion,
    slotId: normalizeStoredSlotId(
      saveSlot.slotId ?? saveSlot.slotKey ?? storageKey,
    ),
    savedAt:
      typeof saveSlot.savedAt === "number" ? saveSlot.savedAt : saveSlot.date,
  };

  delete normalizedSaveSlot.slotKey;
  delete normalizedSaveSlot.date;

  return normalizedSaveSlot;
};

const normalizeStoredSaveSlots = (saveSlots = {}) => {
  return Object.fromEntries(
    Object.entries(saveSlots).map(([storageKey, saveSlot]) => [
      storageKey,
      normalizeStoredSaveSlot(storageKey, saveSlot),
    ]),
  );
};

const normalizeLoadedViewedRegistryEntry = (entry, type, index) => {
  const keyName = type === "sections" ? "sectionId" : "resourceId";

  if (typeof entry === "string" || typeof entry === "number") {
    return {
      [keyName]: String(entry),
    };
  }

  if (!isRecord(entry)) {
    throw new Error(
      `Malformed save slot viewedRegistry.${type}[${index}] entry.`,
    );
  }

  if (typeof entry[keyName] !== "string" || entry[keyName].length === 0) {
    throw new Error(
      `Malformed save slot viewedRegistry.${type}[${index}] entry: missing ${keyName}.`,
    );
  }

  if (type === "sections") {
    const normalizedEntry = {
      sectionId: entry.sectionId,
    };

    if (
      entry.lastLineId !== undefined &&
      entry.lastLineId !== null &&
      typeof entry.lastLineId !== "string"
    ) {
      throw new Error(
        `Malformed save slot viewedRegistry.sections[${index}] entry: invalid lastLineId.`,
      );
    }

    if (typeof entry.lastLineId === "string" && entry.lastLineId.length > 0) {
      normalizedEntry.lastLineId = entry.lastLineId;
    }

    return normalizedEntry;
  }

  return {
    resourceId: entry.resourceId,
  };
};

const normalizeLoadedViewedRegistry = (viewedRegistry) => {
  if (viewedRegistry === undefined) {
    return createDefaultViewedRegistry();
  }

  if (!isRecord(viewedRegistry)) {
    throw new Error("Malformed save slot viewedRegistry.");
  }

  if (
    viewedRegistry.sections !== undefined &&
    !Array.isArray(viewedRegistry.sections)
  ) {
    throw new Error("Malformed save slot viewedRegistry.sections.");
  }

  if (
    viewedRegistry.resources !== undefined &&
    !Array.isArray(viewedRegistry.resources)
  ) {
    throw new Error("Malformed save slot viewedRegistry.resources.");
  }

  const sections = viewedRegistry.sections ?? [];
  const resources = viewedRegistry.resources ?? [];

  return {
    sections: Object.values(
      Object.fromEntries(
        sections.map((entry, index) => {
          const normalizedEntry = normalizeLoadedViewedRegistryEntry(
            entry,
            "sections",
            index,
          );
          return [normalizedEntry.sectionId, normalizedEntry];
        }),
      ),
    ),
    resources: Object.values(
      Object.fromEntries(
        resources.map((entry, index) => {
          const normalizedEntry = normalizeLoadedViewedRegistryEntry(
            entry,
            "resources",
            index,
          );
          return [normalizedEntry.resourceId, normalizedEntry];
        }),
      ),
    ),
  };
};

const normalizeLoadedReadPointer = (pointer, projectData, path) => {
  if (!isRecord(pointer)) {
    throw new Error(`Malformed save slot ${path}.`);
  }

  const { sectionId, lineId } = pointer;
  if (typeof sectionId !== "string" || sectionId.length === 0) {
    throw new Error(`Malformed save slot ${path}: missing sectionId.`);
  }
  if (typeof lineId !== "string" || lineId.length === 0) {
    throw new Error(`Malformed save slot ${path}: missing lineId.`);
  }

  const { sceneId, section } = findSectionInProjectData(projectData, sectionId);
  if (!section) {
    throw new Error(
      `Malformed save slot ${path}: section "${sectionId}" does not exist in projectData.`,
    );
  }

  const lineExists = section.lines?.some((line) => line.id === lineId);
  if (!lineExists) {
    throw new Error(
      `Malformed save slot ${path}: line "${lineId}" does not exist in section "${sectionId}".`,
    );
  }

  return {
    sceneId,
    sectionId,
    lineId,
  };
};

const normalizeLoadedHistoryPointer = (pointer, projectData) => {
  if (!isRecord(pointer)) {
    return createDefaultHistoryPointer();
  }

  if (
    typeof pointer.sectionId !== "string" ||
    pointer.sectionId.length === 0 ||
    typeof pointer.lineId !== "string" ||
    pointer.lineId.length === 0
  ) {
    return createDefaultHistoryPointer();
  }

  try {
    const normalizedPointer = normalizeLoadedReadPointer(
      pointer,
      projectData,
      "contexts[*].pointers.history",
    );

    return {
      sectionId: normalizedPointer.sectionId,
      lineId: normalizedPointer.lineId,
    };
  } catch {
    return createDefaultHistoryPointer();
  }
};

const normalizeLoadedRollback = (rollback, readPointer, projectData) => {
  if (!isRecord(rollback) || !Array.isArray(rollback.timeline)) {
    return createRollbackState({
      pointer: readPointer,
      replayStartIndex: 1,
    });
  }

  const timeline = rollback.timeline.flatMap((checkpoint, index) => {
    if (!isRecord(checkpoint)) {
      return [];
    }

    try {
      const normalizedPointer = normalizeLoadedReadPointer(
        checkpoint,
        projectData,
        `rollback.timeline[${index}]`,
      );
      const normalizedCheckpoint = createRollbackCheckpoint({
        sectionId: normalizedPointer.sectionId,
        lineId: normalizedPointer.lineId,
        rollbackPolicy: checkpoint.rollbackPolicy,
      });

      if (Array.isArray(checkpoint.executedActions)) {
        normalizedCheckpoint.executedActions = cloneStateValue(
          checkpoint.executedActions,
        );
      }

      return [normalizedCheckpoint];
    } catch {
      return [];
    }
  });

  if (timeline.length === 0) {
    return createRollbackState({
      pointer: readPointer,
      replayStartIndex: 1,
    });
  }

  let currentIndex =
    typeof rollback.currentIndex === "number"
      ? Math.trunc(rollback.currentIndex)
      : timeline.length - 1;

  if (currentIndex < 0 || currentIndex >= timeline.length) {
    currentIndex = timeline.length - 1;
  }

  const checkpointAtCurrentIndex = timeline[currentIndex];
  if (
    checkpointAtCurrentIndex?.sectionId !== readPointer.sectionId ||
    checkpointAtCurrentIndex?.lineId !== readPointer.lineId
  ) {
    const matchingIndex = timeline.findLastIndex(
      (checkpoint) =>
        checkpoint.sectionId === readPointer.sectionId &&
        checkpoint.lineId === readPointer.lineId,
    );

    if (matchingIndex >= 0) {
      currentIndex = matchingIndex;
    } else {
      timeline.push(
        createRollbackCheckpoint({
          sectionId: readPointer.sectionId,
          lineId: readPointer.lineId,
        }),
      );
      currentIndex = timeline.length - 1;
    }
  }

  const replayStartIndex =
    typeof rollback.replayStartIndex === "number"
      ? Math.min(
          Math.max(Math.trunc(rollback.replayStartIndex), 0),
          currentIndex,
        )
      : 0;

  return {
    currentIndex,
    isRestoring: false,
    replayStartIndex,
    timeline,
  };
};

const normalizeLoadedContext = (context, projectData, index) => {
  if (!isRecord(context)) {
    throw new Error(`Malformed save slot contexts[${index}] entry.`);
  }

  const contextVariableDefaults =
    getRollbackContextVariableDefaults(projectData);
  const readPointer = normalizeLoadedReadPointer(
    context.pointers?.read,
    projectData,
    `contexts[${index}].pointers.read`,
  );

  if (context.variables !== undefined && !isRecord(context.variables)) {
    throw new Error(`Malformed save slot contexts[${index}].variables entry.`);
  }

  const historyPointer = normalizeLoadedHistoryPointer(
    context.pointers?.history,
    projectData,
  );

  const normalizedContext = {
    currentPointerMode:
      context.currentPointerMode === "history" && historyPointer.lineId
        ? "history"
        : "read",
    pointers: {
      read: readPointer,
      history: historyPointer,
    },
    configuration: isRecord(context.configuration)
      ? cloneStateValue(context.configuration)
      : {},
    views: Array.isArray(context.views) ? cloneStateValue(context.views) : [],
    bgm: isRecord(context.bgm)
      ? cloneStateValue(context.bgm)
      : {
          resourceId: undefined,
        },
    variables: {
      ...contextVariableDefaults,
      ...(context.variables ? cloneStateValue(context.variables) : {}),
    },
    rollback: normalizeLoadedRollback(
      context.rollback,
      readPointer,
      projectData,
    ),
  };

  return normalizedContext;
};

const normalizeLoadedSlotState = (slotState, projectData) => {
  if (!isRecord(slotState)) {
    throw new Error("Malformed save slot state.");
  }

  if (!Array.isArray(slotState.contexts) || slotState.contexts.length === 0) {
    throw new Error(
      "Malformed save slot state: contexts must be a non-empty array.",
    );
  }

  return {
    viewedRegistry: normalizeLoadedViewedRegistry(slotState.viewedRegistry),
    contexts: slotState.contexts.map((context, index) =>
      normalizeLoadedContext(context, projectData, index),
    ),
  };
};

const normalizeLoadedSaveSlot = (saveSlot, projectData) => {
  if (!isRecord(saveSlot)) {
    throw new Error("Malformed save slot.");
  }

  const formatVersion = normalizeSaveSlotFormatVersion(saveSlot.formatVersion);

  return {
    ...saveSlot,
    formatVersion,
    state: normalizeLoadedSlotState(saveSlot.state, projectData),
  };
};

const normalizeConfirmDialogActionBatch = (
  actions,
  fieldName,
  { required = false } = {},
) => {
  if (actions === undefined) {
    if (required) {
      throw new Error(`showConfirmDialog requires ${fieldName}`);
    }

    return {
      hideConfirmDialog: {},
    };
  }

  if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
    throw new Error(`showConfirmDialog ${fieldName} must be an action object`);
  }

  const normalizedActions = cloneStateValue(actions);
  if (
    !Object.prototype.hasOwnProperty.call(
      normalizedActions,
      "hideConfirmDialog",
    )
  ) {
    normalizedActions.hideConfirmDialog = {};
  }

  return normalizedActions;
};

const normalizeConfirmDialogPayload = (payload = {}) => {
  if (!payload?.resourceId) {
    throw new Error("showConfirmDialog requires resourceId");
  }

  return {
    resourceId: payload.resourceId,
    confirmActions: normalizeConfirmDialogActionBatch(
      payload.confirmActions,
      "confirmActions",
      { required: true },
    ),
    cancelActions: normalizeConfirmDialogActionBatch(
      payload.cancelActions,
      "cancelActions",
    ),
  };
};

const clearConfirmDialog = (state) => {
  if (Object.prototype.hasOwnProperty.call(state.global, "confirmDialog")) {
    state.global.confirmDialog = null;
  }
};

const rollbackActionBatchStack = [];

const getActiveRollbackActionBatch = () =>
  rollbackActionBatchStack[rollbackActionBatchStack.length - 1] ?? null;

const setActiveRollbackBatchCheckpoint = (checkpointIndex) => {
  const activeBatch = getActiveRollbackActionBatch();
  if (activeBatch) {
    activeBatch.checkpointIndex = checkpointIndex;
  }
};

const markPendingStorySessionReset = () => {
  const activeBatch = getActiveRollbackActionBatch();
  if (activeBatch) {
    activeBatch.pendingStorySessionReset = true;
  }
};

const consumePendingStorySessionReset = () => {
  const activeBatch = getActiveRollbackActionBatch();
  if (!activeBatch?.pendingStorySessionReset) {
    return false;
  }

  delete activeBatch.pendingStorySessionReset;
  return true;
};

const createRollbackCheckpoint = ({ sectionId, lineId, rollbackPolicy }) => ({
  sectionId,
  lineId,
  rollbackPolicy: rollbackPolicy ?? "free",
});

const getRollbackContextVariableDefaults = (projectData) => {
  const { contextVariableDefaultValues } = getDefaultVariablesFromProjectData(
    projectData ?? {},
  );
  return cloneStateValue(contextVariableDefaultValues);
};

const createDefaultContextState = ({ pointer, projectData }) => ({
  currentPointerMode: "read",
  pointers: {
    read: cloneStateValue(pointer),
    history: createDefaultHistoryPointer(),
  },
  configuration: {},
  views: [],
  bgm: createDefaultBgmState(),
  variables: getRollbackContextVariableDefaults(projectData),
  rollback: createRollbackState({
    pointer,
  }),
});

const resetStorySessionTransientGlobals = (state) => {
  state.global.autoMode = false;
  state.global.skipMode = false;
  state.global.dialogueUIHidden = false;
  delete state.global.isDialogueHistoryShowing;
  clearConfirmDialog(state);
  state.global.viewedRegistry = createDefaultViewedRegistry();
  state.global.nextLineConfig = createDefaultNextLineConfig();
  state.global.layeredViews = [];
  state.global.isLineCompleted = true;

  state.global.pendingEffects.push(
    { name: "clearAutoNextTimer" },
    { name: "clearSkipNextTimer" },
    { name: "clearNextLineConfigTimer" },
    { name: "render" },
  );
};

const removeLegacyRollbackBaseline = (rollback) => {
  if (!rollback || !("baselineVariables" in rollback)) {
    return;
  }

  delete rollback.baselineVariables;
};

const createRollbackState = ({ pointer, replayStartIndex = 0 }) => {
  const hasInitialPointer = pointer?.sectionId && pointer?.lineId;

  return {
    currentIndex: hasInitialPointer ? 0 : -1,
    isRestoring: false,
    replayStartIndex,
    timeline: hasInitialPointer
      ? [
          createRollbackCheckpoint({
            sectionId: pointer.sectionId,
            lineId: pointer.lineId,
          }),
        ]
      : [],
  };
};

const ensureRollbackState = (lastContext, options = {}) => {
  if (lastContext?.rollback) {
    removeLegacyRollbackBaseline(lastContext.rollback);
    if (!Array.isArray(lastContext.rollback.timeline)) {
      lastContext.rollback.timeline = [];
    }
    if (typeof lastContext.rollback.currentIndex !== "number") {
      lastContext.rollback.currentIndex =
        lastContext.rollback.timeline.length > 0
          ? lastContext.rollback.timeline.length - 1
          : -1;
    }
    if (typeof lastContext.rollback.isRestoring !== "boolean") {
      lastContext.rollback.isRestoring = false;
    }
    if (typeof lastContext.rollback.replayStartIndex !== "number") {
      lastContext.rollback.replayStartIndex = 0;
    }
    return lastContext.rollback;
  }

  const pointer = lastContext?.pointers?.read;
  lastContext.rollback = createRollbackState({
    pointer,
    replayStartIndex: options.compatibilityAnchor ? 1 : 0,
  });
  return lastContext.rollback;
};

const appendRollbackCheckpoint = (state, payload) => {
  const lastContext = state.contexts?.[state.contexts.length - 1];
  if (!lastContext) {
    return;
  }

  const rollback = ensureRollbackState(lastContext);
  if (rollback.isRestoring) {
    return;
  }

  if (rollback.currentIndex < rollback.timeline.length - 1) {
    rollback.timeline = rollback.timeline.slice(0, rollback.currentIndex + 1);
  }

  const lastCheckpoint = rollback.timeline[rollback.timeline.length - 1];
  if (
    lastCheckpoint?.sectionId === payload.sectionId &&
    lastCheckpoint?.lineId === payload.lineId &&
    (lastCheckpoint?.rollbackPolicy ?? "free") ===
      (payload.rollbackPolicy ?? "free")
  ) {
    rollback.currentIndex = rollback.timeline.length - 1;
    return;
  }

  rollback.timeline.push(createRollbackCheckpoint(payload));
  rollback.currentIndex = rollback.timeline.length - 1;
};

const getCurrentRollbackCheckpoint = (state) => {
  const lastContext = state.contexts?.[state.contexts.length - 1];
  const rollback = lastContext?.rollback;

  if (
    !rollback ||
    rollback.isRestoring ||
    !Array.isArray(rollback.timeline) ||
    typeof rollback.currentIndex !== "number"
  ) {
    return null;
  }

  const activeBatch =
    rollbackActionBatchStack[rollbackActionBatchStack.length - 1];
  const checkpointIndex =
    typeof activeBatch?.checkpointIndex === "number"
      ? activeBatch.checkpointIndex
      : rollback.currentIndex;

  if (checkpointIndex < 0 || checkpointIndex >= rollback.timeline.length) {
    return null;
  }

  if (
    typeof activeBatch?.checkpointIndex !== "number" &&
    checkpointIndex < rollback.timeline.length - 1
  ) {
    rollback.timeline = rollback.timeline.slice(0, checkpointIndex + 1);
  }

  return rollback.timeline[checkpointIndex] ?? null;
};

export const beginRollbackActionBatch = ({ state }) => {
  const lastContext = state.contexts?.[state.contexts.length - 1];
  const rollback = lastContext?.rollback;
  if (
    !rollback ||
    rollback.isRestoring ||
    !Array.isArray(rollback.timeline) ||
    typeof rollback.currentIndex !== "number" ||
    rollback.currentIndex < 0 ||
    rollback.currentIndex >= rollback.timeline.length
  ) {
    rollbackActionBatchStack.push({ checkpointIndex: null });
    return state;
  }

  if (rollback.currentIndex < rollback.timeline.length - 1) {
    rollback.timeline = rollback.timeline.slice(0, rollback.currentIndex + 1);
  }

  rollbackActionBatchStack.push({
    checkpointIndex: rollback.currentIndex,
  });
  return state;
};

export const endRollbackActionBatch = ({ state }) => {
  rollbackActionBatchStack.pop();
  return state;
};

const recordRollbackAction = (state, actionType, payload) => {
  const checkpoint = getCurrentRollbackCheckpoint(state);
  if (!checkpoint) {
    return;
  }

  if (!Array.isArray(checkpoint.executedActions)) {
    checkpoint.executedActions = [];
  }

  checkpoint.executedActions.push({
    type: actionType,
    payload: cloneStateValue(payload),
  });
};

const applyRollbackCheckpointUpdateVariable = (state, payload) => {
  const lastContext = state.contexts?.[state.contexts.length - 1];
  if (!lastContext) {
    return;
  }

  const operations = payload?.operations ?? [];
  for (const { variableId, op, value } of operations) {
    const variableConfig = state.projectData.resources?.variables?.[variableId];
    const scope = variableConfig?.scope;
    const type = variableConfig?.type;

    validateVariableScope(scope, variableId);
    validateVariableOperation(type, op, variableId);

    if (scope === "context") {
      lastContext.variables[variableId] = applyVariableOperation(
        lastContext.variables[variableId],
        op,
        value,
      );
    }
  }
};

const replayRecordedRollbackActions = (state, checkpoint) => {
  if (!Array.isArray(checkpoint?.executedActions)) {
    return false;
  }

  const restorableActions = {
    showDialogueUI,
    hideDialogueUI,
    toggleDialogueUI,
    setNextLineConfig,
    pushLayeredView,
    popLayeredView,
    replaceLastLayeredView,
    clearLayeredViews,
  };

  checkpoint.executedActions.forEach(({ type, payload }) => {
    if (type === "updateVariable") {
      applyRollbackCheckpointUpdateVariable(state, payload);
      return;
    }

    const action = restorableActions[type];
    if (!action) {
      return;
    }

    action({ state }, payload);
  });

  return true;
};

const applyRollbackableLineActions = (state, payload) => {
  const { sectionId, lineId } = payload;
  const section = selectSection({ state }, { sectionId });
  const line = section?.lines?.find((item) => item.id === lineId);
  const updateVariableAction = line?.actions?.updateVariable;

  if (!updateVariableAction) {
    return;
  }

  const lastContext = state.contexts?.[state.contexts.length - 1];
  if (!lastContext) {
    return;
  }

  const operations = updateVariableAction.operations || [];
  for (const { variableId, op, value } of operations) {
    const variableConfig = state.projectData.resources?.variables?.[variableId];
    const scope = variableConfig?.scope;
    const type = variableConfig?.type;

    validateVariableScope(scope, variableId);
    validateVariableOperation(type, op, variableId);

    if (scope === "context") {
      lastContext.variables[variableId] = applyVariableOperation(
        lastContext.variables[variableId],
        op,
        value,
      );
    }
  }
};

const applyRollbackRestorableLineActions = (state, payload) => {
  const { sectionId, lineId } = payload;
  const section = selectSection({ state }, { sectionId });
  const line = section?.lines?.find((item) => item.id === lineId);
  const actions = line?.actions;

  if (!actions) {
    return;
  }

  const restorableActions = {
    showDialogueUI,
    hideDialogueUI,
    toggleDialogueUI,
    setNextLineConfig,
    pushLayeredView,
    popLayeredView,
    replaceLastLayeredView,
    clearLayeredViews,
  };

  Object.entries(actions).forEach(([actionType, actionPayload]) => {
    const action = restorableActions[actionType];
    if (!action) {
      return;
    }

    action({ state }, actionPayload);
  });
};

const restoreRollbackCheckpoint = (state, checkpointIndex) => {
  const lastContext = state.contexts?.[state.contexts.length - 1];
  if (!lastContext) {
    return state;
  }

  const rollback = ensureRollbackState(lastContext);
  const checkpoint = rollback.timeline[checkpointIndex];
  if (!checkpoint) {
    return state;
  }

  if (state.global.autoMode) {
    stopAutoMode({ state });
  }
  if (state.global.skipMode) {
    stopSkipMode({ state });
  }

  state.global.pendingEffects.push({
    name: "clearNextLineConfigTimer",
  });

  rollback.isRestoring = true;
  rollback.currentIndex = checkpointIndex;

  try {
    lastContext.variables = getRollbackContextVariableDefaults(
      state.projectData,
    );
    state.global.dialogueUIHidden = false;
    delete state.global.isDialogueHistoryShowing;
    state.global.nextLineConfig = cloneStateValue(DEFAULT_NEXT_LINE_CONFIG);
    state.global.layeredViews = [];
    clearConfirmDialog(state);
    state.global.isLineCompleted = true;

    const replayStartIndex = rollback.replayStartIndex ?? 0;
    for (let i = replayStartIndex; i <= checkpointIndex; i++) {
      if (i > replayStartIndex) {
        resetNextLineConfigIfSingleLine(state);
      }
      if (!replayRecordedRollbackActions(state, rollback.timeline[i])) {
        applyRollbackableLineActions(state, rollback.timeline[i]);
        applyRollbackRestorableLineActions(state, rollback.timeline[i]);
      }
    }

    lastContext.pointers.read = {
      sectionId: checkpoint.sectionId,
      lineId: checkpoint.lineId,
    };

    lastContext.currentPointerMode = "read";
    if (lastContext.pointers?.history) {
      lastContext.pointers.history = {
        sectionId: null,
        lineId: null,
      };
    }

    state.global.pendingEffects = state.global.pendingEffects.filter(
      (effect) => effect?.name !== "render",
    );

    state.global.pendingEffects.push({
      name: "render",
    });
  } finally {
    rollback.isRestoring = false;
  }

  return state;
};

export const createInitialState = (payload) => {
  const { projectData } = payload;
  const global = payload.global ?? {};
  const { saveSlots = {}, variables: loadedGlobalVariables = {} } = global;

  assertUniqueSectionIds(projectData);

  const initialSceneId = projectData.story.initialSceneId;
  const initialScene = projectData.story.scenes[initialSceneId];
  const initialSectionId = initialScene.initialSectionId;
  const initialSection = initialScene.sections[initialSectionId];

  const initialPointer = {
    sceneId: initialSceneId,
    sectionId: initialSectionId,
    lineId: initialSection.initialLineId ?? initialSection.lines[0].id,
  };

  // Get default variables from project data
  const { globalVariablesDefaultValues } =
    getDefaultVariablesFromProjectData(projectData);

  // Merge with loaded global variables from persisted browser storage (if provided)
  const globalVariables = {
    ...globalVariablesDefaultValues,
    ...loadedGlobalVariables,
  };

  const state = {
    projectData,
    global: {
      isLineCompleted: false,
      pendingEffects: [],
      autoMode: false,
      skipMode: false,
      dialogueUIHidden: false,
      confirmDialog: null,
      viewedRegistry: createDefaultViewedRegistry(),
      nextLineConfig: createDefaultNextLineConfig(),
      saveSlots: normalizeStoredSaveSlots(saveSlots),
      layeredViews: [],
      variables: globalVariables,
    },
    contexts: [
      createDefaultContextState({ pointer: initialPointer, projectData }),
    ],
  };
  return state;
};

/**************************
 * Selectors
 *************************/
export const selectLayeredViews = ({ state }) => {
  return state.global.layeredViews || [];
};

export const selectPendingEffects = ({ state }) => {
  return state.global.pendingEffects;
};

export const selectSkipMode = ({ state }) => {
  return state.global.skipMode;
};

export const selectAutoMode = ({ state }) => {
  return state.global.autoMode;
};

export const selectDialogueUIHidden = ({ state }) => {
  return state.global.dialogueUIHidden;
};

export const selectDialogueHistory = ({ state }) => {
  const contexts = Array.isArray(state.contexts) ? state.contexts : [];
  const lastContext = contexts[contexts.length - 1];
  if (!lastContext) {
    return [];
  }

  const { sectionId, lineId } = lastContext.pointers.read;
  const section = selectSection({ state }, { sectionId });

  if (!section?.lines || !Array.isArray(section.lines)) {
    return [];
  }

  // Get all lines up to and including the current line
  const currentLineIndex = section.lines.findIndex(
    (line) => line.id === lineId,
  );
  const linesUpToCurrent = section.lines.slice(0, currentLineIndex + 1);

  // Filter for lines that have dialogue content
  const historyContent = linesUpToCurrent
    .filter((line) => line.actions?.dialogue)
    .map((line) => {
      const dialogue = line.actions.dialogue;
      let characterName = "";
      if (dialogue.characterId) {
        const character =
          state.projectData.resources?.characters?.[dialogue.characterId];
        characterName = character?.name || "";
      }
      return {
        sectionId,
        lineId: line.id,
        content: dialogue.content,
        text: buildDialogueHistoryText(dialogue.content),
        characterId: dialogue.characterId,
        characterName: characterName,
      };
    });

  return historyContent;
};

export const selectConfirmDialog = ({ state }) => {
  return state.global.confirmDialog ?? null;
};

export const selectIsLineViewed = ({ state }, payload) => {
  const { sectionId, lineId } = payload;
  const section = state.global.viewedRegistry.sections.find(
    (section) => section.sectionId === sectionId,
  );

  if (!section) {
    return false;
  }

  // If section.lastLineId is undefined, it means the entire section is viewed
  if (section.lastLineId === undefined) {
    return true;
  }

  // If lineId is not provided, check if section exists (which it does at this point)
  if (lineId === undefined) {
    return true;
  }

  // If both section.lastLineId and lineId are present, compare them
  // Use selectSection to get the section data
  const foundSection = selectSection({ state }, { sectionId });

  if (
    !foundSection ||
    !foundSection.lines ||
    !Array.isArray(foundSection.lines)
  ) {
    // If we can't find the section or lines, fallback to equality only.
    return section.lastLineId === lineId;
  }

  // Find indices of both lines in the lines array
  const lastLineIndex = foundSection.lines.findIndex(
    (line) => line.id === section.lastLineId,
  );
  const currentLineIndex = foundSection.lines.findIndex(
    (line) => line.id === lineId,
  );

  // If we can't find either line in the array, fallback to simple comparison
  if (lastLineIndex === -1 || currentLineIndex === -1) {
    return section.lastLineId === lineId;
  }

  // Line is viewed if its index is at or before the last viewed line index
  return currentLineIndex <= lastLineIndex;
};

export const selectIsResourceViewed = ({ state }, payload) => {
  const { resourceId } = payload;
  const resource = state.global.viewedRegistry.resources.find(
    (resource) => resource.resourceId === resourceId,
  );

  return !!resource;
};

export const selectNextLineConfig = ({ state }) => {
  return state.global.nextLineConfig;
};

const selectVisibleChoiceResourceId = ({
  state,
  pointer: targetPointer,
} = {}) => {
  const pointer = targetPointer ?? selectCurrentPointer({ state })?.pointer;
  if (!pointer) {
    return undefined;
  }

  const sectionId = pointer?.sectionId;
  const lineId = pointer?.lineId;
  const section = selectSection({ state }, { sectionId });
  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex((line) => line.id === lineId);

  if (currentLineIndex < 0) {
    return undefined;
  }

  let visibleChoiceResourceId;
  for (const line of lines.slice(0, currentLineIndex + 1)) {
    const actions = line?.actions;
    if (actions?.cleanAll) {
      visibleChoiceResourceId = undefined;
    }

    if (!actions || !Object.prototype.hasOwnProperty.call(actions, "choice")) {
      visibleChoiceResourceId = undefined;
      continue;
    }

    const choice = actions.choice;
    if (choice?.resourceId) {
      visibleChoiceResourceId = choice.resourceId;
      continue;
    }

    // `choice: { animations: ... }` should preserve the previous choice state,
    // while `choice: {}` explicitly clears it.
    if (!choice?.animations) {
      visibleChoiceResourceId = undefined;
    }
  }

  return visibleChoiceResourceId;
};

export const selectIsChoiceVisible = ({ state }) => {
  return !!selectVisibleChoiceResourceId({ state });
};

export const selectSystemState = ({ state }) => {
  return structuredClone(state);
};

export const selectSaveSlotMap = ({ state }) => {
  return state.global.saveSlots;
};

export const selectSaveSlot = ({ state }, payload) => {
  const slotId = payload?.slotId;
  const storageKey = toSlotStorageKey(slotId);
  return state.global.saveSlots[storageKey];
};

export const selectAllVariables = ({ state }) => {
  return {
    ...(state.global?.variables ?? {}),
    ...(state.contexts?.[state.contexts.length - 1]?.variables ?? {}),
  };
};

/**
 * Selects the current pointer from the last context
 * @param {Object} state - Current state object
 * @returns {Object} Current pointer object with currentPointerMode and pointer properties
 * @returns {string} returns.currentPointerMode - The current pointer mode identifier
 * @returns {Object} returns.pointer - The pointer configuration for the current mode
 */
export const selectCurrentPointer = ({ state }) => {
  const contexts = Array.isArray(state.contexts) ? state.contexts : [];
  const lastContext = contexts[contexts.length - 1];

  if (!lastContext) {
    return undefined;
  }

  const pointer = lastContext.pointers?.[lastContext.currentPointerMode];

  return {
    currentPointerMode: lastContext.currentPointerMode,
    pointer,
  };
};

/**
 * Selects a section from the project data by sectionId
 * @param {Object} state - Current state object
 * @param {Object} initialState - Payload containing sectionId
 * @param {string} initialState.sectionId - The section ID to find
 * @returns {Object|undefined} The section object if found, undefined otherwise
 */
export const selectSection = ({ state }, payload) => {
  const { sectionId } = payload;
  return findSectionInProjectData(state.projectData, sectionId).section;
};

/**
 * Selects the current line from the project data based on the current pointer
 * @param {Object} state - Current state object
 * @returns {Object|undefined} The current line object if found, undefined otherwise
 */
export const selectCurrentLine = ({ state }) => {
  const currentPointerData = selectCurrentPointer({ state });

  if (!currentPointerData?.pointer) {
    return undefined;
  }

  const { sectionId, lineId } = currentPointerData.pointer;
  const section = selectSection({ state }, { sectionId });

  if (!section?.lines || !Array.isArray(section.lines)) {
    return undefined;
  }

  return section.lines.find((line) => line.id === lineId);
};

export const selectPresentationState = ({ state }) => {
  const { sectionId, lineId } = selectCurrentPointer({ state }).pointer;
  const section = selectSection({ state }, { sectionId });

  // get all lines up to the current line index, inclusive
  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex((line) => line.id === lineId);

  // Return all lines up to and including the current line
  const currentLines = lines.slice(0, currentLineIndex + 1);

  // Create presentation state from unified actions
  const presentationActions = currentLines.map((line) => {
    const actions = line.actions || {};
    const presentationData = {};

    // Extract only presentation-related actions
    Object.keys(actions).forEach((actionType) => {
      presentationData[actionType] = actions[actionType];
    });

    return presentationData;
  });

  const presentationState = constructPresentationState(presentationActions);
  return presentationState;
};

export const selectPresentationChanges = ({ state }) => {
  const previousPresentationState = selectPreviousPresentationState({ state });
  const currentLine = selectCurrentLine({ state });
  const currentLineActions = currentLine?.actions ?? {};

  const presentationStateAfterLineActions = constructPresentationState([
    previousPresentationState ?? {},
    currentLineActions,
  ]);

  return diffPresentationState(
    previousPresentationState ?? {},
    presentationStateAfterLineActions ?? {},
  );
};

export const selectSectionLineChanges = ({ state }, { sectionId }) => {
  const section = selectSection({ state }, { sectionId });
  if (!section?.lines) {
    return { lines: [] };
  }

  const linesWithChanges = [];
  let previousPresentationState = {};

  for (const line of section.lines) {
    const currentLineActions = line.actions || {};

    const presentationStateAfterLineActions = constructPresentationState([
      previousPresentationState,
      currentLineActions,
    ]);

    const changes = diffPresentationState(
      previousPresentationState,
      presentationStateAfterLineActions,
    );

    linesWithChanges.push({
      id: line.id,
      changes: changes,
    });

    previousPresentationState = normalizePersistentPresentationState(
      presentationStateAfterLineActions,
    );
  }

  return { lines: linesWithChanges };
};

export const selectPreviousPresentationState = ({ state }) => {
  const { sectionId, lineId } = selectCurrentPointer({ state }).pointer;
  const section = selectSection({ state }, { sectionId });

  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex((line) => line.id === lineId);

  // Return all lines before the current line (not including current)
  if (currentLineIndex <= 0) {
    return null;
  }

  const previousLines = lines.slice(0, currentLineIndex);

  const presentationActions = previousLines.map((line) => {
    const actions = line.actions || {};
    const presentationData = {};
    Object.keys(actions).forEach((actionType) => {
      presentationData[actionType] = actions[actionType];
    });
    return presentationData;
  });

  return normalizePersistentPresentationState(
    constructPresentationState(presentationActions),
  );
};

/**
 * Selects the save slots to display on the current page based on loadPage variable
 * and page configuration. Returns a flat array of slots for the current page.
 *
 * @param {Object} params - The selector parameters
 * @param {Object} params.state - The full application state
 * @param {Object} [options] - Configuration options
 * @param {number} [options.slotsPerPage=6] - Number of slots per page
 * @returns {Object} Object containing saveSlots array
 * @returns {Array<Object>} returns.saveSlots - Flat array of slot data for the current page
 *
 * @description
 * This selector calculates which save slots should be displayed on the current page
 * based on the `loadPage` variable and slots per page configuration. It returns a
 * flat array of slots. The UI layer handles wrapping slots into rows using container
 * layout properties (width, gap, direction).
 *
 * Each slot object contains:
 * - slotId: The unique slot identifier (1, 2, 3, ...)
 * - savedAt: Timestamp when the save was created (if saved)
 * - image: Base64 thumbnail image (if saved)
 * - state: Saved game state data (if saved)
 *
 * @example
 * // Default 6 slots per page
 * // Page 1: slots 1-6, Page 2: slots 7-12, etc.
 * const { saveSlots } = selectSaveSlotPage({ state });
 * // Returns: [slot1, slot2, slot3, slot4, slot5, slot6]
 *
 * @example
 * // Custom 12 slots per page
 * const { saveSlots } = selectSaveSlotPage({ state }, { slotsPerPage: 12 });
 * // Returns: [slot1, slot2, ..., slot12]
 *
 * @example
 * // Output data format example (Page 1, default 6 slots):
 * {
 *   saveSlots: [
 *     {
 *       slotId: 1,
 *       savedAt: 1704556800000,
 *       image: "data:image/png;base64,iVBORw0KGgoAAAANS...",
 *       state: { contexts: [...], viewedRegistry: {...} }
 *     },
 *     { slotId: 2 },  // Empty slot (not saved)
 *     {
 *       slotId: 3,
 *       savedAt: 1704643200000,
 *       image: "data:image/png;base64,iVBORw0KGgoAAAANS...",
 *       state: { contexts: [...], viewedRegistry: {...} }
 *     },
 *     { slotId: 4 },  // Empty slot
 *     { slotId: 5 },  // Empty slot
 *     {
 *       slotId: 6,
 *       savedAt: 1704729600000,
 *       image: "data:image/png;base64,iVBORw0KGgoAAAANS...",
 *       state: { contexts: [...], viewedRegistry: {...} }
 *     }
 *   ]
 * }
 */
export const selectSaveSlotPage = ({ state }, { slotsPerPage = 6 } = {}) => {
  const allVariables = {
    ...state.global.variables,
    ...state.contexts[state.contexts.length - 1].variables,
  };
  const loadPage = allVariables.loadPage ?? 1;
  const startSlot = (loadPage - 1) * slotsPerPage + 1;

  const slots = [];

  for (let i = 0; i < slotsPerPage; i++) {
    const slotId = startSlot + i;
    const slotData =
      (state.global.saveSlots &&
        state.global.saveSlots[toSlotStorageKey(slotId)]) ||
      {};
    slots.push({
      ...slotData,
      slotId,
    });
  }

  return { saveSlots: slots };
};

export const selectSaveSlots = selectSaveSlotMap;
export const selectCurrentPageSlots = selectSaveSlotPage;

const shouldSettleCurrentLinePresentation = (state) => {
  const lastContext = state.contexts?.[state.contexts.length - 1];
  const rollback = lastContext?.rollback;
  if (
    !rollback ||
    !Array.isArray(rollback.timeline) ||
    typeof rollback.currentIndex !== "number"
  ) {
    return false;
  }

  return (
    rollback.currentIndex >= 0 &&
    rollback.currentIndex < rollback.timeline.length - 1
  );
};

export const selectRenderState = ({ state }) => {
  const presentationState = selectPresentationState({ state });
  const previousPresentationState = selectPreviousPresentationState({ state });

  const allVariables = {
    ...state.global.variables,
    ...state.contexts[state.contexts.length - 1].variables,
  };

  const { saveSlots } = selectSaveSlotPage({ state });
  const settleCurrentLinePresentation =
    shouldSettleCurrentLinePresentation(state);

  const renderState = constructRenderState({
    presentationState,
    previousPresentationState,
    resources: state.projectData.resources,
    screen: state.projectData.screen,
    dialogueUIHidden: state.global.dialogueUIHidden,
    autoMode: state.global.autoMode,
    skipMode: state.global.skipMode,
    isChoiceVisible: selectIsChoiceVisible({ state }),
    canRollback: selectCanRollback({ state }),
    skipOnlyViewedLines: !allVariables._skipUnseenText,
    isLineCompleted: state.global.isLineCompleted,
    skipTransitionsAndAnimations:
      !!allVariables._skipTransitionsAndAnimations ||
      settleCurrentLinePresentation,
    layeredViews: state.global.layeredViews,
    confirmDialog: state.global.confirmDialog,
    dialogueHistory: selectDialogueHistory({ state }),
    saveSlots,
    variables: allVariables,
  });
  return renderState;
};

/**************************
 * Actions
 *************************/
export const showConfirmDialog = ({ state }, payload) => {
  state.global.confirmDialog = normalizeConfirmDialogPayload(payload);
  state.global.pendingEffects.push({ name: "render" });
  return state;
};

export const hideConfirmDialog = ({ state }) => {
  if (!state.global.confirmDialog) {
    return state;
  }

  clearConfirmDialog(state);
  state.global.pendingEffects.push({ name: "render" });
  return state;
};

export const pushLayeredView = ({ state }, payload) => {
  state.global.layeredViews.push(payload);
  state.global.pendingEffects.push({ name: "render" });
  recordRollbackAction(state, "pushLayeredView", payload);
  return state;
};

export const popLayeredView = ({ state }) => {
  state.global.layeredViews.pop();
  state.global.pendingEffects.push({ name: "render" });
  recordRollbackAction(state, "popLayeredView", undefined);
  return state;
};

export const replaceLastLayeredView = ({ state }, payload) => {
  if (state.global.layeredViews.length > 0) {
    state.global.layeredViews[state.global.layeredViews.length - 1] = payload;
  }
  state.global.pendingEffects.push({ name: "render" });
  recordRollbackAction(state, "replaceLastLayeredView", payload);
  return state;
};

export const clearLayeredViews = ({ state }) => {
  state.global.layeredViews = [];
  clearConfirmDialog(state);
  state.global.pendingEffects.push({ name: "render" });
  recordRollbackAction(state, "clearLayeredViews", undefined);
  return state;
};

const stopPlaybackForEnteredChoiceLine = (state) => {
  if (state.global.autoMode) {
    state.global.autoMode = false;
    state.global.pendingEffects.push({
      name: "clearAutoNextTimer",
    });
  }

  if (state.global.skipMode) {
    state.global.skipMode = false;
    state.global.pendingEffects.push({
      name: "clearSkipNextTimer",
    });
  }

  if (state.global.nextLineConfig?.auto?.enabled) {
    state.global.pendingEffects.push({
      name: "clearNextLineConfigTimer",
    });
  }
};

const queueEnteredLineEffects = (state, pointer) => {
  state.global.isLineCompleted = false;

  const isChoiceVisible = !!selectVisibleChoiceResourceId({ state, pointer });
  if (isChoiceVisible) {
    stopPlaybackForEnteredChoiceLine(state);
  }

  state.global.pendingEffects.push({
    name: "handleLineActions",
  });

  return {
    isChoiceVisible,
  };
};

export const startAutoMode = ({ state }) => {
  if (selectIsChoiceVisible({ state })) {
    return state;
  }

  if (state.global.skipMode) {
    state.global.skipMode = false;
    state.global.pendingEffects.push({
      name: "clearSkipNextTimer",
    });
  }
  state.global.autoMode = true;
  state.global.pendingEffects.push({
    name: "clearAutoNextTimer",
  });

  // Only start timer immediately if line is already completed
  // Otherwise, markLineCompleted will start it when renderComplete fires
  if (state.global.isLineCompleted) {
    const autoForwardTime = state.global.variables._autoForwardTime ?? 1000;
    state.global.pendingEffects.push({
      name: "startAutoNextTimer",
      payload: { delay: autoForwardTime },
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const stopAutoMode = ({ state }) => {
  state.global.autoMode = false;
  state.global.pendingEffects.push({
    name: "clearAutoNextTimer",
  });
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const toggleAutoMode = ({ state }) => {
  const autoMode = state.global.autoMode;
  if (selectIsChoiceVisible({ state }) && !autoMode) {
    return state;
  }

  if (autoMode) {
    stopAutoMode({ state });
  } else {
    startAutoMode({ state });
  }
  return state;
};

export const startSkipMode = ({ state }) => {
  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   return state;
  // }

  if (selectIsChoiceVisible({ state })) {
    return state;
  }

  if (state.global.autoMode) {
    state.global.autoMode = false;
    state.global.pendingEffects.push({
      name: "clearAutoNextTimer",
    });
  }
  state.global.skipMode = true;
  state.global.pendingEffects.push({
    name: "clearSkipNextTimer",
  });
  state.global.pendingEffects.push({
    name: "startSkipNextTimer",
  });
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const stopSkipMode = ({ state }) => {
  state.global.skipMode = false;
  state.global.pendingEffects.push({
    name: "clearSkipNextTimer",
  });
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const toggleSkipMode = ({ state }) => {
  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   const skipMode = selectSkipMode({ state });
  //   if (!skipMode) {
  //     return state;
  //   }
  // }

  const skipMode = selectSkipMode({ state });
  if (selectIsChoiceVisible({ state }) && !skipMode) {
    return state;
  }

  if (skipMode) {
    stopSkipMode({ state });
  } else {
    startSkipMode({ state });
  }
  return state;
};

export const showDialogueUI = ({ state }) => {
  state.global.dialogueUIHidden = false;
  state.global.pendingEffects.push({
    name: "render",
  });
  recordRollbackAction(state, "showDialogueUI", undefined);
  return state;
};

export const hideDialogueUI = ({ state }) => {
  state.global.dialogueUIHidden = true;
  state.global.pendingEffects.push({
    name: "render",
  });
  recordRollbackAction(state, "hideDialogueUI", undefined);
  return state;
};

export const toggleDialogueUI = ({ state }) => {
  const dialogueUIHidden = selectDialogueUIHidden({ state });
  if (dialogueUIHidden) {
    showDialogueUI({ state });
  } else {
    hideDialogueUI({ state });
  }
  return state;
};

export const clearPendingEffects = ({ state }) => {
  state.global.pendingEffects = [];
  return state;
};

export const appendPendingEffect = ({ state }, payload) => {
  state.global.pendingEffects.push(payload);
  return state;
};

export const resetStorySession = ({ state }) => {
  const lastContext = state.contexts?.[state.contexts.length - 1];
  const readPointer = lastContext?.pointers?.read;

  if (!lastContext || !readPointer?.sectionId || !readPointer?.lineId) {
    return state;
  }

  state.contexts[state.contexts.length - 1] = createDefaultContextState({
    pointer: readPointer,
    projectData: state.projectData,
  });
  resetStorySessionTransientGlobals(state);
  markPendingStorySessionReset();
  setActiveRollbackBatchCheckpoint(0);

  return state;
};

const recordViewedLine = (state, { sectionId, lineId }) => {
  if (!state.global.viewedRegistry) {
    state.global.viewedRegistry = {};
  }
  if (!Array.isArray(state.global.viewedRegistry.sections)) {
    state.global.viewedRegistry.sections = [];
  }

  const section = state.global.viewedRegistry.sections.find(
    (section) => section.sectionId === sectionId,
  );

  if (section) {
    // Update existing section only if new line is after the current lastLineId
    const foundSection = selectSection({ state }, { sectionId });
    if (foundSection?.lines && section.lastLineId !== undefined) {
      const lastLineIndex = foundSection.lines.findIndex(
        (line) => line.id === section.lastLineId,
      );
      const newLineIndex = foundSection.lines.findIndex(
        (line) => line.id === lineId,
      );

      // Update only if newLineIndex is greater (later in the section) or if lastLineId not found
      if (lastLineIndex === -1 || newLineIndex > lastLineIndex) {
        section.lastLineId = lineId;
      }
    } else {
      // Fallback: if we can't find the section or lastLineId is undefined, just update
      section.lastLineId = lineId;
    }
  } else {
    // Add new section
    state.global.viewedRegistry.sections.push({
      sectionId,
      lastLineId: lineId,
    });
  }
};

export const addViewedLine = ({ state }, payload) => {
  recordViewedLine(state, payload);

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const addViewedResource = ({ state }, payload) => {
  const { resourceId } = payload;
  const existingResource = state.global.viewedRegistry.resources.find(
    (resource) => resource.resourceId === resourceId,
  );

  if (!existingResource) {
    // Add new resource only if it doesn't already exist
    state.global.viewedRegistry.resources.push({
      resourceId,
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Sets the next line configuration for advancing to the next line
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {Object} [payload.manual] - Manual navigation configuration
 * @param {boolean} [payload.manual.enabled] - Whether manual navigation is enabled
 * @param {boolean} [payload.manual.requireLineCompleted] - Whether completion is required before advancing
 * @param {Object} [payload.auto] - Auto navigation configuration
 * @param {string} [payload.auto.trigger] - When auto navigation triggers ('fromStart' or 'fromComplete')
 * @param {number} [payload.auto.delay] - Delay in milliseconds before auto advancing
 * @param {"singleLine"|"persistent"} [payload.applyMode] - Whether config applies to one line or persists
 * @returns {Object} Updated state object
 * @description
 * If both manual and auto configurations are provided, performs complete replacement.
 * If only one configuration is provided, performs partial merge with existing config.
 */
export const setNextLineConfig = ({ state }, payload) => {
  const manual = normalizeLegacyManualNextLineConfig(payload.manual);
  const { auto, applyMode } = payload;
  const previousAutoEnabled = state.global.nextLineConfig.auto?.enabled;
  const previousApplyMode = state.global.nextLineConfig?.applyMode;
  const isRollbackRestoring =
    state.contexts?.[state.contexts.length - 1]?.rollback?.isRestoring === true;

  // If both manual and auto are provided, do complete replacement
  if (manual && auto) {
    state.global.nextLineConfig = {
      manual,
      auto,
    };
    if (applyMode !== undefined) {
      state.global.nextLineConfig.applyMode = applyMode;
    } else if (previousApplyMode !== undefined) {
      state.global.nextLineConfig.applyMode = previousApplyMode;
    }
  } else {
    // Partial update - merge only provided sections
    if (manual) {
      state.global.nextLineConfig.manual = manual;
      // state.global.nextLineConfig.manual = {
      //   ...state.global.nextLineConfig.manual,
      //   ...manual
      // };
    }

    if (auto) {
      state.global.nextLineConfig.auto = auto;
    }

    if (applyMode !== undefined) {
      state.global.nextLineConfig.applyMode = applyMode;
    }
  }

  const currentAutoEnabled = state.global.nextLineConfig.auto?.enabled;
  const isChoiceVisible = selectIsChoiceVisible({ state });

  // If auto.enabled state has changed, dispatch timer effects
  if (
    !isRollbackRestoring &&
    !isChoiceVisible &&
    currentAutoEnabled === true &&
    !previousAutoEnabled
  ) {
    const trigger = state.global.nextLineConfig.auto?.trigger;

    // Event-based: only start timer immediately if trigger is "fromStart"
    // or if line is already completed (for "fromComplete" trigger)
    // Otherwise, markLineCompleted will start it when renderComplete fires
    if (trigger === "fromStart") {
      state.global.pendingEffects.push({
        name: "nextLineConfigTimer",
        payload: { delay: state.global.nextLineConfig.auto.delay },
      });
    } else if (state.global.isLineCompleted) {
      // trigger === "fromComplete" (or default) and line is already completed
      state.global.pendingEffects.push({
        name: "nextLineConfigTimer",
        payload: { delay: state.global.nextLineConfig.auto.delay },
      });
    }
  } else if (
    !isRollbackRestoring &&
    currentAutoEnabled === false &&
    previousAutoEnabled
  ) {
    state.global.pendingEffects.push({
      name: "clearNextLineConfigTimer",
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  recordRollbackAction(state, "setNextLineConfig", payload);
  return state;
};

/**
 * Saves current game state to a slot
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {number|string} payload.slotId - Save slot identifier
 * @param {string} payload.thumbnailImage - Base64 thumbnail image
 * @returns {Object} Updated state object
 */
export const saveSlot = ({ state }, payload) => {
  const slotId = payload?.slotId;
  if (slotId === undefined || slotId === null || slotId === "") {
    throw new Error("saveSlot requires slotId");
  }
  const { thumbnailImage } = payload;
  const savedAt = payload?.savedAt;
  const storageKey = toSlotStorageKey(slotId);
  const contexts = cloneStateValue(state.contexts);
  contexts?.forEach((context) => {
    removeLegacyRollbackBaseline(context.rollback);
  });

  const currentState = {
    contexts,
    viewedRegistry: cloneStateValue(state.global.viewedRegistry),
  };

  const saveData = {
    formatVersion: CURRENT_SAVE_FORMAT_VERSION,
    slotId: normalizeStoredSlotId(slotId),
    savedAt: typeof savedAt === "number" ? savedAt : Date.now(),
    image: thumbnailImage,
    state: currentState,
  };

  state.global.saveSlots[storageKey] = saveData;

  state.global.pendingEffects.push(
    {
      name: "saveSlots",
      payload: {
        saveSlots: { ...state.global.saveSlots },
      },
    },
    { name: "render" },
  );
  return state;
};

/**
 * Loads game state from a save slot
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {number} payload.slotId - Save slot number
 * @returns {Object} Updated state object
 */
export const loadSlot = ({ state }, payload) => {
  const slotId = payload?.slotId;
  if (slotId === undefined || slotId === null || slotId === "") {
    throw new Error("loadSlot requires slotId");
  }
  const storageKey = toSlotStorageKey(slotId);
  const slotData = state.global.saveSlots[storageKey];
  if (slotData) {
    const normalizedSlot = normalizeLoadedSaveSlot(slotData, state.projectData);

    state.global.viewedRegistry = normalizedSlot.state.viewedRegistry;
    state.contexts = normalizedSlot.state.contexts;
    state.global.autoMode = false;
    state.global.skipMode = false;
    state.global.dialogueUIHidden = false;
    delete state.global.isDialogueHistoryShowing;
    state.global.nextLineConfig = createDefaultNextLineConfig();
    state.global.layeredViews = [];
    state.global.isLineCompleted = true;
    clearConfirmDialog(state);
    state.global.pendingEffects.push(
      { name: "clearAutoNextTimer" },
      { name: "clearSkipNextTimer" },
      { name: "clearNextLineConfigTimer" },
      { name: "render" },
    );
  }
  return state;
};

/**
 * Updates the entire projectData with new data
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {Object} payload.projectData - The new project data to replace existing data
 * @returns {Object} Updated state object
 */
export const updateProjectData = ({ state }, payload) => {
  const { projectData } = payload;

  assertUniqueSectionIds(projectData);

  state.projectData = projectData;
  clearConfirmDialog(state);

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Jumps to a specific line within a section
 * @param {Object} param - Object containing state and dispatch functions
 * @param {Object} payload - Action payload
 * @param {string} payload.sectionId - The target section ID (optional, defaults to current section)
 * @param {string} payload.lineId - The target line ID to jump to
 * @returns {Object} Updated state object
 */
export const jumpToLine = ({ state }, payload) => {
  const { sectionId, lineId } = payload;

  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   return state;
  // }

  if (!lineId) {
    console.warn("jumpToLine requires lineId parameter");
    return state;
  }

  const lastContext = state.contexts[state.contexts.length - 1];
  if (!lastContext) {
    console.warn("No context available for jumpToLine");
    return state;
  }

  // Use provided sectionId or current sectionId
  const targetSectionId = sectionId || lastContext.pointers.read?.sectionId;

  // Validate section exists (if sectionId is provided)
  if (sectionId) {
    const targetSection = selectSection({ state }, { sectionId });
    if (!targetSection) {
      console.warn(`Section not found: ${sectionId}`);
      return state;
    }
  }

  // Validate line exists in target section
  const targetSection = selectSection(
    { state },
    { sectionId: targetSectionId },
  );
  if (!targetSection?.lines || !Array.isArray(targetSection.lines)) {
    console.warn(`Section ${targetSectionId} has no lines`);
    return state;
  }

  const targetLine = targetSection.lines.find((line) => line.id === lineId);
  if (!targetLine) {
    console.warn(`Line not found: ${lineId} in section ${targetSectionId}`);
    return state;
  }

  // Update current pointer to new line
  lastContext.pointers.read = {
    sectionId: targetSectionId,
    lineId: lineId,
  };

  if (consumePendingStorySessionReset()) {
    lastContext.rollback = createRollbackState({
      pointer: lastContext.pointers.read,
    });
    setActiveRollbackBatchCheckpoint(lastContext.rollback.currentIndex);
  }

  queueEnteredLineEffects(state, lastContext.pointers.read);

  return state;
};

export const nextLine = ({ state }, payload) => {
  //const isAutoOrSkip = state.global.autoMode || state.global.skipMode;

  if (!state.global.nextLineConfig.manual.enabled) {
    return state;
  }

  if (state.global.dialogueUIHidden) {
    showDialogueUI({ state });
    return state;
  }

  if (
    selectIsChoiceVisible({ state }) &&
    payload?._interactionSource !== "choice"
  ) {
    return state;
  }

  // If line is not completed, complete it instantly instead of advancing
  if (!state.global.isLineCompleted) {
    state.global.isLineCompleted = true;
    const pointer = selectCurrentPointer({ state })?.pointer;
    const sectionId = pointer?.sectionId;
    const lineId = pointer?.lineId;
    if (sectionId && lineId) {
      recordViewedLine(state, { sectionId, lineId });
    }
    // Clear any running nextLineConfigTimer to prevent auto-advance after manual click
    state.global.pendingEffects.push({ name: "clearNextLineConfigTimer" });

    // If auto mode is on, continue auto-advancing after the skip
    if (state.global.autoMode) {
      const autoForwardTime = state.global.variables._autoForwardTime ?? 1000;
      state.global.pendingEffects.push({
        name: "startAutoNextTimer",
        payload: { delay: autoForwardTime },
      });
    }

    // If scene mode (nextLineConfig.auto) is enabled with fromComplete trigger, restart the timer
    const nextLineConfig = state.global.nextLineConfig;
    if (nextLineConfig?.auto?.enabled) {
      const trigger = nextLineConfig.auto.trigger;
      // Default trigger is "fromComplete", so start timer if not explicitly "fromStart"
      if (trigger !== "fromStart") {
        state.global.pendingEffects.push({
          name: "nextLineConfigTimer",
          payload: { delay: nextLineConfig.auto.delay },
        });
      }
    }

    state.global.pendingEffects.push({ name: "render" });
    return state;
  }

  const pointer = selectCurrentPointer({ state })?.pointer;
  const sectionId = pointer?.sectionId;
  const section = selectSection({ state }, { sectionId });
  const lastContext = state.contexts[state.contexts.length - 1];

  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex(
    (line) => line.id === pointer?.lineId,
  );
  const nextLineIndex = currentLineIndex + 1;

  if (nextLineIndex < lines.length) {
    const nextLine = lines[nextLineIndex];

    // Check if skip mode should stop at unviewed lines
    const skipOnlyViewedLines = !state.global.variables?._skipUnseenText;
    if (state.global.skipMode && skipOnlyViewedLines) {
      const isNextLineViewed = selectIsLineViewed(
        { state },
        {
          sectionId,
          lineId: nextLine.id,
        },
      );

      if (!isNextLineViewed) {
        // Stop skip mode when encountering an unviewed line
        stopSkipMode({ state });
        return state;
      }
    }

    if (lastContext && !lastContext.rollback) {
      ensureRollbackState(lastContext, { compatibilityAnchor: true });
    }

    if (lastContext) {
      // Mark current line as viewed before moving
      const currentLineId = lastContext.pointers.read.lineId;
      if (currentLineId && sectionId) {
        recordViewedLine(state, { sectionId, lineId: currentLineId });
      }

      lastContext.pointers.read = {
        sectionId,
        lineId: nextLine.id,
      };
    }

    appendRollbackCheckpoint(state, {
      sectionId,
      lineId: nextLine.id,
    });
    resetNextLineConfigIfSingleLine(state);
    const { isChoiceVisible } = queueEnteredLineEffects(state, {
      sectionId,
      lineId: nextLine.id,
    });

    // Keep scene auto mode running after manual advances (e.g. choice click -> nextLine).
    const nextLineConfig = state.global.nextLineConfig;
    if (nextLineConfig?.auto?.enabled && !isChoiceVisible) {
      const trigger = nextLineConfig.auto.trigger;
      if (trigger === "fromStart") {
        state.global.pendingEffects.push({
          name: "nextLineConfigTimer",
          payload: { delay: nextLineConfig.auto.delay },
        });
      }
    }
  } else {
    // Reached the end of section, stop auto/skip modes
    if (state.global.autoMode) {
      stopAutoMode({ state });
    }
    if (state.global.skipMode) {
      stopSkipMode({ state });
    }
  }

  return state;
};

/**
 * Navigate to the previous line using history pointer
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.sectionId - The section ID to navigate in
 * @returns {Object} Updated state object
 */
export const markLineCompleted = ({ state }) => {
  // Guard: if already completed, no action needed (prevents duplicate renders)
  if (state.global.isLineCompleted) {
    return state;
  }
  state.global.isLineCompleted = true;
  const isChoiceVisible = selectIsChoiceVisible({ state });

  // If auto mode is on, start the delay timer to advance after completion
  if (state.global.autoMode && !isChoiceVisible) {
    const autoForwardTime = state.global.variables._autoForwardTime ?? 1000;
    state.global.pendingEffects.push({
      name: "startAutoNextTimer",
      payload: { delay: autoForwardTime },
    });
  }

  const pointer = selectCurrentPointer({ state })?.pointer;
  const sectionId = pointer?.sectionId;
  const lineId = pointer?.lineId;
  if (sectionId && lineId) {
    recordViewedLine(state, { sectionId, lineId });
  }

  // If nextLineConfig.auto is enabled with fromComplete trigger, start the timer
  const nextLineConfig = state.global.nextLineConfig;
  if (nextLineConfig?.auto?.enabled && !isChoiceVisible) {
    const trigger = nextLineConfig.auto.trigger;
    // Default trigger is "fromComplete", so start timer if not explicitly "fromStart"
    if (trigger !== "fromStart") {
      state.global.pendingEffects.push({
        name: "nextLineConfigTimer",
        payload: { delay: nextLineConfig.auto.delay },
      });
    }
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const prevLine = ({ state }, payload) => {
  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   return state;
  // }
  const sectionId =
    payload?.sectionId ?? selectCurrentPointer({ state })?.pointer?.sectionId;
  const section = selectSection({ state }, { sectionId });

  // Return early if section doesn't exist
  if (!section || !section.lines || section.lines.length === 0) {
    return state;
  }

  const lines = section.lines;
  const lastContext = state.contexts[state.contexts.length - 1];

  if (!lastContext || !lastContext.pointers) {
    return state;
  }

  // Get current history pointer or use read pointer as fallback
  const currentPointer =
    lastContext.pointers.history || lastContext.pointers.read;

  // If we're already in history mode, keep history pointer and move it back
  // Otherwise, switch to history mode and initialize it (only if we have a valid currentPointer)
  if (
    lastContext.currentPointerMode !== "history" ||
    !lastContext.pointers.history
  ) {
    // Only switch to history mode if we have a valid current pointer to work with
    if (!currentPointer) {
      return state;
    }

    // Switch to history mode, initialize history pointer with current position
    lastContext.currentPointerMode = "history";
    lastContext.pointers.history = {
      sectionId,
      lineId: currentPointer?.lineId,
    };

    // Immediately move to previous line after switching to history mode
    const currentLineIndex = lines.findIndex(
      (line) => line.id === currentPointer.lineId,
    );
    const prevLineIndex = currentLineIndex - 1;

    if (prevLineIndex >= 0 && prevLineIndex < lines.length) {
      const prevLine = lines[prevLineIndex];
      lastContext.pointers.history = {
        sectionId,
        lineId: prevLine.id,
      };
    }

    // Add render effect for mode change
    state.global.pendingEffects.push({
      name: "render",
    });

    return state;
  }

  // Already in history mode, move history pointer to previous line
  const currentLineIndex = lines.findIndex(
    (line) => line.id === lastContext.pointers.history.lineId,
  );
  const prevLineIndex = currentLineIndex - 1;

  if (prevLineIndex >= 0 && prevLineIndex < lines.length) {
    const prevLine = lines[prevLineIndex];
    lastContext.pointers.history = {
      sectionId,
      lineId: prevLine.id,
    };

    state.global.pendingEffects.push({
      name: "render",
    });
  }

  return state;
};

/**
 * Transitions to a different section and positions at the first line
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.sectionId - The section ID to transition to
 * @returns {Object} Updated state object
 * @description
 * - Finds target section across all scenes
 * - Positions pointer at first line of target section
 * - Resets line completion state
 * - Triggers render and line action processing
 * - Logs warnings if section or lines not found
 */
export const sectionTransition = ({ state }, payload) => {
  const { sectionId } = payload;

  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   return state;
  // }
  // Validate section exists
  const targetSection = selectSection({ state }, { sectionId });
  if (!targetSection) {
    console.warn(`Section not found: ${sectionId}`);
    return state;
  }

  // Get first line of target section
  const firstLine = targetSection.lines?.[0];
  if (!firstLine) {
    console.warn(`Section ${sectionId} has no lines`);
    return state;
  }

  // Stop auto/skip modes on section transition
  if (state.global.autoMode) {
    stopAutoMode({ state });
  }
  if (state.global.skipMode) {
    stopSkipMode({ state });
  }

  // Update current pointer to new section's first line
  const lastContext = state.contexts[state.contexts.length - 1];
  if (lastContext) {
    if (!lastContext.rollback) {
      ensureRollbackState(lastContext, { compatibilityAnchor: true });
    }

    lastContext.pointers.read = {
      sectionId,
      lineId: firstLine.id,
    };

    if (consumePendingStorySessionReset()) {
      lastContext.rollback = createRollbackState({
        pointer: lastContext.pointers.read,
      });
      setActiveRollbackBatchCheckpoint(lastContext.rollback.currentIndex);
    } else {
      appendRollbackCheckpoint(state, {
        sectionId,
        lineId: firstLine.id,
      });
    }
  }

  queueEnteredLineEffects(state, lastContext?.pointers?.read);

  return state;
};

export const nextLineFromSystem = ({ state }) => {
  if (state.global.dialogueUIHidden) {
    showDialogueUI({ state });
    return state;
  }

  // Auto/skip/scene timers should pause when an interactive choice is visible.
  if (selectIsChoiceVisible({ state })) {
    return state;
  }

  const pointer = selectCurrentPointer({ state })?.pointer;
  const sectionId = pointer?.sectionId;
  const section = selectSection({ state }, { sectionId });
  const lastContext = state.contexts[state.contexts.length - 1];

  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex(
    (line) => line.id === pointer?.lineId,
  );
  const nextLineIndex = currentLineIndex + 1;

  if (nextLineIndex < lines.length) {
    const nextLine = lines[nextLineIndex];

    // Check if skip mode should stop at unviewed lines
    const skipOnlyViewedLines = !state.global.variables?._skipUnseenText;
    if (state.global.skipMode && skipOnlyViewedLines) {
      const isNextLineViewed = selectIsLineViewed(
        { state },
        {
          sectionId,
          lineId: nextLine.id,
        },
      );

      if (!isNextLineViewed) {
        // Stop skip mode when encountering an unviewed line
        stopSkipMode({ state });
        return state;
      }
    }

    if (lastContext && !lastContext.rollback) {
      ensureRollbackState(lastContext, { compatibilityAnchor: true });
    }

    if (lastContext) {
      const currentLineId = lastContext.pointers.read.lineId;
      if (currentLineId && sectionId) {
        recordViewedLine(state, { sectionId, lineId: currentLineId });
      }

      lastContext.pointers.read = {
        sectionId,
        lineId: nextLine.id,
      };
    }

    appendRollbackCheckpoint(state, {
      sectionId,
      lineId: nextLine.id,
    });
    resetNextLineConfigIfSingleLine(state);
    const { isChoiceVisible } = queueEnteredLineEffects(state, {
      sectionId,
      lineId: nextLine.id,
    });

    // Only start timer immediately if trigger is "fromStart"
    // For "fromComplete" trigger, markLineCompleted will start it when renderComplete fires
    if (state.global.nextLineConfig.auto?.enabled && !isChoiceVisible) {
      const trigger = state.global.nextLineConfig.auto.trigger;
      if (trigger === "fromStart") {
        state.global.pendingEffects.push({
          name: "nextLineConfigTimer",
          payload: { delay: state.global.nextLineConfig.auto.delay },
        });
      }
    }
  } else {
    if (state.global.nextLineConfig.auto?.enabled) {
      state.global.nextLineConfig.auto.enabled = false;
      state.global.pendingEffects.push({
        name: "clearNextLineConfigTimer",
      });
    }
  }

  return state;
};

export const updateVariable = ({ state }, payload) => {
  const { id, operations = [] } = payload;

  // Validate required id field
  if (!id) {
    throw new Error("updateVariable requires an id field");
  }
  if (typeof id !== "string" || !/^[a-zA-Z0-9]+$/.test(id)) {
    throw new Error(`updateVariable id must be alphanumeric, got: "${id}"`);
  }

  const lastContext = state.contexts[state.contexts.length - 1];
  if (lastContext?.rollback?.isRestoring) {
    return state;
  }

  // Track which scopes are modified
  let contextVariableModified = false;
  let globalDeviceModified = false;
  let globalAccountModified = false;
  const contextOperations = [];

  operations.forEach(({ variableId, op, value }) => {
    const variableConfig = state.projectData.resources?.variables?.[variableId];
    const scope = variableConfig?.scope;
    const type = variableConfig?.type;

    // Use pure helpers for validation
    validateVariableScope(scope, variableId);
    validateVariableOperation(type, op, variableId);

    const target =
      scope === "context" ? lastContext.variables : state.global.variables;

    // Track which scope was modified
    if (scope === "context") {
      contextVariableModified = true;
      contextOperations.push({ variableId, op, value });
    } else if (scope === "global-device") {
      globalDeviceModified = true;
    } else if (scope === "global-account") {
      globalAccountModified = true;
    }

    // Use pure helper to apply operation
    target[variableId] = applyVariableOperation(target[variableId], op, value);
  });

  if (contextVariableModified) {
    recordRollbackAction(state, "updateVariable", {
      id,
      operations: contextOperations,
    });
  }

  // Save global-device variables if any were modified
  if (globalDeviceModified) {
    const globalDeviceVars = filterVariablesByScope(
      state.global.variables,
      state.projectData.resources?.variables,
      "global-device",
    );
    state.global.pendingEffects.push({
      name: "saveGlobalDeviceVariables",
      payload: {
        globalDeviceVariables: globalDeviceVars,
      },
    });
  }

  // Save global-account variables if any were modified
  if (globalAccountModified) {
    const globalAccountVars = filterVariablesByScope(
      state.global.variables,
      state.projectData.resources?.variables,
      "global-account",
    );
    state.global.pendingEffects.push({
      name: "saveGlobalAccountVariables",
      payload: {
        globalAccountVariables: globalAccountVars,
      },
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Selects a line ID by relative offset from the active rollback timeline.
 *
 * @param {Object} state - Current state object
 * @param {Object} payload - Selector payload
 * @param {number} payload.offset - Relative offset (negative = back, positive = forward)
 * @returns {Object|null} { sectionId, lineId } or null if out of bounds
 *
 * @example
 * // Go back one line
 * const target = selectLineIdByOffset({ state }, { offset: -1 });
 * // target = { sectionId: "story", lineId: "line3" } or null if at first line
 */
export const selectLineIdByOffset = ({ state }, payload) => {
  const { offset } = payload;

  if (offset === undefined || typeof offset !== "number") {
    console.warn("selectLineIdByOffset requires a numeric offset");
    return null;
  }

  const lastContext = state.contexts[state.contexts.length - 1];
  if (!lastContext) {
    return null;
  }

  const rollback = lastContext.rollback;
  if (
    !Array.isArray(rollback?.timeline) ||
    typeof rollback?.currentIndex !== "number"
  ) {
    return null;
  }

  const targetIndex = rollback.currentIndex + offset;
  if (targetIndex < 0 || targetIndex >= rollback.timeline.length) {
    return null;
  }

  const targetLine = rollback.timeline[targetIndex];
  return {
    sectionId: targetLine.sectionId,
    lineId: targetLine.lineId,
  };
};

/**
 * Checks if rollback is possible (not at the first rollback checkpoint).
 * Used for UI to conditionally enable/disable back button.
 *
 * @param {Object} state - Current state object
 * @returns {boolean} True if rollback is possible, false otherwise
 */
export const selectCanRollback = ({ state }) => {
  const target = selectLineIdByOffset({ state }, { offset: -1 });
  return target !== null;
};

/**
 * Rolls back by a relative offset from the current rollback checkpoint.
 *
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {number} [payload.offset=-1] - Negative offset (defaults to -1)
 * @returns {Object} Updated state object (unchanged if out of bounds)
 * @throws {Error} If offset is not negative
 *
 * @example
 * // Go back one line (default)
 * engine.handleAction("rollbackByOffset", {});
 * // Go back two lines
 * engine.handleAction("rollbackByOffset", { offset: -2 });
 */
export const rollbackByOffset = ({ state }, payload) => {
  const { offset = -1 } = payload;

  if (offset >= 0) {
    throw new Error("rollbackByOffset requires a negative offset");
  }

  const lastContext = state.contexts?.[state.contexts.length - 1];
  if (!lastContext) {
    return state;
  }

  const rollback = ensureRollbackState(lastContext, {
    compatibilityAnchor: !lastContext.rollback,
  });
  const targetIndex = rollback.currentIndex + offset;
  if (targetIndex < 0 || targetIndex >= rollback.timeline.length) {
    return state;
  }

  return restoreRollbackCheckpoint(state, targetIndex);
};

/**
 * Rolls back to a specific line using the active rollback timeline.
 *
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.sectionId - The section ID to rollback within
 * @param {string} payload.lineId - The target line ID to rollback to
 * @returns {Object} Updated state object
 */
export const rollbackToLine = ({ state }, payload) => {
  const { sectionId, lineId } = payload;

  const lastContext = state.contexts[state.contexts.length - 1];
  if (!lastContext) {
    throw new Error("No context available for rollbackToLine");
  }

  const rollback = ensureRollbackState(lastContext, {
    compatibilityAnchor: !lastContext.rollback,
  });
  const visibleTimeline = rollback.timeline.slice(0, rollback.currentIndex + 1);
  const targetLineIndex = visibleTimeline.findLastIndex(
    (checkpoint) =>
      checkpoint.sectionId === sectionId && checkpoint.lineId === lineId,
  );

  if (targetLineIndex === -1) {
    throw new Error(
      `Line ${lineId} not found in section ${sectionId} rollback timeline`,
    );
  }

  if (targetLineIndex === rollback.currentIndex) {
    return state;
  }

  return restoreRollbackCheckpoint(state, targetLineIndex);
};

/**************************
 * Store Export
 *************************/

// Export the store using createStore from util.js
export const createSystemStore = (initialState) => {
  const _initialState = createInitialState(initialState);

  // Gather all selectors and actions for the store
  const selectorsAndActions = {
    // Selectors
    selectPendingEffects,
    selectSkipMode,
    selectAutoMode,
    selectIsChoiceVisible,
    selectDialogueUIHidden,
    selectDialogueHistory,
    selectConfirmDialog,
    selectIsLineViewed,
    selectIsResourceViewed,
    selectNextLineConfig,
    selectSystemState,
    selectSaveSlotMap,
    selectSaveSlots,
    selectSaveSlot,
    selectAllVariables,
    selectCurrentPointer,
    selectSection,
    selectCurrentLine,
    selectPresentationState,
    selectPresentationChanges,
    selectSectionLineChanges,
    selectSaveSlotPage,
    selectCurrentPageSlots,
    selectRenderState,
    selectLayeredViews,
    selectLineIdByOffset,
    selectCanRollback,

    // Actions
    startAutoMode,
    stopAutoMode,
    toggleAutoMode,
    startSkipMode,
    stopSkipMode,
    toggleSkipMode,
    showDialogueUI,
    hideDialogueUI,
    toggleDialogueUI,
    showConfirmDialog,
    hideConfirmDialog,
    resetStorySession,
    clearPendingEffects,
    appendPendingEffect,
    beginRollbackActionBatch,
    endRollbackActionBatch,
    addViewedLine,
    addViewedResource,
    setNextLineConfig,
    saveSlot,
    loadSlot,
    updateProjectData,
    sectionTransition,
    jumpToLine,
    nextLine,
    markLineCompleted,
    prevLine,
    rollbackToLine,
    rollbackByOffset,
    pushLayeredView,
    popLayeredView,
    replaceLastLayeredView,
    clearLayeredViews,
    updateVariable,
    nextLineFromSystem,
  };

  return createStore(_initialState, selectorsAndActions, {
    transformActionFirstArgument: (state) => {
      return { state };
    },
    transformSelectorFirstArgument: (state) => {
      return { state };
    },
  });
};
