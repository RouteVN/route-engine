import yaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm";
import Engine from "./rvn.js";
import {
  PixiTDR,
  SpriteRendererPlugin,
  TextRendererPlugin,
  ContainerRendererPlugin,
  TextRevealingRendererPlugin,
  GraphicsRendererPlugin,
  SoundPlugin,
  SliderRendererPlugin,
  KeyframeTransitionPlugin,
} from "./renderer.js";

// Convert YAML to JSON
const jsonData = yaml.load(window.yamlContent);

const init = async () => {
  const assets = {
    "file:lakjf3lka": {
      url: "/public/background-1-1.png",
      type: "image/png",
    },
    "file:dmni32": {
      url: "/public/background-1-2.png",
      type: "image/png",
    },
    "file:23jkfa893": {
      url: "/public/background-2-1.png",
      type: "image/png",
    },
    "file:la3lka": {
      url: "/public/circle-blue.png",
      type: "image/png",
    },
    "file:a32kf3": {
      url: "/public/circle-green.png",
      type: "image/png",
    },
    "file:x342fga": {
      url: "/public/circle-green-small.png",
      type: "image/png",
    },
    "file:94lkj289": {
      url: '/public/logo1.png',
      type: 'image/png',
    }
  };

  const assetBufferMap = {};
  await Promise.all(
    Object.entries(assets).map(async ([key, value]) => {
      const resp = await fetch(value.url);
      const buffer = await resp.arrayBuffer();
      assetBufferMap[key] = {
        buffer,
        type: value.type,
      };
    })
  );

  const app = new PixiTDR();
  await app.init({
    width: 1920,
    height: 1080,
    assetBufferMap,
    eventHandler: (event, payload) => {
      engine.handleEvent(event, payload);

    },
    plugins: [
      new SpriteRendererPlugin(),
      new TextRendererPlugin(),
      new ContainerRendererPlugin(),
      new TextRevealingRendererPlugin(),
      new GraphicsRendererPlugin(),
      new SoundPlugin(),
      new SliderRendererPlugin(),
      new KeyframeTransitionPlugin(),
    ],
  });

  await app.loadAssets([
    "file:lakjf3lka",
    "file:dmni32",
    "file:23jkfa893",
    "file:la3lka",
    "file:a32kf3",
    "file:x342fga",
    "file:94lkj289",
  ]);

  await app.loadSoundAssets([
    // "/public/bgm-1.mp3",
    // "/public/bgm-2.mp3",
    // "/public/bgm-3.mp3",
    // "/public/sfx-1.ogg",
    // "/public/sfx-2.ogg",
    // "/public/sfx-3.ogg",
  ]);
  document.getElementById("canvas").appendChild(app.canvas);
  document.getElementById("canvas").addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
  const engine = new Engine();
  const callback = (event, payload) => {
    console.log({
      event,
      payload,
    });
    if (event === "render") {
      app.render(payload);
    }
  };
  engine.init(jsonData, {
    callback,
    ticker: app._app.ticker,
  });
};

await init();
