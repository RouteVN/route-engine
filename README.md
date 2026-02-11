# Route Engine

A lightweight, state-driven visual novel engine built in JavaScript for creating interactive narrative games.

[![npm version](https://img.shields.io/npm/v/route-engine-js)](https://www.npmjs.com/package/route-engine-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Declarative Story Definition**: Define your visual novel content in YAML
- **Unidirectional Data Flow**: Predictable state management using Immer
- **Layered Architecture**: Clean separation between engine logic, state, and rendering
- **Save/Load System**: Built-in support for save slots with automatic persistence
- **Multi-language Support**: Full localization system for international releases
- **Auto/Skip Modes**: Player-friendly auto-advance and skip functionality
- **Variable System**: Context, device, and account-scoped variables
- **Modular Design**: Works with [route-graphics](https://github.com/RouteVN/route-graphics) for rendering
## Quick Start

### Installation

```bash
npm install route-engine-js
```

### Basic Usage

```javascript
import createRouteEngine, { createEffectsHandler } from 'route-engine-js';
import createRouteGraphics, {
  createAssetBufferManager,
  textPlugin,
  spritePlugin,
  containerPlugin,
  textRevealingPlugin,
  tweenPlugin,
  soundPlugin
} from 'route-graphics';
import { Ticker } from 'pixi.js';

const init = async () => {
  // Initialize route-graphics
  const routeGraphics = createRouteGraphics();
  await routeGraphics.init({
    width: 1920,
    height: 1080,
    plugins: {
      elements: [textPlugin, spritePlugin, containerPlugin, textRevealingPlugin],
      animations: [tweenPlugin],
      audio: [soundPlugin]
    },
    eventHandler: async (eventName, payload) => {
      if (payload.actions) {
        engine.handleActions(payload.actions);
      }
    }
  });

  document.getElementById('canvas').appendChild(routeGraphics.canvas);

  // Create ticker for auto/skip modes
  const ticker = new Ticker();
  ticker.start();

  // Create effects handler (handles render, timers, localStorage automatically)
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics,
    ticker
  });

  // Create engine
  const engine = createRouteEngine({
    handlePendingEffects: effectsHandler
  });

  // Initialize with project data
  engine.init({
    initialState: {
      global: { currentLocalizationPackageId: 'en' },
      projectData: myProjectData
    }
  });
};

init();
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/GettingStarted.md) | Quick start guide with setup instructions |
| [Core Concepts](docs/Concepts.md) | Architecture and data flow explanation |
| [API Reference](docs/RouteEngine.md) | Complete API documentation |
| [Project Data Schema](docs/ProjectDataSchema.md) | YAML configuration reference |
| [Troubleshooting](docs/Troubleshooting.md) | Common issues and solutions |

## Architecture Overview

Route Engine follows a three-layer architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌─────────────┐  │
│   │ route-engine │───▶│ route-graphics│───▶│   Canvas    │  │
│   │   (State)    │    │  (Rendering)  │    │  (Display)  │  │
│   └──────────────┘    └──────────────┘    └─────────────┘  │
│          ▲                                                   │
│          │                                                   │
│   ┌──────────────┐                                          │
│   │ projectData  │  ← YAML configuration                    │
│   │   (Story)    │                                          │
│   └──────────────┘                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Input → Action → State Change → Effects → Render
     ↑                                            │
     └────────────────────────────────────────────┘
```

## Example Project Data

```yaml
story:
  initialSceneId: intro
  scenes:
    intro:
      initialSectionId: opening
      sections:
        opening:
          lines:
            - id: line_1
              actions:
                dialogue:
                  characterId: narrator
                  content: "Welcome to my visual novel!"
            - id: line_2
              actions:
                dialogue:
                  characterId: protagonist
                  content: "Let's begin the adventure!"
```

## Development

### Running Tests

```bash
npm test           # Run tests
npm run test:watch # Watch mode
npm run coverage   # Coverage report
```

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint       # Check formatting
npm run lint:fix   # Fix formatting
```

## Community

Join us on [Discord](https://discord.gg/8J9dyZSu9C) to ask questions, report bugs, and stay up to date.

## Related Projects

- [route-graphics](https://github.com/RouteVN/route-graphics) - PixiJS-based renderer for route-engine
- [routevn-creator-client](https://github.com/RouteVN/routevn-creator-client) - Visual novel creation interface

## License

Licensed under the [MIT License](LICENSE).
