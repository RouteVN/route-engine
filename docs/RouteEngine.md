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

### `init({ initialState, namespace })`

Initializes the engine with project data and global settings.

```js
engine.init({
  namespace: "my-visual-novel",
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

For browser-backed save/load hydration, the runtime also exports
`createIndexedDbPersistence({ namespace })`. Use the same `namespace` both when
loading persisted data before init and when calling `engine.init(...)` so
different visual novels on the same domain do not share persistence. The
returned adapter also exposes `clear()` to delete persisted data for that
namespace.

Localization is not implemented in the current runtime. The planned
patch-based l10n model is documented in [L10n.md](./L10n.md).

The engine will:

1. Create the system store with initial state
2. Append a `render` effect
3. Execute any actions on the initial line
4. Trigger pending effects handler
5. Clear pending effects

## Project Data Interfaces

### Computed Variables

Computed variables are derived read-only values declared under
`resources.variables[*].computed`. They are exposed through the same
`variables.*` template namespace as stored variables, but are not persisted or
updated directly.

The locked authored interface is documented in
[ComputedVariables.md](./ComputedVariables.md).

## Methods

### `selectSystemState()`

Returns a cloned snapshot of the full internal system state.

This is intended for tooling, debugging, capture harnesses, and devtools-style
inspection. It should not be treated as the primary gameplay-facing API for
normal runtime integration.

The returned value is a snapshot, not the live mutable store object.

```js
const systemState = engine.selectSystemState();

console.log(systemState.global.nextLineConfig);
console.log(systemState.contexts.at(-1)?.pointers);
```

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

### `resolveComputedVariables({ projectData?, variableConfigs?, variables?, runtime? })`

Evaluates computed variables with the same logic used by the engine.

```js
import { resolveComputedVariables } from "rvn-temp";

const variables = resolveComputedVariables({
  projectData,
  variables: {
    hp: 40,
    maxHp: 100,
  },
  runtime,
});
```

Pass either full `projectData` or `variableConfigs`. The returned object merges
stored variables with resolved computed variables and ignores stale computed
keys from the input `variables` object.

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
  startAutoMode: {},
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
    payload:
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
    dialogue: {
      characterId: "protagonist",
      character: {
        name: "Hero",
      },
      persistCharacter: true,
      content: [{ text: "Hello!" }],
    },
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
//   dialogue: {
//     characterId: 'protagonist',
//     character: { name: 'Hero' },
//     persistCharacter: true,
//     content: [...]
//   },
//   bgm: { resourceId: 'music_1', loop: true }
// }
```

### `selectSectionLineChanges({ sectionId, includePresentationState? })`

Returns the per-line presentation diff for an entire section.

By default each line entry only includes `changes`. Pass
`includePresentationState: true` to also include the full end-state
`presentationState` after that line has been applied.

```js
const sectionLineChanges = engine.selectSectionLineChanges({
  sectionId: "section1",
  includePresentationState: true,
});
// {
//   lines: [
//     {
//       id: "line-1",
//       changes: { ... },
//       presentationState: { ... }
//     }
//   ]
// }
```

## Available Actions

### Navigation Actions

| Action              | Payload                  | Description                                                 |
| ------------------- | ------------------------ | ----------------------------------------------------------- |
| `nextLine`          | -                        | Advance to the next line (respects `nextLineConfig.manual`) |
| `rollbackByOffset`  | `{ offset? }`            | Roll back relative to the active rollback checkpoint        |
| `rollbackToLine`    | `{ sectionId, lineId }`  | Roll back to a specific line in the rollback timeline       |
| `jumpToLine`        | `{ sectionId?, lineId }` | Jump to specific line                                       |
| `sectionTransition` | `{ sectionId }`          | Transition to a different section                           |

### Conditional Actions

Use `conditional` to evaluate ordered branches and execute the first matching
branch. `when` uses Jempl condition syntax, including semantic JSON conditions.
A branch without `when` is treated as `else` and should be last.

