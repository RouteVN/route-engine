import { createSystemStore } from "./stores/system.store.js";
import { normalizeNamespace } from "./indexedDbPersistence.js";
import { processActionTemplates } from "./util.js";
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

/**
 * Creates a RouteEngine instance.
 */
export default function createRouteEngine(options) {
  let _systemStore;
  let _renderSequence = 0;
  let _namespace = null;
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
  };

  const init = ({ initialState, namespace }) => {
    _systemStore = createSystemStore(initialState);
    _renderSequence = 0;
    _namespace = normalizeNamespace(namespace);
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

  const handleAction = (actionType, payload) => {
    if (!_systemStore[actionType]) {
      return;
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

    _systemStore[actionType](payload);
    processEffectsUntilEmpty();
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

  const handleActions = (actions, eventContext, options = {}) => {
    const context = buildActionTemplateContext(eventContext);
    const processedActions = processActionTemplates(actions, context);
    _systemStore.beginRollbackActionBatch({
      source: options.rollbackSource,
    });
    try {
      Object.entries(processedActions).forEach(([actionType, payload]) => {
        handleAction(actionType, payload);
      });
    } finally {
      _systemStore.endRollbackActionBatch({});
    }
  };

  const handleLineActions = () => {
    const line = _systemStore.selectCurrentLine();
    if (line?.actions) {
      handleActions(line.actions, undefined, {
        rollbackSource: "line",
      });
      return true;
    }

    return false;
  };

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
    selectSaveSlotMap,
    selectSaveSlot,
    selectSaveSlotPage,
    selectSaveSlots: selectSaveSlotMap,
    selectRuntime,
    selectIsChoiceVisible,
    handleLineActions,
    getNamespace,
  };
}
