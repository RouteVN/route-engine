import { parse } from "https://cdn.jsdelivr.net/npm/yaml@2.7.1/+esm";
import createRouteEngine, {
  createEffectsHandler,
  createIndexedDbPersistence,
} from "./RouteEngine.js";
import { Ticker } from "https://cdn.jsdelivr.net/npm/pixi.js@8.0.0/+esm";
import { createSaveThumbnailAssetId } from "./saveSlotUtils.js";

import createRouteGraphics, {
  createAssetBufferManager,
  textPlugin,
  rectPlugin,
  spritePlugin,
  inputPlugin,
  sliderPlugin,
  containerPlugin,
  textRevealingPlugin,
  tweenPlugin,
  soundPlugin,
  videoPlugin,
  particlesPlugin,
  animatedSpritePlugin,
} from "./RouteGraphics.js";

const projectData = parse(window.yamlContent);
const namespace = `vt:${window.location.pathname}`;
const isVtCaptureMode = () =>
  window?.RTGL_VT_DEBUG === true || navigator.webdriver === true;

const downscaleBase64Image = async (base64, scale = 0.5) => {
  if (!isVtCaptureMode() || scale === 1) {
    return base64;
  }

  const blob = await (await fetch(base64)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close?.();
    throw new Error("Failed to create VT screenshot canvas.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  return canvas.toDataURL("image/png");
};

const init = async () => {
  const screenWidth = projectData?.screen?.width ?? 1920;
  const screenHeight = projectData?.screen?.height ?? 1080;
  const assets = {
    lakjf3lka: {
      url: "/public/bg/door.png",
      type: "image/png",
    },
    dmni32: {
      url: "/public/bg/forest.png",
      type: "image/png",
    },
    "23jkfa893": {
      url: "/public/bg/moon.png",
      type: "image/png",
    },
    la3lka: {
      url: "/public/circle-blue.png",
      type: "image/png",
    },
    a32kf3: {
      url: "/public/circle-green.png",
      type: "image/png",
    },
    x342fga: {
      url: "/public/circle-green-small.png",
      type: "image/png",
    },
    char_sprite_1: {
      url: "/public/characters/sprite-1-1.png",
      type: "image/png",
    },
    char_sprite_2: {
      url: "/public/characters/sprite-1-2.png",
      type: "image/png",
    },
    char_sprite_3: {
      url: "/public/characters/sprite-2-1.png",
      type: "image/png",
    },
    char_sprite_4: {
      url: "/public/characters/sprite-2-2.png",
      type: "image/png",
    },
    character_parts_body: {
      url: "/public/characters/parts-body-base.png",
      type: "image/png",
    },
    character_parts_face_neutral: {
      url: "/public/characters/parts-face-neutral.png",
      type: "image/png",
    },
    character_parts_face_smile: {
      url: "/public/characters/parts-face-smile.png",
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
    xk393: {
      url: "/public/bgm-2.mp3",
      type: "audio/mpeg",
    },
    xj323: {
      url: "/public/sfx-1.mp3",
      type: "audio/mpeg",
    },
    "39csl": {
      url: "/public/sfx-2.wav",
      type: "audio/wav",
    },
    vertical_hover_bar: {
      url: "/public/vertical_hover_bar.png",
      type: "image/png",
    },
    vertical_hover_thumb: {
      url: "/public/vertical_hover_thumb.png",
      type: "image/png",
    },
    vertical_idle_bar: {
      url: "/public/vertical_idle_bar.png",
      type: "image/png",
    },
    vertical_idle_thumb: {
      url: "/public/vertical_idle_thumb.png",
      type: "image/png",
    },
    horizontal_hover_bar: {
      url: "/public/horizontal_hover_bar.png",
      type: "image/png",
    },
    horizontal_hover_thumb: {
      url: "/public/horizontal_hover_thumb.png",
      type: "image/png",
    },
    horizontal_idle_bar: {
      url: "/public/horizontal_idle_bar.png",
      type: "image/png",
    },
    horizontal_idle_thumb: {
      url: "/public/horizontal_idle_thumb.png",
      type: "image/png",
    },
    "fighter-spritesheet": {
      url: "/public/fighter.png",
      type: "image/png",
    },
    "mask-diagonal": {
      url: "/public/mask_diagonal.png",
      type: "image/png",
    },
  };

  if (!window?.RTGL_VT_DEBUG) {
    Object.assign(assets, {
      video_sample: {
        url: "/public/video_sample.mp4",
        type: "video/mp4",
      },
    });
  }

  const assetBufferManager = createAssetBufferManager();
  await assetBufferManager.load(assets);
  const assetBufferMap = assetBufferManager.getBufferMap();

  const routeGraphics = createRouteGraphics();
  window.takeVtScreenshotBase64 = async (label) => {
    let base64;

    try {
      base64 = await routeGraphics.extractBase64(label);
    } catch {
      base64 = routeGraphics.canvas.toDataURL("image/png");
    }

    return await downscaleBase64Image(base64);
  };

  const plugins = {
    elements: [
      textPlugin,
      rectPlugin,
      spritePlugin,
      inputPlugin,
      sliderPlugin,
      containerPlugin,
      textRevealingPlugin,
      videoPlugin,
      particlesPlugin,
      animatedSpritePlugin,
    ],
    animations: [tweenPlugin],
    audio: [soundPlugin],
  };

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
  const persistence = createIndexedDbPersistence({ namespace });
  const {
    saveSlots,
    globalDeviceVariables,
    globalAccountVariables,
    globalRuntime,
    accountViewedRegistry,
  } = await persistence.load();

  let engine;
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    persistence,
    routeGraphics: {
      render: (renderState) => {
        routeGraphics.render(renderState);
      },
    },
    ticker,
  });

  const routeGraphicsEventHandler =
    effectsHandler.createRouteGraphicsEventHandler({
      preprocessPayload: async (eventName, payload) => {
        const saveAction = payload?.actions?.saveSlot;
        if (saveAction) {
          const saveTimestamp = Date.now();
          let url;

          try {
            // Capture only the story container so the save menu itself does not
            // become the slot thumbnail.
            url = await routeGraphics.extractBase64("story");
          } catch {
            url = routeGraphics.canvas.toDataURL("image/png");
          }
          const assets = {
            [createSaveThumbnailAssetId(
              saveAction.slotId,
              saveTimestamp,
              payload,
            )]: {
              buffer: base64ToArrayBuffer(url),
              type: "image/png",
            },
          };
          await routeGraphics.loadAssets(assets);

          return {
            ...payload,
            actions: {
              ...payload.actions,
              saveSlot: {
                ...saveAction,
                thumbnailImage: url,
                savedAt: saveTimestamp,
              },
            },
          };
        }

        return payload;
      },
      onEvent: async (eventName, payload) => {
        console.log("[vt][route-graphics:event]", eventName, payload);
      },
    });

  window.__vtHandleRouteGraphicsEvent = routeGraphicsEventHandler;

  await routeGraphics.init({
    width: screenWidth,
    height: screenHeight,
    plugins,
    eventHandler: routeGraphicsEventHandler,
    onFirstRender: () => {
      window.dispatchEvent(new CustomEvent("vt:ready"));
    },
    debug: window?.RTGL_VT_DEBUG ?? false,
  });
  await routeGraphics.loadAssets(assetBufferMap);

  const canvasHost = document.getElementById("canvas");
  canvasHost.appendChild(routeGraphics.canvas);
  canvasHost.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  engine = createRouteEngine({ handlePendingEffects: effectsHandler });

  engine.init({
    namespace,
    initialState: {
      global: {
        saveSlots,
        variables: { ...globalDeviceVariables, ...globalAccountVariables },
        runtime: globalRuntime,
        accountViewedRegistry,
      },
      projectData,
    },
  });

  window.__vtEngine = engine;
  window.__vtPersistence = persistence;
  window.__vtNamespace = persistence.namespace;

  window.addEventListener("vt:nextLine", () => {
    engine.handleActions({
      nextLine: {},
    });
  });
};

await init();
