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

For deterministic tests, `createRouteEngine` also accepts a `randomSource`
with a synchronous `nextUint32()` method. It must return an integer from `0`
through `4294967295`. Production hosts can omit it; the engine uses
`crypto.getRandomValues` when available and falls back to `Math.random` for
compatibility.

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

Initialization may also receive complete imported L10n packages through
`initialState.l10nData`. The canonical project is the default; an existing
device preference under `initialState.global.runtime.localizationPackageId`
restores an imported package. Authored layouts receive package options and can
dispatch `updateLocalizationPackage` to switch and render. The patch format,
package layout, and runtime behavior are documented in [L10n.md](./L10n.md).

### Project Runtime Defaults

Projects can override the initial values of device-level preferences under
`projectData.config.runtimeDefaults`:

```yaml
config:
  runtimeDefaults:
    dialogueTextSpeed: 50
    autoForwardDelay: 1000
    autoForwardSpeed: 50
    skipUnseenText: false
    skipTransitionsAndAnimations: false
    soundVolume: 50
    musicVolume: 50
    muteAll: false
```

Every field is optional. Omitted fields retain the engine default. During
initialization, a persisted device preference overrides the project default for
that field. Project defaults are only initialization fallbacks: changing
project data, resetting story progress, loading a slot, or rolling back does
not overwrite the active device preferences.

`autoForwardSpeed`, `soundVolume`, and `musicVolume` accept values from `0` to
`100`; `autoForwardDelay` is a non-negative number of milliseconds. Runtime
mode flags, context UI state, and `localizationPackageId` are intentionally not
project-configurable. The canonical project remains the initial localization
unless the device has a saved localization selection.

During initialization, the engine:

1. Create the system store with initial state
2. Append a `render` effect
3. Execute any actions on the initial line
4. Trigger pending effects handler
5. Clear pending effects

Calling `init(...)` again replaces the active runtime generation. Engine-owned
timers, render-completion ownership, and pending asynchronous renderer input
from the previous generation are invalidated before the replacement begins.
If validation of the replacement state fails, the existing generation remains
active.

### `dispose()`

Stops the active engine generation and releases engine-owned timers and event
ownership. Disposal is idempotent. Renderer events and story actions from the
disposed generation are rejected. Read-only state remains available through
`selectSystemState()`. A later successful `init(...)` starts a fresh generation
on the same engine instance.

Hosts should call `dispose()` before permanently discarding an engine. Pending
persistence writes that were already handed to the persistence adapter are not
cancelled.

## Project Data Interfaces

### Computed Variables

Computed variables are derived read-only values declared under
`resources.variables[*].computed`. They are exposed through the same
`variables.*` template namespace as stored variables, but are not persisted or
updated directly.

The locked authored interface is documented in
[ComputedVariables.md](./ComputedVariables.md).

### Achievements

Achievements are stable, platform-agnostic definitions under
`resources.achievements`. Story and UI actions reference only the Route Engine
resource ID. Public selectors expose the authored definitions, and ordered
effects let external consumers integrate them without putting platform details
in Route Engine.

The resource, selector, action, and effect primitives are documented in
[Achievements.md](./Achievements.md).

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
Text transparency should be authored on the text style resource with `colorAlpha`,
`strokeAlpha`, and `shadow.alpha`, not baked into the shared color resource itself. Whole-node
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
      shadow:
        colorId: colorPrimary
        alpha: 0.75
        blur: 6
        offsetX: 2
        offsetY: 3
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
          alpha: 0.85
          colorId: panelBg
          hover:
            colorId: panelBgHover
            opacity: 0.9
```

#### Background Backing Color

Background actions can set a persistent solid backing color with `colorId`.
The color resolves through `resources.colors` and renders behind the background
image, video, spritesheet, or layout. If no background `colorId` has been set,
the backing color uses `screen.backgroundColor`, which defaults to black.

```yaml
screen:
  width: 1920
  height: 1080
  backgroundColor: "#000000"
resources:
  colors:
    nightBackdrop:
      hex: "#05070D"
story:
  scenes:
    scene1:
      sections:
        intro:
          lines:
            - id: line1
              actions:
                background:
                  colorId: nightBackdrop
                  resourceId: forest
```

#### Spritesheet Backgrounds

A background `resourceId` can reference `resources.spritesheets`. Use
`animationName` to select a named animation; when it is omitted, the first
defined animation is used. `animationSpeed` and `loop` override the defaults on
that animation.

```yaml
background:
  resourceId: animatedSky
  animationName: storm
  animationSpeed: 0.4
  loop: true
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
//   audio: [{ id: 'channel:bgm', type: 'audio-channel', children: [...] }]
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

Background changes are split into independent persistent layers. `resource`
tracks `resourceId` and its related fields, while `color` tracks `colorId`.
Background animation selections are playback instructions and are not included
in this diff.

Dialogue UI changes are reported as `dialogue`. Speaker sprite changes are
reported separately as `dialogueSprite`, with `add`, `update`, or `delete` as
the change type.

```js
const sectionLineChanges = engine.selectSectionLineChanges({
  sectionId: "section1",
  includePresentationState: true,
});
// {
//   lines: [
//     {
//       id: "line-1",
//       changes: {
//         background: {
//           resource: { changeType: "add", data: { resourceId: "bg_school" } },
//           color: { changeType: "add", data: { colorId: "night" } },
//         },
//       },
//       presentationState: { ... }
//     }
//   ]
// }
```

## Available Actions

### Action Batch Execution Order

`handleActions` and every nested action batch use the following canonical
schedule. YAML/JavaScript object property order has no effect. Phases and the
actions inside each phase run from top to bottom.

1. Cleanup
   1. `cleanAll`
2. State
   1. `updateVariable`
   2. `updateFormField`
   3. `updateLocalizationPackage`
   4. integer `random`
3. Decision
   1. `submitForm`
   2. `cancelForm`
   3. weighted `random`
   4. `conditional`
4. Presentation
   1. `screen`
   2. `background`
   3. `dialogue`
   4. `character`
   5. `visual`
   6. `choice`
   7. `form`
   8. `sfx`
   9. `bgm`
   10. `voice`
   11. `control`
   12. `layout`
