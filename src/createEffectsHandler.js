import {
  createIndexedDbPersistence,
  normalizeNamespace,
} from "./indexedDbPersistence.js";
import {
  createPlaybackScheduler,
  PLAYBACK_TIMER_EFFECT_NAMES,
} from "./playbackScheduler.js";

const MUSIC_ROOM_SOUND_ID = "music-room:player";
const MUSIC_ROOM_SOUND_EVENT_ACTIONS = new Map([
  ["soundReady", "musicRoomSoundReady"],
  ["soundProgress", "musicRoomSoundProgress"],
  ["soundComplete", "musicRoomSoundComplete"],
  ["soundError", "musicRoomSoundError"],
]);
const isMusicRoomSoundEvent = (eventName, payload) =>
  MUSIC_ROOM_SOUND_EVENT_ACTIONS.has(eventName) &&
  payload?._event?.id === MUSIC_ROOM_SOUND_ID;

const render = (
  {
    engine,
    routeGraphics,
    trackRenderDispatch,
    lifecycleGeneration,
    isCurrentLifecycle,
  },
  payload,
) => {
  if (engine.selectHasPendingRenderWork?.()) {
    return;
  }

  const renderState =
    engine.prepareRenderState?.(payload) ?? engine.selectRenderState(payload);
  trackRenderDispatch?.(renderState);
  routeGraphics.render(renderState);

  if (!isCurrentLifecycle(lifecycleGeneration)) {
    return;
  }

  engine.commitRenderState?.(renderState);
};

const handleLineActions = (
  {
    engine,
    routeGraphics,
    trackRenderDispatch,
    getRenderDispatchCount,
    lifecycleGeneration,
    isCurrentLifecycle,
  },
  payload,
) => {
  const renderDispatchCountBefore = getRenderDispatchCount?.() ?? 0;

  const handledLineActions = engine.handleLineActions(payload);

  const renderDispatchCountAfter = getRenderDispatchCount?.() ?? 0;
  if (renderDispatchCountAfter === renderDispatchCountBefore) {
    render(
      {
        engine,
        routeGraphics,
        trackRenderDispatch,
        lifecycleGeneration,
        isCurrentLifecycle,
      },
      payload,
    );
  }
};

const saveSlots = ({ enqueuePersistenceWrite }, payload) => {
  enqueuePersistenceWrite((persistence) =>
    persistence.saveSlots(payload?.saveSlots),
  );
};

const saveGlobalDeviceVariables = ({ enqueuePersistenceWrite }, payload) => {
  enqueuePersistenceWrite((persistence) =>
    persistence.saveGlobalDeviceVariables(payload?.globalDeviceVariables),
  );
};

const saveGlobalAccountVariables = ({ enqueuePersistenceWrite }, payload) => {
  enqueuePersistenceWrite((persistence) =>
    persistence.saveGlobalAccountVariables(payload?.globalAccountVariables),
  );
};

const saveGlobalRuntime = ({ enqueuePersistenceWrite }, payload) => {
  enqueuePersistenceWrite((persistence) =>
    persistence.saveGlobalRuntime(payload?.globalRuntime),
  );
};

const applyScopedDataUpdates = ({ enqueuePersistenceWrite }, payload) => {
  enqueuePersistenceWrite((persistence) => {
    if (typeof persistence.applyScopedDataUpdates !== "function") {
      throw new Error(
        "RouteEngine persistence adapter must implement applyScopedDataUpdates.",
      );
    }
    return persistence.applyScopedDataUpdates(payload?.updates);
  });
};

const effects = {
  render,
  saveSlots,
  saveGlobalDeviceVariables,
  saveGlobalAccountVariables,
  saveGlobalRuntime,
  applyScopedDataUpdates,
  handleLineActions,
};

const COALESCIBLE_EFFECT_NAMES = new Set([
  "render",
  "handleLineActions",
  "saveSlots",
  "saveGlobalDeviceVariables",
  "saveGlobalAccountVariables",
  "saveGlobalRuntime",
  "startAutoNextTimer",
  "clearAutoNextTimer",
  "startSkipNextTimer",
  "clearSkipNextTimer",
  "nextLineConfigTimer",
  "clearNextLineConfigTimer",
]);

