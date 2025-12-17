# RouteEngine API Reference

The RouteEngine is the core runtime for RVN visual novels. It manages state, processes actions, and coordinates rendering.

## Creating an Engine Instance

```js
import createRouteEngine from 'rvn-temp';

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

Dispatches a single action to the system store.

```js
// Advance to next line
engine.handleAction('nextLine');

// Jump to specific section
engine.handleAction('sectionTransition', { sectionId: 'chapter_2' });

// Toggle auto mode
engine.handleAction('toggleAutoMode');
```

### `handleActions(actions)`

Dispatches multiple actions from an object.

```js
engine.handleActions({
  setNextLineConfig: {
    manual: { enabled: false },
    auto: { enabled: true, trigger: 'fromComplete', delay: 2000 }
  },
  markLineCompleted: {}
});
```

### `handleLineActions()`

Processes actions attached to the current line. Called automatically on line changes.

```js
// Line data structure
const line = {
  id: 'line_1',
  actions: {
    background: { resourceId: 'bg_school' },
    dialogue: { characterId: 'protagonist', content: [{ text: 'Hello!' }] },
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
| `nextLineFromCompleted` | - | Advance if auto-trigger is `fromComplete` |
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

### State Management Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `markLineCompleted` | - | Mark current line as completed |
| `setNextLineConfig` | `{ manual?, auto? }` | Configure line advancement |
| `setCurrentLocalizationPackageId` | `{ localizationPackageId }` | Change language |
| `updateProjectData` | `{ projectData }` | Replace project data |

### Registry Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `addViewedLine` | `{ sectionId, lineId }` | Mark line as viewed |
| `addViewedResource` | `{ resourceId }` | Mark resource as viewed |
| `addToHistory` | `{ item }` | Add entry to history sequence |

### Save System Actions

| Action | Payload | Description |
|--------|---------|-------------|
| `replaceSaveSlot` | `{ slotKey, date, image, state }` | Save game to slot |

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
| `selectDialogueUIHidden` | - | Boolean |
| `selectCurrentLocalizationPackageId` | - | String |
| `selectIsLineViewed` | `{ sectionId, lineId }` | Boolean |
| `selectIsResourceViewed` | `{ resourceId }` | Boolean |
| `selectNextLineConfig` | - | Config object |
| `selectSaveSlots` | - | Save slots object |
| `selectSaveSlot` | `{ slotKey }` | Save slot data |

## Pending Effects

Effects queued by actions for external handling:

| Effect | Description |
|--------|-------------|
| `render` | Re-render the current state |
| `handleLineActions` | Process current line's actions |

## Line Actions (Presentation)

Actions that can be attached to lines to control presentation:

| Action | Properties | Description |
|--------|------------|-------------|
| `base` | `{ resourceId }` | Set base layout |
| `background` | `{ resourceId, animations? }` | Set background/CG |
| `dialogue` | `{ characterId?, character?, content, mode?, gui?, clear? }` | Display dialogue |
| `character` | `{ items }` | Display character sprites |
| `visual` | `{ items }` | Display visual elements |
| `bgm` | `{ resourceId, loop?, volume?, delay? }` | Play background music |
| `sfx` | `{ items }` | Play sound effects |
| `voice` | `{ fileId, volume?, loop? }` | Play voice audio |
| `animation` | `{ ... }` | Apply animations |
| `layout` | `{ resourceId }` | Display layout |
| `choice` | `{ resourceId, items }` | Display choice menu |
| `cleanAll` | `true` | Clear all presentation state |