5. Runtime
   1. `setNextLineConfig`
   2. `startAutoMode`
   3. `stopAutoMode`
   4. `toggleAutoMode`
   5. `startSkipMode`
   6. `stopSkipMode`
   7. `toggleSkipMode`
   8. `showDialogueUI`
   9. `hideDialogueUI`
   10. `toggleDialogueUI`
   11. `setDialogueTextSpeed`
   12. `setAutoForwardDelay`
   13. `setAutoForwardSpeed`
   14. `setSkipUnseenText`
   15. `setSkipTransitionsAndAnimations`
   16. `setSoundVolume`
   17. `setMusicVolume`
   18. `setMuteAll`
   19. `setSaveLoadPagination`
   20. `incrementSaveLoadPagination`
   21. `decrementSaveLoadPagination`
   22. `setMenuPage`
   23. `setMenuEntryPoint`
   24. `showConfirmDialog`
   25. `hideConfirmDialog`
   26. `pushOverlay`
   27. `popOverlay`
   28. `replaceLastOverlay`
   29. `clearOverlays`
   30. `completeAchievement`
   31. `setAchievementProgress`
   32. `showImageGalleryVariant`
   33. `moveToPreviousImageGalleryVariant`
   34. `moveToNextImageGalleryVariant`
   35. `clearImageGallerySelection`
   36. `moveToImageGalleryPage`
   37. `moveToNextImageGalleryPage`
   38. `moveToPreviousImageGalleryPage`
   39. `playMusicRoomTrack`
   40. `playMusicRoom`
   41. `pauseMusicRoom`
   42. `stopMusicRoom`
   43. `seekMusicRoom`
   44. `playPreviousMusicRoomTrack`
   45. `playNextMusicRoomTrack`
   46. `clearMusicRoomSelection`
   47. `moveToMusicRoomPage`
   48. `moveToNextMusicRoomPage`
   49. `moveToPreviousMusicRoomPage`
   50. `finishSceneReplay`
   51. `moveToSceneReplayPage`
   52. `moveToNextSceneReplayPage`
   53. `moveToPreviousSceneReplayPage`
6. Persistence
   1. `saveSlot`
7. Navigation
   1. `loadSlot`
   2. `rollbackByOffset`
   3. `rollbackToLine`
   4. `resetStoryAtSection`
   5. `sectionTransition`
   6. `jumpToLine`
   7. `startSceneReplay`
   8. `exitSceneReplay`
   9. `nextLine`

Engine-only and test store actions have fixed positions in the same schedule:

- Cleanup, before `cleanAll`: `clearPendingEffects`.
- State, before `updateVariable`: `addViewedLine`, `addViewedResource`.
- State, after `updateFormField`: `updateProjectData`.
- State, after `updateLocalizationPackage`: `markLineCompleted`.
- Runtime, after `moveToPreviousSceneReplayPage`: `musicRoomSoundReady`,
  `musicRoomSoundProgress`, `musicRoomSoundComplete`, `musicRoomSoundError`,
  `appendPendingEffect`, `beginRollbackActionBatch`,
  `endRollbackActionBatch`, `ensureRandomReplayOccurrence`,
  `recordRandomOutcome`, `markRollbackCheckpointTransient`,
  `markSavedRollbackCheckpointTransient`, `recordCurrentDialogueHistory`.
- Navigation, after `nextLine`: `nextLineFromSystem`.

Templates are resolved immediately before their scheduled action, so later
phases observe state produced by earlier phases. An integer `random` therefore
always writes its declared variable before `conditional`, even if
`conditional` appears first in YAML. Weighted `random` is a decision because it
executes a selected nested action batch.

Nested batches use the same schedule. A navigation selected inside a nested
batch is deferred until the outermost batch reaches its Navigation phase. This
lets outer Runtime and Persistence actions settle before navigation executes;
the navigation is then terminal.

A batch containing multiple direct navigation actions is rejected before any
action runs. If separately nested actions select more than one reachable route,
the whole transaction is rejected before any route executes. Conditional and
weighted branches remain the supported way to author mutually exclusive
navigation.

Unknown host-only batch actions are ordered by code-unit name after Runtime and
before Persistence. Authored project schemas reject unknown actions. Direct
`handleAction` dispatch remains immediate and does not use the batch schedule.

### Navigation Actions

| Action              | Payload                  | Description                                                 |
| ------------------- | ------------------------ | ----------------------------------------------------------- |
| `nextLine`          | -                        | Advance to the next line (respects `nextLineConfig.manual`) |
| `rollbackByOffset`  | `{ offset? }`            | Roll back by eligible landing points (`-1` means Back)      |
| `rollbackToLine`    | `{ sectionId, lineId }`  | Roll back to a specific line in the rollback timeline       |
| `jumpToLine`        | `{ sectionId?, lineId }` | Jump to specific line                                       |
| `sectionTransition` | `{ sectionId, screen? }` | Transition to a different section                           |

`sectionTransition.screen` uses the same shape as line-level `screen`:

```yaml
sectionTransition:
  sectionId: chapter2
  screen:
    animations:
      resourceId: screenCrossFade
```

This transition is scoped to the edge between sections. If both
`sectionTransition.screen` and the destination line's `screen.animations` are
defined, the `sectionTransition.screen` animation wins for the first destination
render only.

Rollback design treats a source line that invokes `sectionTransition` during
line-entry processing as transient. Player-facing Back must skip that source
and restore the preceding settled line in one action. A transition triggered
later from an already-presented interaction does not disqualify that source
line. This target-selection behavior is specified in [Rollback.md](./Rollback.md)
and is applied by `rollbackByOffset` and its availability selectors.

### Conditional Actions

Use `conditional` to evaluate ordered branches and execute the first matching
branch. `when` uses Jempl semantic JSON condition syntax. String expression
conditions are not supported. A branch without `when` is treated as `else` and
should be last.

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
```

The conditional runs the first matching branch, or its default branch when one
is authored. If nothing matches and there is no default, it runs no branch
actions. In every case, the engine automatically continues once after the
entire action batch finishes. Invoking `sectionTransition` or
`resetStoryAtSection` suppresses that continuation. Any other action that
changes the current pointer, such as `jumpToLine` or an advancing `nextLine`,
also suppresses it so the batch cannot skip a second line. Nested conditionals
coalesce into the same single batch continuation. This is an immediate
control-flow advance: hidden dialogue does not consume it and remains hidden.
When skip mode cannot pass unseen content, the engine enters that destination
and stops skip there. Active choice and form authorization still applies.

Condition comparisons are strict and never coerce operands. `eq` and `neq`
compare both type and value, so `1` and `"1"` are different. Objects and arrays
compare by identity rather than deep contents. `gt`, `gte`, `lt`, and `lte`
compare only two finite numbers or two strings; mixed types and all other
operand combinations evaluate to `false`. A missing path is distinct from an
explicit `null` value; there is currently no dedicated `exists` operator. These
rules apply to conditional-action semantic JSON, not Jempl string expressions
inside layout templates.

A line-authored conditional that automatically continues during line entry is
a transient rollback source. Player-facing Back must skip it rather than
rendering or pausing on an empty conditional line. Conditionals triggered later
from an already-presented interaction leave that source eligible for Back. See
[Rollback.md](./Rollback.md); player-facing rollback skips the transient source
in the same action.

### Random Actions

Use `random` to generate a uniformly distributed integer directly into a
declared writable context number variable:

```yaml
actions:
  random:
    distribution:
      type: integer
      min: 1
      max: 100
    variableId: randomNumber
  conditional:
    branches:
      - when:
          gte:
            - var: variables.randomNumber
            - 75
        actions:
          jumpToLine:
            lineId: lockOpened
      - actions:
          jumpToLine:
            lineId: lockFailed