const dispatchInternalAction = (engine, actionType, payload) => {
  const dispatch =
    engine.handleInternalAction ?? engine.handleAction?.bind(engine);
  dispatch?.(actionType, payload);
};

const coalescePendingEffects = (pendingEffects = []) => {
  const seenCoalescedEffects = new Set();
  const normalizedEffects = [];

  for (let index = pendingEffects.length - 1; index >= 0; index -= 1) {
    const effect = pendingEffects[index];
    if (typeof effect?.name !== "string" || effect.name.length === 0) {
      throw new Error("Pending effect is missing a valid name.");
    }

    if (!COALESCIBLE_EFFECT_NAMES.has(effect.name)) {
      normalizedEffects.unshift(effect);
      continue;
    }

    if (seenCoalescedEffects.has(effect.name)) {
      continue;
    }

    seenCoalescedEffects.add(effect.name);
    normalizedEffects.unshift(effect);
  }

  return normalizedEffects;
};

const createEffectsHandler = ({
  getEngine,
  routeGraphics,
  ticker,
  handleUnhandledEffect,
  handlePersistenceError,
  indexedDB,
  persistence: providedPersistence,
  namespace,
}) => {
  const persistenceByNamespace = new Map();
  let persistenceWriteQueue = Promise.resolve();
  let latestRenderId = null;
  let lastHandledRenderCompleteId = null;
  let handledIdlessRenderComplete = false;
  let renderDispatchCount = 0;
  let lifecycleGeneration = 0;
  let isActive = true;
  const playbackScheduler = createPlaybackScheduler({
    ticker,
    dispatchAutomaticAttempt: () =>
      dispatchInternalAction(getEngine(), "nextLineFromSystem", {}),
    classifyAutomaticAttemptError: (error) =>
      getEngine()?.classifyAutomaticAttemptError?.(error) ?? "preCommit",
  });

  const resetRenderOwnership = () => {
    latestRenderId = null;
    lastHandledRenderCompleteId = null;
    handledIdlessRenderComplete = false;
    renderDispatchCount = 0;
  };

  const reset = () => {
    playbackScheduler.reset();
    lifecycleGeneration += 1;
    resetRenderOwnership();
    isActive = true;
  };

  const dispose = () => {
    lifecycleGeneration += 1;
    isActive = false;
    resetRenderOwnership();
    playbackScheduler.dispose();
  };

  const isCurrentLifecycle = (candidateGeneration) =>
    isActive && candidateGeneration === lifecycleGeneration;

  const reportPersistenceError = (error) => {
    if (handlePersistenceError) {
      handlePersistenceError(error);
      return;
    }

    console.error("RouteEngine persistence write failed.", error);
  };

  const getPersistence = (persistenceNamespace) => {
    if (providedPersistence) {
      return providedPersistence;
    }

    const normalizedNamespace = normalizeNamespace(persistenceNamespace);
    const cachedPersistence = persistenceByNamespace.get(normalizedNamespace);
    if (cachedPersistence) {
      return cachedPersistence;
    }

    const persistence = createIndexedDbPersistence({
      indexedDB,
      namespace: normalizedNamespace,
    });
    persistenceByNamespace.set(normalizedNamespace, persistence);
    return persistence;
  };

  const enqueuePersistenceWrite = (write) => {
    const persistenceNamespace = providedPersistence
      ? null
      : normalizeNamespace(namespace ?? getEngine()?.getNamespace?.());
    let persistenceAdapter;

    persistenceWriteQueue = persistenceWriteQueue
      .catch(() => undefined)
      .then(() => {
        persistenceAdapter = getPersistence(persistenceNamespace);
        return write(persistenceAdapter);
      })
      .catch((error) => {
        if (
          !providedPersistence &&
          persistenceByNamespace.get(persistenceNamespace) ===
            persistenceAdapter
        ) {
          persistenceByNamespace.delete(persistenceNamespace);
        }
        reportPersistenceError(error);
      });
  };

  const trackRenderDispatch = (renderState) => {
    if (!isActive) {
      return;
    }

    const renderId =
      typeof renderState?.id === "string" && renderState.id.length > 0
        ? renderState.id
        : null;

    renderDispatchCount += 1;
    latestRenderId = renderId;
    handledIdlessRenderComplete = false;
  };

  const getRenderDispatchCount = () => renderDispatchCount;

  const shouldHandleRenderComplete = (payload = {}) => {
    if (!isActive) {
      return false;
    }

    if (payload?.aborted === true) {
      return false;
    }

    const completionId =
      typeof payload?.id === "string" && payload.id.length > 0
        ? payload.id
        : null;

    if (completionId) {
      if (completionId !== latestRenderId) {
        return false;
      }

      if (completionId === lastHandledRenderCompleteId) {
        return false;
      }

      lastHandledRenderCompleteId = completionId;
      return true;
    }

    if (latestRenderId !== null) {
      return false;
    }

    if (handledIdlessRenderComplete) {
      return false;
    }

    handledIdlessRenderComplete = true;
    return true;
  };

  const handleRouteGraphicsEvent = (eventName, payload = {}) => {
    if (!isActive) {
      return false;
    }

    if (isMusicRoomSoundEvent(eventName, payload)) {
      const musicRoomAction = MUSIC_ROOM_SOUND_EVENT_ACTIONS.get(eventName);
      const engine = getEngine();
      dispatchInternalAction(engine, musicRoomAction, payload?._event);
      return true;
    }

    if (eventName !== "renderComplete") {
      return false;
    }

    if (!shouldHandleRenderComplete(payload)) {
      return false;
    }

    const engine = getEngine();
    dispatchInternalAction(engine, "markLineCompleted", {});
    return true;
  };

  const formInteractionActionTypes = new Set([
    "updateFormField",
    "submitForm",
    "cancelForm",
  ]);
  const formConcurrentActionTypes = new Set(["updateVariable"]);

  const getActiveInteraction = (engine) => {
    if (typeof engine?.selectActiveInteraction === "function") {
      return engine.selectActiveInteraction();
    }

    if (
      typeof engine?.selectIsChoiceVisible === "function" &&
      engine.selectIsChoiceVisible()
    ) {
      return {
        source: "choice",
      };
    }

    return null;
  };

  const getFormInteractionKey = (value) => value?._formKey ?? value?.formKey;

  const hasMatchingFormKey = (value, activeInteraction) => {
    return getFormInteractionKey(value) === activeInteraction?.formKey;
  };

  const matchesInteractionSource = (value, activeInteraction) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    return value._interactionSource === activeInteraction?.source;
  };

  const matchesInteraction = (value, activeInteraction) => {
    if (!matchesInteractionSource(value, activeInteraction)) {
      return false;
    }

    if (activeInteraction.source === "form") {
      return hasMatchingFormKey(value, activeInteraction);
    }

    return true;
  };

  const matchesFormAction = (value, activeInteraction) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    if (activeInteraction?.source !== "form") {
      return false;
    }

    return hasMatchingFormKey(value, activeInteraction);
  };

  const isAllowedFormActionBatch = (actions = {}, activeInteraction) =>
    Object.keys(actions).length > 0 &&
    Object.entries(actions).every(([actionType, actionPayload]) => {
      if (formInteractionActionTypes.has(actionType)) {
        return matchesFormAction(actionPayload, activeInteraction);
      }

      return formConcurrentActionTypes.has(actionType);
    });

  const isInteractionPayload = (payload = {}, activeInteraction) => {
    const actions = payload?.actions;

    if (activeInteraction?.source === "form") {
      if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
        return false;
      }

      return isAllowedFormActionBatch(actions, activeInteraction);
    }

    if (matchesInteraction(payload, activeInteraction)) {
      return true;
    }

    if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
      return false;
    }

    return Object.values(actions).some((actionPayload) =>
      matchesInteraction(actionPayload, activeInteraction),
    );
  };

  const shouldBlockInteractionActions = (engine, payload = {}) => {
    if (!payload?.actions) {
      return false;
    }

    const activeInteraction = getActiveInteraction(engine);
    if (!activeInteraction) {
      return false;
    }

    if (activeInteraction.source === "choice") {
      return false;
    }

    return !isInteractionPayload(payload, activeInteraction);
  };

  const createRouteGraphicsEventHandler = ({
    preprocessPayload,
    onEvent,
  } = {}) => {
    return async (eventName, payload = {}) => {
      if (!isActive) {
        return false;
      }

      if (isMusicRoomSoundEvent(eventName, payload)) {
        handleRouteGraphicsEvent(eventName, payload);
        return onEvent?.(eventName, payload);
      }

      const engine = getEngine();
      const eventLifecycleGeneration = lifecycleGeneration;
      const eventRenderDispatchCount = renderDispatchCount;
      if (shouldBlockInteractionActions(engine, payload)) {
        return onEvent?.(eventName, payload);
      }

      const nextPayload =
        (await preprocessPayload?.(eventName, payload)) ?? payload;

      if (
        !isCurrentLifecycle(eventLifecycleGeneration) ||
        getEngine() !== engine ||
        renderDispatchCount !== eventRenderDispatchCount
      ) {
        return false;
      }

      if (shouldBlockInteractionActions(engine, nextPayload)) {
        return onEvent?.(eventName, nextPayload);
      }

      handleRouteGraphicsEvent(eventName, nextPayload);

      if (nextPayload?.actions) {
        const eventContext = nextPayload?._event
          ? { _event: nextPayload._event }
          : nextPayload?.event
            ? { _event: nextPayload.event }
            : undefined;
        let actionOptions;
        if (nextPayload?.bypassChoice === true) {
          actionOptions = {
            bypassChoice: true,
          };
        } else if (nextPayload?._interactionSource) {
          actionOptions = {
            interactionSource: nextPayload._interactionSource,
          };
        }

        if (actionOptions) {
          engine.handleActions(
            nextPayload.actions,
            eventContext,
            actionOptions,
          );
        } else {
          engine.handleActions(nextPayload.actions, eventContext);
        }
      }

      return onEvent?.(eventName, nextPayload);
    };
  };

  const handlePendingEffects = (pendingEffects) => {
    if (!isActive) {
      return;
    }

    const handlingLifecycleGeneration = lifecycleGeneration;
    const engine = getEngine();
    const normalizedEffects = coalescePendingEffects(pendingEffects);
    const hasEnteredLineWork = normalizedEffects.some(
      (effect) => effect.name === "handleLineActions",
    );

    normalizedEffects.forEach((effect) => {
      if (
        !effects[effect.name] &&
        !PLAYBACK_TIMER_EFFECT_NAMES.has(effect.name) &&
        !handleUnhandledEffect
      ) {
        throw new Error(`Unhandled pending effect "${effect.name}".`);
      }
    });

    const deps = {
      engine,
      routeGraphics,
      ticker,
      trackRenderDispatch,
      getRenderDispatchCount,
      enqueuePersistenceWrite,
      lifecycleGeneration,
      isCurrentLifecycle,
    };

    for (const effect of normalizedEffects) {
      if (!isCurrentLifecycle(handlingLifecycleGeneration)) {
        break;
      }

      // Entered-line actions can queue newer render work. Let that work settle
      // before rendering so this snapshot cannot flash or duplicate old state.
      if (hasEnteredLineWork && effect.name === "render") {
        continue;
      }

      if (PLAYBACK_TIMER_EFFECT_NAMES.has(effect.name)) {
        playbackScheduler.handleLegacyEffect(effect);
        continue;
      }

      const handler = effects[effect.name];
      if (handler) {
        handler(deps, effect.payload);
        continue;
      }

      handleUnhandledEffect(effect, deps);
    }
  };

  handlePendingEffects.handleRouteGraphicsEvent = handleRouteGraphicsEvent;
  handlePendingEffects.createRouteGraphicsEventHandler =
    createRouteGraphicsEventHandler;
  handlePendingEffects.reset = reset;
  handlePendingEffects.dispose = dispose;
  handlePendingEffects.reconcilePlaybackScheduleV1 = (schedule) =>
    playbackScheduler.reconcilePlaybackScheduleV1(schedule);

  return handlePendingEffects;
};

export default createEffectsHandler;
