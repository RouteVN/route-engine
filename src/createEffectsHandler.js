const createEffectsHandler = ({ getEngine, routeGraphics, ticker }) => {
  // Auto mode state (persisted across calls via closure)
  let autoModeElapsed = 0;
  let autoModeCallback = null;

  // Skip mode state (persisted across calls via closure)
  let skipModeElapsed = 0;
  let skipModeCallback = null;

  return async (effects) => {
    const engine = getEngine();
    // Deduplicate effects by name, keeping only the last occurrence
    const deduplicatedEffects = effects.reduce((acc, effect) => {
      acc[effect.name] = effect;
      return acc;
    }, {});

    // Convert back to array and process deduplicated effects
    const uniqueEffects = Object.values(deduplicatedEffects);

    for (const effect of uniqueEffects) {
      if (effect.name === "render") {
        const renderState = engine.selectRenderState();
        routeGraphics.render(renderState);
      } else if (effect.name === "handleLineActions") {
        engine.handleLineActions();
      } else if (effect.name === "startAutoNextTimer") {
        // Remove old callback if exists
        if (autoModeCallback) {
          ticker.remove(autoModeCallback);
        }

        // Reset elapsed time
        autoModeElapsed = 0;

        // Create new ticker callback for auto mode
        autoModeCallback = (time) => {
          autoModeElapsed += time.deltaMS;

          // Auto advance every 1000ms (1 second) - hardcoded
          // TODO: Speed can adjust in the future
          if (autoModeElapsed >= 1000) {
            autoModeElapsed = 0;
            engine.handleAction("nextLine", {});
          }
        };

        // Add to auto ticker
        ticker.add(autoModeCallback);
      } else if (effect.name === "clearAutoNextTimer") {
        // Remove ticker callback
        if (autoModeCallback) {
          ticker.remove(autoModeCallback);
          autoModeCallback = null;
        }
        autoModeElapsed = 0;
      } else if (effect.name === "startSkipNextTimer") {
        // Remove old callback if exists
        if (skipModeCallback) {
          ticker.remove(skipModeCallback);
        }

        // Reset elapsed time
        skipModeElapsed = 0;

        // Create new ticker callback for skip mode
        skipModeCallback = (time) => {
          skipModeElapsed += time.deltaMS;

          // Skip advance every 30ms
          if (skipModeElapsed >= 30) {
            skipModeElapsed = 0;
            engine.handleAction("nextLine", {});
          }
        };

        // Add to skip ticker
        ticker.add(skipModeCallback);
      } else if (effect.name === "clearSkipNextTimer") {
        // Remove ticker callback
        if (skipModeCallback) {
          ticker.remove(skipModeCallback);
          skipModeCallback = null;
        }
        skipModeElapsed = 0;
      }
    }
  };
};

export default createEffectsHandler;