```

Both bounds are inclusive. Every integer from `min` through `max` has equal
probability. Integer `random` is in the State phase and `conditional` is in the
Decision phase, so the generated number is stored first regardless of their
YAML property order.

Distribution configuration is fixed authored data: numeric fields accept only
literal numbers and do not resolve variables or action templates.

Weighted selection is branch-only: each outcome contains its own action batch,
with no authored value or result variable:

```yaml
actions:
  random:
    distribution:
      type: weighted
      outcomes:
        - weight: 70
          actions:
            jumpToLine:
              lineId: commonReward
        - weight: 30
          actions:
            jumpToLine:
              lineId: rareReward
```

Like `conditional`, `random` automatically continues once unless the outer
batch or selected weighted actions navigate. Line-authored outcomes are
recorded with rollback history so save/load and rollback replay the stored
integer or weighted branch without rerolling. Chance routing uses two weighted
outcomes. The full contract and authoring-tool interface are in
[RandomAction.md](./RandomAction.md).

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

- Global `autoMode` waits for the current line to complete before starting a
  length-aware delay. The delay combines `runtime.autoForwardDelay` with
  grapheme-based reading time adjusted by `runtime.autoForwardSpeed`. The result
  is capped at 20 seconds unless the configured base delay itself is higher; in
  that case, the higher base delay is preserved as the effective delay.
- That completion is driven by Route Graphics `renderComplete`, so revealing text and other tracked render work finish first.
- Global `skipMode` does not use that completion gate; it advances on its own fast timer.
- `nextLineConfig.auto` is separate and may use `trigger: "fromStart"` or `trigger: "fromComplete"` depending on authored behavior.

#### Playback scheduling and ownership

The built-in effects handler reconciles auto, skip, and authored auto timing as
one authoritative schedule. It owns at most one physical ticker callback per
engine even when multiple logical deadlines are active. If two deadlines
become due on the same tick, the engine performs one progression attempt; it
does not skip a second line.

Logical deadlines retain their exact remaining duration while their descriptor
is unchanged. This includes an authored `fromStart` deadline when a manual
click only completes the current reveal. Auto and authored deadlines restart
for a new line occurrence or changed delay; authored timing also restarts when
its trigger changes, while auto restarts for an accepted mode restart or
changed resolved text. Skip timing belongs to the active skip session and
therefore continues across ordinary line changes until it becomes due or skip
mode restarts. Duration accumulation uses exact binary64 arithmetic, so
repeated fractional deltas and very large finite delays do not drift at the due
boundary.

Timer ownership is private runtime metadata. It is absent from
`selectSystemState()`, save slots, persistence payloads, and render state.
Loading, reinitializing, or entering a fresh occurrence derives a new schedule
from the settled semantic state; partial elapsed time is never serialized.
Rollback deliberately suppresses a restored line's authored auto deadline
until that line occurrence or its authored auto configuration changes.

The engine reconciles only after an outer action batch and all of its effects
settle. Effect or reconciliation failures send an `unsettled` schedule and
remove active timing fail-closed. A failed progression that did not commit is
not retried repeatedly with the same ownership descriptor. A committed
destination may schedule again after a later successful reconciliation.

Custom effect handlers remain compatible in two modes:

- A handler without `reconcilePlaybackScheduleV1` receives the existing six
  timer start/clear effects unchanged.
- A handler that defines `reconcilePlaybackScheduleV1` must also define
  synchronous `reset` and `dispose` methods. The engine then withholds the six
  legacy timer effects and calls the reconciler with a complete cloned
  schedule. Capabilities are captured when the engine is created, and the
  reconciler must complete synchronously without mutating, initializing, or
  disposing the engine reentrantly.

The V1 reconciler receives one of these shapes:

```js
{
  contractVersion: 1,
  status: "settled",
  lineEntryId: 42,
  timers: {
    auto: {
      owner: { sessionId: 3, lineEntryId: 42 },
      delayMs: 1800,
      contentKey: "Resolved dialogue text",
    },
    skip: null,
    authored: {
      owner: { lineEntryId: 42 },
      delayMs: 1000,
      trigger: "fromStart",
    },
  },
}