```yaml
actions:
  conditional:
    branches:
      - when:
          gte:
            - var: variables.trust
            - 70
        actions:
          jumpToLine:
            lineId: trustedRoute
      - actions:
          jumpToLine:
            lineId: guardedRoute
```

The same action can be used inside choice click payloads:

```yaml
events:
  click:
    payload:
      actions:
        conditional:
          branches:
            - when:
                eq:
                  - var: variables.role
                  - admin
              actions:
                jumpToLine:
                  lineId: adminRoute
            - actions:
                nextLine: {}
```

### Playback Mode Actions

| Action           | Payload | Description               |
| ---------------- | ------- | ------------------------- |
| `startAutoMode`  | -       | Enable auto-advance mode  |
| `stopAutoMode`   | -       | Disable auto-advance mode |
| `toggleAutoMode` | -       | Toggle auto-advance mode  |
| `startSkipMode`  | -       | Enable skip mode          |
| `stopSkipMode`   | -       | Disable skip mode         |
| `toggleSkipMode` | -       | Toggle skip mode          |

Playback timing semantics:

- Global `autoMode` waits for the current line to complete before starting its `_autoForwardTime` delay.
- That completion is driven by Route Graphics `renderComplete`, so revealing text and other tracked render work finish first.
- Global `skipMode` does not use that completion gate; it advances on its own fast timer.
- `nextLineConfig.auto` is separate and may use `trigger: "fromStart"` or `trigger: "fromComplete"` depending on authored behavior.

### UI Actions

| Action             | Payload | Description                   |
| ------------------ | ------- | ----------------------------- |
| `showDialogueUI`   | -       | Show the dialogue UI          |
| `hideDialogueUI`   | -       | Hide the dialogue UI          |
| `toggleDialogueUI` | -       | Toggle dialogue UI visibility |

### State Management Actions

| Action                | Payload              | Description                                 |
| --------------------- | -------------------- | ------------------------------------------- |
| `setNextLineConfig`   | `{ manual?, auto? }` | Configure line advancement                  |
| `updateProjectData`   | `{ projectData }`    | Replace project data                        |
| `resetStoryAtSection` | `{ sectionId }`      | Reset story-local state and enter a section |

### Registry Actions

| Action              | Payload                 | Description                              |
| ------------------- | ----------------------- | ---------------------------------------- |
| `addViewedLine`     | `{ sectionId, lineId }` | Mark line as viewed in account state     |
| `addViewedResource` | `{ resourceId }`        | Mark resource as viewed in account state |

Seen-line semantics:

- The engine stores seen progress per section as a single frontier: `{ sectionId, lastLineId }`.
- The frontier line itself counts as seen.
- Any earlier line in the same section also counts as seen.
- The frontier is updated when a line is completed and when progression moves away from the current line.
- Account-level viewed state is persisted outside save slots as `global.accountViewedRegistry`.
- Skip-unseen checks use account-level viewed state; `runtime.skipUnseenText` only controls whether skip may pass unseen account content.

### Save System Actions

| Action     | Payload                       | Description           |
| ---------- | ----------------------------- | --------------------- |
| `saveSlot` | `{ slotId, thumbnailImage? }` | Save game to a slot   |
| `loadSlot` | `{ slotId }`                  | Load game from a slot |

Save/load design, requirements, and storage boundaries are documented in [SaveLoad.md](./SaveLoad.md).
Destructive fresh-start navigation semantics are documented in [ResetStoryAtSection.md](./ResetStoryAtSection.md).

Notes:

- `slotId` is the public action field; storage stringification is internal
- save/load UIs can bind `slotId` directly from layout templates such as `${slot.slotId}`
- if slot identity comes from event data, use `_event.*` bindings such as `slotId: "_event.slotId"`
- example save/load UI copy should stay terse; prefer short labels like `Save`, `Load`, `Page 1`, `Saved`, `Empty`, and `Image`
- `thumbnailImage` is integration-provided; the engine does not capture screenshots by itself
- if a save action appears inside a multi-action event payload, the host should prepare/augment the `actions` object and still call `handleActions(...)` once for the whole batch

