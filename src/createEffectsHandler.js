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
  if (
    renderDispatchCountAfter === renderDispatchCountBefore &&
    (!handledLineActions || renderDispatchCountBefore === 0)
  ) {
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
      engine.handleAction("nextLineFromSystem", {});
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

    // Skip advance every 30ms
    if (skipTimer.getElapsed() >= 30) {
      skipTimer.setElapsed(0);
      engine.handleAction("nextLineFromSystem", {});
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
      engine.handleAction("nextLineFromSystem", {});
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

const saveSlots = ({}, payload) => {
  localStorage.setItem("saveSlots", JSON.stringify(payload.saveSlots));
};

const saveGlobalDeviceVariables = ({}, payload) => {
  localStorage.setItem(
    "globalDeviceVariables",
    JSON.stringify(payload.globalDeviceVariables),
  );
};

const saveGlobalAccountVariables = ({}, payload) => {
  localStorage.setItem(
    "globalAccountVariables",
    JSON.stringify(payload.globalAccountVariables),
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

const createEffectsHandler = ({ getEngine, routeGraphics, ticker }) => {
  const autoTimer = createTimerState();
  const skipTimer = createTimerState();
  const nextLineConfigTimerState = createTimerState();
  let latestRenderId = null;
  let lastHandledRenderCompleteId = null;
  let handledIdlessRenderComplete = false;
  let renderDispatchCount = 0;

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
    engine.handleAction("markLineCompleted", {});
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

  const handlePendingEffects = async (pendingEffects) => {
    const engine = getEngine();

    // Deduplicate effects by name, keeping only the last occurrence
    const deduplicatedEffects = pendingEffects.reduce((acc, effect) => {
      acc[effect.name] = effect;
      return acc;
    }, {});

    // Convert back to array and process deduplicated effects
    const uniqueEffects = Object.values(deduplicatedEffects);

    const deps = {
      engine,
      routeGraphics,
      ticker,
      autoTimer,
      skipTimer,
      nextLineConfigTimerState,
      trackRenderDispatch,
      getRenderDispatchCount,
    };

    for (const effect of uniqueEffects) {
      const handler = effects[effect.name];
      if (handler) {
        handler(deps, effect.payload);
      }
    }
  };

  handlePendingEffects.handleRouteGraphicsEvent = handleRouteGraphicsEvent;
  handlePendingEffects.createRouteGraphicsEventHandler =
    createRouteGraphicsEventHandler;

  return handlePendingEffects;
};

export default createEffectsHandler;
