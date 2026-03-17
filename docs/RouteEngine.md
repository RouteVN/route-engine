# RouteEngine API Reference

The RouteEngine is the core runtime for RVN visual novels. It manages state, processes actions, and coordinates rendering.

## Creating an Engine Instance

```js
import createRouteEngine from "rvn-temp";

const engine = createRouteEngine({
  handlePendingEffects: (effects) => {
    // Process side effects (render, timers, etc.)
    effects.forEach((effect) => {
      switch (effect.name) {
        case "render":
          renderToScreen(engine.selectRenderState());
          break;
        case "handleLineActions":
          engine.handleLineActions();
          break;
        // ... handle other effects
      }
    });
  },
});
```

## Initialization

### `init({ initialState })`

Initializes the engine with project data and global settings.

```js
engine.init({
  initialState: {
    projectData: {
      resources: {
        /* images, audio, etc */
      },
      story: {
        initialSceneId: "scene1",
        scenes: {
          scene1: {
            initialSectionId: "section1",
            sections: {
              section1: {
                initialLineId: "line1", // optional, otherwise first line is used
                lines: [
                  /* section lines */
                ],
              },
            },
          },
        },
      },
    },
  },
});
```

Localization is not implemented in the current runtime. The planned
patch-based l10n model is documented in [L10n.md](./L10n.md).

The engine will:

1. Create the system store with initial state
2. Append a `render` effect
3. Execute any actions on the initial line
4. Trigger pending effects handler
5. Clear pending effects

## Methods

## Utilities

### `resolveLayoutReferences(value, { resources })`

Resolves authored layout references into renderer-facing fields without mutating
the input value.

It resolves:

- `textStyleId` into `textStyle`
- `colorId` into `fill`
- `imageId` into `src`
- nested interaction references such as `hover.colorId`,
  `clickImageId`, and `rightClick.colorId`

It uses the same strict rules as the engine render-state pipeline, so inline
authored `textStyle`, `fill`, and sprite `src` fields still throw.

```js
import { resolveLayoutReferences } from "rvn-temp";

const resolvedElements = resolveLayoutReferences(layout.elements, {
  resources: projectData.resources,
});
```

### `handleAction(actionType, payload)`

Dispatches a single action to the system store.

```js
// Advance to next line
engine.handleAction("nextLine");

// Jump to specific section
engine.handleAction("sectionTransition", { sectionId: "chapter_2" });

// Toggle auto mode
engine.handleAction("toggleAutoMode");
```

### `handleActions(actions, eventContext?)`

Dispatches multiple actions from an object. Optionally accepts event context for `_event.*` payload bindings.

```js
// Basic usage
engine.handleActions({
  setNextLineConfig: {
    manual: { enabled: false },
    auto: { enabled: true, trigger: "fromComplete", delay: 2000 },
  },
  markLineCompleted: {},
});

// With event context (for slider/input events)
// Bindings like _event.value in action payloads get resolved
engine.handleActions(payload.actions, { _event: payload._event });
```

#### Event Templating

When `eventContext` is provided, action payloads can use `_event.*` bindings to reference event values.
Action payloads can also reference `${variables.*}` and they will be resolved at runtime.
`eventContext` only supports `_event` for event data; using `event` will throw.
Invalid `_event.*` bindings fail fast with an explicit error.

```yaml
# In YAML layout definition
- id: volumeSlider
  type: slider
  min: 0
  max: 100
  change:
    actionPayload:
      actions:
        updateVariable:
          id: setVolume
          operations:
            - variableId: volume
              op: set
              value: "_event.value" # Resolved to slider's current value
```

The integration layer should pass event context when handling events:

```js
eventHandler: (eventName, payload) => {
  if (payload.actions) {
    engine.handleActions(
      payload.actions,
      payload._event ? { _event: payload._event } : undefined,
    );
  }
};
```

#### Layout Resource References

Layout authoring uses project resource references, not the renderer-facing fields
that RouteGraphics consumes directly.

- `textStyleId` resolves through `resources.textStyles` to renderer `textStyle`
- `imageId` / `hoverImageId` / `clickImageId` resolve through `resources.images`
  to renderer `src`, `hover.src`, and `click.src`
