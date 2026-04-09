import { createIndexedDbPersistence } from "./indexedDbPersistence.js";

const createTimerState = () => {
  let elapsed = 0;
  let callback = null;

  return {
    getElapsed: () => elapsed,
    setElapsed: (value) => {
      elapsed = value;
    },
    addElapsed: (value) => {
      elapsed += value;
    },
    getCallback: () => callback,
    setCallback: (value) => {
      callback = value;
    },
  };
};

const DEFAULT_SKIP_NEXT_DELAY_MS = 80;

const render = ({ engine, routeGraphics, trackRenderDispatch }, payload) => {
  const renderState = engine.selectRenderState();
  trackRenderDispatch?.(renderState);
  routeGraphics.render(renderState);
};

const handleLineActions = (
  { engine, routeGraphics, trackRenderDispatch, getRenderDispatchCount },
  payload,
) => {
  const renderDispatchCountBefore = getRenderDispatchCount?.() ?? 0;

  const handledLineActions = engine.handleLineActions();

  const renderDispatchCountAfter = getRenderDispatchCount?.() ?? 0;
  if (renderDispatchCountAfter === renderDispatchCountBefore) {
    render({ engine, routeGraphics, trackRenderDispatch }, payload);
  }
};

const startAutoNextTimer = ({ engine, ticker, autoTimer }, payload) => {
  // Remove old callback if exists
  const existingCallback = autoTimer.getCallback();
  if (existingCallback) {
    ticker.remove(existingCallback);
  }

  // Reset elapsed time
  autoTimer.setElapsed(0);

  // Create new ticker callback for auto mode (one-shot)
  const newCallback = (time) => {
    autoTimer.addElapsed(time.deltaMS);

    const delay = payload.delay ?? 1000;
    if (autoTimer.getElapsed() >= delay) {
      // Remove timer before advancing (one-shot behavior)
      ticker.remove(newCallback);
      autoTimer.setCallback(null);
      autoTimer.setElapsed(0);
      // Advance to next line - markLineCompleted will restart timer when ready
      dispatchInternalAction(engine, "nextLineFromSystem", {});
    }
  };

  autoTimer.setCallback(newCallback);

  // Add to auto ticker
  ticker.add(newCallback);
};

const clearAutoNextTimer = ({ ticker, autoTimer }, payload) => {
  // Remove ticker callback
  const existingCallback = autoTimer.getCallback();
  if (existingCallback) {
    ticker.remove(existingCallback);
    autoTimer.setCallback(null);
  }
  autoTimer.setElapsed(0);
};

const startSkipNextTimer = ({ engine, ticker, skipTimer }, payload) => {
  // Remove old callback if exists
  const existingCallback = skipTimer.getCallback();
  if (existingCallback) {
    ticker.remove(existingCallback);
  }

  // Reset elapsed time
  skipTimer.setElapsed(0);

  // Create new ticker callback for skip mode
  const newCallback = (time) => {
    skipTimer.addElapsed(time.deltaMS);

    const delay = payload?.delay ?? DEFAULT_SKIP_NEXT_DELAY_MS;
    if (skipTimer.getElapsed() >= delay) {
      skipTimer.setElapsed(0);
      dispatchInternalAction(engine, "nextLineFromSystem", {});
    }
  };

  skipTimer.setCallback(newCallback);

  // Add to skip ticker
  ticker.add(newCallback);
};

const clearSkipNextTimer = ({ ticker, skipTimer }, payload) => {
  // Remove ticker callback
  const existingCallback = skipTimer.getCallback();
  if (existingCallback) {
    ticker.remove(existingCallback);
    skipTimer.setCallback(null);
  }
  skipTimer.setElapsed(0);
};