// Fail-closed invalidation
{
  contractVersion: 1,
  status: "unsettled",
  lineEntryId: 42,
  timers: null,
}
```

All fields and ownership IDs are authoritative and opaque to the host. A
reconciler should preserve elapsed time only when a logical descriptor is
field-for-field equivalent to the currently installed descriptor.

### Runtime and Localization Actions

| Action                            | Payload      | Description                                                 |
| --------------------------------- | ------------ | ----------------------------------------------------------- |
| `setDialogueTextSpeed`            | `{ value }`  | Set dialogue reveal speed                                   |
| `setAutoForwardDelay`             | `{ value }`  | Set non-negative base auto delay in milliseconds            |
| `setAutoForwardSpeed`             | `{ value }`  | Set length-aware auto speed from 0 to 100                   |
| `setSkipUnseenText`               | `{ value }`  | Set whether skip mode may pass unseen dialogue              |
| `setSkipTransitionsAndAnimations` | `{ value }`  | Set whether authored transitions and animations are skipped |
| `setSoundVolume`                  | `{ value }`  | Set Voice/SFX volume from 0 to 100                          |
| `setMusicVolume`                  | `{ value }`  | Set BGM/music-room volume from 0 to 100                     |
| `setMuteAll`                      | `{ value }`  | Set global audio mute                                       |
| `updateLocalizationPackage`       | `{ l10nId }` | Select an imported package, or `null` for canonical content |
| `setSaveLoadPagination`           | `{ value }`  | Set the active context's one-based save/load page           |
| `incrementSaveLoadPagination`     | `{}`         | Increment the active save/load page                         |
| `decrementSaveLoadPagination`     | `{}`         | Decrement the active save/load page, clamped to page 1      |
| `setMenuPage`                     | `{ value }`  | Set the active context's menu page string                   |
| `setMenuEntryPoint`               | `{ value }`  | Set the active context's menu entry-point string            |

The first nine actions update device-persisted runtime preferences. Save/load and
menu navigation values are context-local and included in save slots. Rollback
reconstructs these context runtime values by replaying their authored and
interaction-originated setters up to the selected checkpoint. L10n selection
behavior is documented in [L10n.md](./L10n.md).

### UI Actions

| Action               | Payload                                          | Description                                     |
| -------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `showDialogueUI`     | `{}`                                             | Show the dialogue UI                            |
| `hideDialogueUI`     | `{}`                                             | Hide the dialogue UI                            |
| `toggleDialogueUI`   | `{}`                                             | Toggle dialogue UI visibility                   |
| `pushOverlay`        | `{ resourceId }`                                 | Push a layout onto the authored overlay stack   |
| `popOverlay`         | `{}`                                             | Remove the last overlay                         |
| `replaceLastOverlay` | `{ resourceId }`                                 | Replace the last overlay                        |
| `clearOverlays`      | `{}`                                             | Clear overlays, confirm dialog, and form drafts |
| `showConfirmDialog`  | `{ resourceId, confirmActions, cancelActions? }` | Show a transient layout-backed confirm dialog   |
| `hideConfirmDialog`  | `{}`                                             | Hide the current confirm dialog                 |

Confirm-dialog normalization, deferred actions, lifecycle, and rendering are
documented in [ConfirmDialog.md](./ConfirmDialog.md).

### Form Actions

| Action            | Payload                      | Description                                    |
| ----------------- | ---------------------------- | ---------------------------------------------- |
| `updateFormField` | `{ formKey, field, value? }` | Update a transient draft field                 |
| `submitForm`      | `{ formKey, actions? }`      | Validate and commit the active form, then act  |
| `cancelForm`      | `{ formKey, actions? }`      | Clear the active form draft and run follow-ups |

### State Management Actions

| Action                | Payload                  | Description                                 |
| --------------------- | ------------------------ | ------------------------------------------- |
| `setNextLineConfig`   | `{ manual?, auto? }`     | Configure line advancement                  |
| `updateProjectData`   | `{ projectData }`        | Replace project data                        |
| `resetStoryAtSection` | `{ sectionId, screen? }` | Reset story-local state and enter a section |

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

### Image Gallery Actions

| Action                              | Payload                   | Description                                        |
| ----------------------------------- | ------------------------- | -------------------------------------------------- |
| `showImageGalleryVariant`           | `{ groupId, variantId? }` | Select an unlocked variant and its containing page |
| `moveToPreviousImageGalleryVariant` | `{}`                      | Select the previous unlocked variant               |
| `moveToNextImageGalleryVariant`     | `{}`                      | Select the next unlocked variant                   |
| `clearImageGallerySelection`        | `{}`                      | Clear selection while retaining the current page   |
| `moveToImageGalleryPage`            | `{ pageIndex }`           | Move to a zero-based page and clear selection      |
| `moveToNextImageGalleryPage`        | `{}`                      | Move to the next page without wrapping             |
| `moveToPreviousImageGalleryPage`    | `{}`                      | Move to the previous page without wrapping         |

Gallery actions use the optional singleton `resources.imageGallery`. Locked
state comes from the existing viewed-resource registry. Well-formed actions are
no-ops when the gallery or requested target is unavailable; malformed payloads
throw. If an action target exactly matches a declared group or variant ID, the
ID is treated literally even when it resembles a template; targets without an
exact declared match continue through normal action-template resolution.

### Music Room Actions

| Action                        | Payload          | Description                                       |
| ----------------------------- | ---------------- | ------------------------------------------------- |
| `playMusicRoomTrack`          | `{ trackId }`    | Select and play/restart an unlocked track         |
| `playMusicRoom`               | `{}`             | Resume or start the selected track                |
| `pauseMusicRoom`              | `{}`             | Pause and preserve the renderer-owned cursor      |
| `stopMusicRoom`               | `{}`             | Stop at zero while retaining selection            |
| `seekMusicRoom`               | `{ positionMs }` | Seek to segment-relative milliseconds             |
| `playPreviousMusicRoomTrack`  | `{}`             | Play the previous unlocked track without wrapping |
| `playNextMusicRoomTrack`      | `{}`             | Play the next unlocked track without wrapping     |
| `clearMusicRoomSelection`     | `{}`             | Clear selection and restore story BGM             |
| `moveToMusicRoomPage`         | `{ pageIndex }`  | Browse a zero-based page                          |
| `moveToNextMusicRoomPage`     | `{}`             | Browse the next page without wrapping             |
| `moveToPreviousMusicRoomPage` | `{}`             | Browse the previous page without wrapping         |

The optional singleton `resources.musicRoom` has one transient player and no
layout association. Layouts consume the computed `musicRoom` template root and
dispatch these actions. Locks reuse `addViewedResource` with each track's
`soundId`. Full catalog, projection, playback, validation, and audio-focus
semantics are documented in [MusicBox.md](./MusicBox.md).

### Scene Replay Actions

| Action                          | Payload         | Description                                 |
| ------------------------------- | --------------- | ------------------------------------------- |
| `startSceneReplay`              | `{ sceneId }`   | Start an unlocked scene in a fresh context  |
| `finishSceneReplay`             | `{}`            | Unlock normally, or finish an active replay |
| `exitSceneReplay`               | `{}`            | Exit immediately and restore the caller     |
| `moveToSceneReplayPage`         | `{ pageIndex }` | Browse a zero-based replay page             |
| `moveToNextSceneReplayPage`     | `{}`            | Browse the next page without wrapping       |
| `moveToPreviousSceneReplayPage` | `{}`            | Browse the previous page without wrapping   |

The optional singleton `resources.sceneReplay` has no layout association.
Layouts consume the computed `sceneReplay` template root, including each
entry's `locked` flag. Normal-story finish markers persist scene unlocks at
account scope. Replays use a fresh context, suppress persistent progress, and
restore the caller when they end.
See [ReplayScene.md](./ReplayScene.md) for the full contract.

### Achievement Actions

| Action                   | Payload                   | Description                                       |
| ------------------------ | ------------------------- | ------------------------------------------------- |
| `completeAchievement`    | `{ resourceId }`          | Declare a boolean or number achievement complete  |
| `setAchievementProgress` | `{ resourceId, current }` | Report absolute progress for a number achievement |

Achievement actions enqueue external effects and do not store player
achievement state. See [Achievements.md](./Achievements.md) for resource,
validation, progress, and host-integration semantics.

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
| `nextLineFromSystem`  | internal options       | Internal engine-driven advance      |
| `appendPendingEffect` | `{ name, ...options }` | Queue a side effect                 |
| `clearPendingEffects` | -                      | Clear the effect queue              |

Use these only if you are extending engine internals or writing engine-level tests.

## Available Selectors

The system store exposes these selectors (called internally):

| Selector                        | Parameters              | Returns                                                |
| ------------------------------- | ----------------------- | ------------------------------------------------------ |
| `selectPendingEffects`          | -                       | Array of pending effects                               |
| `selectCurrentPointer`          | -                       | `{ currentPointerMode: "read", pointer }`              |
| `selectCurrentLine`             | -                       | Current line object                                    |
| `selectSection`                 | `{ sectionId }`         | Section object                                         |
| `selectAutoMode`                | -                       | Boolean                                                |
| `selectSkipMode`                | -                       | Boolean                                                |
| `selectDialogueUIHidden`        | -                       | Boolean                                                |
| `selectIsLineAccountViewed`     | `{ sectionId, lineId }` | Account-level viewed boolean                           |
| `selectIsResourceAccountViewed` | `{ resourceId }`        | Account-level viewed boolean                           |
| `selectNextLineConfig`          | -                       | Config object                                          |
| `selectLineIdByOffset`          | `{ offset? }`           | Relative line; negative offsets skip transient entries |
| `selectCanRollback`             | -                       | Whether an earlier landing point exists                |
| `selectAchievements`            | -                       | Cloned achievement resource map                        |
| `selectAchievement`             | `{ resourceId }`        | Cloned achievement resource or `undefined`             |
| `selectImageGallery`            | -                       | Computed singleton image-gallery projection or `null`  |
| `selectMusicRoom`               | -                       | Computed singleton music-room projection or `null`     |
| `selectSceneReplay`             | -                       | Computed singleton scene-replay projection or `null`   |
| `selectIsSceneReplayActive`     | -                       | Whether the current context is a replay                |
| `selectRuntime`                 | -                       | Cloned authored `runtime.*` projection                 |
| `selectSaveSlotMap`             | -                       | Save slots object map                                  |
| `selectSaveSlot`                | `{ slotId }`            | Save slot data                                         |
| `selectSaveSlotPage`            | `{ slotsPerPage? }`     | Paged save slot list for UI                            |

## Pending Effects

Effects queued by actions for external handling:

| Effect                   | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `render`                 | Re-render the current state                      |
| `handleLineActions`      | Process current line's actions                   |
| `applyScopedDataUpdates` | Persist ordered scoped data operations           |
| `completeAchievement`    | Notify the host of achievement completion        |
| `setAchievementProgress` | Notify the host of absolute achievement progress |

`applyScopedDataUpdates` is a public runtime-facing persistence contract. Its full interface and semantics are documented in [ScopedDataUpdates.md](./ScopedDataUpdates.md).

Built-in effect handling notes:

- `createEffectsHandler(...)` coalesces only the latest occurrence of replaceable built-in effects such as `render`, `handleLineActions`, full-snapshot persistence effects, and legacy timer start/clear effects before translating them.
- With the built-in V1 playback capability, the engine filters legacy timer
  effects and supplies a complete authoritative schedule instead. Custom
  handlers that do not opt into V1 continue to receive the legacy effects.
- `applyScopedDataUpdates` is incremental and ordered, so it must not be last-write coalesced by effect name.
- Achievement effects are external, ordered, and never coalesced by effect name.
- Unknown effect names are not silently dropped; `createEffectsHandler(...)` throws unless you provide `handleUnhandledEffect`.
- The coalescing rule is specific to the built-in effect handler, not the store queue itself.

## Line Actions (Presentation)

Actions that can be attached to lines to control presentation:

| Action       | Properties                                                                                                                                                                   | Description                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `screen`     | `{ alpha?, opacity?, blur?, animations? }`                                                                                                                                   | Set whole-screen appearance or transition. `alpha`/`blur` apply to the composed story frame                                     |
| `background` | `{ resourceId?, colorId?, transformId?, x?, y?, anchorX?, anchorY?, scaleX?, scaleY?, flipX?, flipY?, rotation?, originX?, originY?, alpha?, opacity?, blur?, animations? }` | Set background/CG. Transform fields are renderer pixels/unitless multipliers/degrees; `blur: null` clears background blur       |
| `dialogue`   | `{ characterId?, character?, character.sprite?, persistCharacter?, persistSprite?, content, append?, mode?, ui?, clear? }`                                                   | Display dialogue                                                                                                                |
| `character`  | `{ items }`                                                                                                                                                                  | Display character sprites. Each item can set transform overrides, `alpha`, and `blur`                                           |
| `visual`     | `{ items }`                                                                                                                                                                  | Display resource-backed or inline-layout visual elements. Each item can set `layer`, transform, `alpha`, `blur`, and animations |
| `bgm`        | `{ sounds, loop?, volume?, muted?, pan? }`                                                                                                                                   | Control the persistent, multi-sound BGM channel                                                                                 |
| `sfx`        | `{ channels: [{ id, sounds, applyMode?, loop?, volume?, muted?, pan? }] }`                                                                                                   | Play any number of single-line or persistent SFX channels, each with its own sounds                                             |
| `voice`      | `{ sounds, loop?, volume?, muted?, pan? }`                                                                                                                                   | Control the line-scoped, multi-sound Voice channel; resources resolve from the current scene                                    |
| `animation`  | `{ ... }`                                                                                                                                                                    | Apply animations                                                                                                                |
| `layout`     | `{ resourceId }`                                                                                                                                                             | Display layout                                                                                                                  |
| `control`    | `{ resourceId }`                                                                                                                                                             | Activate control bindings and control UI                                                                                        |
| `choice`     | `{ resourceId, items }`                                                                                                                                                      | Display choice menu                                                                                                             |
| `form`       | `{ resourceId, fields, submitActions?, cancelActions? }`                                                                                                                     | Display a blocking multi-input form                                                                                             |
| `cleanAll`   | `true`                                                                                                                                                                       | Clear all presentation state                                                                                                    |

Animation selections use `animations.resourceId` plus optional
`animations.playback`. `playback.speed` is a unitless multiplier: `1` is normal,
`2` is twice as fast, and `0.5` is half speed. `playback.continuity` defaults to
render-scoped behavior when omitted.

### Visual Layers

Visual items use a flat `items` array. Each item can set numeric `layer` to
choose one of the predefined story render layers. Items in the same layer
preserve their array order.

```yaml
visual:
  items:
    - id: fog
      resourceId: fog
      transformId: fullscreen
      layer: 30
