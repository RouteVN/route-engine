import { parse } from "https://cdn.jsdelivr.net/npm/yaml@2.7.1/+esm";
import createRouteEngine from "./RouteEngine.js";
import { Ticker } from "https://cdn.jsdelivr.net/npm/pixi.js@8.0.0/+esm";

import createRouteGraphics, {
  createAssetBufferManager,
  textPlugin,
  rectPlugin,
  spritePlugin,
  sliderPlugin,
  containerPlugin,
  textRevealingPlugin,
  tweenPlugin,
  soundPlugin,
} from "https://cdn.jsdelivr.net/npm/route-graphics@0.0.15/+esm"

const projectData = parse(window.yamlContent);

const init = async () => {
  const assets = {
    "lakjf3lka": {
      url: "/public/background-1-1.png",
      type: "image/png",
    },
    "dmni32": {
      url: "/public/background-1-2.png",
      type: "image/png",
    },
    "23jkfa893": {
      url: "/public/background-2-1.png",
      type: "image/png",
    },
    "la3lka": {
      url: "/public/circle-blue.png",
      type: "image/png",
    },
    "a32kf3": {
      url: "/public/circle-green.png",
      type: "image/png",
    },
    "x342fga": {
      url: "/public/circle-green-small.png",
      type: "image/png",
    },
    "94lkj289": {
      url: "/public/logo1.png",
      type: "image/png",
    },
    "3kda832": {
      url: "/public/dialogue-box.png",
      type: "image/png",
    },
    "3ka3s": {
      url: "/public/bgm-1.mp3",
      type: "audio/mpeg",
    },
    "xk393": {
      url: "/public/bgm-2.mp3",
      type: "audio/mpeg",
    },
    "xj323": {
      url: "/public/sfx-1.mp3",
      type: "audio/mpeg",
    },
    "39csl": {
      url: "/public/sfx-2.wav",
      type: "audio/wav",
    },
    "vertical_hover_bar": {
      url: "/public/vertical_hover_bar.png",
      type: "image/png"
    },
    "vertical_hover_thumb": {
      url: "/public/vertical_hover_thumb.png",
      type: "image/png"
    },
    "vertical_idle_bar": {
      url: "/public/vertical_idle_bar.png",
      type: "image/png"
    },
    "vertical_idle_thumb": {
      url: "/public/vertical_idle_thumb.png",
      type: "image/png"
    },
    "horizontal_hover_bar": {
      url: "/public/horizontal_hover_bar.png",
      type: "image/png"
    },
    "horizontal_hover_thumb": {
      url: "/public/horizontal_hover_thumb.png",
      type: "image/png"
    },
    "horizontal_idle_bar": {
      url: "/public/horizontal_idle_bar.png",
      type: "image/png"
    },
    "horizontal_idle_thumb": {
      url: "/public/horizontal_idle_thumb.png",
      type: "image/png"
    }
  };

  const assetBufferManager = createAssetBufferManager();
  await assetBufferManager.load(assets);
  const assetBufferMap = assetBufferManager.getBufferMap();

  const routeGraphics = createRouteGraphics();

  const plugins = {
    elements: [
      textPlugin,
      rectPlugin,
      spritePlugin,
      sliderPlugin,
      containerPlugin,
      textRevealingPlugin
    ],
    animations: [
      tweenPlugin
    ],
    audio: [
      soundPlugin
    ]
  };

  let count = 0;

  // Create dedicated ticker for auto mode
  const ticker = new Ticker();
  ticker.start();

  await routeGraphics.init({
    width: 1920,
    height: 1080,
    plugins,
    eventHandler: (eventName, payload) => {
      if (eventName === 'renderComplete') {
        if (count >= 2) {
          return;
        }
        engine.handleAction('nextLineFromCompleted', {})
        count += 1;
        // engine.handleLineActions();
      } else {
        if (payload.actions) {
          engine.handleActions(payload.actions);
        }
      }
    },
  });
  await routeGraphics.loadAssets(assetBufferMap)

  document.getElementById("canvas").appendChild(routeGraphics.canvas);
  document.getElementById("canvas").addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Create effectsHandler with closure to persist timer state
  const createEffectsHandler = () => {
    // Auto mode state (persisted across calls via closure)
    let autoModeElapsed = 0;
    let autoModeCallback = null;

    // Skip mode state (persisted across calls via closure)
    let skipModeElapsed = 0;
    let skipModeCallback = null;

    return (effects) => {
      // Deduplicate effects by name, keeping only the last occurrence
      const deduplicatedEffects = effects.reduce((acc, effect) => {
        acc[effect.name] = effect;
        return acc;
      }, {});

      // Convert back to array and process deduplicated effects
      const uniqueEffects = Object.values(deduplicatedEffects);

      for (const effect of uniqueEffects) {
      if (effect.name === 'render') {
        const renderState = engine.selectRenderState();
        routeGraphics.render(renderState);
      } else if (effect.name === 'handleLineActions') {
        engine.handleLineActions();
      } else if (effect.name === 'lineCompleted') {
        engine.handleAction('nextLineFromCompleted', {});
      } else if (effect.name === 'startAutoNextTimer') {
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
          const delay = effect.delay ?? 1000;
          if (autoModeElapsed >= delay) {
            autoModeElapsed = 0;
            engine.handleAction('nextLine', {});
          }
        };

        // Add to auto ticker
        ticker.add(autoModeCallback);
      } else if (effect.name === 'clearAutoNextTimer') {
        // Remove ticker callback
        if (autoModeCallback) {
          ticker.remove(autoModeCallback);
          autoModeCallback = null;
        }
        autoModeElapsed = 0;
      } else if (effect.name === 'startSkipNextTimer') {
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
            engine.handleAction('nextLine', {});
          }
        };

        // Add to skip ticker
        ticker.add(skipModeCallback);
      } else if (effect.name === 'clearSkipNextTimer') {
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

  const effectsHandler = createEffectsHandler();
  const engine = createRouteEngine({ handlePendingEffects: effectsHandler });

  engine.init({
    initialState: {
      global: {
        currentLocalizationPackageId: 'eklekfjwalefj'
      },
      projectData
    }
  });

};

await init();
