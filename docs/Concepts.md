# Route Engine Concepts

route-engine is a state-driven visual novel engine that follows a unidirectional data flow architecture.

## Core Pattern: Unidirectional Data Flow

The engine follows a strict **State → View → Action** cycle:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌─────────────┐  │
│   │    State     │───▶│     View     │───▶│   Action    │  │
│   │ (systemState)│    │(route-graphics)   │   (events)  │  │
│   └──────────────┘    └──────────────┘    └─────────────┘  │
│          ▲                                       │          │
│          │                                       │          │
│          └───────────────────────────────────────┘          │
│                    systemStore actions                      │
│                    update the state                         │
└─────────────────────────────────────────────────────────────┘
```

1. **State (systemState)**: The single source of truth. Contains all runtime data including pointers, variables, and configuration.

2. **View (route-graphics)**: Renders the current state. The view is a pure function of state - given the same state, it always produces the same output.

3. **Action/Events**: User interactions (clicks, key presses) or system events (timers) trigger actions. Actions are processed by systemStore action functions.

4. **systemStore Actions**: These functions receive the current state, apply mutations (via Immer), and produce the next state. The cycle then repeats.

This pattern ensures:
- **Predictability**: State changes only through defined actions
- **Debuggability**: You can inspect any state and understand what the view should show
- **Testability**: Each part can be tested in isolation

## Architecture Overview

```mermaid
flowchart TD
    Start([Start]) --> projectData[projectData]
    projectData --> systemState[systemState]

    projectData --> constructPresentationState[[constructPresentationState]]
    systemState --> constructPresentationState
    constructPresentationState --> presentationState[presentationState]

    presentationState --> constructRenderState[[constructRenderState]]
    projectData --> constructRenderState
    systemState --> constructRenderState
    constructRenderState --> renderState[renderState]

    renderState --> renderer[renderer]
    user[user] --> renderer
    renderer --> user
    renderer --> action[[action]]
    action --> sideEffect[sideEffect]
    action --> systemState
    sideEffect --> renderer
```

## Core Data Structures

### Project Data

Static, read-only data that defines the visual novel content:

- **l10n**: Localization packages for multi-language support
- **resources**: Images, audio, animations, transforms, layouts, characters
- **story**: Scenes, sections, and lines that define the narrative flow

Project data is loaded once and never mutated during runtime.

## Story Hierarchy: Scenes, Sections, and Lines

The story content is organized in a three-level hierarchy:

```
story
├── scenes
│   ├── title_screen (Scene)
│   │   └── sections
│   │       ├── main_menu (Section)
│   │       │   └── lines: [line_1, line_2, ...]
│   │       └── settings (Section)
│   │           └── lines: [line_1, line_2, ...]
│   │
│   └── chapter_1 (Scene)
│       └── sections
│           ├── intro (Section)
│           │   └── lines: [line_1, line_2, ...]
│           ├── meeting (Section)
│           │   └── lines: [line_1, line_2, ...]
│           └── ending (Section)
│               └── lines: [line_1, line_2, ...]
```

### Hierarchy Levels

| Level | Purpose | Navigation |
|-------|---------|------------|
| **Scene** | Major story divisions (chapters, menus) | Currently implicit - set via `initialSceneId` |
| **Section** | Logical groupings within a scene | Use `sectionTransition` action |
| **Line** | Individual content units with actions | Automatic via `nextLine` or `jumpToLine` |

### Key Points

1. **Scene IDs are organizational only**: The pointer tracks `sectionId` and `lineId`, not `sceneId`. Scenes group related sections but don't appear in navigation state.

2. **Section IDs must be unique across all scenes**: When using `sectionTransition`, the engine searches all scenes to find the target section.

3. **Lines advance sequentially within a section**: Use `nextLine` to advance, `sectionTransition` to jump between sections.

### Navigation Example

```yaml
# In project data
story:
  initialSceneId: chapter_1
  scenes:
    chapter_1:
      initialSectionId: intro
      sections:
        intro:
          lines:
            - id: line_1
              actions:
                dialogue:
                  content: "Welcome to chapter 1!"
            - id: line_2
              actions:
                sectionTransition:
                  sectionId: meeting  # Jump to another section
        meeting:
          lines:
            - id: line_1
              actions:
                dialogue:
                  content: "Nice to meet you!"