```

If `layer` is omitted, the item defaults to `50`, matching the previous visual
behavior.

| Layer value | Constant name              | Position                 |
| ----------- | -------------------------- | ------------------------ |
| `10`        | `VISUAL_BEHIND_BACKGROUND` | Before background        |
| `20`        | `BACKGROUND`               | Engine background layer  |
| `30`        | `VISUAL_BEHIND_CHARACTER`  | Before characters        |
| `40`        | `CHARACTER`                | Engine character layer   |
| `50`        | `VISUAL_BEHIND_DIALOGUE`   | Before dialogue          |
| `60`        | `DIALOGUE`                 | Engine dialogue/UI layer |
| `70`        | `VISUAL_BEHIND_CHOICE`     | Before choice            |
| `80`        | `CHOICE`                   | Engine choice UI layer   |
| `90`        | `VISUAL_FOREGROUND`        | Above choice/UI/layouts  |

Visual items can use `10`, `30`, `50`, `70`, or `90`. Layer `90` is still below
screen transitions, overlay stack entries, and confirm dialogs. JavaScript
callers can use the exported `RENDER_LAYER`, `VISUAL_LAYER`, and
`DEFAULT_VISUAL_LAYER` constants when generating project data.

### Inline Visual Layouts

Visual items can contain a layout directly instead of referencing an image,
video, spritesheet, particle, or shared layout resource. Inline layouts use the
same RouteGraphics element format and the same template and resource-reference
resolution as `resources.layouts`.

A new visual item chooses one render subject:

- `resourceId` for an existing image, video, spritesheet, particle, or layout
  resource
- `layout` for layout elements authored directly on the visual item
- `text` for the legacy direct-text form

These fields are mutually exclusive. Prefer `layout` for new inline content;
it covers text while also allowing containers, rectangles, sprites, input
handlers, and future layout element types.

#### Plain text

A plain text visual is a one-element inline layout:

```yaml
visual:
  items:
    - id: chapterTitle
      layout:
        elements:
          - id: chapter-title-text
            type: text
            content: "Chapter 1"
            textStyleId: title
            width: 720
      transformId: titleTop
      layer: 70
      alpha: 0.9
      animations:
        resourceId: titleFadeIn
