import { parse } from "https://cdn.jsdelivr.net/npm/yaml@2.7.1/+esm";
import createRouteEngine, { createEffectsHandler } from "./RouteEngine.js";
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
  videoPlugin,
  particlesPlugin,
  animatedSpritePlugin
} from "https://cdn.jsdelivr.net/npm/route-graphics@0.0.25/+esm"

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
    },
    "video_sample": {
      url: "/public/video_sample.mp4",
      type: "video/mp4"
    },
    "fighter-spritesheet": {
      url: "/public/fighter.png",
      type: "image/png",
    },
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
      textRevealingPlugin,
      videoPlugin,
      particlesPlugin,
      animatedSpritePlugin
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

  const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(
      base64.replace(/^data:image\/[a-z]+;base64,/, ""),
    );
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };


  await routeGraphics.init({
    width: 1920,
    height: 1080,
    plugins,
    eventHandler: async (eventName, payload) => {
      if (payload.actions) {
          if (payload.actions.saveSaveSlot) {
            const url = await routeGraphics.extractBase64("story");
            const assets = {
              [`saveThumbnailImage:${payload.actions.saveSaveSlot.slot}`]: {
                buffer: base64ToArrayBuffer(url),
                type: "image/png",
              },
            };
            await routeGraphics.loadAssets(assets);
            payload.actions.saveSaveSlot.thumbnailImage = url;
          }
          engine.handleActions(payload.actions);
        }
    },
  });
  await routeGraphics.loadAssets(assetBufferMap)

  document.getElementById("canvas").appendChild(routeGraphics.canvas);
  document.getElementById("canvas").addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  const effectsHandler = createEffectsHandler({ getEngine: () => engine, routeGraphics, ticker });
  const engine = createRouteEngine({ handlePendingEffects: effectsHandler });
  const saveSlots = JSON.parse(localStorage.getItem("saveSlots")) || {};
  const globalDeviceVariables = JSON.parse(localStorage.getItem("globalDeviceVariables")) || {};
  const globalAccountVariables = JSON.parse(localStorage.getItem("globalAccountVariables")) || {};

  engine.init({
    initialState: {
      global: {
        currentLocalizationPackageId: 'eklekfjwalefj',
        saveSlots,
        variables: { ...globalDeviceVariables, ...globalAccountVariables }
      },
      projectData
    }
  });

};

await init();
