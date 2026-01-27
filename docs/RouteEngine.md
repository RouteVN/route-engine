# RouteEngine API Reference

The RouteEngine is the core runtime for RVN visual novels. It manages state, processes actions, and coordinates rendering.

## Creating an Engine Instance

```js
import createRouteEngine from 'route-engine-js';

const engine = createRouteEngine({
  handlePendingEffects: (effects) => {
    // Process side effects (render, timers, etc.)
    effects.forEach(effect => {
      switch(effect.name) {
        case 'render':
          renderToScreen(engine.selectRenderState());
          break;
        case 'handleLineActions':
          engine.handleLineActions();
          break;
        // ... handle other effects
      }
    });
  }
});
```

## Effects Handler

### `createEffectsHandler({ getEngine, routeGraphics, ticker })`

The recommended way to handle effects is using the built-in `createEffectsHandler` helper. It automatically handles all built-in effects including rendering, timers, and persistence.

```js
import createRouteEngine, { createEffectsHandler } from 'route-engine-js';
import { Ticker } from 'pixi.js';

// Create a ticker for auto/skip mode timers
const ticker = new Ticker();
ticker.start();

// Create effects handler
const effectsHandler = createEffectsHandler({
  getEngine: () => engine,  // Lazy reference to avoid circular dependency
  routeGraphics,            // Initialized route-graphics instance
  ticker                    // PixiJS Ticker for timer management
});

// Create engine with the effects handler
const engine = createRouteEngine({
  handlePendingEffects: effectsHandler
});
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `getEngine` | `() => Engine` | Function returning the engine instance (lazy evaluation handles circular dependency) |
| `routeGraphics` | `RouteGraphics` | Initialized route-graphics instance for rendering |
| `ticker` | `Ticker` | PixiJS Ticker instance for auto/skip mode timers |

**What it handles automatically:**

| Effect | Behavior |
|--------|----------|
| `render` | Calls `routeGraphics.render(engine.selectRenderState())` |
| `handleLineActions` | Calls `engine.handleLineActions()` |
| `startAutoNextTimer` | Starts ticker callback for auto mode advancement |
| `clearAutoNextTimer` | Removes auto mode ticker callback |
| `startSkipNextTimer` | Starts ticker callback for skip mode (30ms intervals) |
| `clearSkipNextTimer` | Removes skip mode ticker callback |
| `nextLineConfigTimer` | Starts scene-specific auto-advance timer |
| `clearNextLineConfigTimer` | Removes scene-specific timer |
| `saveSlots` | Saves to `localStorage.setItem('saveSlots', ...)` |
| `saveGlobalDeviceVariables` | Saves to `localStorage.setItem('globalDeviceVariables', ...)` |
| `saveGlobalAccountVariables` | Saves to `localStorage.setItem('globalAccountVariables', ...)` |

**Effect deduplication:** The handler automatically deduplicates effects by name, keeping only the last occurrence. Multiple `render` effects in one cycle become a single render call.

### Custom Effects Handler

If you need custom behavior, you can implement your own `handlePendingEffects` function:

```js
const engine = createRouteEngine({
  handlePendingEffects: (effects) => {
    // Effects is an array of { name: string, payload?: object }
    effects.forEach(effect => {
      switch (effect.name) {
        case 'render':
          // Render the current state
          const renderState = engine.selectRenderState();
          myRenderer.render(renderState);
          break;

        case 'handleLineActions':
          // Process actions on the current line
          engine.handleLineActions();
          break;

        case 'saveSlots':
          // Persist save slots
          localStorage.setItem('saveSlots', JSON.stringify(effect.payload.saveSlots));
          break;

        case 'saveGlobalDeviceVariables':
          // Persist device variables
          localStorage.setItem('globalDeviceVariables',
            JSON.stringify(effect.payload.globalDeviceVariables));
          break;

        case 'saveGlobalAccountVariables':
          // Persist account variables
          localStorage.setItem('globalAccountVariables',
            JSON.stringify(effect.payload.globalAccountVariables));
          break;

        case 'startAutoNextTimer':
          // Start auto-advance timer with effect.payload.delay
          break;

        case 'clearAutoNextTimer':
          // Stop auto-advance timer
          break;

        case 'startSkipNextTimer':
          // Start skip mode timer (30ms intervals)
          break;

        case 'clearSkipNextTimer':
          // Stop skip mode timer
          break;

        case 'nextLineConfigTimer':
          // Start scene-specific timer with effect.payload.delay
          break;

        case 'clearNextLineConfigTimer':
          // Stop scene-specific timer
          break;
      }
    });
  }
});
```

**Important:** All effects must be handled. Missing handlers will cause features to break silently:
- Missing `render` → Screen won't update
- Missing `handleLineActions` → Line actions (dialogue, background, etc.) won't execute
- Missing timer effects → Auto/skip modes won't work
- Missing save effects → Data won't persist

## Initialization

### `init({ initialState })`

Initializes the engine with project data and global settings.

```js
engine.init({
  initialState: {
    global: {
      currentLocalizationPackageId: 'en'
    },
    projectData: {
      l10n: { packages: { en: { /* translations */ } } },
      resources: { /* images, audio, etc */ },
      story: {
        initialSceneId: 'scene_1',
        scenes: { /* scene definitions */ }
      }
    }
  }
});
```

The engine will:
1. Create the system store with initial state
2. Append a `render` effect
3. Execute any actions on the initial line
4. Trigger pending effects handler
5. Clear pending effects

## Methods

### `handleAction(actionType, payload)`

Dispatches a single action to the system store. After the action executes, all pending effects are processed until the queue is empty.

```js
// Advance to next line
engine.handleAction('nextLine');

