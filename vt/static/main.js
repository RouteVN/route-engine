import yaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm";
import { RouteEngine } from "./RouteEngine.js";
import RouteGraphics, {
  SpriteRendererPlugin,
  TextRendererPlugin,
  ContainerRendererPlugin,
  TextRevealingRendererPlugin,
  RectRendererPlugin,
  AudioPlugin,
  SliderRendererPlugin,
  KeyframeTransitionPlugin,
  createAssetBufferManager,
} from "https://cdn.jsdelivr.net/npm/route-graphics@0.0.2-rc29/+esm";

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
      url: "/public/logo1.png",
      type: "image/png",
    },
    "file:3kda832": {
      url: "/public/dialogue-box.png",
      type: "image/png",
    },
    "file:3ka3s": {
      url: "/public/bgm-1.mp3",
      type: "audio/mpeg",
    },
    "file:xk393": {
      url: "/public/bgm-2.mp3",
      type: "audio/mpeg",
    },
    "file:xj323": {
      url: "/public/sfx-1.mp3",
      type: "audio/mpeg",
    },
    "file:39csl": {
      url: "/public/sfx-2.wav",
      type: "audio/wav",
    },
    "file:vertical_hover_bar": {
      url: "/public/vertical_hover_bar.png",
      type: "image/png"
    },
    "file:vertical_hover_thumb": {
      url: "/public/vertical_hover_thumb.png",
      type: "image/png"
    },
    "file:vertical_idle_bar": {
      url: "/public/vertical_idle_bar.png",
      type: "image/png"
    },
    "file:vertical_idle_thumb": {
      url: "/public/vertical_idle_thumb.png",
      type: "image/png"
    },
    "file:horizontal_hover_bar": {
      url: "/public/horizontal_hover_bar.png",
      type: "image/png"
    },
    "file:horizontal_hover_thumb": {
      url: "/public/horizontal_hover_thumb.png",
      type: "image/png"
    },
    "file:horizontal_idle_bar": {
      url: "/public/horizontal_idle_bar.png",
      type: "image/png"
    },
    "file:horizontal_idle_thumb": {
      url: "/public/horizontal_idle_thumb.png",
      type: "image/png"
    }
  };

  const assetBufferManager = createAssetBufferManager();
  await assetBufferManager.load(assets);
  const assetBufferMap = assetBufferManager.getBufferMap();

  const app = new RouteGraphics();
  await app.init({
    width: 1920,
    height: 1080,
    assetBufferMap,
    eventHandler: (eventType, payload) => {
      console.log('eventHandler', { eventType, payload })
      engine.handleEvent({ eventType, payload });
      // engine.handleEvent(event, payload);
      // console.log('eventHandler', event, payload)
      // engine.systemEventHandler(event, payload)
    },
    plugins: [
      new SpriteRendererPlugin(),
      new TextRendererPlugin(),
      new ContainerRendererPlugin(),
      new TextRevealingRendererPlugin(),
      new RectRendererPlugin(),
      new AudioPlugin(),
      new SliderRendererPlugin(),
      new KeyframeTransitionPlugin(),
    ],
  });
  await app.loadAssets(assetBufferMap);

  document.getElementById("canvas").appendChild(app.canvas);
  document.getElementById("canvas").addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
  const engine = new RouteEngine();
  engine.onEvent(({ eventType, payload }) => {
    console.log('onEvent', { eventType, payload })
    if (eventType === "render") {
      app.render(payload);
    }
  });

  engine.init({
    projectData: jsonData,
    ticker: app._app.ticker
  });
};

await init();
