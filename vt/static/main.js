import yaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm";
import RouteEngine from "./RouteEngine.js";
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
    },
    // 'file:horizontal_hover_bar': {
    //   url: '/public/horizontal_hover_bar.png',
    //   type: 'image/png'
    // },
    // 'file:horizontal_hover_thumb': {
    //   url: '/public/horizontal_hover_thumb.png',
    //   type: 'image/png'
    // },
    // 'file:horizontal_idle_bar': {
    //   url: '/public/horizontal_idle_bar.png',
    //   type: 'image/png'
    // }, 
    // 'file:horizontal_idle_thumb': {
    //   url: '/public/horizontal_idle_thumb.png',
    //   type: 'image/png'
    // },
    // 'file:vertical_hover_bar': {
    //   url: '/public/vertical_hover_bar.png',
    //   type: 'image/png'
    // },
    // 'file:vertical_hover_thumb': {
    //   url: '/public/vertical_hover_thumb.png',
    //   type: 'image/png'
    // },
    // 'file:vertical_idle_bar': {
    //   url: '/public/vertical_idle_bar.png',
    //   type: 'image/png'
    // },
    // 'file:vertical_idle_thumb': {
    //   url: '/public/vertical_idle_thumb.png',
    //   type: 'image/png'
    // },

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
    eventHandler: (eventType, payload) => {
      console.log('2d renderer eventHandler', eventType, payload)
      engine.handleEvent({eventType, payload});
      // engine.handleEvent(event, payload);
      // console.log('eventHandler', event, payload)
      // engine.systemEventHandler(event, payload)
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
    // "file:horizontal_hover_bar",
    // "file:horizontal_hover_thumb",
    // "file:horizontal_idle_bar",
    // "file:horizontal_idle_thumb",
    // "file:vertical_idle_bar",
    // "file:vertical_idle_thumb",
    // "file:vertical_hover_bar",
    // "file:vertical_hover_thumb",
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
  const engine = new RouteEngine();
  // const callback = (payload) => {
  //   console.log({
  //     payload,
  //   });
  //   // if (event === "render") {
  //     app.render(payload);
  //   // }
  // };

  engine.onEvent(({eventType, payload}) => {
    console.log({
      eventType,
      payload,
    });
    if (eventType === "render") {
      app.render(payload);
    }
  });

  engine.init({
    vnData: jsonData,
    // render: callback,
    // callback,
    // ticker: app._app.ticker,
  });
};

await init();