```

#### Mixed visual content

One visual can group multiple layout elements under a stable visual container:

```yaml
visual:
  items:
    - id: locationCard
      layout:
        elements:
          - id: card-background
            type: rect
            width: 640
            height: 180
            colorId: cardBackground
          - id: location-icon
            type: sprite
            imageId: mapPin
            x: 70
            y: 90
            anchorX: 0.5
            anchorY: 0.5
          - id: location-name
            type: text
            content: "Old Town"
            textStyleId: locationTitle
            x: 380
            y: 90
            anchorX: 0.5
            anchorY: 0.5
      transformId: locationCardPosition
      layer: 70
```

`imageId`, `textStyleId`, and `colorId` are resolved from the normal project
resource collections. Raw renderer fields such as sprite `src`, text
`textStyle`, and rectangle `fill` should not be authored directly.

#### Templates and input

Inline visual layouts receive the same template data as shared visual layouts.
They can also contain normal layout input handlers:

```yaml
visual:
  items:
    - id: scoreCard
      layout:
        elements:
          - id: score-label
            type: text
            content: "SCORE ${variables.score}"
            textStyleId: score
          - id: increment-button
            type: rect
            y: 80
            width: 240
            height: 72
            colorId: button
            click:
              payload:
                actions:
                  updateVariable:
                    id: incrementScore
                    operations:
                      - variableId: score
                        op: increment
                        value: 1
      transformId: scoreCardPosition
```

#### Shared and inline transforms

A visual can use a shared transform resource:

```yaml
- id: chapterTitle
  layout:
    elements:
      - id: title
        type: text
        content: "Chapter 1"
        textStyleId: title
  transformId: titleTop
```

Or it can own an inline transform without creating a transform resource:

```yaml
- id: chapterTitle
  layout:
    elements:
      - id: title
        type: text
        content: "Chapter 1"
        textStyleId: title
  transform:
    x: 960
    y: 180
    anchorX: 0.5
    anchorY: 0.5
    scaleX: 1
    scaleY: 1
    flipX: true
    flipY: false
    rotation: 0
```

`transformId` and `transform` are mutually exclusive. Existing top-level
transform fields remain supported as overrides for compatibility.

#### Updating an inline layout

Later lines can replace the inline layout by visual `id` while retaining its
transform, layer, alpha, and blur. Inline transform patches merge by field:

```yaml
visual:
  items:
    - id: chapterTitle
      layout:
        elements:
          - id: title
            type: text
            content: "Chapter 2"
            textStyleId: title
      transform:
        y: 220
```

Appearance-only and animation-only updates do not need to repeat the layout:

```yaml
visual:
  items:
    - id: chapterTitle
      alpha: 0.5
      animations:
        resourceId: titleFadeOut
```

#### Legacy direct text

The existing `text` form remains supported for compatibility. New projects
should prefer an inline layout so the visual can grow beyond one text element.
For a new legacy text visual, both `text.content` and `text.textStyleId` are
required; later patches can supply either field alone.

```yaml
visual:
  items:
    - id: chapterTitle
      text:
        content: "Chapter 1"
        textStyleId: title
      transformId: titleTop
```

### Particle Visuals

Particle effects are authored under `resources.particles` and selected from a
normal visual item with `resourceId`. A particle resource owns its simulation
area and Route Graphics particle configuration; the visual item owns placement,
layer, alpha, blur, and animations.

Structured particle modules are the preferred format:

```yaml
resources:
  particles:
    fireflies:
      width: 640
      height: 360
      seed: 42
      modules:
        emission:
          mode: burst
          burstCount: 20
          particleLifetime: 30
          source:
            kind: rect
            data:
              x: 0
              y: 0
              width: 640
              height: 360
        appearance:
          texture:
            shape: circle
            radius: 5
            color: "#FFFFFF"
visual:
  items:
    - id: fireflies
      resourceId: fireflies
      transformId: particleArea
      layer: 50
      alpha: 0.8
```

Particle textures can reference project images. Use an image resource ID as a
texture string, or use `imageId` on an item in a structured texture selection;
the engine resolves it to the image resource's `fileId`. Generated `circle`,
`ellipse`, and `rect` texture shapes pass through unchanged. Legacy Route
Graphics particle resources with `texture`, `behaviors`, and `emitter` are also
supported.

### Item Transform Overrides

`resources.transforms` can define `x`, `y`, `anchorX`, `anchorY`, `scaleX`,
`scaleY`, `flipX`, `flipY`, `rotation`, `originX`, and `originY`. `x` and `y` use renderer pixels,
anchors are normalized unitless values, scale fields are multipliers, and
`rotation` is degrees. Character and visual items can override any of those
transform fields for a single item. `originX` and `originY` are passed through
to the renderer as the transform origin fields. New character sprite items still
require `transformId`; after an item exists, a later line can provide only `id`
and transform fields to patch that item without restating its sprites or visual
resource.

Background actions can also set `x`, `y`, `anchorX`, `anchorY`, `scaleX`,
`scaleY`, `flipX`, `flipY`, `rotation`, `originX`, and `originY` at the top level. These fields
can override selected values from `transformId`, or position the background
without any `transformId`. Image, video, and spritesheet backgrounds default to
centered placement, computed as `x = screen.width / 2` and
`y = screen.height / 2`, with `anchorX: 0.5`, `anchorY: 0.5`, `rotation: 0`,
`scaleX: 1`, and `scaleY: 1`. Layout backgrounds use top-left defaults when a
background transform is authored.

When `flipX` or `flipY` is `true`, the corresponding resolved scale is
multiplied by `-1`. An omitted scale defaults to `1` for the flip, so
`flipX: true` resolves to `scaleX: -1`. Item-level flip values override shared
transform values; explicitly setting a flip to `false` disables an inherited
flip. A negative authored scale combined with a flip becomes positive.

Background transforms support three authoring modes:

| Mode                              | Behavior                                                               |
| --------------------------------- | ---------------------------------------------------------------------- |
| `transformId` only                | Use the complete transform resource                                    |
| `transformId` plus inline fields  | Start from the transform resource, then override the provided fields   |
| inline fields without transformId | Apply the provided fields over the background type's default transform |

```yaml
background:
  resourceId: bg_school
  transformId: fullscreen

