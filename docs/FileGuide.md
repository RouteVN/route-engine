# File Guide

This guide explains each file in the Route Engine codebase, when to use it, and why.

## Quick Reference

| File | Purpose | Use When... |
|------|---------|-------------|
| `src/index.js` | Package entry point | Importing the engine |
| `src/RouteEngine.js` | Engine factory | Creating engine instances |
| `src/util.js` | Store & action utilities | Building custom state management |
| `src/createTimer.js` | Timer system | Scheduling delayed actions |
| `src/stores/system.store.js` | Core state store | Reading/managing game state |
| `src/stores/constructPresentationState.js` | Presentation builder | Converting actions to display data |
| `src/stores/constructRenderState.js` | Render builder | Converting presentation to renderer output |
| `src/stores/effectHandlers.js` | Side effect handlers | Processing game events (save, render, timers) |

---

## Core Files

### `src/index.js`
**Main entry point** - Exports `createRouteEngine` factory function.

```js
import createRouteEngine from 'route-engine-js';
```

**Why use it:** This is the only file you need to import to use the engine.

---

### `src/RouteEngine.js`
**Engine factory** - Creates RouteEngine instances with effect handling.

```js
const engine = createRouteEngine({
  handlePendingEffects: (effects) => {
    effects.forEach(effect => {
      if (effect.name === 'render') {
        // Update your renderer
      }
    });
  }
});

engine.init({ initialState });
```

**API Methods:**
| Method | Purpose |
|--------|---------|
| `init({ initialState })` | Initialize engine with project data |
| `handleAction(type, payload)` | Dispatch a single action |
| `handleActions(actions)` | Dispatch multiple actions at once |
| `selectPresentationState()` | Get current presentation state |
| `selectRenderState()` | Get renderer-ready state |
| `handleLineActions()` | Process current line's actions |

**Why use it:** Creates isolated engine instances for multiple games or contexts.

---

### `src/util.js`
**State management utilities** - Store builders and action executors.

#### `createStore(initialState, selectorsAndActions, options)`
Creates a store with selectors and actions from a single object.

```js
const store = createStore(initialState, {
  selectCount: (state) => state.count,
  increment: (state) => { state.count++; }
});

store.increment();
console.log(store.selectCount());
```

**Functions starting with `select`** become selectors (read state).
**All other functions** become actions (mutate state via Immer).

**Why use it:**
- Build custom stores for game-specific state
- Leverage Immer for immutable updates
- Automatic selector/action separation

#### `createSequentialActionsExecutor(createInitialState, actions)`
Applies all actions to each payload sequentially.

```js
const executor = createSequentialActionsExecutor(
  () => ({ items: [], total: 0 }),
  [
    (state, item) => { state.items.push(item); },
    (state, item) => { state.total += item.value; }
  ]
);

const result = executor([{ id: 1, value: 10 }, { id: 2, value: 20 }]);
// Result: { items: [...], total: 30 }
```

**Why use it:**
- Processing presentation actions that accumulate (dialogue history)
- Building derived state from a sequence of payloads

#### `createSelectiveActionsExecutor(deps, actions, createInitialState)`
Applies only specified actions with their payloads.

```js
const executor = createSelectiveActionsExecutor(
  { api: myApi },
  {
    setUser: (state, deps, payload) => { state.user = payload; },
    setTheme: (state, deps, payload) => { state.theme = payload; }
  },
  () => ({ user: null, theme: 'light' })
);

const result = executor({
  setUser: { name: 'Alice' },
  // setTheme not called - no payload provided
});
// Result: { user: { name: 'Alice' }, theme: 'light' }
```

**Why use it:**
- System action handling (only run specified actions)
- Batch state updates with independent changes

---

### `src/createTimer.js`
**Timer system** - Creates timers backed by PixiJS Ticker.

```js
import { Ticker } from 'pixi.js';
import { createTimer } from 'route-engine-js/util';

const ticker = new Ticker();
const timer = createTimer(ticker);

timer.start({
  timerId: 'auto-advance',
  delay: 1000,
  onComplete: () => engine.handleAction('nextLine')
});

timer.clear('auto-advance');
```

**Why use it:**
- Auto-advance delays after dialogue completes
- Skip mode fast-forward timing
- Any game logic needing precise timing synced to render loop

---

## Store Files

### `src/stores/system.store.js`
**Core state management** - The heart of the engine (1031 lines).

**Exports:**
- `createSystemStore(initialState)` - Creates the main store

**Selectors** (30+):
| Selector | Returns |
|----------|---------|
| `selectPresentationState()` | Current presentation state |
| `selectRenderState()` | Renderer-ready state |
| `selectCurrentLine()` | Current line data |
| `selectCurrentPointer()` | Current story position |
| `selectViewedRegistry()` | Tracking for skip/gallery |
| `selectSaveSlots()` | All save data |
| `selectVariables()` | Game variables |
| `selectIsInAutoMode()` / `selectIsInSkipMode()` | Playback state |

**Actions** (30+):
| Action | Purpose |
|--------|---------|
| `nextLine` / `prevLine` | Navigate story |
| `jumpToLine({ sectionId, lineId })` | Jump to position |
| `sectionTransition({ sectionId })` | Change sections |
| `toggleAutoMode` / `toggleSkipMode` | Playback controls |
| `markLineCompleted` | Track animation finish |
| `addViewedLine` / `addViewedResource` | Registry updates |
| `replaceSaveSlot` | Save/load games |
| `pushLayeredView` / `popLayeredView` | UI overlays |
| `appendPendingEffect` | Queue side effects |