const nextLineConfigTimer = (
  { engine, ticker, nextLineConfigTimerState },
  payload,
) => {
  // Remove old callback if exists
  const existingCallback = nextLineConfigTimerState.getCallback();
  if (existingCallback) {
    ticker.remove(existingCallback);
  }

  // Reset elapsed time
  nextLineConfigTimerState.setElapsed(0);

  // Create new ticker callback for scene mode
  const newCallback = (time) => {
    nextLineConfigTimerState.addElapsed(time.deltaMS);

    const delay = payload.delay ?? 1000;
    if (nextLineConfigTimerState.getElapsed() >= delay) {
      nextLineConfigTimerState.setElapsed(0);
      // Use the dedicated system action
      dispatchInternalAction(engine, "nextLineFromSystem", {});
      // Stop this timer instance; the action will re-queue it if needed
      ticker.remove(newCallback);
      nextLineConfigTimerState.setCallback(null);
    }
  };

  nextLineConfigTimerState.setCallback(newCallback);

  // Add to ticker
  ticker.add(newCallback);
};

const clearNextLineConfigTimer = (
  { ticker, nextLineConfigTimerState },
  payload,
) => {
  // Remove ticker callback
  const existingCallback = nextLineConfigTimerState.getCallback();
  if (existingCallback) {
    ticker.remove(existingCallback);
    nextLineConfigTimerState.setCallback(null);
  }
  nextLineConfigTimerState.setElapsed(0);
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

const effects = {
  render,
  saveSlots,
  saveGlobalDeviceVariables,
  saveGlobalAccountVariables,
  handleLineActions,
  startAutoNextTimer,
  clearAutoNextTimer,
  startSkipNextTimer,
  clearSkipNextTimer,
  nextLineConfigTimer,
  clearNextLineConfigTimer,
};

const COALESCIBLE_EFFECT_NAMES = new Set([
  "render",
  "handleLineActions",
  "saveSlots",
  "saveGlobalDeviceVariables",
  "saveGlobalAccountVariables",
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
  const autoTimer = createTimerState();
  const skipTimer = createTimerState();
  const nextLineConfigTimerState = createTimerState();
  let persistence = providedPersistence ?? null;
  let persistenceWriteQueue = Promise.resolve();
  let latestRenderId = null;
  let lastHandledRenderCompleteId = null;
  let handledIdlessRenderComplete = false;
  let renderDispatchCount = 0;

  const reportPersistenceError = (error) => {
    if (handlePersistenceError) {
      handlePersistenceError(error);
      return;
    }

    console.error("RouteEngine persistence write failed.", error);
  };

  const getPersistence = () => {
    if (persistence) {
      return persistence;
    }

    const engine = getEngine();
    persistence = createIndexedDbPersistence({
      indexedDB,
      namespace: namespace ?? engine?.getNamespace?.(),
    });
    return persistence;
  };

  const enqueuePersistenceWrite = (write) => {
    persistenceWriteQueue = persistenceWriteQueue
      .catch(() => undefined)
      .then(() => {
        const persistenceAdapter = getPersistence();
        return write(persistenceAdapter);
      })
      .catch((error) => {
        reportPersistenceError(error);
      });
  };

  const trackRenderDispatch = (renderState) => {
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

  const createRouteGraphicsEventHandler = ({
    preprocessPayload,
    onEvent,
  } = {}) => {
    return async (eventName, payload = {}) => {
      const nextPayload =
        (await preprocessPayload?.(eventName, payload)) ?? payload;

      handleRouteGraphicsEvent(eventName, nextPayload);

      if (nextPayload?.actions) {
        const eventContext = nextPayload?._event
          ? { _event: nextPayload._event }
          : nextPayload?.event
            ? { _event: nextPayload.event }
            : undefined;

        const engine = getEngine();
        engine.handleActions(nextPayload.actions, eventContext);
      }

      return onEvent?.(eventName, nextPayload);
    };
  };

  const handlePendingEffects = (pendingEffects) => {
    const engine = getEngine();
    const normalizedEffects = coalescePendingEffects(pendingEffects);

    normalizedEffects.forEach((effect) => {
      if (!effects[effect.name] && !handleUnhandledEffect) {
        throw new Error(`Unhandled pending effect "${effect.name}".`);
      }
    });

    const deps = {
      engine,
      routeGraphics,
      ticker,
      autoTimer,
      skipTimer,
      nextLineConfigTimerState,
      trackRenderDispatch,
      getRenderDispatchCount,
      enqueuePersistenceWrite,
    };

    for (const effect of normalizedEffects) {
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

  return handlePendingEffects;
};

export default createEffectsHandler;