background:
  resourceId: bg_school
  transformId: fullscreen
  scaleX: 1.1
  scaleY: 1.1

background:
  resourceId: bg_school
  x: 960
  y: 540
  anchorX: 0.5
  anchorY: 0.5
  rotation: 0
  scaleX: 1
  scaleY: 1
  originX: 960
  originY: 540
```

```yaml
character:
  items:
    - id: lead
      transformId: characterCenter
      x: 920
      y: 980
      anchorX: 0.5
      anchorY: 1
      scaleX: 0.8
      scaleY: 0.9
      rotation: 12
      originX: 64
      originY: 128
      sprites:
        - id: body
          resourceId: leadBody

visual:
  items:
    - id: fog
      resourceId: fog
      transformId: fullscreen
      layer: 30
      anchorX: 0
      anchorY: 0
      scaleX: 1.2
      scaleY: 1.3
      rotation: -8
      originX: 20
      originY: 40
```

### Item Appearance

Character and visual items can set static `alpha` and `blur`. `alpha` accepts
values from `0` to `1` and is the preferred field for new projects. `blur` uses
the same shape as `background.blur` and `screen.blur`; `blur: null` clears the
item blur.

For backward compatibility, the engine also accepts the legacy `opacity` alias
wherever top-level appearance `alpha` is accepted: screen and background
actions, character and visual items, and layout elements. When both fields are
present, `alpha` wins. New projects should use `alpha`; `opacity` remains only
so existing projects continue to load. This alias does not apply to visual
fields nested inside `hover`, `click`, or `rightClick` interaction metadata.

Character item appearance applies to the whole character container, so every
sprite part is faded or blurred together. Visual item appearance applies to the
single visual item container, sprite, video, animated sprite, layout, or text
element.

```yaml
character:
  items:
    - id: lead
      transformId: characterCenter
      alpha: 0.72
      blur:
        x: 6
        y: 9
        quality: 3
        kernelSize: 9
        repeatEdgePixels: true
      sprites:
        - id: body
          resourceId: leadBody
        - id: face
          resourceId: leadSmile

visual:
  items:
    - id: fog
      resourceId: fog
      transformId: fullscreen
      layer: 30
      alpha: 0.45
      blur:
        x: 6
        y: 9
        quality: 3
        kernelSize: 9
        repeatEdgePixels: true

    - id: vignette
      resourceId: vignette
      transformId: fullscreen
      layer: 90
      alpha: 0.8
```

### Forms

Forms are blocking presentation actions for Route Graphics `input` elements.
Edits stay in transient form drafts until the user submits a valid form. On a
valid submit, the engine commits every field to its configured variable, then
runs the authored `submitActions`.

The layout should bind buttons to prepared form action batches, matching the
confirm-dialog style:

```yaml
click:
  payload:
    actions: ${form.submitActions}
```

Inputs opt into a field by name:

```yaml
- id: name-input
  type: input
  field: name
```

Story action:

```yaml
form:
  resourceId: profileForm
  fields:
    name:
      variableId: playerName
      required: true
      trim: true
      placeholder: Name
    code:
      variableId: playerCode
      required: true
  submitActions:
    nextLine: {}
  cancelActions:
    rollbackByOffset: {}
```

### Dialogue Speaker Fields

Use `dialogue.character.name` for new authored content. `dialogue.characterName` is still accepted, but only as a compatibility alias for older content and tools, so it is intentionally omitted from the public action summary above.

Character resources can bind their default display name to a string variable:

```yaml
resources:
  variables:
    playerName:
      type: string
      scope: context
      default: Guest
  characters:
    protagonist:
      name: Protagonist
      nameVariableId: playerName
```

When a dialogue line uses `characterId: protagonist`, `${dialogue.character.name}`
resolves to the current `variables.playerName` value. The resource `name`
remains the fallback/editor label.

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
- `resources.characters[*].nameVariableId` binds the resource display name to a string variable.
- `character.name` is only a display-name override.
- `character.sprite` is an optional layered speaker sprite group rendered with the dialogue action.
- `persistCharacter: true` means later dialogue lines that omit speaker fields
  reuse the previous `characterId` and `character.name` override.
- `persistSprite: true` keeps `character.sprite` when later dialogue lines omit
  a sprite, independently from speaker persistence and speaker changes.
- `persistSprite: false` clears the previous sprite on the next dialogue line
  that omits a sprite. For backward compatibility, `persistCharacter: true`
  continues to persist sprites when `persistSprite` has never been specified
  and later lines inherit the speaker. An explicit `characterId` keeps the
  legacy behavior of clearing that sprite unless `persistSprite: true` was
  established.
- If a later dialogue line explicitly provides `characterId` without `character.name` or `character.sprite`, the previous override is cleared and the displayed name falls back to the character resource name.
- If a later dialogue line omits `characterId` but provides `character.name` or
  `character.sprite` while `persistCharacter` is active, the provided fields
  update the persisted speaker and omitted fields keep their previous values.

### Dialogue Text Speed

`runtime.dialogueTextSpeed` is the persisted user preference. A dialogue action
can provide `textSpeed` to override that preference for the authored line only:

```yaml
dialogue:
  textSpeed: 12
  content:
    - text: "This line reveals slowly."
```

Dialogue layouts should bind the effective dialogue value to the Route Graphics
`text-revealing.speed` field:

```yaml
- id: dialogue-text
  type: text-revealing
  content: ${dialogue.content}
  speed: ${dialogue.textSpeed}
  revealEffect: typewriter
```

If the action omits `textSpeed`, `${dialogue.textSpeed}` resolves to
`${runtime.dialogueTextSpeed}`. The override does not mutate the runtime
preference and is cleared by the next dialogue action that omits it.

### Auto-Forward Speed

`runtime.autoForwardSpeed` is the persisted user preference for global auto
mode reading speed. It uses the same `0` to `100` settings range as the volume
controls and defaults to `50`. A value of `0` is half speed, `50` is normal,
and `100` is twice as fast. Update it with the same runtime-action pattern used
by dialogue speed and audio volume controls:

```yaml
setAutoForwardSpeed:
  value: 100
