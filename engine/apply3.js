import {
  PixiTDR,
  SpriteRendererPlugin,
  SpriteInteractiveRendererPlugin,
  TextRendererPlugin,
  TextRevealingRendererPlugin,
  TextInteractiveRendererPlugin,
  ContainerRendererPlugin,
  FadeTransitionPlugin,
  ScaleTransitionPlugin,
  RepeatFadeTransitionPlugin,
  KeyframeTransitionPlugin,
  AnchorLayoutContainerRendererPlugin,
  GraphicsRendererPlugin,
  SoundPlugin,
  SliderRendererPlugin,
} from "./renderer.js";

import {
  RvnEngine,
  HandlerActions,
} from "./state/engine.js";

const applyWasmController = async (options) => {
  const controller = new RvnEngine(options);
  await controller.init();
  return controller.handleAction;
};

const getAllValuesByPropertyName = (obj, propertyNames) => {
  const result = [];

  const traverse = (obj) => {
    if (typeof obj === "object" && obj !== null) {
      if (Array.isArray(obj)) {
        obj.forEach((item) => traverse(item));
      } else {
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            if (propertyNames.includes(key)) {
              result.push(obj[key]);
            }
            traverse(obj[key]);
          }
        }
      }
    }
  };

  traverse(obj);
  return result;
};


const initializeVnPlayer = async (element, onClose) => {
  const app = new PixiTDR();
  const controller = await applyWasmController({
    gameDataPath: "002",
    getData: (path) =>
      fetch(`/public/vndata/${path}.json`).then((res) => res.json()),
    getPersistentData: (key) => {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : undefined;
    },
    savePersistentData: (key, data) => {
      if (data === undefined) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(data));
    },
    onChangeGameStage: async ({ elements, transitions }) => {
      const fileUrls = getAllValuesByPropertyName(elements, ["url"]).filter(
        (url) => !!url
      );
      await app.loadAssets(
        fileUrls.filter((url) => !url.endsWith(".wav") && !url.endsWith(".ogg"))
      );
      const soundFileIds = fileUrls.filter(
        (url) => url.endsWith(".wav") || url.endsWith(".ogg")
      );
      await app.loadSoundAssets(soundFileIds.concat(["/public/first-contract/audio/sfx_button1.wav", "/public/first-contract/audio/sfx_button2.wav"]));
      app.render({
        id: "rvn_root",
        elements: elements,
        transitions: transitions,
      });
    },
    takeScreenshot: async () => {
      try {
        const url = await app._app.renderer.extract.base64(app._app.stage);
        return url;
      } catch (e) {
        // console.error(e);
        return null;
      }
    },
    onClose,
  });

  await app.init({
    width: 1280,
    height: 720,
    backgroundColor: "black",
    plugins: [
      new SpriteRendererPlugin(),
      new SpriteInteractiveRendererPlugin(),
      new TextRendererPlugin(),
      new TextRevealingRendererPlugin(),
      new TextInteractiveRendererPlugin(),
      new ContainerRendererPlugin(),
      new FadeTransitionPlugin(),
      new ScaleTransitionPlugin(),
      new RepeatFadeTransitionPlugin(),
      new KeyframeTransitionPlugin(),
      new AnchorLayoutContainerRendererPlugin(),
      new GraphicsRendererPlugin(),
      new SoundPlugin(),
      new SliderRendererPlugin(),
    ],
    eventHandler: (action, payload) =>
      controller(action, payload),
  });

  // app._app.stage.eventMode = "static";
  // app._app.stage.on("pointerdown", (e) => {
  //   if (e.data.button === 0) {
  //     controller(HandlerActions.NextStep);
  //   } else if (e.data.button === 2) {
  //     controller(HandlerActions.RightClick);
  //   }
  // });
  // let lastWheelTime = 0;
  // const throttleDelay = 300; // 1 second

  // app._app.stage.on("wheel", (e) => {
  //   const currentTime = Date.now();
  //   if (currentTime - lastWheelTime < throttleDelay) {
  //     return; // Ignore wheel events within the throttle delay
  //   }
  //   lastWheelTime = currentTime;

  //   if (e.deltaY > 0) {
  //   } else {
  //     controller(HandlerActions.PreviousStep);
  //   }
  // });

  app.loadAssets([
    "/public/first-contract/font/NomnomNami2.ttf",
    "/public/first-contract/gui/slider/horizontal_idle_thumb.png",
    "/public/first-contract/gui/slider/horizontal_hover_thumb.png",
    "/public/first-contract/gui/slider/horizontal_idle_bar.png",
    "/public/first-contract/gui/slider/horizontal_hover_bar.png",
    "/public/first-contract/gui/slider/vertical_idle_thumb.png",
    "/public/first-contract/gui/slider/vertical_hover_thumb.png",
    "/public/first-contract/gui/slider/vertical_idle_bar.png",
    "/public/first-contract/gui/slider/vertical_hover_bar.png",
    "/public/first-contract/gui/button/slot_hover_background.png"
  ]);

  element.appendChild(app.canvas);
  element.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  element.addEventListener("keydown", (e) => {
    if (e.key === "Control") {
      e.preventDefault();
      e.stopPropagation();
      controller(HandlerActions.Skip);
    }
  });
  element.addEventListener("keyup", (e) => {
    if (e.key === "Control") {
      e.preventDefault();
      e.stopPropagation();
      controller(HandlerActions.StopSkip);
    }
  });
  controller(HandlerActions.Init);
};

export default initializeVnPlayer;
