# Getting Started with Route Engine

This guide will help you get route-engine up and running quickly. By the end of this guide, you'll understand the basic concepts and be able to create a simple visual novel.

## Prerequisites

- Node.js 18+ or Bun
- Basic understanding of JavaScript ES modules
- A text editor

## Installation

```bash
npm install route-engine-js
```

Or with Bun:

```bash
bun add route-engine-js
```

## Quick Start

### 1. Create Your Project Structure

```
my-visual-novel/
├── index.html
├── main.js
└── projectData.yaml
```

### 2. Set Up HTML

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Visual Novel</title>
  <style>
    body { margin: 0; overflow: hidden; }
    #canvas { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="canvas"></div>
  <script type="module" src="main.js"></script>
</body>
</html>
```

### 3. Create Your Story (projectData.yaml)

```yaml
# Screen configuration
screen:
  width: 1920
  height: 1080
  backgroundColor: "#000000"

# Localization
l10n:
  packages:
    en:
      label: English
      lang: en
      keys:
        hello: "Hello, welcome to my visual novel!"
        choice_yes: "Yes, let's continue!"
        choice_no: "No, I want to go back."

# Resources (images, characters, etc.)
resources:
  characters:
    narrator:
      name: "Narrator"
    protagonist:
      name: "Alex"

  transforms:
    center:
      x: 960
      y: 540
      anchorX: 0.5
      anchorY: 0.5

# Story content
story:
  initialSceneId: intro
  scenes:
    intro:
      name: Introduction
      initialSectionId: opening
      sections:
        opening:
          name: Opening Scene
          lines:
            - id: line_1
              actions:
                dialogue:
                  characterId: narrator
                  content: "Welcome to the visual novel world!"
            - id: line_2
              actions:
                dialogue:
                  characterId: protagonist
                  content: "I'm excited to be here!"
```

### 4. Initialize the Engine (main.js)

Before writing code, understand the plugin system. route-graphics uses plugins for rendering:

| Category | Plugin | Description |
|----------|--------|-------------|
| `elements` | `textPlugin` | Static text rendering |
| `elements` | `rectPlugin` | Rectangles and shapes |
| `elements` | `spritePlugin` | Image/sprite rendering |
| `elements` | `sliderPlugin` | Slider UI controls |
| `elements` | `containerPlugin` | Container layouts |
| `elements` | `textRevealingPlugin` | Character-by-character text reveal effect |
| `elements` | `videoPlugin` | Video playback |
| `elements` | `particlesPlugin` | Particle effects |
| `elements` | `animatedSpritePlugin` | Spritesheet animations |
| `animations` | `tweenPlugin` | Tween/keyframe animations |
| `audio` | `soundPlugin` | Audio playback (BGM, SFX, voice) |

Now here's the initialization code:

```javascript
import createRouteEngine, { createEffectsHandler } from 'route-engine-js';
import createRouteGraphics, {
  createAssetBufferManager,
  textPlugin,
  rectPlugin,
  spritePlugin,
  sliderPlugin,
  containerPlugin,
  textRevealingPlugin,
  videoPlugin,
  particlesPlugin,
  animatedSpritePlugin,
  tweenPlugin,
  soundPlugin
} from 'route-graphics';
import { Ticker } from 'pixi.js';
import jsYaml from 'js-yaml';

const init = async () => {
  // Load project data
  const response = await fetch('/projectData.yaml');
  const projectDataText = await response.text();
  const projectData = jsYaml.load(projectDataText);

  // Define your assets
  const assets = {
    'bg_school': {
      url: '/assets/backgrounds/school.png',
      type: 'image/png'
    },
    'bgm_main': {
      url: '/assets/audio/main_theme.mp3',
      type: 'audio/mpeg'
    }
  };

  // Load assets using the asset buffer manager
  const assetBufferManager = createAssetBufferManager();
  await assetBufferManager.load(assets);
  const assetBufferMap = assetBufferManager.getBufferMap();

  // Configure plugins
  const plugins = {
    elements: [
      textPlugin,           // Text rendering
      rectPlugin,           // Rectangle/shape rendering
      spritePlugin,         // Image/sprite rendering
      sliderPlugin,         // Slider UI elements
      containerPlugin,      // Container layouts
      textRevealingPlugin,  // Character-by-character text reveal
      videoPlugin,          // Video playback
      particlesPlugin,      // Particle effects
      animatedSpritePlugin  // Spritesheet animations
    ],
    animations: [
      tweenPlugin           // Tween/keyframe animations
    ],
    audio: [
      soundPlugin           // Audio playback (BGM, SFX, voice)
    ]
  };

  // Initialize graphics renderer
  const routeGraphics = createRouteGraphics();
  await routeGraphics.init({
    width: 1920,
    height: 1080,
    plugins,
    eventHandler: async (eventName, payload) => {
      if (payload.actions) {
        engine.handleActions(payload.actions);
      }
    }
  });

  // Load assets into route-graphics
  await routeGraphics.loadAssets(assetBufferMap);

  // Append canvas to DOM
  document.getElementById('canvas').appendChild(routeGraphics.canvas);

  // Create ticker for auto/skip modes
  const ticker = new Ticker();
  ticker.start();

  // Create effects handler
  // This handles: render, timers, and localStorage persistence automatically
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics,
    ticker
  });

  // Create engine
  const engine = createRouteEngine({
    handlePendingEffects: effectsHandler
  });

  // Load saved data from localStorage (optional)
  const saveSlots = JSON.parse(localStorage.getItem('saveSlots')) ?? {};
  const globalDeviceVariables = JSON.parse(localStorage.getItem('globalDeviceVariables')) ?? {};

  // Initialize with project data
  engine.init({
    initialState: {
      global: {
        currentLocalizationPackageId: 'en',
        saveSlots,
        variables: globalDeviceVariables
      },
      projectData
    }
  });
};

