import yaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm";
import createRouteEngine from "./RouteEngine.js";
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
} from "https://cdn.jsdelivr.net/npm/route-graphics@0.0.2-rc30/+esm";

const projectData = yaml.load(window.yamlContent);

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

  const app = new RouteGraphics();
  await app.init({
    width: 1920,
    height: 1080,
    assetBufferMap,
    eventHandler: (eventType, payload) => {
      console.log('eventHandler', { eventType, payload })
      if (eventType === "completed") {
        engine.handleEvent({
          payload: {
            actions: {
              handleCompleted: {}
            }
          }
        });
      } else if (eventType === "system") {
        engine.handleEvent({ payload });
      }
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


  // Recursive function to find element by label
  const findElementByLabel = (container, targetLabel) => {
    // Check if current container has the target label
    if (container.label === targetLabel) {
      return container;
    }

    // If container has children, search recursively
    if (container.children && container.children.length > 0) {
      for (const child of container.children) {
        const found = findElementByLabel(child, targetLabel);
        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  // Function to capture screenshot of specific element
  const captureElement = async (targetLabel) => {
    console.log(`Searching for element with label: ${targetLabel}`);

    // Find the element with the specified label
    const element = findElementByLabel(app._app.stage, targetLabel);

    if (!element) {
      console.error(`Element with label "${targetLabel}" not found`);
      return null;
    }

    console.log(`Found element:`, element);

    // Extract base64 from the found element
    const base64 = await app._app.renderer.extract.base64(element);

    // Create an image to resize
    const img = new Image();
    img.src = base64;

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    // Create canvas for resizing (6x smaller)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(img.width / 6);
    canvas.height = Math.floor(img.height / 6);

    // Draw the resized image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Get resized image as base64
    const resizedBase64 = canvas.toDataURL('image/png');

    console.log(`Image of ${targetLabel} captured (${canvas.width}x${canvas.height})`);

    return resizedBase64;
  };

  const effectsHandler = (effects) => {
    for (const effect of effects) {
      if (effect.type === 'render') {
        const renderState = engine.selectRenderState();
        app.render(renderState);
      } else if (effect.type === '') {

      }
    }

  }

  const engine = createRouteEngine({ handlePendingEffects: effectsHandler });
  // engine.onEvent(({ eventType, payload }) => {
  //   console.log('onEvent', { eventType, payload })
  //   if (eventType === "render") {
  //     app.render(payload);
  //   }
  // });

  engine.init({

    initialState: {
      global: {
        currentLocalizationPackageId: 'en'
      },
      projectData
    }
    //  ticker: app._app.ticker,
    // captureElement,
    // loadAssets: app.loadAssets
  });

};

await init();
