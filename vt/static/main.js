import { parse, Ticker } from "./VtDependencies.js";
import createRouteEngine, {
  createEffectsHandler,
  createIndexedDbPersistence,
} from "./RouteEngine.js";
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

const parsedData = parse(window.yamlContent);
const { l10nData, ...projectData } = parsedData;
const namespace = `vt:${window.location.pathname}`;
const isVtCaptureMode = () =>
  window?.RTGL_VT_DEBUG === true || navigator.webdriver === true;
const dispatchVtReady = () => {
  window.dispatchEvent(new CustomEvent("vt:ready"));
};
const waitForPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
const setBootstrapPhase = (phase) => {
  window.__vtBootstrapPhase = phase;
};

const renderBootstrapFailure = async (error) => {
  const message = error instanceof Error ? error.stack : String(error);
  const output = document.createElement("pre");
  output.dataset.vtBootstrapFailure = "true";
  output.textContent = [
    "VT BOOTSTRAP FAILED",
    `phase: ${window.__vtBootstrapPhase ?? "unknown"}`,
    message,
  ].join("\n\n");
  Object.assign(output.style, {
    boxSizing: "border-box",
    width: "100vw",
    height: "100vh",
    margin: "0",
    padding: "32px",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    background: "#7f1d1d",
    color: "#ffffff",
    font: "24px/1.4 monospace",
  });
  // RTGL prefers this hook over a browser screenshot. Disable it so a failure
  // that occurs after the hook was installed captures this diagnostic DOM,
  // never a stale or blank Route Graphics canvas.
  window.takeVtScreenshotBase64 = undefined;
  document.body.replaceChildren(output);
  window.__vtBootstrapError = message;
  console.error("[vt][bootstrap]", error);

  await waitForPaint();
  dispatchVtReady();
};

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
  setBootstrapPhase("prepare project and assets");
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
    "l10n-ja-feature-image.svg": {
      url: "/public/l10n/japanese/files/l10n-ja-feature-image.svg",
      type: "image/svg+xml",
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
  const playbackTickerCallbacks = new Set();
  const usesDeterministicPlaybackTicker =
    isVtCaptureMode() &&
    projectData.resources?.variables?.vtDeterministicPlaybackTicker?.default ===
      true;
  const playbackTicker = {
    add(callback) {
      playbackTickerCallbacks.add(callback);
      if (!usesDeterministicPlaybackTicker) {
        ticker.add(callback);
      }
    },
    remove(callback) {
      playbackTickerCallbacks.delete(callback);
      if (!usesDeterministicPlaybackTicker) {
        ticker.remove(callback);
      }
    },
  };
  ticker.start();
  window.addEventListener("vt:tickPlayback", (event) => {
    const deltaMS = Number(event?.detail?.deltaMS);
    if (!Number.isFinite(deltaMS) || deltaMS < 0) {
      throw new Error("vt:tickPlayback requires finite non-negative deltaMS");
    }
    [...playbackTickerCallbacks].forEach((callback) => callback({ deltaMS }));
  });

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
  setBootstrapPhase("load persistence");
  const persistence = createIndexedDbPersistence({ namespace });
  const {
    saveSlots,
    globalDeviceVariables,
    globalAccountVariables,
    globalRuntime,
    accountViewedRegistry,
    accountReplayRegistry,
  } = await persistence.load();

  let engine;
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    persistence,
    routeGraphics: {
      render: (renderState) => {
        if (isVtCaptureMode()) {
          window.__vtLastRenderState = structuredClone(renderState);
          if (renderState.audioAnimations?.length > 0) {
            window.__vtLastAudioAnimation = structuredClone(
              renderState.audioAnimations[0],
            );
          }
          if (renderState.audioAnimationControl) {
            window.__vtLastAudioAnimationControl = structuredClone(
              renderState.audioAnimationControl,
            );
          }
        }
        routeGraphics.render(renderState);
      },
    },
    ticker: playbackTicker,
    handleUnhandledEffect: (effect) => {
      if (
        effect?.name !== "vt:dispatchActions" ||
        !effect.payload?.actions ||
        typeof effect.payload.actions !== "object" ||
        Array.isArray(effect.payload.actions)
      ) {
        throw new Error(`Unhandled VT effect "${effect?.name}".`);
      }

      engine.handleActions(effect.payload.actions);
    },
  });

  const routeGraphicsEventHandler =
    effectsHandler.createRouteGraphicsEventHandler({
      preprocessPayload: async (eventName, payload) => {
        const preprocessDelayMs = payload?._vtPreprocessDelayMs;
        if (
          Number.isFinite(preprocessDelayMs) &&
          preprocessDelayMs > 0 &&
          isVtCaptureMode()
        ) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, preprocessDelayMs);
          });
        }

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

  setBootstrapPhase("initialize Route Graphics");
  await routeGraphics.init({
    width: screenWidth,
    height: screenHeight,
    plugins,
    eventHandler: routeGraphicsEventHandler,
    debug: window?.RTGL_VT_DEBUG ?? false,
  });
  setBootstrapPhase("load assets");
  await routeGraphics.loadAssets(assetBufferMap);

  const canvasHost = document.getElementById("canvas");
  canvasHost.appendChild(routeGraphics.canvas);
  canvasHost.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  setBootstrapPhase("initialize Route Engine");
  const deterministicRandomWord =
    projectData.resources?.variables?.vtRandomUint32?.default;
  const randomSource =
    Number.isInteger(deterministicRandomWord) &&
    deterministicRandomWord >= 0 &&
    deterministicRandomWord <= 0xffff_ffff
      ? { nextUint32: () => deterministicRandomWord }
      : undefined;
  engine = createRouteEngine({
    handlePendingEffects: effectsHandler,
    randomSource,
  });

  engine.init({
    namespace,
    initialState: {
      global: {
        saveSlots,
        variables: { ...globalDeviceVariables, ...globalAccountVariables },
        runtime: globalRuntime,
        accountViewedRegistry,
        accountReplayRegistry,
      },
      projectData,
      l10nData,
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
  setBootstrapPhase("wait for initialized render");
  await waitForPaint();
  setBootstrapPhase("complete");
  dispatchVtReady();
};

const bootstrapTimeoutMs = 10_000;
let bootstrapTimeout;

try {
  await Promise.race([
    init(),
    new Promise((_, reject) => {
      bootstrapTimeout = window.setTimeout(() => {
        reject(
          new Error(
            `VT bootstrap exceeded ${bootstrapTimeoutMs}ms in phase "${window.__vtBootstrapPhase ?? "unknown"}".`,
          ),
        );
      }, bootstrapTimeoutMs);
    }),
  ]);
} catch (error) {
  await renderBootstrapFailure(error);
} finally {
  window.clearTimeout(bootstrapTimeout);
}
