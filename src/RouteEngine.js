import { createSystemStore } from "./stores/system.store.js";
import { normalizeNamespace } from "./indexedDbPersistence.js";
import {
  evaluateRouteCondition,
  processActionTemplates,
  validateComputedVariableConfigs,
} from "./util.js";
import {
  collectPersistentAnimationContinuations,
  getAnimationInstanceDurationMs,
  getPersistentAnimationContinuationKey,
} from "./stores/constructRenderState.js";

const PERSISTENT_PLAYBACK_RESET_ACTIONS = new Set([
  "loadSlot",
  "resetStoryAtSection",
  "rollbackByOffset",
  "rollbackToLine",
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
const FORM_INTERACTION_SOURCE = "form";
const FORM_ACTION_TYPES = new Set(["submitForm", "cancelForm"]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isConditionalAutoContinue = (value) =>
  value?.type === CONDITIONAL_AUTO_CONTINUE;

const isSameStoryPointer = (left, right) =>
  left?.sectionId === right?.sectionId && left?.lineId === right?.lineId;

/**
 * Creates a RouteEngine instance.
 */
export default function createRouteEngine(options) {
  let _systemStore;
  let _renderSequence = 0;
  let _namespace = null;
  let _actionDispatchDepth = 0;
  let _isProcessingPendingEffects = false;
  let _conditionalRoutingSequence = 0;
  let _rollbackNavigationContexts = [];
  let _pendingRollbackLineEntrySaveHandoff = null;
  let _persistentAnimationSessions = new Map();
  let _restoredPersistentAnimationSessions = new Map();
  let _renderPersistentAnimationMetadata = new Map();

  const { handlePendingEffects } = options;

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
    try {
      return callback();
    } finally {
      _actionDispatchDepth -= 1;
      processEffectsUntilEmpty();
    }
  };

  const init = ({ initialState, namespace }) => {
    _systemStore = createSystemStore(initialState);
    _renderSequence = 0;
    _namespace = normalizeNamespace(namespace);
    _actionDispatchDepth = 0;
    _isProcessingPendingEffects = false;
    _conditionalRoutingSequence = 0;
    _rollbackNavigationContexts = [];
    _pendingRollbackLineEntrySaveHandoff = null;
    _persistentAnimationSessions = new Map();
    _restoredPersistentAnimationSessions = new Map();
    _renderPersistentAnimationMetadata = new Map();
    _systemStore.appendPendingEffect({ name: "handleLineActions" });
    processEffectsUntilEmpty();
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
      id: `render-${_renderSequence}`,
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
    if (!_systemStore[actionType]) {
      return;
    }

    if (actionType === "updateProjectData") {
      validateProjectDataUpdatePayload(payload);
    }

    if (CONDITIONAL_ROUTING_ACTION_TYPES.has(actionType)) {
      _conditionalRoutingSequence += 1;
    }

    if (PERSISTENT_PLAYBACK_RESET_ACTIONS.has(actionType)) {
      if (PERSISTENT_PLAYBACK_RESTORE_ACTIONS.has(actionType)) {
        _restoredPersistentAnimationSessions =
          snapshotPersistentAnimationSessions(_persistentAnimationSessions);
      } else {
        _restoredPersistentAnimationSessions = new Map();
      }
      _persistentAnimationSessions = new Map();
    }

    const cursorBeforeAction = _systemStore.selectRollbackCursor?.() ?? null;
    const result = _systemStore[actionType](payload);
    const cursorAfterAction = _systemStore.selectRollbackCursor?.() ?? null;
    if (actionType === "saveSlot") {
      recordActiveRollbackSave(payload);
    }
    updateActiveRollbackNavigation(
      actionType,
      cursorBeforeAction,
      cursorAfterAction,
    );
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
  };

  const preflightProjectDataUpdates = (actions) => {
    if (!isRecord(actions)) {
      return;
    }

    Object.entries(actions).forEach(([actionType, payload]) => {
      if (actionType === "updateProjectData") {
        validateProjectDataUpdatePayload(payload);
        return;
      }

      if (actionType === CONDITIONAL_ACTION_TYPE) {
        payload?.branches?.forEach((branch) => {
          preflightProjectDataUpdates(branch?.actions);
        });
        return;
      }

      if (FORM_ACTION_TYPES.has(actionType)) {
        preflightProjectDataUpdates(payload?.actions);
      }
    });
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

  const runActionBatch = (callback, options = {}) => {
    return runWithDeferredEffects(() => {
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
            checkpointIndex: navigationContext.rollbackCursor?.checkpointIndex,
            checkpointIdentity: navigationContext.rollbackCursor?.checkpoint,
            savedCheckpointOccurrences:
              navigationContext.savedCheckpointOccurrences,
          };
        }
      }
    });
  };

  const handleAction = (actionType, payload, eventContext, options = {}) => {
    if (actionType === CONDITIONAL_ACTION_TYPE) {
      preflightProjectDataUpdates({ [actionType]: payload });
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
    const processedActions = processActionTemplates(
      { [actionType]: payload },
      context,
    );
    const processedPayload = processedActions[actionType];

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
    preflightProjectDataUpdates(actions);
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

  const handleLineActions = () =>
    runWithDeferredEffects(() => {
      const enteredPointer = _systemStore.selectCurrentPointer()?.pointer;
      const rollbackCursor = _systemStore.selectRollbackCursor?.() ?? null;
      const savedCheckpointOccurrences = takeRollbackLineEntrySaveHandoff(
        enteredPointer,
        rollbackCursor,
      );
      const line = _systemStore.selectCurrentLine();
      let handledLineActions = false;
      if (line?.actions) {
        handleActions(line.actions, undefined, {
          rollbackSource: "line",
          savedCheckpointOccurrences,
        });
        handledLineActions = true;
      }

      // The entered line may replace an already-enabled persistent auto config.
      // Read the settled config only after its actions finish, and leave timer
      // ownership to a newly entered pointer when those actions navigate again.
      queueSettledEnteredLineAutoTimer(enteredPointer);
      return handledLineActions;
    });

  return {
    init,
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
    selectRuntime,
    selectIsChoiceVisible,
    selectIsFormVisible,
    selectActiveInteraction,
    selectHasPendingRenderWork,
    handleLineActions,
    getNamespace,
  };
}