// Jump to specific section
engine.handleAction('sectionTransition', { sectionId: 'chapter_2' });

// Toggle auto mode
engine.handleAction('toggleAutoMode');
```

### `handleActions(actions)`

Dispatches multiple actions from an object. Actions are processed sequentially in iteration order, with effects processed after each action.

```js
engine.handleActions({
  setNextLineConfig: {
    manual: { enabled: false },
    auto: { enabled: true, trigger: 'fromComplete', delay: 2000 }
  },
  markLineCompleted: {}
});
```

### When to Use Each

| Method | Use Case |
|--------|----------|
| `handleAction` | Single action from user interaction (click, keypress) |
| `handleActions` | Multiple related actions that should execute together |

**Key difference:** `handleActions` iterates over an object and calls `handleAction` for each entry. Effects are processed after each individual action, not batched at the end.

```js
// These are equivalent:
engine.handleActions({ actionA: {}, actionB: {} });

// Same as:
engine.handleAction('actionA', {});
engine.handleAction('actionB', {});
```

**Note:** Action order in `handleActions` depends on JavaScript object iteration order. For guaranteed ordering, use multiple `handleAction` calls.

### `handleLineActions()`

Processes actions attached to the current line. Called automatically on line changes.

```js
// Line data structure
const line = {
  id: 'line_1',
  actions: {
    background: { resourceId: 'bg_school' },
    dialogue: { characterId: 'protagonist', content: 'Hello!' },
    bgm: { resourceId: 'music_1' }
  }
};
```

### `selectRenderState()`

Returns the current render state for the renderer.

```js
const renderState = engine.selectRenderState();
// {
//   elements: [{ id: 'story', type: 'container', children: [...] }],
//   animations: [...],
//   audio: [...]
// }
```

### `selectPresentationState()`

Returns the current presentation state.

```js
const presentationState = engine.selectPresentationState();
// {
//   background: { resourceId: 'bg_school' },
//   dialogue: { characterId: 'protagonist', content: [...] },
//   bgm: { resourceId: 'music_1', loop: true }
// }
```

## Available Actions

### Navigation Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `nextLine` | - | Advance to the next line (respects `nextLineConfig.manual`) |
| `prevLine` | `{ sectionId }` | Navigate to previous line (enters history mode) |
| `jumpToLine` | `{ sectionId?, lineId }` | Jump to specific line |
| `sectionTransition` | `{ sectionId }` | Transition to a different section |

### Playback Mode Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `startAutoMode` | - | Enable auto-advance mode |
| `stopAutoMode` | - | Disable auto-advance mode |
| `toggleAutoMode` | - | Toggle auto-advance mode |
| `startSkipMode` | - | Enable skip mode |
| `stopSkipMode` | - | Disable skip mode |
| `toggleSkipMode` | - | Toggle skip mode |

### UI Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `showDialogueUI` | - | Show the dialogue UI |
| `hideDialogueUI` | - | Hide the dialogue UI |
| `toggleDialogueUI` | - | Toggle dialogue UI visibility |
| `showDialogueHistory` | - | Show the dialogue history panel |
| `hideDialogueHistory` | - | Hide the dialogue history panel |

### State Management Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `markLineCompleted` | - | Mark current line as completed |
| `setNextLineConfig` | `{ manual?, auto? }` | Configure line advancement |
| `setAutoplayDelay` | `{ delay }` | Set auto-play delay in milliseconds |
| `setCurrentLocalizationPackageId` | `{ localizationPackageId }` | Change language |
| `updateProjectData` | `{ projectData }` | Replace project data |

### Registry Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `addViewedLine` | `{ sectionId, lineId }` | Mark line as viewed |
| `addViewedResource` | `{ resourceId }` | Mark resource as viewed |
| `addToHistorySequence` | `{ item: { sectionId } }` | Add section entry to history sequence |
| `addLineToHistory` | `{ lineId }` | Add line entry to current section's history |

### Save System Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `saveSaveSlot` | `{ slot, thumbnailImage }` | Save current game state to slot |
| `loadSaveSlot` | `{ slot }` | Load game state from slot |

### Layered View Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `pushLayeredView` | `{ resourceId }` | Push a new view layer onto the stack |
| `popLayeredView` | - | Remove the current view layer |
| `replaceLastLayeredView` | `{ resourceId }` | Replace current layer with new one |
| `clearLayeredViews` | - | Clear all view layers |

### Rollback Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `rollbackByOffset` | `{ offset? }` | Rollback by relative offset (default: -1) |
| `rollbackToLine` | `{ sectionId, lineId }` | Rollback to specific line with variable reversion |

### Effect Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `appendPendingEffect` | `{ name, ...options }` | Queue a side effect |
| `clearPendingEffects` | - | Clear the effect queue |

## Available Selectors

The system store exposes these selectors (called internally):

| Selector | Parameters | Returns |
|----------|------------|---------|
| `selectPendingEffects` | - | Array of pending effects |
| `selectCurrentPointer` | - | `{ currentPointerMode, pointer }` |
| `selectCurrentLine` | - | Current line object |
| `selectSection` | `{ sectionId }` | Section object |
| `selectAutoMode` | - | Boolean |
| `selectSkipMode` | - | Boolean |
| `selectAutoplayDelay` | - | Number (milliseconds) |
| `selectDialogueUIHidden` | - | Boolean |
| `selectDialogueHistory` | - | Array of dialogue entries |
| `selectCurrentLocalizationPackageId` | - | String |
| `selectIsLineViewed` | `{ sectionId, lineId }` | Boolean |
| `selectIsResourceViewed` | `{ resourceId }` | Boolean |
| `selectNextLineConfig` | - | Config object |
| `selectSaveSlots` | - | Save slots object |
| `selectSaveSlot` | `{ slotKey }` | Save slot data |
| `selectCurrentPageSlots` | `{ slotsPerPage? }` | `{ saveSlots }` for current page |
| `selectLayeredViews` | - | Array of layered views |
| `selectCanRollback` | - | Boolean (true if rollback possible) |
| `selectLineIdByOffset` | `{ offset }` | `{ sectionId, lineId }` or null |

## Pending Effects

Effects queued by actions for external handling:

| Effect | Description |
|--------|-------------|
| `render` | Re-render the current state |
| `handleLineActions` | Process current line's actions |
| `startAutoNextTimer` | Start auto-advance timer |
| `clearAutoNextTimer` | Stop auto-advance timer |
| `startSkipNextTimer` | Start skip mode timer (30ms intervals) |
| `clearSkipNextTimer` | Stop skip mode timer |
| `nextLineConfigTimer` | Start scene-specific auto-advance timer |
| `clearNextLineConfigTimer` | Stop scene-specific auto-advance timer |
| `saveSlots` | Persist save slots to localStorage |
| `saveGlobalDeviceVariables` | Persist device variables to localStorage |
| `saveGlobalAccountVariables` | Persist account variables to localStorage |

**Note:** When using `createEffectsHandler`, these effects are handled automatically.

## Line Actions (Presentation)

Actions that can be attached to lines to control presentation:

| Action | Properties | Description |
|--------|------------|-------------|
| `base` | `{ resourceId }` | Set base layout |
| `background` | `{ resourceId, animations? }` | Set background/CG |
| `dialogue` | See details below | Display dialogue text |
| `character` | `{ items }` | Display character sprites. Each item can have optional `x` and `y` to override transform position |
| `visual` | `{ items }` | Display visual elements |
| `bgm` | `{ resourceId, loop?, volume?, delay? }` | Play background music |
| `sfx` | `{ items }` | Play sound effects |
| `voice` | `{ fileId, volume?, loop? }` | Play voice audio |
| `animation` | `{ resourceId }` | Apply standalone tween animation |
| `layout` | `{ resourceId }` | Display layout |
| `choice` | `{ resourceId, items }` | Display choice menu |
| `cleanAll` | `true` | Clear all presentation state |

### dialogue Action

The `dialogue` action displays text to the player. It supports two display modes and various configuration options.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `characterId` | `string` | ID of the speaking character (from `resources.characters`) |
| `character` | `object` | Inline character definition `{ name: "..." }` |
| `content` | `string` or `array` | The dialogue text. String for simple text, array for styled segments |
| `mode` | `"adv"` or `"nvl"` | Display mode (default: `"adv"`) |
| `gui` | `{ resourceId }` | Custom dialogue box layout |
| `clear` | `boolean` | Remove dialogue from screen |
| `clearPage` | `boolean` | Clear accumulated NVL lines (NVL mode only) |

**Display Modes:**

| Mode | Behavior |
|------|----------|
| `adv` | **Adventure mode** - Each line replaces the previous. Traditional VN style with one text box. |
| `nvl` | **Novel mode** - Lines accumulate on screen. Use `clearPage: true` to start fresh. |

**Examples:**

```yaml
# Simple dialogue
dialogue:
  characterId: protagonist
  content: "Hello, world!"

# NVL mode with page clear
dialogue:
  mode: nvl
  clearPage: true
  content: "Chapter 2 begins..."

# Clear dialogue from screen
dialogue:
  clear: true
```

## Related Documentation

- [Getting Started Guide](./GettingStarted.md) - Quick setup and basic usage
- [Core Concepts](./Concepts.md) - Architecture and data flow explanation
- [Project Data Schema](./ProjectDataSchema.md) - YAML configuration reference
- [Troubleshooting](./Troubleshooting.md) - Common issues and solutions

