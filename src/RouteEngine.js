import { createSystemStore } from "./stores/system.store.js";
import { normalizeNamespace } from "./indexedDbPersistence.js";
import {
  evaluateRouteCondition,
  processActionTemplates,
  RUN_STORE_TRANSACTION,
  validateComputedVariableConfigs,
  validateImageGalleryConfig,
  validateMusicRoomConfig,
  validateSceneReplayConfig,
} from "./util.js";
import {
  collectPersistentAnimationContinuations,
  getAnimationInstanceDurationMs,
  getPersistentAnimationContinuationKey,
} from "./stores/constructRenderState.js";
import {
  getLocalizationPackageOptions,
  resolveL10nProjectData,
} from "./l10n.js";

const PERSISTENT_PLAYBACK_RESET_ACTIONS = new Set([
  "loadSlot",
  "resetStoryAtSection",
  "rollbackByOffset",
  "rollbackToLine",
  "updateLocalizationPackage",
  "updateProjectData",
]);

const PERSISTENT_PLAYBACK_RESTORE_ACTIONS = new Set([
  "loadSlot",
  "rollbackByOffset",
  "rollbackToLine",
]);

const CONDITIONAL_ACTION_TYPE = "conditional";
const CONDITIONAL_AUTO_CONTINUE = Symbol("conditionalAutoContinue");
const CONDITIONAL_ROUTING_ACTION_TYPES = new Set([
  "sectionTransition",
  "resetStoryAtSection",
]);
const ROLLBACK_CHECKPOINT_CREATING_ACTION_TYPES = new Set([
  "nextLine",
  "nextLineFromSystem",
  "resetStoryAtSection",
  "sectionTransition",
]);
const ROLLBACK_CURSOR_REPLACING_ACTION_TYPES = new Set([
  "loadSlot",
  "rollbackByOffset",
  "rollbackToLine",
]);
const DIALOGUE_HISTORY_CONTINUATION_ACTION_TYPES = new Set([
  "nextLine",
  "nextLineFromSystem",
]);
const DIALOGUE_HISTORY_RESTORE_ACTION_TYPES = new Set([
  "loadSlot",
  "rollbackByOffset",
  "rollbackToLine",
]);
const FORM_INTERACTION_SOURCE = "form";
const FORM_ACTION_TYPES = new Set(["submitForm", "cancelForm"]);
const SHOW_IMAGE_GALLERY_VARIANT_ACTION_TYPE = "showImageGalleryVariant";
const PLAY_MUSIC_ROOM_TRACK_ACTION_TYPE = "playMusicRoomTrack";
const START_SCENE_REPLAY_ACTION_TYPE = "startSceneReplay";

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const createEngineInstanceId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const isConditionalAutoContinue = (value) =>
  value?.type === CONDITIONAL_AUTO_CONTINUE;

const isSameStoryPointer = (left, right) =>
  left?.sectionId === right?.sectionId && left?.lineId === right?.lineId;

/**
 * Creates a RouteEngine instance.
 */
