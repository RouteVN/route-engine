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

import RvnEngine from "./state/engine2.js";

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

  const res = await fetch(`/public/vndata/003.json`);
  const gameData = await res.json();

  const fileUrls = getAllValuesByPropertyName(gameData.resources, [
    "url",
    "src",
  ]).filter((url) => !!url);
  const imageUrls = fileUrls
    .filter((url) => !url.endsWith(".wav") && !url.endsWith(".ogg"))
    .concat([
      "/public/first-contract/font/NomnomNami2.ttf",
      "/public/first-contract/gui/slider/horizontal_idle_thumb.png",
      "/public/first-contract/gui/slider/horizontal_hover_thumb.png",
      "/public/first-contract/gui/slider/horizontal_idle_bar.png",
      "/public/first-contract/gui/slider/horizontal_hover_bar.png",
      "/public/first-contract/gui/slider/vertical_idle_thumb.png",
      "/public/first-contract/gui/slider/vertical_hover_thumb.png",
      "/public/first-contract/gui/slider/vertical_idle_bar.png",
      "/public/first-contract/gui/slider/vertical_hover_bar.png",
      "/public/first-contract/gui/button/slot_hover_background.png",
    ]);

  await app.loadAssets(imageUrls);
  const soundUrls = fileUrls.filter(
    (url) => url.endsWith(".wav") || url.endsWith(".ogg")
  );
  await app.loadSoundAssets(
    soundUrls.concat([
      "/public/first-contract/audio/sfx_button1.wav",
      "/public/first-contract/audio/sfx_button2.wav",
    ])
  );

  await app.init({
    width: 1280,
    height: 720,
    backgroundColor: "#000000",
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
    eventHandler: (event, payload) => {
      console.log("eventHandler", {
        action: event,
        payload,
      });
      engine.handleEvent(event, payload);
    },
  });

  element.appendChild(app.canvas);

  element.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  const engine = new RvnEngine();
  engine.loadGameData(gameData);

  const configKey = "rvn_config";
  engine.persistentConfigInterface = {
    setAll: (config) => {
      localStorage.setItem(configKey, JSON.stringify(config));
    },
    set: (key, data) => {
      const config = localStorage.getItem(configKey);
      const configObj = config ? JSON.parse(config) : {};
      configObj[key] = data;
      localStorage.setItem(configKey, JSON.stringify(configObj));
    },
    get: (key) => {
      const config = localStorage.getItem(configKey);
      const configObj = config ? JSON.parse(config) : {};
      return configObj[key];
    },
    getAll: () => {
      const config = localStorage.getItem(configKey);
      const configObj = config ? JSON.parse(config) : {};
      return configObj;
    },
  };

  const saveDataKey = "rvn_save_data";
  engine.persistentSaveInterface = {
    setAll: (config) => {
      localStorage.setItem(saveDataKey, JSON.stringify(config));
    },
    set: (key, data) => {
      const config = localStorage.getItem(saveDataKey);
      const configObj = config ? JSON.parse(config) : {};
      configObj[key] = data;
      localStorage.setItem(saveDataKey, JSON.stringify(configObj));
    },
    get: (key) => {
      const config = localStorage.getItem(saveDataKey);
      const configObj = config ? JSON.parse(config) : {};
      return configObj[key];
    },
    getAll: () => {
      const config = localStorage.getItem(saveDataKey);
      const configObj = config ? JSON.parse(config) : {};
      Object.values(configObj).forEach((value) => {
        if (value.url) {
          app.loadAssets([value.url]);
        }
      });
      return configObj;
    },
  }

  engine.onTriggerRender = ({ elements, transitions }) => {
    app.render({
      id: "rvn_root",
      elements: elements,
      transitions: transitions,
    });
  };

  engine.init();
  console.log(engine._currentStepPointer());
};

export default initializeVnPlayer;