```

### System State

Mutable runtime state managed by the system store. Key components:

- **global**: Application-wide settings
  - `pendingEffects`: Queue of side effects to execute
  - `autoMode` / `skipMode`: Playback mode flags
  - `dialogueUIHidden`: UI visibility toggle
  - `currentLocalizationPackageId`: Active language
  - `viewedRegistry`: Tracks which sections/lines have been seen
  - `nextLineConfig`: Controls line advancement behavior
  - `saveSlots`: Save game data
  - `isLineCompleted`: Whether current line animation finished

- **contexts**: Stack of isolated game contexts (supports title screen, gameplay, replays)
  - `currentPointerMode`: Either `'read'` or `'history'`
  - `pointers`: Position trackers (read pointer and history pointer)
  - `historySequence`: Navigation history
  - `configuration`: Context-specific settings
  - `views`: Layered view stack
  - `bgm`: Current background music
  - `variables`: Game variables

### Presentation State

Derived state computed from project data and system state. Represents **what should be displayed** without rendering specifics.

```js
const presentationState = constructPresentationState(presentations);
```

Presentation state includes:
- `base`: Base layout/screen configuration
- `background`: Current background or CG
- `dialogue`: Speaker, text content, mode (ADV/NVL)
- `character`: Character sprites and positions
- `visual`: Additional visual elements
- `bgm` / `sfx` / `voice`: Audio configuration
- `animation`: Active animations
- `layout`: UI layouts
- `choice`: Choice menu data

### Render State

Final output format ready for the renderer:

```js
const renderState = constructRenderState({
  presentationState,
  resources,
  l10n
});
```

Render state structure:
- `elements`: Tree of renderable elements (containers, sprites, text)
- `animations`: Tween animations to apply
- `audio`: Sound effects and music to play

## Contexts

Contexts provide isolated environments for different game states:

- **Title Screen Context**: The main menu before starting a game
- **Gameplay Context**: Active game session (new game or loaded save)
- **Replay Context**: History replay mode with read-only global variables

All contexts share global state but maintain their own:
- Pointer positions
- History sequences
- Variables
- View stacks

## Layered Views

Layered views provide a stack-based system for displaying UI overlays on top of the main story content. This is used for menus, settings screens, save/load interfaces, and other UI that temporarily covers the story view.

### Concept

```
┌─────────────────────────────────────┐
│         Layered View Stack          │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │  ← Top layer (visible, interactive)
│  │     Settings Menu           │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │  ← Middle layer
│  │     Pause Menu              │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│         Main Story View             │  ← Base (always present)
│   (background, characters, dialogue)│
└─────────────────────────────────────┘
```

### How It Works

- Views are pushed onto a stack using `pushLayeredView`
- The topmost view receives user interactions
- Popping a view reveals the one beneath it
- When the stack is empty, the main story view is interactive

### Layered View Actions

| Action | Effect |
|--------|--------|
| `pushLayeredView` | Add a new view on top of the stack |
| `popLayeredView` | Remove the topmost view |
| `replaceLastLayeredView` | Replace the current top view with a new one |
| `clearLayeredViews` | Remove all layered views, returning to story |

### Usage Example

```yaml
# Open a menu
- id: open_menu
  actions:
    pushLayeredView:
      resourceId: pause_menu_layout

# From within the menu, open settings (stacks on top)
- id: open_settings
  actions:
    pushLayeredView:
      resourceId: settings_layout

# Close current view (returns to pause menu)
- id: close_settings
  actions:
    popLayeredView: {}

# Close all menus and return to story
- id: resume_game
  actions:
    clearLayeredViews: {}
