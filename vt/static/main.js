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
import { fileTypeFromBuffer } from 'https://cdn.jsdelivr.net/npm/file-type@19/+esm';

async function parseVNBundle(arrayBuffer) {
  const uint8View = new Uint8Array(arrayBuffer);
  const headerSize = 9 + Number(new DataView(uint8View.buffer, 1, 8).getBigUint64(0));
  const index = JSON.parse(new TextDecoder().decode(uint8View.subarray(9, headerSize)));
  const assets = {};
  let instructions = null;
  for (const [id, metadata] of Object.entries(index)) {
    const content = uint8View.subarray(metadata.start + headerSize, metadata.end + headerSize + 1);
    if (id === 'instructions') {
      instructions = JSON.parse(new TextDecoder().decode(content));
    } else {
      const fileType = await fileTypeFromBuffer(content);
      const detectedType = fileType?.mime;
      assets[`file:${id}`] = {
        url: URL.createObjectURL(new Blob([content], { type: detectedType })),
        type: detectedType,
        size: content.byteLength
      };
    }
  }
  return { assets, instructions };
}

const jsonData = yaml.load(window.yamlContent);

const init = async () => {
  // Load and parse VNBundle file
  const response = await fetch('/public/test.vnbundle');
  if (!response.ok) throw new Error(`Failed to fetch VNBundle: ${response.statusText}`);
  const { assets: vnbundleAssets, instructions: vnbundleInstructions } = await parseVNBundle(await response.arrayBuffer());
  
  // Merge VNBundle instructions into existing jsonData structure
  // This handles the conversion from VNBundle's nested format to the flat format expected by the engine
  if (vnbundleInstructions && jsonData.resources) {
    // Helper function to process and flatten nested VNBundle items
    // VNBundle uses {items: {id: data}} structure, we need flat {id: data} structure
    const processItems = (source, target, filter, mapper) => {
      if (!source?.items || !target) return;
      Object.entries(source.items).forEach(([id, data]) => {
        if (filter(data)) target[id] = mapper(id, data);
      });
    };
    
    // Process images: filter out non-image types (like folders) and map to simple {fileId} structure
    processItems(vnbundleInstructions.images, jsonData.resources.images,
      d => d.type === 'image' && d.fileId,
      (_, d) => ({ fileId: d.fileId }));
    
    // Process characters: handle nested sprites structure
    // VNBundle sprites can be either {items: {...}} or direct object
    processItems(vnbundleInstructions.characters, jsonData.resources.characters,
      d => d.type !== 'folder',
      (_, d) => {
        const sprites = {};
        if (d.sprites?.items) {
          // Flatten nested sprites.items structure
          Object.entries(d.sprites.items).forEach(([sid, sd]) => {
            if (sd.type === 'image') sprites[sid] = { fileId: sd.fileId };
          });
        } else if (d.sprites) Object.assign(sprites, d.sprites);
        return { variables: d.variables, sprites };
      });
    
    // Process transforms: extract x,y coordinates only, ensure they are numbers
    processItems(vnbundleInstructions.transforms, jsonData.resources.transforms,
      d => d.type !== 'folder',
      (_, d) => ({ 
        x: typeof d.x === 'string' ? parseFloat(d.x) : d.x, 
        y: typeof d.y === 'string' ? parseFloat(d.y) : d.y 
      }));
    
    // Process animations: keep name and properties
    processItems(vnbundleInstructions.animations, jsonData.resources.animations,
      d => d.type !== 'folder',
      (_, d) => ({ name: d.name, properties: d.properties }));
    
    // Process audio/bgm/sfx resources
    ['audio', 'bgm', 'sfx'].forEach(resourceType => {
      if (vnbundleInstructions[resourceType]?.items && jsonData.resources[resourceType]) {
        processItems(vnbundleInstructions[resourceType], jsonData.resources[resourceType],
          d => d.type !== 'folder' && d.fileId,
          (_, d) => ({ fileId: d.fileId }));
      }
    });
    
    
    // Process layouts: complex conversion from tree structure to flat array
    // VNBundle uses {items: {id: data}, tree: [{id, children}]} structure
    // Engine expects flat array with nested children
    if (vnbundleInstructions.layouts?.items) {
      if (!jsonData.resources.layouts) jsonData.resources.layouts = {};
      Object.entries(vnbundleInstructions.layouts.items).forEach(([layoutId, layoutData]) => {
        if (layoutData.type === 'layout') {
          let elements = [];
          if (layoutData.elements?.tree && layoutData.elements.items) {
            // Recursively build element tree from VNBundle's split tree/items structure
            const buildElements = (node) => {
              const itemData = layoutData.elements.items[node.id];
              if (!itemData) return null;
              const element = { id: node.id, ...itemData };
              if (node.children?.length) element.children = node.children.map(buildElements).filter(Boolean);
              return element;
            };
            elements = layoutData.elements.tree.map(buildElements).filter(Boolean);
          } else if (Array.isArray(layoutData.elements)) elements = layoutData.elements;
          jsonData.resources.layouts[layoutId] = {
            name: layoutData.name,
            mode: layoutData.layoutType === 'dialogue' ? 'adv' : layoutData.layoutType,
            elements
          };
        }
      });
    }
  }
  // Process scenes: convert VNBundle's nested scene/section/line structure
  // VNBundle: scenes.items -> sections.items -> lines.tree/items
  // Engine: scenes -> sections -> lines array
  if (jsonData.story?.scenes && vnbundleInstructions.scenes?.items) {
    Object.entries(vnbundleInstructions.scenes.items).forEach(([sceneId, sceneData]) => {
      const scene = { name: sceneData.name, initialSectionId: null, sections: {} };
      if (sceneData.sections?.items) Object.entries(sceneData.sections.items).forEach(([sectionId, sectionData]) => {
        scene.sections[sectionId] = { name: sectionData.name, lines: [] };
        // Convert lines from tree/items structure to flat array
        // tree contains order, items contains data
        sectionData.lines?.tree?.forEach(item => {
          const line = sectionData.lines.items[item.id];
          if (line) {
            // line.presentation contains the actual actions
            const actions = line.presentation || {};
            // Ensure dialogue has mode field (defaults to 'adv' if missing)
            if (actions.dialogue && !actions.dialogue.mode) actions.dialogue.mode = 'adv';
            
            scene.sections[sectionId].lines.push({ id: item.id, actions });
          }
        });
        // Set first section as initial if not already set
        if (!scene.initialSectionId) scene.initialSectionId = sectionId;
      });
      jsonData.story.scenes[sceneId] = scene;
    });
    // Set scene-prologue as initial scene if it exists
    if (jsonData.story.scenes['scene-prologue']) jsonData.story.initialSceneId = 'scene-prologue';
  }

  // Add screen layout if missing (needed for click events to work)
  if (!jsonData.resources) jsonData.resources = {};
  if (!jsonData.resources.layouts) jsonData.resources.layouts = {};
  if (!jsonData.resources.layouts.storyScreenLayout) {
    jsonData.resources.layouts.storyScreenLayout = {
      name: "Story Screen Background",
      elements: [{
        id: "story-screen-bg",
        type: "rect",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        fill: "#000000",
        clickEventName: "system",
        clickEventPayload: { actions: { nextLine: {} } }
      }]
    };
  }
  
  // Convert layout sprite imageId to url format and text typographyId to style
  // VNBundle uses imageId: "xxx", engine expects url: "file:xxx"
  // VNBundle uses typographyId for text, engine expects inline style object
  if (jsonData.resources?.layouts) {
    const convertElements = (element) => {
      if (element.type === 'sprite' && element.imageId) {
        // Find the fileId for this imageId
        const imageResource = jsonData.resources.images?.[element.imageId];
        if (imageResource?.fileId) {
          element.url = `file:${imageResource.fileId}`;
          delete element.imageId;
        }
      }
      // Also handle hoverImageId
      if (element.type === 'sprite' && element.hoverImageId) {
        const hoverImageResource = jsonData.resources.images?.[element.hoverImageId];
        if (hoverImageResource?.fileId) {
          element.hoverUrl = `file:${hoverImageResource.fileId}`;
          delete element.hoverImageId;
        }
      }
      if (element.children) {
        element.children.forEach(convertElements);
      }
    };
    
    Object.values(jsonData.resources.layouts).forEach(layout => {
      if (layout.elements) {
        layout.elements.forEach(convertElements);
      }
    });
  }
  
  // Add screen action to first line if missing
  if (jsonData.story?.scenes) {
    Object.values(jsonData.story.scenes).forEach(scene => {
      if (scene.sections) {
        Object.values(scene.sections).forEach(section => {
          if (section.lines?.length > 0 && section.lines[0].actions) {
            // Add screen layout to first line if not present
            if (!section.lines[0].actions.screen) {
              section.lines[0].actions.screen = {
                resourceId: "storyScreenLayout",
                resourceType: "layout"
              };
            }
          }
        });
      }
    });
  }
  
  const assets = vnbundleAssets;
  
  
  // Process audio/bgm/sfx resources from VNBundle
  if (vnbundleInstructions) {
    // Process audio resources
    ['audio', 'bgm', 'sfx'].forEach(resourceType => {
      if (vnbundleInstructions[resourceType]?.items) {
        if (!jsonData.resources[resourceType]) jsonData.resources[resourceType] = {};
        Object.entries(vnbundleInstructions[resourceType].items).forEach(([audioId, audioData]) => {
          if (audioData.type !== 'folder' && audioData.fileId) {
            jsonData.resources[resourceType][audioId] = { fileId: audioData.fileId };
          }
        });
      }
    });
  }

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

  const engine = createRouteEngine();
  engine.onEvent(({ eventType, payload }) => {
    console.log('onEvent', { eventType, payload })
    if (eventType === "render") {
      app.render(payload);
    }
  });

  engine.init({
    projectData: jsonData,
    ticker: app._app.ticker,
    captureElement,
    loadAssets: app.loadAssets
  });

  console.log({
    projectData: jsonData,
    ticker: app._app.ticker,
    captureElement,
    loadAssets: app.loadAssets
  })
};

await init();