### Internal Store Actions

These actions exist inside the store/runtime but are not part of the stable authored/public API surface:

| Action                | Payload                | Description                         |
| --------------------- | ---------------------- | ----------------------------------- |
| `markLineCompleted`   | -                      | Internal render-complete transition |
| `nextLineFromSystem`  | -                      | Internal timer-driven advance       |
| `appendPendingEffect` | `{ name, ...options }` | Queue a side effect                 |
| `clearPendingEffects` | -                      | Clear the effect queue              |

Use these only if you are extending engine internals or writing engine-level tests.

## Available Selectors

The system store exposes these selectors (called internally):

| Selector                        | Parameters              | Returns                                   |
| ------------------------------- | ----------------------- | ----------------------------------------- |
| `selectPendingEffects`          | -                       | Array of pending effects                  |
| `selectCurrentPointer`          | -                       | `{ currentPointerMode: "read", pointer }` |
| `selectCurrentLine`             | -                       | Current line object                       |
| `selectSection`                 | `{ sectionId }`         | Section object                            |
| `selectAutoMode`                | -                       | Boolean                                   |
| `selectSkipMode`                | -                       | Boolean                                   |
| `selectDialogueUIHidden`        | -                       | Boolean                                   |
| `selectIsLineAccountViewed`     | `{ sectionId, lineId }` | Account-level viewed boolean              |
| `selectIsResourceAccountViewed` | `{ resourceId }`        | Account-level viewed boolean              |
| `selectNextLineConfig`          | -                       | Config object                             |
| `selectSaveSlotMap`             | -                       | Save slots object map                     |
| `selectSaveSlot`                | `{ slotId }`            | Save slot data                            |
| `selectSaveSlotPage`            | `{ slotsPerPage? }`     | Paged save slot list for UI               |

## Pending Effects

Effects queued by actions for external handling:

| Effect                   | Description                            |
| ------------------------ | -------------------------------------- |
| `render`                 | Re-render the current state            |
| `handleLineActions`      | Process current line's actions         |
| `applyScopedDataUpdates` | Persist ordered scoped data operations |

`applyScopedDataUpdates` is a public runtime-facing persistence contract. Its full interface and semantics are documented in [ScopedDataUpdates.md](./ScopedDataUpdates.md).

Built-in effect handling notes:

- `createEffectsHandler(...)` coalesces only the latest occurrence of replaceable built-in effects such as `render`, timer start/clear effects, `handleLineActions`, and full-snapshot persistence effects.
- `applyScopedDataUpdates` is incremental and ordered, so it must not be last-write coalesced by effect name.
- Unknown effect names are not silently dropped; `createEffectsHandler(...)` throws unless you provide `handleUnhandledEffect`.
- The coalescing rule is specific to the built-in effect handler, not the store queue itself.

## Line Actions (Presentation)

Actions that can be attached to lines to control presentation:

| Action       | Properties                                                                                                 | Description                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `background` | `{ resourceId, animations? }`                                                                              | Set background/CG                                                                                 |
| `dialogue`   | `{ characterId?, character?, character.sprite?, persistCharacter?, content, append?, mode?, ui?, clear? }` | Display dialogue                                                                                  |
| `character`  | `{ items }`                                                                                                | Display character sprites. Each item can have optional `x` and `y` to override transform position |
| `visual`     | `{ items }`                                                                                                | Display visual elements                                                                           |
| `bgm`        | `{ resourceId, loop?, startDelayMs? }`                                                                     | Play background music                                                                             |
| `sfx`        | `{ items }`                                                                                                | Play sound effects                                                                                |
| `voice`      | `{ resourceId, volume?, loop?, startDelayMs? }`                                                            | Play voice audio from `resources.voices[currentSceneId][resourceId]`                              |
| `animation`  | `{ ... }`                                                                                                  | Apply animations                                                                                  |
| `layout`     | `{ resourceId }`                                                                                           | Display layout                                                                                    |
| `control`    | `{ resourceId }`                                                                                           | Activate control bindings and control UI                                                          |
| `choice`     | `{ resourceId, items }`                                                                                    | Display choice menu                                                                               |
| `cleanAll`   | `true`                                                                                                     | Clear all presentation state                                                                      |