export default function createRouteEngine(options) {
  const _engineInstanceId = createEngineInstanceId();
  let _systemStore;
  let _lifecycleGeneration = 0;
  let _isActive = false;
  let _renderSequence = 0;
  let _namespace = null;
  let _actionDispatchDepth = 0;
  let _isProcessingPendingEffects = false;
  let _conditionalRoutingSequence = 0;
  let _rollbackNavigationContexts = [];
  let _pendingRollbackLineEntrySaveHandoff = null;
  let _pendingDialogueHistoryLineEntry = null;
  let _persistentAnimationSessions = new Map();
  let _restoredPersistentAnimationSessions = new Map();
  let _renderPersistentAnimationMetadata = new Map();
  let _canonicalProjectData;
  let _l10nData;
  let _localizationPackageId = null;

  const { handlePendingEffects } = options;

  const assertActive = (operation) => {
    if (!_isActive || !_systemStore) {
      throw new Error(`RouteEngine ${operation} requires an active engine`);
    }
  };

  const snapshotPersistentAnimationSessions = (
    sessions = new Map(),
    now = Date.now(),
  ) => {
    return new Map(
      Array.from(sessions.entries())
        .filter(([, session]) => now < session.expiresAt)
        .map(([continuationKey, session]) => [
          continuationKey,
          {
            animation: structuredClone(session.animation),
            startedAt: session.startedAt,
            expiresAt: session.expiresAt,
          },
        ]),
    );
  };

  const collectSessionAnimations = (sessions = new Map()) => {
    return Array.from(sessions.values()).map((session) =>
      structuredClone(session.animation),
    );
  };

  const pruneExpiredPersistentAnimationSessions = (now = Date.now()) => {
    _persistentAnimationSessions = new Map(
      Array.from(_persistentAnimationSessions.entries()).filter(
        ([, session]) => now < session.expiresAt,
      ),
    );
  };

  const processEffectsUntilEmpty = () => {
    if (!_isActive) {
      return;
    }

    if (_actionDispatchDepth > 0 || _isProcessingPendingEffects) {
      return;
    }

    _isProcessingPendingEffects = true;
    try {
      while (_systemStore.selectPendingEffects().length > 0) {
        const snapshot = [..._systemStore.selectPendingEffects()];
        _systemStore.clearPendingEffects();
        try {
          handlePendingEffects(snapshot);
        } catch (error) {
          _systemStore.clearPendingEffects();
          snapshot.forEach((effect) => {
            _systemStore.appendPendingEffect(effect);
          });
          throw error;
        }
      }
    } finally {
      _isProcessingPendingEffects = false;
    }
  };

  const runWithDeferredEffects = (callback) => {
    _actionDispatchDepth += 1;
    let completed = false;
    try {
      const result = callback();
      completed = true;
      return result;
    } finally {
      _actionDispatchDepth -= 1;
      if (completed) {
        processEffectsUntilEmpty();
      }
    }
  };

  const init = ({ initialState, namespace }) => {
    const previousAudioCommandId =
      _systemStore?.selectSystemState?.()?.global?.audioCommandId ?? 0;
    const { l10nData, ...systemInitialState } = initialState;
    const normalizedL10nData =
      l10nData === undefined ? undefined : structuredClone(l10nData);
    const canonicalProjectData = structuredClone(initialState.projectData);
    const localizationPackages = getLocalizationPackageOptions({
      projectData: canonicalProjectData,
      l10nData: normalizedL10nData,
    });
    const loadedGlobal = systemInitialState.global ?? {};
    if (!isRecord(loadedGlobal)) {
      throw new Error("Malformed global state.");
    }
    const loadedGlobalRuntime = loadedGlobal.runtime ?? {};
    if (!isRecord(loadedGlobalRuntime)) {
      throw new Error("Malformed global.runtime.");
    }
    const loadedLocalizationPackageId =
      loadedGlobalRuntime.localizationPackageId;
    if (
      loadedLocalizationPackageId !== undefined &&
      loadedLocalizationPackageId !== null &&
      typeof loadedLocalizationPackageId !== "string"
    ) {
      throw new Error("localizationPackageId requires a string or null value");
    }
    const importedL10nIds = new Set(
      localizationPackages
        .map(({ l10nId }) => l10nId)
        .filter((l10nId) => l10nId !== null),
    );
    const localizationPackageId =
      typeof loadedLocalizationPackageId === "string" &&
      importedL10nIds.has(loadedLocalizationPackageId)
        ? loadedLocalizationPackageId
        : null;
    const projectData = resolveL10nProjectData({
      projectData: canonicalProjectData,
      l10nData: normalizedL10nData,
      l10nId: localizationPackageId,
    });

    const nextSystemStore = createSystemStore({
      ...systemInitialState,
      global: {
        ...loadedGlobal,
        localizationPackages,
        runtime: {
          ...loadedGlobalRuntime,
          localizationPackageId,
        },
      },
      projectData,
      initialAudioCommandId: previousAudioCommandId,
    });

    handlePendingEffects.reset?.();
    _systemStore = nextSystemStore;
    _lifecycleGeneration += 1;
    _isActive = true;
    _renderSequence = 0;
    _namespace = normalizeNamespace(namespace);
    _actionDispatchDepth = 0;
    _isProcessingPendingEffects = false;
    _conditionalRoutingSequence = 0;
    _rollbackNavigationContexts = [];
    _pendingRollbackLineEntrySaveHandoff = null;
    _pendingDialogueHistoryLineEntry = null;
    _persistentAnimationSessions = new Map();
    _restoredPersistentAnimationSessions = new Map();
    _renderPersistentAnimationMetadata = new Map();
    _canonicalProjectData = canonicalProjectData;
    _l10nData = normalizedL10nData;
    _localizationPackageId = localizationPackageId;
    _systemStore.appendPendingEffect({ name: "handleLineActions" });
    processEffectsUntilEmpty();
  };

  const dispose = () => {
    if (!_isActive) {
      return;
    }

    _isActive = false;
    _lifecycleGeneration += 1;
    _systemStore?.clearPendingEffects?.();
    _actionDispatchDepth = 0;
    _isProcessingPendingEffects = false;
    _rollbackNavigationContexts = [];
    _pendingRollbackLineEntrySaveHandoff = null;
    _pendingDialogueHistoryLineEntry = null;
    _persistentAnimationSessions = new Map();
    _restoredPersistentAnimationSessions = new Map();
    _renderPersistentAnimationMetadata = new Map();
    handlePendingEffects.dispose?.();
  };

  const getNamespace = () => {
    return _namespace;
  };

  const selectPresentationState = () => {
    return _systemStore.selectPresentationState();
  };

  const selectPresentationChanges = () => {
    return _systemStore.selectPresentationChanges();
  };

  const selectSectionLineChanges = (payload) => {
    return _systemStore.selectSectionLineChanges(payload);
  };

  const buildRenderState = (options = {}) => {
    assertActive("rendering");
    _renderSequence += 1;
    const builtAt = Date.now();
    pruneExpiredPersistentAnimationSessions(builtAt);

    const shouldUseRestoredPersistentAnimationSessions =
      _restoredPersistentAnimationSessions.size > 0;
    const activePersistentAnimationSessions =
      snapshotPersistentAnimationSessions(
        _persistentAnimationSessions,
        builtAt,
      );
    const restoredPersistentAnimationSessions =
      shouldUseRestoredPersistentAnimationSessions
        ? snapshotPersistentAnimationSessions(
            _restoredPersistentAnimationSessions,
            builtAt,
          )
        : new Map();
    const renderState = _systemStore.selectRenderState({
      activePersistentAnimations: collectSessionAnimations(
        activePersistentAnimationSessions,
      ),
      restoredPersistentAnimations: collectSessionAnimations(
        restoredPersistentAnimationSessions,
      ),
    });
    const nextRenderState = {
      ...renderState,
      id: `render-${_engineInstanceId}-${_lifecycleGeneration}-${_renderSequence}`,
    };

    _renderPersistentAnimationMetadata.set(nextRenderState.id, {
      builtAt,
      persistentAnimationSessions: new Map([
        ...restoredPersistentAnimationSessions.entries(),
        ...activePersistentAnimationSessions.entries(),
      ]),
      usedRestoredPersistentAnimationSessions:
        shouldUseRestoredPersistentAnimationSessions,
    });

    return nextRenderState;
  };

  const selectRenderState = (options = {}) => {
    return buildRenderState(options);
  };

  const prepareRenderState = (options = {}) => {
    return buildRenderState(options);
  };

  const commitRenderState = (renderState) => {
    if (!_isActive || !_systemStore) {
      return;
    }

    const renderId =
      typeof renderState?.id === "string" && renderState.id.length > 0
        ? renderState.id
        : null;
    const renderMetadata = renderId
      ? _renderPersistentAnimationMetadata.get(renderId)
      : null;
    if (renderId) {
      _renderPersistentAnimationMetadata.delete(renderId);
    }

    const nextSessions = new Map();
    collectPersistentAnimationContinuations(renderState?.animations).forEach(
      (animationInstance) => {
        const continuationKey =
          getPersistentAnimationContinuationKey(animationInstance);
        if (!continuationKey) {
          return;
        }

        const existingSession =
          renderMetadata?.persistentAnimationSessions?.get(continuationKey) ??
          _persistentAnimationSessions.get(continuationKey);
        const durationMs = Math.max(
          0,
          getAnimationInstanceDurationMs(animationInstance),
        );
        const startedAt =
          existingSession?.startedAt ?? renderMetadata?.builtAt ?? Date.now();

        nextSessions.set(continuationKey, {
          animation: structuredClone(animationInstance),
          startedAt,
          expiresAt: startedAt + durationMs,
        });
      },
    );

    _persistentAnimationSessions = nextSessions;
    if (renderMetadata?.usedRestoredPersistentAnimationSessions) {
      _restoredPersistentAnimationSessions = new Map();
    }
  };

  const selectSystemState = () => {
    return _systemStore.selectSystemState();
  };

  const selectAchievements = () => {
    return _systemStore.selectAchievements();
  };

  const selectAchievement = (payload) => {
    return _systemStore.selectAchievement(payload);
  };

  const selectSaveSlotMap = () => {
    return _systemStore.selectSaveSlotMap();
  };

  const selectSaveSlot = (payload) => {
    return _systemStore.selectSaveSlot(payload);
  };

  const selectSaveSlotPage = (payload) => {
    return _systemStore.selectSaveSlotPage(payload);
  };

  const selectImageGallery = () => {
    return _systemStore.selectImageGallery();
  };

  const selectMusicRoom = () => {
    return _systemStore.selectMusicRoom();
  };

  const selectSceneReplay = () => {
    return _systemStore.selectSceneReplay();
  };

  const selectIsSceneReplayActive = () => {
    return _systemStore.selectIsSceneReplayActive();
  };

  const selectSkipMode = () => {
    return _systemStore.selectSkipMode();
  };

  const selectAutoMode = () => {
    return _systemStore.selectAutoMode();
  };

  const selectRuntime = () => {
    return _systemStore.selectRuntime();
  };

  const selectIsChoiceVisible = () => {
    return _systemStore.selectIsChoiceVisible();
  };

  const selectIsFormVisible = () => {
    return _systemStore.selectIsFormVisible();
  };

  const selectActiveInteraction = () => {
    return _systemStore.selectActiveInteraction();
  };

  const selectHasPendingRenderWork = () => {
    return _systemStore
      .selectPendingEffects()
      .some(
        (effect) =>
          effect?.name === "handleLineActions" || effect?.name === "render",
      );
  };

  const applyActionOptions = (actionType, payload, options = {}) => {
    if (!isRecord(payload)) {
      return payload;
    }

    if (actionType !== "nextLine") {
      return payload;
    }

    if (options.bypassChoice === true) {
      return {
        ...payload,
        bypassChoice: true,
      };
    }

    if (options.interactionSource === FORM_INTERACTION_SOURCE) {
      return {
        ...payload,
        _interactionSource: FORM_INTERACTION_SOURCE,
      };
    }

    return payload;
  };

  const createConditionalAutoContinue = (options = {}) => ({
    type: CONDITIONAL_AUTO_CONTINUE,
    payload: applyActionOptions(
      "nextLine",
      { _conditionalContinuation: true },
      options,
    ),
  });

  const mergeConditionalAutoContinue = (currentResult, nextResult) => {
    if (!isConditionalAutoContinue(currentResult)) {
      return nextResult;
    }

    return {
      type: CONDITIONAL_AUTO_CONTINUE,
      payload: {
        ...currentResult.payload,
        ...nextResult.payload,
      },
    };
  };

  const patchSavedTransientRollbackSources = (navigationContext) => {
    navigationContext.savedCheckpointOccurrences.forEach((occurrence) => {
      _systemStore.markSavedRollbackCheckpointTransient(occurrence);
    });
    navigationContext.savedCheckpointOccurrences = [];
  };

  const takeRollbackLineEntrySaveHandoff = (pointer, rollbackCursor) => {
    const handoff = _pendingRollbackLineEntrySaveHandoff;
    _pendingRollbackLineEntrySaveHandoff = null;
    if (
      !handoff ||
      !isSameStoryPointer(handoff.pointer, pointer) ||
      handoff.checkpointIndex !== rollbackCursor?.checkpointIndex ||
      handoff.checkpointIdentity !== rollbackCursor?.checkpoint
    ) {
      return [];
    }

    return handoff.savedCheckpointOccurrences;
  };

  const takeDialogueHistoryLineEntry = (pointer) => {
    const lineEntry = _pendingDialogueHistoryLineEntry;
    if (!lineEntry || !isSameStoryPointer(lineEntry.pointer, pointer)) {
      return null;
    }

    _pendingDialogueHistoryLineEntry = null;
    return lineEntry;
  };

  const updatePendingDialogueHistoryLineEntry = ({
    actionType,
    pointerBeforeAction,
    pointerAfterAction,
    cursorBeforeAction,
    cursorAfterAction,
    wasSceneReplayActive,
    isSceneReplayActive,
  }) => {
    if (!pointerAfterAction) {
      return;
    }

    const enteredLine =
      !isSameStoryPointer(pointerBeforeAction, pointerAfterAction) ||
      cursorBeforeAction?.checkpoint !== cursorAfterAction?.checkpoint ||
      cursorBeforeAction?.checkpointIndex !==
        cursorAfterAction?.checkpointIndex ||
      actionType === "jumpToLine";
    if (!enteredLine) {
      return;
    }

    _pendingDialogueHistoryLineEntry = {
      pointer: pointerAfterAction,
      appendToPrevious:
        DIALOGUE_HISTORY_CONTINUATION_ACTION_TYPES.has(actionType) &&
        wasSceneReplayActive === isSceneReplayActive &&
        pointerBeforeAction?.sectionId === pointerAfterAction.sectionId &&
        pointerBeforeAction?.lineId !== pointerAfterAction.lineId,
      reuseExistingOccurrence:
        DIALOGUE_HISTORY_RESTORE_ACTION_TYPES.has(actionType),
      forceNewOccurrence: actionType === "jumpToLine",
    };
  };

  const finalizeRollbackNavigationCandidate = (navigationContext) => {
    if (!navigationContext.markCurrentCheckpointTransient) {
      return;
    }

    _systemStore.markRollbackCheckpointTransient({
      checkpointIndex: navigationContext.rollbackCursor?.checkpointIndex,
      checkpointIdentity: navigationContext.rollbackCursor?.checkpoint,
      sectionId: navigationContext.pointer?.sectionId,
      lineId: navigationContext.pointer?.lineId,
    });
    patchSavedTransientRollbackSources(navigationContext);
  };

  const didCreateRollbackCheckpoint = (
    actionType,
    cursorBeforeAction,
    cursorAfterAction,
  ) => {
    if (!ROLLBACK_CHECKPOINT_CREATING_ACTION_TYPES.has(actionType)) {
      return false;
    }

    if (actionType === "resetStoryAtSection") {
      return cursorAfterAction?.checkpoint !== cursorBeforeAction?.checkpoint;
    }

    return (
      cursorAfterAction?.checkpoint !== cursorBeforeAction?.checkpoint &&
      cursorAfterAction?.checkpointIndex > cursorBeforeAction?.checkpointIndex
    );
  };

  const recordActiveRollbackSave = (payload) => {
    const navigationContext = _rollbackNavigationContexts.at(-1);
    if (!navigationContext?.markCurrentCheckpointTransient) {
      return;
    }

    const savedSlot = _systemStore.selectSaveSlot({ slotId: payload?.slotId });
    if (!savedSlot) {
      return;
    }

    navigationContext.savedCheckpointOccurrences.push({
      slotId: payload.slotId,
      saveSlotIdentity: savedSlot,
      checkpointIndex: navigationContext.rollbackCursor?.checkpointIndex,
      sectionId: navigationContext.pointer?.sectionId,
      lineId: navigationContext.pointer?.lineId,
    });
  };

  const updateActiveRollbackNavigation = (
    actionType,
    cursorBeforeAction,
    cursorAfterAction,
  ) => {
    const navigationContext = _rollbackNavigationContexts.at(-1);
    if (!navigationContext) {
      return;
    }

    const settledPointer = _systemStore.selectCurrentPointer()?.pointer;
    const createdCheckpoint = didCreateRollbackCheckpoint(
      actionType,
      cursorBeforeAction,
      cursorAfterAction,
    );
    if (isSameStoryPointer(navigationContext.pointer, settledPointer)) {
      const replacedCheckpoint =
        cursorAfterAction?.checkpoint !== cursorBeforeAction?.checkpoint ||
        cursorAfterAction?.checkpointIndex !==
          cursorBeforeAction?.checkpointIndex;
      if (
        createdCheckpoint ||
        (replacedCheckpoint &&
          ROLLBACK_CURSOR_REPLACING_ACTION_TYPES.has(actionType))
      ) {
        finalizeRollbackNavigationCandidate(navigationContext);
        navigationContext.pointer = settledPointer;
        navigationContext.rollbackCursor = cursorAfterAction;
        navigationContext.markCurrentCheckpointTransient = createdCheckpoint;
        navigationContext.savedCheckpointOccurrences = [];
      }
      return;
    }

    finalizeRollbackNavigationCandidate(navigationContext);

    navigationContext.pointer = settledPointer;
    navigationContext.rollbackCursor =
      _systemStore.selectRollbackCursor?.() ?? null;
    navigationContext.markCurrentCheckpointTransient = createdCheckpoint;
    navigationContext.savedCheckpointOccurrences = [];
  };

  const dispatchStoreAction = (actionType, payload) => {
    assertActive(`action "${actionType}"`);
    if (!_systemStore[actionType]) {
      return;
    }

    let storePayload = payload;
    let nextCanonicalProjectData;
    let nextLocalizationPackageId;
    if (actionType === "updateProjectData") {
      validateProjectDataUpdatePayload(payload);
      nextCanonicalProjectData = structuredClone(payload.projectData);
      storePayload = {
        ...payload,
        projectData: resolveL10nProjectData({
          projectData: nextCanonicalProjectData,
          l10nData: _l10nData,
          l10nId: _localizationPackageId,
        }),
      };
      validateProjectDataUpdatePayload(storePayload);
    } else if (actionType === "updateLocalizationPackage") {
      nextLocalizationPackageId =
        validateLocalizationPackageUpdatePayload(payload);
      if (nextLocalizationPackageId === _localizationPackageId) {
        return;
      }
      storePayload = {
        l10nId: nextLocalizationPackageId,
        projectData: resolveL10nProjectData({
          projectData: _canonicalProjectData,
          l10nData: _l10nData,
          l10nId: nextLocalizationPackageId,
        }),
      };
    }

    if (CONDITIONAL_ROUTING_ACTION_TYPES.has(actionType)) {
      _conditionalRoutingSequence += 1;
    }

    const wasSceneReplayActive =
      _systemStore.selectIsSceneReplayActive?.() === true;
    const persistentAnimationSessionsBeforeAction =
      PERSISTENT_PLAYBACK_RESTORE_ACTIONS.has(actionType)
        ? snapshotPersistentAnimationSessions(_persistentAnimationSessions)
        : null;
    const pointerBeforeAction =
      _systemStore.selectCurrentPointer()?.pointer ?? null;
    const cursorBeforeAction = _systemStore.selectRollbackCursor?.() ?? null;
    const result = _systemStore[actionType](storePayload);
    if (nextCanonicalProjectData !== undefined) {
      _canonicalProjectData = nextCanonicalProjectData;
    }
    if (nextLocalizationPackageId !== undefined) {
      _localizationPackageId = nextLocalizationPackageId;
    }
    if (PERSISTENT_PLAYBACK_RESET_ACTIONS.has(actionType)) {
      _restoredPersistentAnimationSessions =
        persistentAnimationSessionsBeforeAction ?? new Map();
      _persistentAnimationSessions = new Map();
    }
    const isSceneReplayActive =
      _systemStore.selectIsSceneReplayActive?.() === true;
    if (wasSceneReplayActive !== isSceneReplayActive) {
      _persistentAnimationSessions = new Map();
      _restoredPersistentAnimationSessions = new Map();
    }
    const pointerAfterAction =
      _systemStore.selectCurrentPointer()?.pointer ?? null;
    const cursorAfterAction = _systemStore.selectRollbackCursor?.() ?? null;
    if (actionType === "saveSlot") {
      recordActiveRollbackSave(payload);
    }
    updateActiveRollbackNavigation(
      actionType,
      cursorBeforeAction,
      cursorAfterAction,
    );
    updatePendingDialogueHistoryLineEntry({
      actionType,
      pointerBeforeAction,
      pointerAfterAction,
      cursorBeforeAction,
      cursorAfterAction,
      wasSceneReplayActive,
      isSceneReplayActive,
    });
    processEffectsUntilEmpty();
    return result;
  };

  const validateProjectDataUpdatePayload = (payload) => {
    if (!Object.prototype.hasOwnProperty.call(payload ?? {}, "projectData")) {
      throw new Error("updateProjectData requires projectData");
    }
    validateComputedVariableConfigs(
      payload?.projectData?.resources?.variables ?? {},
    );
    validateImageGalleryConfig(payload.projectData);
    validateMusicRoomConfig(payload.projectData);
    validateSceneReplayConfig(payload.projectData);
  };

  const validateLocalizationPackageUpdatePayload = (payload) => {
    if (!isRecord(payload)) {
      throw new Error("updateLocalizationPackage requires an object payload");
    }
    const keys = Object.keys(payload);
    if (keys.length !== 1 || keys[0] !== "l10nId") {
      throw new Error("updateLocalizationPackage only accepts l10nId");
    }
    if (
      payload.l10nId !== null &&
      (typeof payload.l10nId !== "string" || payload.l10nId.length === 0)
    ) {
      throw new Error(
        "updateLocalizationPackage requires a non-empty l10nId or null",
      );
    }
    return payload.l10nId;
  };

  const dispatchConditionalAutoContinue = (
    result,
    sourcePointer,
    routingSequence,
  ) => {
    const currentPointer = _systemStore.selectCurrentPointer()?.pointer;
    if (
      sourcePointer !== currentPointer ||
      routingSequence !== _conditionalRoutingSequence
    ) {
      return;
    }

    // An authored nextLine may have completed the source and queued its
    // completion timers. Cancel those source timers before the implicit
    // advance; the destination will schedule its own timers when appropriate.
    _systemStore.appendPendingEffect({ name: "clearAutoNextTimer" });
    _systemStore.appendPendingEffect({ name: "clearNextLineConfigTimer" });
    dispatchStoreAction("nextLineFromSystem", result.payload);
  };

  const createActionBatchEngineSnapshot = () => ({
    renderSequence: _renderSequence,
    conditionalRoutingSequence: _conditionalRoutingSequence,
    rollbackNavigationContexts: _rollbackNavigationContexts.slice(),
    pendingRollbackLineEntrySaveHandoff: _pendingRollbackLineEntrySaveHandoff,
    pendingDialogueHistoryLineEntry: _pendingDialogueHistoryLineEntry,
    persistentAnimationSessions: new Map(_persistentAnimationSessions),
    restoredPersistentAnimationSessions: new Map(
      _restoredPersistentAnimationSessions,
    ),
    renderPersistentAnimationMetadata: new Map(
      _renderPersistentAnimationMetadata,
    ),
    canonicalProjectData: _canonicalProjectData,
    localizationPackageId: _localizationPackageId,
  });

  const restoreActionBatchEngineSnapshot = (snapshot) => {
    _renderSequence = snapshot.renderSequence;
    _conditionalRoutingSequence = snapshot.conditionalRoutingSequence;
    _rollbackNavigationContexts = snapshot.rollbackNavigationContexts.slice();
    _pendingRollbackLineEntrySaveHandoff =
      snapshot.pendingRollbackLineEntrySaveHandoff;
    _pendingDialogueHistoryLineEntry = snapshot.pendingDialogueHistoryLineEntry;
    _persistentAnimationSessions = new Map(
      snapshot.persistentAnimationSessions,
    );
    _restoredPersistentAnimationSessions = new Map(
      snapshot.restoredPersistentAnimationSessions,
    );
    _renderPersistentAnimationMetadata = new Map(
      snapshot.renderPersistentAnimationMetadata,
    );
    _canonicalProjectData = snapshot.canonicalProjectData;
    _localizationPackageId = snapshot.localizationPackageId;
  };

  const runActionBatch = (callback, options = {}) => {
    assertActive("action batch");
    return runWithDeferredEffects(() => {
      const engineSnapshot = createActionBatchEngineSnapshot();
      try {
        return _systemStore[RUN_STORE_TRANSACTION](() => {
          let result;
          const sourcePointer =
            _systemStore.selectCurrentPointer()?.pointer ?? null;
          const sourceRollbackCursor =
            _systemStore.selectRollbackCursor?.() ?? null;
          const routingSequence = _conditionalRoutingSequence;
          const navigationContext = {
            pointer: sourcePointer,
            rollbackCursor: sourceRollbackCursor,
            markCurrentCheckpointTransient: options.rollbackSource === "line",
            savedCheckpointOccurrences:
              options.savedCheckpointOccurrences?.slice() ?? [],
          };
          _rollbackNavigationContexts.push(navigationContext);
          try {
            _systemStore.beginRollbackActionBatch({
              source: options.rollbackSource,
            });
            try {
              result = callback();
            } finally {
              _systemStore.endRollbackActionBatch({});
            }

            if (isConditionalAutoContinue(result)) {
              dispatchConditionalAutoContinue(
                result,
                sourcePointer,
                routingSequence,
              );
            }

            const settledPointer =
              _systemStore.selectCurrentPointer()?.pointer ?? null;
            if (
              options.rollbackSource === "line" &&
              isSameStoryPointer(sourcePointer, settledPointer)
            ) {
              _systemStore.recordCurrentDialogueHistory({
                savedCheckpointOccurrences:
                  navigationContext.savedCheckpointOccurrences,
                appendToPrevious:
                  options.dialogueHistoryAppendToPrevious === true,
                reuseExistingOccurrence:
                  options.dialogueHistoryReuseExistingOccurrence === true,
                forceNewOccurrence:
                  options.dialogueHistoryForceNewOccurrence === true,
              });
            }
          } finally {
            _rollbackNavigationContexts.pop();
            const enteredAnotherCheckpoint =
              !isSameStoryPointer(sourcePointer, navigationContext.pointer) ||
              sourceRollbackCursor?.checkpoint !==
                navigationContext.rollbackCursor?.checkpoint;
            if (
              enteredAnotherCheckpoint &&
              navigationContext.markCurrentCheckpointTransient &&
              navigationContext.savedCheckpointOccurrences.length > 0
            ) {
              _pendingRollbackLineEntrySaveHandoff = {
                pointer: navigationContext.pointer,
                checkpointIndex:
                  navigationContext.rollbackCursor?.checkpointIndex,
                checkpointIdentity:
                  navigationContext.rollbackCursor?.checkpoint,
                savedCheckpointOccurrences:
                  navigationContext.savedCheckpointOccurrences,
              };
            }
          }
        });
      } catch (error) {
        restoreActionBatchEngineSnapshot(engineSnapshot);
        throw error;
      }
    });
  };

  const handleAction = (actionType, payload, eventContext, options = {}) => {
    if (actionType === CONDITIONAL_ACTION_TYPE) {
      return runActionBatch(() => {
        const context = buildActionTemplateContext(eventContext);
        const processedActions = processActionTemplates(
          { [actionType]: payload },
          context,
        );
        return handleConditionalAction(
          processedActions[actionType],
          eventContext,
          options,
        );
      }, options);
    }

    dispatchStoreAction(actionType, payload);
  };

  const handleInternalAction = (actionType, payload) => {
    handleAction(actionType, payload);
  };

  const buildActionTemplateContext = (eventContext) => {
    if (!eventContext) {
      return {
        variables: _systemStore.selectAllVariables
          ? _systemStore.selectAllVariables()
          : undefined,
        runtime: _systemStore.selectRuntime ? _systemStore.selectRuntime() : {},
      };
    }
    if (Object.prototype.hasOwnProperty.call(eventContext, "event")) {
      throw new Error(
        'eventContext key "event" is no longer supported. Use "_event".',
      );
    }
    const { _event, ...additionalContext } = eventContext;
    const variables = _systemStore.selectAllVariables
      ? _systemStore.selectAllVariables()
      : undefined;
    return {
      ...additionalContext,
      _event,
      variables,
      runtime: _systemStore.selectRuntime ? _systemStore.selectRuntime() : {},
    };
  };

  const maskDeclaredImageGalleryTargetIds = (payload) => {
    if (!isRecord(payload)) {
      return {
        templatePayload: payload,
        literalTargetIds: null,
      };
    }

    const gallery = _systemStore.selectImageGalleryConfig();
    if (!Array.isArray(gallery?.groups)) {
      return {
        templatePayload: payload,
        literalTargetIds: null,
      };
    }

    const declaredGroup =
      typeof payload.groupId === "string"
        ? gallery.groups.find((group) => group.id === payload.groupId)
        : undefined;
    if (!declaredGroup) {
      return {
        templatePayload: payload,
        literalTargetIds: null,
      };
    }

    const hasDeclaredVariant =
      typeof payload.variantId === "string" &&
      declaredGroup.variants.some(
        (variant) => variant.id === payload.variantId,
      );

    // Loop interpolation can produce IDs that look like action templates.
    // Mask exact declared targets so action-time rendering cannot reinterpret them.
    return {
      templatePayload: {
        ...payload,
        groupId: null,
        ...(hasDeclaredVariant ? { variantId: null } : {}),
      },
      literalTargetIds: {
        groupId: payload.groupId,
        ...(hasDeclaredVariant ? { variantId: payload.variantId } : {}),
      },
    };
  };

  const maskDeclaredMusicRoomTrackId = (payload) => {
    if (!isRecord(payload) || typeof payload.trackId !== "string") {
      return {
        templatePayload: payload,
        literalTargetIds: null,
      };
    }
    const musicRoom = _systemStore.selectMusicRoomConfig();
    const hasDeclaredTrack = musicRoom?.tracks?.some(
      (track) => track.id === payload.trackId,
    );
    if (!hasDeclaredTrack) {
      return {
        templatePayload: payload,
        literalTargetIds: null,
      };
    }
    return {
      templatePayload: {
        ...payload,
        trackId: null,
      },
      literalTargetIds: {
        trackId: payload.trackId,
      },
    };
  };

  const maskDeclaredSceneReplayId = (payload) => {
    if (!isRecord(payload) || typeof payload.sceneId !== "string") {
      return {
        templatePayload: payload,
        literalTargetIds: null,
      };
    }
    const sceneReplay = _systemStore.selectSceneReplayConfig();
    const hasDeclaredReplay = sceneReplay?.replays?.some(
      (replay) => replay.sceneId === payload.sceneId,
    );
    if (!hasDeclaredReplay) {
      return {
        templatePayload: payload,
        literalTargetIds: null,
      };
    }
    return {
      templatePayload: {
        ...payload,
        sceneId: null,
      },
      literalTargetIds: {
        sceneId: payload.sceneId,
      },
    };
  };

  const assertConditionalActionPayload = (payload) => {
    if (!isRecord(payload)) {
      throw new Error("conditional action payload must be an object");
    }

    if (!Array.isArray(payload.branches)) {
      throw new Error("conditional action requires branches array");
    }

    if (payload.branches.length === 0) {
      throw new Error("conditional action requires at least one branch");
    }
  };

  const assertConditionalBranch = (branch, index, branchCount) => {
    if (!isRecord(branch)) {
      throw new Error(`conditional branch at index ${index} must be an object`);
    }

    if (!isRecord(branch.actions)) {
      throw new Error(
        `conditional branch at index ${index} requires actions object`,
      );
    }

    if (
      !Object.prototype.hasOwnProperty.call(branch, "when") &&
      index !== branchCount - 1
    ) {
      throw new Error("conditional else branch must be the last branch");
    }
  };

  const handleConditionalAction = (payload, eventContext, options) => {
    assertConditionalActionPayload(payload);
    const autoContinue = createConditionalAutoContinue(options);

    for (let index = 0; index < payload.branches.length; index += 1) {
      const branch = payload.branches[index];
      assertConditionalBranch(branch, index, payload.branches.length);

      const conditionContext = buildActionTemplateContext(eventContext);
      const hasCondition = Object.prototype.hasOwnProperty.call(branch, "when");
      if (
        hasCondition &&
        !evaluateRouteCondition(branch.when, conditionContext)
      ) {
        continue;
      }

      const branchResult = processActionEntries(
        branch.actions,
        eventContext,
        options,
      );
      return isConditionalAutoContinue(branchResult)
        ? mergeConditionalAutoContinue(autoContinue, branchResult)
        : autoContinue;
    }

    return autoContinue;
  };

  const buildFormActionEventContext = (eventContext, formContext) => {
    return {
      ...(eventContext ?? {}),
      _form: formContext,
    };
  };

  const handleFormAction = (actionType, payload, eventContext, options) => {
    const result = dispatchStoreAction(actionType, payload);
    const isSubmitted = result?.submitted === true && result.valid === true;
    const isCancelled = result?.cancelled === true;

    if (!isSubmitted && !isCancelled) {
      return;
    }

    if (!isRecord(payload.actions)) {
      return;
    }

    return processActionEntries(
      payload.actions,
      buildFormActionEventContext(eventContext, result.form),
      {
        ...options,
        interactionSource: FORM_INTERACTION_SOURCE,
      },
    );
  };

  const handleActionEntry = (actionType, payload, eventContext, options) => {
    const context = buildActionTemplateContext(eventContext);
    let maskedPayload = {
      templatePayload: payload,
      literalTargetIds: null,
    };
    if (actionType === SHOW_IMAGE_GALLERY_VARIANT_ACTION_TYPE) {
      maskedPayload = maskDeclaredImageGalleryTargetIds(payload);
    } else if (actionType === PLAY_MUSIC_ROOM_TRACK_ACTION_TYPE) {
      maskedPayload = maskDeclaredMusicRoomTrackId(payload);
    } else if (actionType === START_SCENE_REPLAY_ACTION_TYPE) {
      maskedPayload = maskDeclaredSceneReplayId(payload);
    }
    const { templatePayload, literalTargetIds } = maskedPayload;
    const processedActions = processActionTemplates(
      { [actionType]: templatePayload },
      context,
    );
    const renderedPayload = processedActions[actionType];
    const processedPayload = literalTargetIds
      ? {
          ...renderedPayload,
          ...literalTargetIds,
        }
      : renderedPayload;

    if (actionType === CONDITIONAL_ACTION_TYPE) {
      return handleConditionalAction(processedPayload, eventContext, options);
    }

    const processedPayloadWithActionOptions = applyActionOptions(
      actionType,
      processedPayload,
      options,
    );

    if (FORM_ACTION_TYPES.has(actionType)) {
      return handleFormAction(
        actionType,
        processedPayloadWithActionOptions,
        eventContext,
        options,
      );
    }

    dispatchStoreAction(actionType, processedPayloadWithActionOptions);
  };

  const processActionEntries = (actions, eventContext, options) => {
    let result;

    Object.entries(actions).forEach(([actionType, payload]) => {
      const entryResult = handleActionEntry(
        actionType,
        payload,
        eventContext,
        options,
      );
      if (isConditionalAutoContinue(entryResult)) {
        result = mergeConditionalAutoContinue(result, entryResult);
      }
    });

    return result;
  };

  const handleActions = (actions, eventContext, options = {}) => {
    return runActionBatch(
      () => processActionEntries(actions, eventContext, options),
      options,
    );
  };

  const queueSettledEnteredLineAutoTimer = (enteredPointer) => {
    const currentPointer = _systemStore.selectCurrentPointer()?.pointer;
    if (
      enteredPointer !== currentPointer ||
      _systemStore.selectActiveInteraction()
    ) {
      return;
    }

    const nextLineConfig = _systemStore.selectNextLineConfig();
    if (
      nextLineConfig?.auto?.enabled &&
      nextLineConfig.auto.trigger === "fromStart"
    ) {
      _systemStore.appendPendingEffect({
        name: "nextLineConfigTimer",
        payload: { delay: nextLineConfig.auto.delay },
      });
    }
  };

  const handleLineActions = (payload) => {
    assertActive("line action handling");
    if (typeof payload?.sceneReplaySceneId === "string") {
      const activeEntry = _systemStore.selectActiveSceneReplayEntry?.();
      if (
        activeEntry?.sceneId !== payload.sceneReplaySceneId ||
        activeEntry?.entryId !== payload.entryId
      ) {
        return false;
      }
    }

    return runWithDeferredEffects(() => {
      const enteredPointer = _systemStore.selectCurrentPointer()?.pointer;
      const rollbackCursor = _systemStore.selectRollbackCursor?.() ?? null;
      const pendingRollbackLineEntrySaveHandoff =
        _pendingRollbackLineEntrySaveHandoff;
      const pendingDialogueHistoryLineEntry = _pendingDialogueHistoryLineEntry;
      const savedCheckpointOccurrences = takeRollbackLineEntrySaveHandoff(
        enteredPointer,
        rollbackCursor,
      );
      const dialogueHistoryLineEntry =
        takeDialogueHistoryLineEntry(enteredPointer);
      const line = _systemStore.selectCurrentLine();
      let handledLineActions = false;
      if (line?.actions) {
        try {
          handleActions(line.actions, undefined, {
            rollbackSource: "line",
            savedCheckpointOccurrences,
            dialogueHistoryAppendToPrevious:
              dialogueHistoryLineEntry?.appendToPrevious === true,
            dialogueHistoryReuseExistingOccurrence:
              dialogueHistoryLineEntry?.reuseExistingOccurrence === true,
            dialogueHistoryForceNewOccurrence:
              dialogueHistoryLineEntry?.forceNewOccurrence === true,
          });
        } catch (error) {
          _pendingRollbackLineEntrySaveHandoff =
            pendingRollbackLineEntrySaveHandoff;
          _pendingDialogueHistoryLineEntry = pendingDialogueHistoryLineEntry;
          throw error;
        }
        handledLineActions = true;
      }

      // The entered line may replace an already-enabled persistent auto config.
      // Read the settled config only after its actions finish, and leave timer
      // ownership to a newly entered pointer when those actions navigate again.
      queueSettledEnteredLineAutoTimer(enteredPointer);
      return handledLineActions;
    });
  };

  return {
    init,
    dispose,
    handleAction,
    handleInternalAction,
    handleActions,
    selectRenderState,
    prepareRenderState,
    commitRenderState,
    selectPresentationState,
    selectPresentationChanges,
    selectSectionLineChanges,
    selectSystemState,
    selectAchievements,
    selectAchievement,
    selectSaveSlotMap,
    selectSaveSlot,
    selectSaveSlotPage,
    selectSaveSlots: selectSaveSlotMap,
    selectImageGallery,
    selectMusicRoom,
    selectSceneReplay,
    selectIsSceneReplayActive,
    selectRuntime,
    selectIsChoiceVisible,
    selectIsFormVisible,
    selectActiveInteraction,
    selectHasPendingRenderWork,
    handleLineActions,
    getNamespace,
  };
}