```

The speed setting is converted exponentially across the half-speed to
double-speed range and applies only to the length-derived reading time. The
persisted `runtime.autoForwardDelay` minimum is still added unchanged, subject
to the auto-mode delay cap.

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
  speed: ${dialogue.textSpeed}
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
  persistSprite: true
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
- `persistSprite` is independent from `persistCharacter`, so a persisted
  portrait can remain visible when a later line changes the speaker.
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

```yaml
# The portrait remains when a later line changes the speaker.
- dialogue:
    characterId: alice
    character:
      sprite:
        transformId: dialoguePortraitLeft
        items:
          - id: base
            resourceId: aliceBody
    persistSprite: true
    content:
      - text: Hello
- dialogue:
    characterId: bob
    content:
      - text: I am speaking while the previous portrait remains visible.
```

Set `persistSprite: false` on a later dialogue line without a sprite to remove
the previously persisted sprite on that line.

Template/runtime paths:

- Active dialogue layouts should use `${dialogue.character.name}`.
- Active dialogue layouts can inspect sprite metadata at paths such as `${dialogue.character.sprite.items[0].resourceId}`.
- NVL line-item layouts should prefer `${line.character.name}`. `${line.characterName}` remains available as a compatibility alias.
- NVL line-item layouts can inspect sprite metadata at `${line.character.sprite}`.
- Dialogue history layouts should prefer `${item.character.name}`. `${item.characterName}` remains available as a compatibility alias.
- Dialogue history layouts can inspect sprite metadata at `${item.character.sprite}`.

### Audio Channels

Engine audio is authored with `sounds` and rendered as Route Graphics
`audio-channel.children`.

- BGM owns one persistent channel and may contain many sounds.
- Voice owns one line-scoped channel and may contain many sounds.
- SFX may contain any number of single-line or persistent channels, each with
  many sounds.
- Channel and sound IDs are namespaced in render state so authored IDs remain
  stable and globally unique.
- Canonical sound IDs must be unique within their channel, and canonical SFX
  channel IDs must be unique within the SFX action.
- Audio transitions are not part of the Engine authoring interface yet.

```yaml
actions:
  bgm:
    volume: 80
    pan: -0.2
    loop: true
    sounds:
      - id: theme
        resourceId: music_1
        volume: 90
        muted: false
        pan: 0.1
        playbackRate: 1.1
        startAt: 5
        endAt: 30
      - id: ambience
        resourceId: forest_ambience
        volume: 40

  voice:
    sounds:
      - id: alice
        resourceId: alice_001
      - id: narrator
        resourceId: narrator_001
        startDelayMs: 250

  sfx:
    channels:
      - id: ui
        volume: 80
        sounds:
          - id: confirm
            resourceId: ui_confirm
      - id: environment
        pan: 0.5
        loop: true
        applyMode: persistent
        sounds:
          - id: rain
            resourceId: rain
```

Each canonical sound supports `loop`, `volume`, `muted`, `pan`,
`startDelayMs`, `playbackRate`, `startAt`, and `endAt`. `startDelayMs` is in
milliseconds; `startAt` and `endAt` are offsets in seconds for partial source
playback. An action sound overrides defaults from its sound or Voice resource,
and `endAt: null` explicitly clears a resource end offset. After those defaults
and overrides are resolved, a non-null `endAt` must be greater than or equal to
`startAt`. With canonical `bgm.sounds`, top-level `bgm.loop` repeats the complete
scheduled sound sequence after every sound finishes. Canonical Voice channels
use top-level `voice.loop` the same way, and each canonical SFX channel supports
`loop`. A looping channel cannot contain a sound whose own `loop` is `true`.
`startDelayMs` remains a sound-level setting. For legacy single-sound BGM and
Voice actions, top-level `loop` and `startDelayMs` continue to configure that
sound.

Omitting `bgm` preserves its current desired channel state. `bgm.sounds: []`
stops the BGM channel. Voice channels and SFX channels whose `applyMode` is
`singleLine` are cleared when the next line omits their action. `singleLine` is
the default SFX apply mode. A persistent SFX channel remains active across
following lines until an action replaces its ID, provides that ID with
`sounds: []`, provides `sfx.channels: []` to stop every SFX channel, or uses
`cleanAll`.

The previous single-sound forms remain compatibility shorthands:

```yaml
bgm: { resourceId: music_1, volume: 80 }
voice: { resourceId: alice_001, volume: 80 }
sfx:
  items:
    - { id: door, resourceId: door_close, volume: 60 }
```

They compile respectively to the BGM channel, Voice channel, and a default SFX
channel.

### Audio Volumes

Canonical channel audio uses three multiplicative layers:

- authored channel volume;
- runtime `musicVolume` for BGM or `soundVolume` for Voice/SFX;
- authored or resource-level sound volume.

The effective output is:

```js
(channelVolume * runtimeVolume * soundVolume) / 10000;
```

Each omitted authored volume defaults to `100`. Runtime volume preferences use
the project runtime default when configured, otherwise the engine default.
Persisted device preferences take precedence over both. `runtime.muteAll` emits
`muted: true` on every channel without destroying its configured volume. A
channel's authored `muted: true` is combined with the runtime mute.

Legacy single-sound BGM and Voice payloads preserve their previous effective
volume behavior when compiled into channels.

### Voice Resources

Voice assets are grouped by scene under `resources.voices`. Every item in
`voice.sounds` stores a scene-local `resourceId`; the engine resolves the scene
from the current section. The Voice channel uses `runtime.soundVolume` as its
runtime volume layer.

```yaml
resources:
  voices:
    scene_intro:
      alice_001:
        fileId: voices/scene_intro/alice_001.ogg
        volume: 90
        pan: -0.1
        playbackRate: 1
        startAt: 0
        endAt: null

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
                  volume: 80
                  sounds:
                    - id: alice
                      resourceId: alice_001
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
- `imageGallery` (the computed singleton projection, or `null` when absent)
- `musicRoom` (the computed singleton projection, or `null` when absent)
- `sceneReplay` (the computed singleton projection, or `null` when absent)
- `runtime`
- `saveSlots`
- `characters`
- `isChoiceVisible`
- `isFormVisible`
- `canRollback`

Roots with special presence semantics:

- `dialogue` and `dialogueLines` are added only when active dialogue template
  data exists
- `choice` is added by the choice-layout render path when a choice is active
- `form` is added by the form-layout render path when a form is active
- `historyDialogue` is always present in the shared template data and defaults
  to `[]`. It contains chronological dialogue from the active context across
  section boundaries and follows save/load, rollback, branching, and story-reset
  semantics.
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
  textSpeed: 12
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
      textSpeed: 12
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