```

### When to Use Layered Views vs Section Transitions

| Use Case | Approach |
|----------|----------|
| Temporary UI overlay (pause menu, settings) | Layered Views |
| Navigating to different story content | Section Transition |
| Modal dialogs, confirmations | Layered Views |
| Branching narrative paths | Section Transition |

Layered views preserve the underlying story state, while section transitions change the story position entirely.

## Pointers

Pointers are the core navigation mechanism in route-engine. A pointer tracks the current position in the story by referencing a `sectionId` and `lineId`.

### Pointer Structure

```js
pointer: {
  sectionId: 'chapter_1_intro',
  lineId: 'line_42'
}
```

The pointer always points to a specific line within a specific section. The engine uses this to:
- Retrieve the current line's content and actions
- Determine which lines to include in presentation state (all lines from start of section up to current line)
- Navigate forward/backward through the story

### How Navigation Works

When `nextLine` is executed:
1. Get the current pointer's `sectionId` and `lineId`
2. Find the section using `selectSection({ sectionId })`
3. Find the current line's index in `section.lines`
4. Move to `lines[currentIndex + 1]`
5. Update the pointer with the new `lineId`

```js
// Simplified nextLine logic (inside an Immer-wrapped action)
const section = selectSection({ sectionId });
const currentIndex = section.lines.findIndex(line => line.id === lineId);
const nextLine = section.lines[currentIndex + 1];
pointer.lineId = nextLine.id;  // This mutation is safe - Immer creates a new state
```

> **Note:** This code runs inside an Immer-wrapped action function. What looks like direct mutation (`pointer.lineId = ...`) actually operates on an Immer "draft" that produces an immutable update. The original state is never modified.

### Pointer Modes

Each context maintains two pointers with different purposes:

```js
pointers: {
  read: { sectionId: '...', lineId: '...' },    // Current playback position
  history: { sectionId: '...', lineId: '...' }  // History review position
}
```

**Read Mode (`'read'`)**
- Normal playback mode
- The read pointer advances through lines sequentially
- Used during active gameplay

**History Mode (`'history'`)**
- Review mode for navigating back through previously viewed content
- Uses a separate history pointer while preserving the read pointer position
- Allows players to re-read past dialogue without losing their place
- Switching back to read mode returns to the preserved read pointer position

## Line Navigation

### Manual Navigation
- Controlled by `nextLineConfig.manual`
- `enabled`: Whether manual advancement is allowed
- `requireLineCompleted`: Whether line must finish animating first

### Auto Navigation
- Controlled by `nextLineConfig.auto`
- `enabled`: Whether auto-advance is active
- `trigger`: When to advance (`'fromStart'` or `'fromComplete'`)
- `delay`: Milliseconds to wait before advancing

## Dialogue Modes

### ADV Mode (Adventure)
Traditional visual novel style with one text box showing the current line. Each new line replaces the previous content.

### NVL Mode (Novel)
Novel-style display where lines accumulate on screen. Text is appended rather than replaced.

## Actions and Effects

### Actions
Functions that mutate system state. Examples:
- `nextLine`: Advance to next line
- `prevLine`: Go back in history
- `sectionTransition`: Jump to a different section
- `jumpToLine`: Jump to specific line
- `toggleAutoMode` / `toggleSkipMode`: Control playback
- `toggleDialogueUI`: Show/hide dialogue box
- `rollbackByOffset` / `rollbackToLine`: Backtrack with variable restoration

### Pending Effects
Side effects queued during action execution:
- `render`: Re-render the current state
- `handleLineActions`: Process actions attached to a line
- `startAutoNextTimer` / `clearAutoNextTimer`: Auto mode timers
- `startSkipNextTimer` / `clearSkipNextTimer`: Skip mode timers

## Store Architecture

The engine uses a custom store implementation (`createStore`) with:

- **Selectors**: Pure functions starting with `select*` that read state
- **Actions**: Functions that mutate state via Immer

```js
const store = createStore(initialState, {
  selectCount: (state) => state.count,
  increment: (state) => { state.count++; }  // Immer draft - safe mutation syntax
});
```

> **Immer Integration:** Action functions receive an Immer "draft" of the state, not the actual state. Code like `state.count++` uses mutation syntax but produces immutable updates under the hood. This provides the ergonomics of mutable code with the safety of immutable state management. You can write mutations naturally without spreading objects or creating copies manually.

### Action Executors

Two patterns for processing multiple actions:

**Sequential Executor**: Applies all actions to each payload in sequence
```js
const executor = createSequentialActionsExecutor(createInitialState, actions);
const result = executor(payloads);
```

**Selective Executor**: Applies only specified actions with their payloads
```js
const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
const result = executor({ actionName: payload });
```

## Viewed Registry

Tracks content the player has seen:

- **sections**: Array of `{ sectionId, lastLineId }` entries
- **resources**: Array of `{ resourceId }` entries

Used for:
- Skip mode (skip only viewed content)
- Unlocking gallery items
- Tracking completion progress

## Save System

Save slots store:
- `slotKey`: Unique identifier
- `date`: Unix timestamp
- `image`: Screenshot (base64)
- `state`: Serialized game state

## History Sequence Structure

The `historySequence` tracks navigation history with state snapshots for rollback functionality:

```js
historySequence: [
  {
    sectionId: "chapter_1",
    initialState: {           // Context variables snapshot at section entry
      score: 0,
      lives: 3
    },
    lines: [
      { id: "line_1" },
      { id: "line_2", updateVariableIds: ["action1"] },  // Action IDs executed
      { id: "line_3", updateVariableIds: ["action2", "action3"] }
    ]
  }
]
```

Key properties:
- `initialState`: Captured once when entering a section (context variables only)
- `lines`: Array of visited lines with their executed action IDs
- `updateVariableIds`: IDs of `updateVariable` actions executed on that line

## Backtrack and Rollback

The engine supports backtracking through history with variable state restoration using an **Event Sourcing** pattern:

### How Rollback Works

1. **Reset to `initialState`**: Context variables are restored to section entry values
2. **Replay Forward**: All `updateVariable` actions from `initialState` up to (but not including) the target line are re-executed
3. **Update Pointer**: Navigation pointer moves to target line in read mode

```js
// Rollback by offset (go back 1 line)
engine.handleAction('rollbackByOffset', { offset: -1 });