### Dialogue Speaker Fields

Use `dialogue.character.name` for new authored content. `dialogue.characterName` is still accepted, but only as a compatibility alias for older content and tools, so it is intentionally omitted from the public action summary above.

Preferred authored shape:

```yaml
dialogue:
  characterId: alice
  character:
    name: Alias
    sprite:
      transformId: dialoguePortraitLeft
      items:
        - id: base
          resourceId: aliceBody
        - id: face
          resourceId: aliceSmile
      animations:
        resourceId: portraitIn
  persistCharacter: true
  content:
    - text: Hello
```

Field semantics:

- `characterId` is the speaker identity. It selects the character resource and its default display name.
- `character.name` is only a display-name override.
- `character.sprite` is an optional layered speaker sprite group rendered with the dialogue action.
- `persistCharacter: true` means later dialogue lines that omit speaker fields reuse the previous `characterId` and `character` override.
- If a later dialogue line explicitly provides `characterId` without `character.name` or `character.sprite`, the previous override is cleared and the displayed name falls back to the character resource name.
- If a later dialogue line omits `characterId` but provides `character.name` or
  `character.sprite` while `persistCharacter` is active, the provided fields
  update the persisted speaker and omitted fields keep their previous values.

### Dialogue Append Reveal

In ADV mode, `dialogue.append: true` appends the line content to the current
dialogue content instead of replacing it. The engine exposes
`dialogue.initialRevealedCharacters` to dialogue layouts so a `text-revealing`
element can keep the existing prefix visible and reveal only the appended suffix.
When an append action omits speaker fields, the current speaker is kept for the
continuation; explicit `characterId` or `character` fields still update it.

```yaml
dialogue:
  ui:
    resourceId: advDialogue
  content:
    - text: "Held prefix: "

dialogue:
  append: true
  content:
    - text: "continuing from the same visible line."
```

The dialogue layout should pass the template value through to Route Graphics:

```yaml
- id: dialogue-text
  type: text-revealing
  content: ${dialogue.content}
  initialRevealedCharacters: ${dialogue.initialRevealedCharacters}
  revealEffect: typewriter
```

### Dialogue Character Sprites

`dialogue.character.sprite` renders one dialogue speaker sprite group. It uses a
single transform and animation selection for all sprite layers.

```yaml
dialogue:
  characterId: alice
  character:
    sprite:
      transformId: dialoguePortraitLeft
      items:
        - id: base
          resourceId: aliceBody
        - id: face
          resourceId: aliceSmile
      animations:
        resourceId: portraitIn
        playback:
          continuity: render
  content:
    - text: Hello
```

Runtime behavior:

- `sprite.transformId` resolves through `resources.transforms`.
- `sprite.items[].resourceId` resolves through `resources.images`.
- `sprite.animations.resourceId` resolves through `resources.animations`.
- The rendered container id is `dialogue-character-sprite`.
- Sprite layer ids are `dialogue-character-sprite-${item.id}`.
- The sprite group is added after the dialogue UI layout elements, so the
  portrait can render above the UI when they overlap.
- An animation-only `character.sprite` payload can animate out the previous
  dialogue sprite group:

```yaml
dialogue:
  character:
    sprite:
      animations:
        resourceId: portraitOut
  content:
    - text: Goodbye
```

Examples:

```yaml
# Omitted speaker fields keep the persisted alias.
- dialogue:
    characterId: alice
    character:
      name: Alias
    persistCharacter: true
    content:
      - text: Hello
- dialogue:
    content:
      - text: Hi again
```

The second line still displays `Alias`.