- `colorId` / `hover.colorId` / `click.colorId` / `rightClick.colorId` resolve
  through `resources.colors` to renderer `fill`

This resolution happens during render-state construction, before RouteGraphics
parses the layout tree.

#### Layout Text Styles

Layout text should be authored with `textStyleId` and resolved through `resources.textStyles`.
Authored inline `textStyle` objects in layout elements are rejected at render-state construction.
Text transparency should be authored on the text style resource with `colorAlpha`
and `strokeAlpha`, not baked into the shared color resource itself. Whole-node
transparency still uses the element `alpha`. `resources.colors[*].hex` must be
opaque hex only.

```yaml
resources:
  fonts:
    fontDefault:
      fileId: Arial
  colors:
    colorPrimary:
      hex: "#FFFFFF"
  textStyles:
    body:
      fontId: fontDefault
      colorId: colorPrimary
      colorAlpha: 0.9
      fontSize: 24
      fontWeight: "400"
      fontStyle: normal
      lineHeight: 1.2
      strokeColorId: colorPrimary
      strokeAlpha: 0.35
      strokeWidth: 2
  layouts:
    dialogueLayout:
      elements:
        - id: dialogue-text
          type: text
          content: "${dialogue.content[0].text}"
          textStyleId: body
```

#### Layout Sprite Images

Layout sprite elements should be authored with `imageId` and optional
`hoverImageId` / `clickImageId`.
Authored inline sprite `src` and interaction `hover.src` / `click.src` fields are
rejected at render-state construction. Legacy `url`, `hoverUrl`, and `clickUrl`
fields are also rejected.

If `resources.images[imageId]` exists, the engine resolves the sprite to that
image resource's `fileId`. Otherwise, the rendered `imageId` string is passed
through directly, which allows dynamic values such as save preview image keys.
Before RouteGraphics parses the layout, the engine resolves these IDs to
sprite-facing `src`, `hover.src`, and `click.src` fields.

```yaml
resources:
  images:
    buttonIdle:
      fileId: button-idle.png
      width: 400
      height: 80
    buttonHover:
      fileId: button-hover.png
      width: 400
      height: 80
  layouts:
    titleLayout:
      elements:
        - id: start-button
          type: sprite
          imageId: buttonIdle
          hoverImageId: buttonHover
```

#### Layout Rect Colors

Layout rect elements should be authored with `colorId` and optional
`hover.colorId` / `click.colorId` / `rightClick.colorId`.
Authored inline rect `fill` and interaction `hover.fill` / `click.fill` /
`rightClick.fill` fields are rejected at render-state construction.
Before RouteGraphics parses the layout, the engine resolves these IDs to
rect-facing `fill` fields.

```yaml
resources:
  colors:
    panelBg:
      hex: "#000000"
    panelBgHover:
      hex: "#141414"
  layouts:
    menuLayout:
      elements:
        - id: menu-panel
          type: rect
          width: 900
          height: 420
          opacity: 0.85
          colorId: panelBg
          hover:
            colorId: panelBgHover
            opacity: 0.9
```

### `handleLineActions()`

Processes actions attached to the current line. Called automatically on line changes.

