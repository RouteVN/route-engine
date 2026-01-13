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

const render = ({ engine, routeGraphics }, payload) => {
  const renderState = engine.selectRenderState();
  routeGraphics.render(renderState);
};

const handleLineActions = ({ engine }, payload) => {
  engine.handleLineActions();
};

const startAutoNextTimer = ({ engine, ticker, autoTimer }, payload) => {
  // Remove old callback if exists
  const existingCallback = autoTimer.getCallback();
  if (existingCallback) {
    ticker.remove(existingCallback);
  }

  // Reset elapsed time
  autoTimer.setElapsed(0);

  // Create new ticker callback for auto mode
  const newCallback = (time) => {
    autoTimer.addElapsed(time.deltaMS);

    // Auto advance every 1000ms (1 second) - hardcoded
    // TODO: Speed can adjust in the future
    const delay = payload.delay ?? 1000;
    if (autoTimer.getElapsed() >= delay) {
      autoTimer.setElapsed(0);
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

  // Track consumed triggers (animations, audio) to prevent replay on same-line re-render
  let lastLineId = null;
  let consumedTriggerIds = new Set();

  // Store last rendered state for debugging (what actually rendered, not raw state)
  let lastRenderedState = null;

  const handleEffects = async (pendingEffects) => {
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
    };

    for (const effect of uniqueEffects) {
      if (effect.name === "render") {
        const currentLineId = engine.selectCurrentLineId();
        const rawRenderState = engine.selectRenderState();

        // Reset consumed tracking on line change
        if (currentLineId !== lastLineId) {
          lastLineId = currentLineId;
          consumedTriggerIds = new Set();
        }

        // Filter triggers that have already been consumed, mark new ones as consumed
        const filterAndConsume = (items) => {
          const newItems = items.filter(
            (item) => !consumedTriggerIds.has(item.id),
          );
          newItems.forEach((item) => consumedTriggerIds.add(item.id));
          return newItems;
        };

        // Apply filtering to all trigger types (animations, audio)
        // Elements are declarative and should always re-render
        const renderState = {
          ...rawRenderState,
          animations: filterAndConsume(rawRenderState.animations),
          audio: filterAndConsume(rawRenderState.audio),
        };

        // Store for debugging - this is what actually renders
        lastRenderedState = renderState;

        console.log("filteredRenderState", renderState);
        routeGraphics.render(renderState);
      } else {
        const handler = effects[effect.name];
        if (handler) {
          handler(deps, effect.payload);
        }
      }
    }
  };

  return {
    handleEffects,
    selectRenderedState: () => lastRenderedState,
  };
};

export default createEffectsHandler;