**Why use it:**
- Access all game state through selectors
- Control game flow through actions
- Understand engine behavior

### `src/stores/constructPresentationState.js`
**Builds presentation state** from line actions.

**Exports:**
- `constructPresentationState(projectData, systemState, presentations)`

**What it does:**
1. Iterates through all lines from section start to current line
2. Applies each line's presentation actions in sequence
3. Handles action overrides (later actions replace earlier ones)
4. Accumulates dialogue content for NVL mode

**Presentation Actions Handled:**
- `base` - Layout configuration
- `background` - Background images with animations
- `dialogue` - Speaker, text, mode (ADV/NVL)
- `character` - Sprite placement with transforms
- `visual` - Overlay images
- `bgm` / `sfx` / `voice` - Audio
- `choice` - Branching options
- `animation` - Active tweens
- `layout` - UI layouts

**Why use it:**
- Understand how actions become display data
- Debug presentation issues
- Build custom presentation logic

### `src/stores/constructRenderState.js`
**Builds render state** from presentation state.

**Exports:**
- `constructRenderState(projectData, systemState, presentationState)`

**What it does:**
1. Resolves resource IDs to file paths
2. Applies localization translations
3. Creates element tree (containers, sprites, text)
4. Converts animations to tween keyframes
5. Builds audio playback instructions

**Why use it:**
- Bridge between engine data and renderer
- Debug rendering issues
- Integrate with custom renderers

### `src/stores/effectHandlers.js`
**Side effect handlers** - Pure functions for processing effects.

**Exports:**
- `handleEffect(effect, context)` - Main handler

**Effects Handled:**
| Effect | Handler | Purpose |
|--------|---------|---------|
| `render` | - | Trigger re-render (handled externally) |
| `handleLineActions` | - | Process current line actions |
| `saveVnData` | `handleSaveVnDataEffect` | Save game with screenshot |
| `saveVariables` | `handleSaveVariablesEffect` | Save device variables |
| `startAutoNextTimer` | `handleStartAutoNextTimer` | Schedule auto-advance |
| `clearAutoNextTimer` | `handleClearAutoNextTimer` | Cancel auto-advance |
| `startSkipNextTimer` | `handleStartSkipNextTimer` | Schedule skip advance |
| `clearSkipNextTimer` | `handleClearSkipNextTimer` | Cancel skip advance |
| `startTimer` | `handleStartTimer` | Custom timer |

**Why use it:**
- Understand side effect lifecycle
- Add custom effect types
- Debug save/timer issues

---

## Schema Files

Located in `src/schemas/`, these YAML files define the shape of data.

### `schemas/projectData/`
| File | Defines |
|------|---------|
| `projectData.yaml` | Overall project structure |
| `story.yaml` | Scenes, sections, lines structure |
| `resources.yaml` | Images, sounds, characters, transforms, etc. |
| `i18n.yaml` | Localization package format |
| `mode.yaml` | Display mode configuration |

### `schemas/systemState/`
| File | Defines |
|------|---------|
| `systemState.yaml` | System state structure |
| `configuration.yaml` | Config options |
| `effects.yaml` | Effect definitions |

### Action Schemas
| File | Defines |
|------|---------|
| `systemActions.yaml` | All system action schemas |
| `presentationActions.yaml` | All presentation action schemas |

**Why use them:**
- Validate project data before loading
- Understand expected data shapes
- Generate TypeScript types
- IDE autocomplete/integration

---

## Common Patterns

### Creating a Game

```js
import createRouteEngine from 'route-engine-js';
import projectData from './game/project.yaml';

const engine = createRouteEngine({
  handlePendingEffects: (effects) => {
    effects.forEach(effect => {
      switch (effect.name) {
        case 'render':
          const renderState = engine.selectRenderState();
          renderer.render(renderState);
          break;
        case 'saveVnData':
          saveGame(effect.payload.slotKey, effect.payload.state);
          break;
        case 'startAutoNextTimer':
          timer.start(effect.payload);
          break;
      }
    });
  }
});

engine.init({
  initialState: {
    global: { currentLocalizationPackageId: 'en' },
    projectData
  }
});
```

### Adding Custom Actions

Extend the system store with your own actions:

```js
import { createSystemStore } from 'route-engine-js/stores/system.store.js';

const baseStore = createSystemStore(initialState);

const customStore = {
  ...baseStore,
  setPlayerHealth: (health) => {
    // Your custom logic
  }
};
```

### Building Custom Selectors

```js
import { createStore } from 'route-engine-js/util';

const gameState = createStore(
  initialState,
  {
    selectCurrentHP: (state) => state.variables.hp,
    selectIsDead: (state) => state.variables.hp <= 0,
    selectHasItem: (state, itemId) =>
      state.variables.inventory.includes(itemId)
  }
);
```

---

## Summary

- **Use `src/index.js`** to import the engine
- **Use `src/RouteEngine.js`** to create engine instances
- **Use `src/util.js`** for custom state management
- **Use `src/createTimer.js`** for timed events
- **Read `src/stores/`** to understand engine internals
- **Read `src/schemas/`** to understand data structures