```js
// Line data structure
const line = {
  id: "line_1",
  actions: {
    background: { resourceId: "bg_school" },
    dialogue: { characterId: "protagonist", content: [{ text: "Hello!" }] },
    bgm: { resourceId: "music_1" },
  },
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

| Action              | Payload                  | Description                                                 |
| ------------------- | ------------------------ | ----------------------------------------------------------- |
| `nextLine`          | -                        | Advance to the next line (respects `nextLineConfig.manual`) |
| `prevLine`          | `{ sectionId }`          | Navigate to previous line (enters history mode)             |
| `jumpToLine`        | `{ sectionId?, lineId }` | Jump to specific line                                       |
| `sectionTransition` | `{ sectionId }`          | Transition to a different section                           |

### Playback Mode Actions

| Action           | Payload | Description               |
| ---------------- | ------- | ------------------------- |
| `startAutoMode`  | -       | Enable auto-advance mode  |
| `stopAutoMode`   | -       | Disable auto-advance mode |
| `toggleAutoMode` | -       | Toggle auto-advance mode  |
| `startSkipMode`  | -       | Enable skip mode          |
| `stopSkipMode`   | -       | Disable skip mode         |
| `toggleSkipMode` | -       | Toggle skip mode          |

### UI Actions

| Action             | Payload | Description                   |
| ------------------ | ------- | ----------------------------- |
| `showDialogueUI`   | -       | Show the dialogue UI          |
| `hideDialogueUI`   | -       | Hide the dialogue UI          |
| `toggleDialogueUI` | -       | Toggle dialogue UI visibility |

### State Management Actions

| Action              | Payload              | Description                    |
| ------------------- | -------------------- | ------------------------------ |
| `markLineCompleted` | -                    | Mark current line as completed |
| `setNextLineConfig` | `{ manual?, auto? }` | Configure line advancement     |
| `updateProjectData` | `{ projectData }`    | Replace project data           |

### Registry Actions

| Action              | Payload                 | Description                   |
| ------------------- | ----------------------- | ----------------------------- |
| `addViewedLine`     | `{ sectionId, lineId }` | Mark line as viewed           |
| `addViewedResource` | `{ resourceId }`        | Mark resource as viewed       |
| `addToHistory`      | `{ item }`              | Add entry to history sequence |

### Save System Actions

| Action            | Payload                           | Description       |
| ----------------- | --------------------------------- | ----------------- |
| `replaceSaveSlot` | `{ slotKey, date, image, state }` | Save game to slot |

### Effect Actions

| Action                | Payload                | Description            |
| --------------------- | ---------------------- | ---------------------- |
| `appendPendingEffect` | `{ name, ...options }` | Queue a side effect    |
| `clearPendingEffects` | -                      | Clear the effect queue |

## Available Selectors

The system store exposes these selectors (called internally):

| Selector                 | Parameters              | Returns                           |
| ------------------------ | ----------------------- | --------------------------------- |
| `selectPendingEffects`   | -                       | Array of pending effects          |
| `selectCurrentPointer`   | -                       | `{ currentPointerMode, pointer }` |
| `selectCurrentLine`      | -                       | Current line object               |
| `selectSection`          | `{ sectionId }`         | Section object                    |
| `selectAutoMode`         | -                       | Boolean                           |
| `selectSkipMode`         | -                       | Boolean                           |
| `selectDialogueUIHidden` | -                       | Boolean                           |
| `selectIsLineViewed`     | `{ sectionId, lineId }` | Boolean                           |
| `selectIsResourceViewed` | `{ resourceId }`        | Boolean                           |
| `selectNextLineConfig`   | -                       | Config object                     |
| `selectSaveSlots`        | -                       | Save slots object                 |
| `selectSaveSlot`         | `{ slotKey }`           | Save slot data                    |

## Pending Effects

Effects queued by actions for external handling:

| Effect              | Description                    |
| ------------------- | ------------------------------ |
| `render`            | Re-render the current state    |
| `handleLineActions` | Process current line's actions |

## Line Actions (Presentation)

Actions that can be attached to lines to control presentation:

| Action       | Properties                                                  | Description                                                                                       |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `base`       | `{ resourceId }`                                            | Set base layout                                                                                   |
| `background` | `{ resourceId, animations? }`                               | Set background/CG                                                                                 |
| `dialogue`   | `{ characterId?, character?, content, mode?, ui?, clear? }` | Display dialogue                                                                                  |
| `character`  | `{ items }`                                                 | Display character sprites. Each item can have optional `x` and `y` to override transform position |
| `visual`     | `{ items }`                                                 | Display visual elements                                                                           |
| `bgm`        | `{ resourceId, loop?, volume?, delay? }`                    | Play background music                                                                             |
| `sfx`        | `{ items }`                                                 | Play sound effects                                                                                |
| `voice`      | `{ fileId, volume?, loop? }`                                | Play voice audio                                                                                  |
| `animation`  | `{ ... }`                                                   | Apply animations                                                                                  |
| `layout`     | `{ resourceId }`                                            | Display layout                                                                                    |
| `control`    | `{ resourceId }`                                            | Activate control bindings and control UI                                                          |
| `choice`     | `{ resourceId, items }`                                     | Display choice menu                                                                               |
| `cleanAll`   | `true`                                                      | Clear all presentation state                                                                      |