```yaml
# Explicit characterId resets the speaker to the resource name
# unless character.name is provided again.
- dialogue:
    characterId: alice
    character:
      name: Alias
    persistCharacter: true
    content:
      - text: Hello
- dialogue:
    characterId: alice
    content:
      - text: Hi again
```

The second line displays `Alice`, not `Alias`.

Template/runtime paths:

- Active dialogue layouts should use `${dialogue.character.name}`.
- Active dialogue layouts can inspect sprite metadata at paths such as `${dialogue.character.sprite.items[0].resourceId}`.
- NVL line-item layouts should prefer `${line.character.name}`. `${line.characterName}` remains available as a compatibility alias.
- NVL line-item layouts can inspect sprite metadata at `${line.character.sprite}`.
- Dialogue history layouts should prefer `${item.character.name}`. `${item.characterName}` remains available as a compatibility alias.
- Dialogue history layouts can inspect sprite metadata at `${item.character.sprite}`.

### Voice Resources

Voice assets are grouped by scene under `resources.voices`. The line action only
stores the scene-local `resourceId`; the engine resolves the scene from the
current section. If `voice.volume` is omitted, the emitted audio uses
`runtime.soundVolume`; `runtime.muteAll` forces voice volume to `0`.

```yaml
resources:
  voices:
    scene_intro:
      alice_001:
        fileId: voices/scene_intro/alice_001.ogg

story:
  scenes:
    scene_intro:
      sections:
        opening:
          lines:
            - id: line_001
              actions:
                dialogue:
                  content:
                    - text: "You're late."
                voice:
                  resourceId: alice_001
                  volume: 80
```

### Shared Layout Template Data

All layout-backed UI surfaces render against the same base template-data
contract:

- dialogue UI layouts
- generic `layout` presentation layouts
- `control` layouts
- `choice` layouts
- overlays
- confirm dialogs
- background/CG layouts that render layout elements
- layout-backed visual items

Shared template roots:

- `variables`
- `runtime`
- `saveSlots`
- `characters`
- `isChoiceVisible`
- `canRollback`

Roots with special presence semantics:

- `dialogue` and `dialogueLines` are added only when active dialogue template
  data exists
- `choice` is added by the choice-layout render path when a choice is active
- `historyDialogue` is always present in the shared template data and defaults
  to `[]`
- `confirmDialog` is always present in the shared template data and is
  `undefined` when no confirm dialog is active

The dialogue omission is intentional. When no active dialogue state exists, the
runtime does not materialize `dialogue: {}` or `dialogueLines: []`. Existing
truthiness checks such as `$if dialogue` therefore keep their previous
behavior.

Dialogue template shape:

```yaml
dialogue:
  characterId: alice
  persistCharacter: true
  character:
    name: Alias
    sprite:
      transformId: dialoguePortraitLeft
      items:
        - id: base
          resourceId: aliceBody
        - id: face
          resourceId: aliceSmile
  content:
    - text: Hello
  lines:
    - characterId: alice
      character:
        name: Alice
        sprite:
          transformId: dialoguePortraitLeft
          items:
            - id: base
              resourceId: aliceBody
      characterName: Alice
      content:
        - text: Hello
```

Compatibility notes:

- `dialogue.characterId` is available anywhere the shared layout template data
  is used, not only inside the dedicated dialogue UI.
- `dialogue.character.name` remains the preferred speaker display-name path.
- `dialogue.character.sprite`, `line.character.sprite`, and
  `item.character.sprite` expose the authored dialogue sprite metadata.
- `dialogueLines` remains a compatibility alias for `dialogue.lines`.
- `line.characterName` remains a compatibility alias for `line.character.name`.
- Existing authored templates that rely on `line.characterName` or
  `dialogueLines` do not need to change.

Examples:

```yaml
# Generic layout or control condition
$when: 'dialogue.characterId == "alice"'
```

```yaml
# Preferred display-name path
content: "${dialogue.character.name}"
```

```yaml
# Compatibility alias still supported
content: "${dialogueLines[0].characterName}"
```