init();
```

**Note:** The `createEffectsHandler` automatically saves to localStorage when save/variable effects occur. You only need to load the data on initialization as shown above.

### Asset Loading

Assets must be loaded before they can be used in your visual novel:

```javascript
// Define assets with unique IDs
const assets = {
  'asset_id': {
    url: '/path/to/file.png',
    type: 'image/png'  // MIME type
  }
};

// Load using asset buffer manager
const assetBufferManager = createAssetBufferManager();
await assetBufferManager.load(assets);
const assetBufferMap = assetBufferManager.getBufferMap();

// Pass to route-graphics
await routeGraphics.loadAssets(assetBufferMap);
```

**Supported asset types:**
- Images: `image/png`, `image/jpeg`, `image/webp`
- Audio: `audio/mpeg` (mp3), `audio/wav`, `audio/ogg`
- Video: `video/mp4`, `video/webm`

## Core Concepts

### The Three Layers

Route Engine operates in a three-layer architecture:

1. **route-engine** (this library): Manages state, processes actions, handles story logic
2. **route-graphics**: Renders visuals to canvas using PixiJS
3. **projectData**: YAML configuration defining your story content

### Data Flow

```
User Input → Action → State Change → Render State → Graphics Render
     ↑                                                      │
     └──────────────────────────────────────────────────────┘
```

### Key Terminology

| Term | Description |
|------|-------------|
| **Scene** | A major section of your story (like a chapter) |
| **Section** | A subsection within a scene |
| **Line** | A single unit of content with actions |
| **Action** | Something that changes state or presentation |
| **Pointer** | Current reading position (sectionId + lineId) |
| **Context** | Isolated game environment (supports multiple contexts) |

## Next Steps

- Read the [Concepts Guide](./Concepts.md) for deeper understanding
- Check the [API Reference](./RouteEngine.md) for all available actions
- Explore the [Project Data Schema](./ProjectDataSchema.md) for YAML configuration
- Look at the [Examples](https://github.com/yuusoft/route-engine-examples) for complete projects

## Common Patterns

### Advancing Lines

Lines advance manually (user click) or automatically. Configure with `setNextLineConfig`:

```yaml
- id: auto_advance_line
  actions:
    setNextLineConfig:
      manual:
        enabled: true
      auto:
        enabled: true
        trigger: fromComplete
        delay: 2000
    dialogue:
      content: "This will auto-advance after 2 seconds..."
```

### Showing Backgrounds

```yaml
- id: show_background
  actions:
    background:
      resourceId: my_background_image
      animations:
        in:
          resourceId: fadeIn_1s
```

### Displaying Characters

```yaml
- id: show_character
  actions:
    character:
      items:
        - id: protagonist_sprite
          transformId: center
          sprites:
            - id: body
              imageId: protagonist_normal
```

### Creating Choices

```yaml
- id: choice_line
  actions:
    choice:
      resourceId: choice_layout
      items:
        - id: yes_choice
          content: "Yes"
        - id: no_choice
          content: "No"
```

## Troubleshooting

### Engine not rendering?

1. Check that `handlePendingEffects` is properly set up
2. Verify `routeGraphics.init()` completed successfully
3. Ensure the canvas element exists in the DOM

### Lines not advancing?

1. Check `nextLineConfig` settings
2. Verify event handlers are wired correctly
3. Check browser console for errors

### Resources not loading?

1. Verify file paths in your asset configuration
2. Check that `routeGraphics.loadAssets()` was called
3. Ensure CORS is configured if loading from different domains

## Need Help?

Join our [Discord community](https://discord.gg/8J9dyZSu9C) for support and discussions.