// Rollback to specific line
engine.handleAction('rollbackToLine', { sectionId: 'chapter_1', lineId: 'line_2' });
```

### Scope Limitations

- Only **context-scoped** variables are rolled back
- `global-device` and `global-account` variables are NOT affected
- Rollback is limited to lines within the current section

### Performance Considerations

Rollback uses a **replay-forward algorithm** that re-executes all variable update actions from the section's start to the target line. This means:

| Section Length | Rollback Cost |
|---------------|---------------|
| 10 lines with 5 variable updates | ~5 operations |
| 100 lines with 50 variable updates | ~50 operations |
| 500 lines with 200 variable updates | ~200 operations |

**Best practices for performance:**

1. **Keep sections reasonably sized**: Split very long sections (100+ lines) into smaller sections at natural break points
2. **Minimize variable updates per section**: Move complex variable logic to section transitions when possible
3. **Use section transitions strategically**: Each section creates a new `initialState` snapshot, resetting the replay cost

**Note:** Rollback is typically fast for normal section sizes. Performance only becomes noticeable with very long sections containing many variable updates.

## Effects System

The engine uses a pending effects queue to handle side effects. When an action modifies state, it queues effects rather than executing them directly. This provides:

- **Deduplication**: Multiple render requests become a single render
- **Batching**: All effects from an action cycle execute together
- **Separation of concerns**: State logic stays pure, side effects are explicit

### Built-in Effects

| Effect | Description |
|--------|-------------|
| `render` | Re-render the current state to the screen |
| `handleLineActions` | Process actions attached to the current line |
| `startAutoNextTimer` | Start auto-advance timer |
| `clearAutoNextTimer` | Stop auto-advance timer |
| `startSkipNextTimer` | Start skip mode timer (30ms intervals) |
| `clearSkipNextTimer` | Stop skip mode timer |
| `nextLineConfigTimer` | Start scene-specific auto-advance timer |
| `clearNextLineConfigTimer` | Stop scene-specific auto-advance timer |
| `saveSlots` | Persist save slots to localStorage |
| `saveGlobalDeviceVariables` | Persist device variables to localStorage |
| `saveGlobalAccountVariables` | Persist account variables to localStorage |

### Custom Effects Handler

The effects handler is injected at engine creation:

```javascript
const engine = createRouteEngine({
  handlePendingEffects: (effects) => {
    effects.forEach(effect => {
      switch (effect.name) {
        case 'render':
          routeGraphics.render(engine.selectRenderState());
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

## Glossary

This glossary standardizes terminology used throughout the route-engine documentation.

### Core Terms

| Term | Definition |
|------|------------|
| **route-engine** | The state management library for visual novels. Manages game logic, navigation, and state. |
| **route-graphics** | The rendering library that displays visuals using PixiJS. Receives render state from route-engine. |
| **projectData** | Static YAML/JSON configuration containing all story content, resources, and settings. Immutable at runtime. |

### State Terms

| Term | Definition |
|------|------------|
| **systemState** | The complete runtime state managed by systemStore. Contains pointers, variables, presentation state, etc. |
| **systemStore** | The Zustand store that holds systemState. Provides actions and selectors. |
| **presentationState** | Derived state describing what should be displayed (dialogue, background, characters, audio). |
| **renderState** | Final state passed to route-graphics. Contains elements, animations, and audio arrays ready for rendering. |
| **context** | An isolated game environment with its own pointer and variables. Supports multiple simultaneous contexts. |

### Story Structure Terms

| Term | Definition |
|------|------------|
| **Scene** | Top-level grouping (like chapters). Contains multiple sections. |
| **Section** | Mid-level grouping within a scene. Contains an array of lines. |
| **Line** | Single unit of content. Has an ID and actions object. |
| **Pointer** | Current reading position: `{ sectionId, lineId }`. Note: scoped to section, not scene. |

### Action Terms

| Term | Definition |
|------|------------|
| **Action** | A function that modifies systemState. Dispatched via `handleAction()` or `handleActions()`. |
| **Line Action** | Actions attached to a line (dialogue, background, character, etc.) that affect presentation. |
| **Effect** | Side effect queued for external handling (render, timers, persistence). Processed by effects handler. |
| **Pending Effects** | Queue of effects waiting to be processed. Cleared after handling. |

### Navigation Terms

| Term | Definition |
|------|------------|
| **nextLine** | Advance to the following line within the current section. |
| **sectionTransition** | Navigate to a different section (same or different scene). |
| **Rollback** | Return to a previous line with variable state reverted. Uses event sourcing. |
| **History Mode** | Reading mode that allows navigating through previously viewed content. |

### Variable Terms

| Term | Definition |
|------|------------|
| **context variable** | Variable scoped to current game session. Reset on new game. |
| **global-device variable** | Variable persisted to device localStorage. Survives across sessions. |
| **global-account variable** | Variable persisted to account localStorage. Follows user across devices. |

### UI Terms

| Term | Definition |
|------|------------|
| **Layered View** | Overlay UI (menus, settings) managed as a stack. Push/pop to show/hide. |
| **Dialogue UI** | The dialogue box and related UI. Can be shown/hidden independently. |
| **nextLineConfig** | Configuration controlling how lines advance (manual click, auto-advance, timers). |

## Related Documentation

- [Getting Started Guide](./GettingStarted.md) - Quick setup and basic usage
- [API Reference](./RouteEngine.md) - Complete API documentation
- [Project Data Schema](./ProjectDataSchema.md) - YAML configuration reference
- [Troubleshooting](./Troubleshooting.md) - Common issues and solutions
