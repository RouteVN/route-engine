# Save/Load Design

This document defines the intended product behavior, engine interfaces, and implementation boundaries for save/load in `route-engine`.

## Purpose

Save/load lets the player persist a playable story state into a slot and later restore that story state from the slot.

In `route-engine`, save/load is separate from:

- rollback
- dialogue history
- persistent global variables
- renderer/transient runtime state

Save/load should restore the story to a coherent playable point, not resume every temporary UI or timer detail from the moment the save was made.

Overwrite confirmation for occupied save slots is a related but separate
transient UI concern. The planned confirm-dialog design is documented in
[ConfirmDialog.md](./ConfirmDialog.md).

## Product Summary

The product model for save/load is:

- save slots store story-local runtime state
- save slots restore a coherent playable reading position
- rollback timeline is part of saved story state and must survive save/load
- viewed/seen registry is saved and restored
- persistent global variables are not part of slot state
- transient runtime globals are not part of slot state
- loading a slot must reinitialize transient runtime globals instead of inheriting stale values from the pre-load session
- loading a missing or malformed slot must fail safely
- persistence to browser storage is a side effect handled outside the store

## Terminology

### Save Slot

A save slot is a named/indexed container with:

- slot metadata for UI
- saved story state for restoration

### Saved Story State

Saved story state is the subset of runtime state needed to resume the story coherently.

For the current model, that means:

- `contexts`
- `viewedRegistry`

Rollback data lives inside context state and is therefore part of saved story state.

### Persistent Global Variables

Persistent global variables are variables with scope:

- `global-device`
- `global-account`

These are not story-local and should not be stored inside save slot state.

They persist through their own storage path.

### Transient Runtime State

Transient runtime state is temporary engine/UI state that should be recreated or reset on load rather than serialized into a slot.

Examples:

- `autoMode`
- `skipMode`
- `dialogueUIHidden`
- `nextLineConfig`
- `layeredViews`
- `isLineCompleted`
- `pendingEffects`
- live timer callbacks and in-flight timing state

## User-Facing Requirements

### Saving

When the player saves:

- the current story position is captured
- the current story-local variables are captured
- the current rollback timeline/cursor is captured
- the viewed registry is captured
- the slot thumbnail/preview metadata is stored
- the slot becomes available immediately in save/load UI

If the player attempts to save into an occupied slot:

- the UI should ask for confirmation before overwriting
- confirming should execute the deferred save
- cancelling should leave existing slot data unchanged

### Loading

When the player loads:

- the engine returns to the saved story position
- saved story-local variables are restored
- saved rollback ability is restored
- seen/viewed registry is restored from the slot
- transient runtime state is reinitialized to clean defaults
- the result is a coherent playable state, not a hybrid of pre-load and post-load runtime state

## Product Decisions

### What save slots must include

Save slots must include:

- `formatVersion`
- current `contexts`
- `global.viewedRegistry`
- rollback timeline/cursor inside each saved context
- slot metadata:
  - `slotId`
  - `savedAt`
  - `image`

### What save slots must not include

Save slots must not include:

- `projectData`
- persistent/global variables
- current render/presentation snapshots
- transient runtime globals
- pending effects
- live timer state

Rationale:

- `projectData` is application input, not runtime save state
- persistent globals have their own lifetime and persistence rules
- transient runtime globals should not leak across load boundaries
- renderer state should be reconstructed from restored story state

### Load must reinitialize transient runtime globals

Loading a slot must explicitly reset transient globals to the same clean runtime baseline expected for a playable state.

That includes resetting:

- `autoMode`
- `skipMode`
- `dialogueUIHidden`
- `nextLineConfig`
- `layeredViews`
- `isLineCompleted`

It also includes clearing runtime timers/effects that belong to the prior live session.

This is a product decision, not an implementation detail.

### Persistent globals stay outside save slots

`global-device` and `global-account` variables are intentionally not saved into slots.

Load should not roll them back or replace them from slot data.

Rationale:

- they are not local branch state
- they are meant to persist across saves, playthroughs, and sessions

### Rollback must survive save/load

Rollback is part of the player's current story state.

Therefore:

- save must serialize rollback timeline/cursor inside context state
- load must restore that rollback data
- older saves without rollback data may be normalized into a minimal rollback timeline anchored at the loaded pointer

See [Rollback.md](./Rollback.md).

### Missing or malformed saves must fail safely

If a requested slot is missing:

- load should leave state unchanged

If slot data is malformed:

- load must not partially corrupt the engine state
- load should either:
  - leave state unchanged, or
  - normalize the data into a minimal valid playable state

Partial application into an invalid runtime shape is not acceptable.

## Interfaces

### Store Actions

Current store actions are:

- `saveSlot({ slotId, thumbnailImage?, savedAt? })`
- `loadSlot({ slotId })`

Notes:

- `thumbnailImage` is UI/host-provided preview data
- `slotId` is the public action field
- storage still uses a stringified object key internally, but that is not part of the authored API
- saved slot entries now carry an explicit `formatVersion`

### Store Selectors

Current save/load-related selectors are:

- `selectSaveSlotMap()`
- `selectSaveSlot({ slotId })`
- `selectSaveSlotPage({ slotsPerPage? })`

`selectSaveSlotPage` is a UI helper for paginated save/load screens. It flattens the current page into slot UI items based on the `loadPage` variable.

### Effects

The save/load path crosses the store boundary through effects:

- `saveSlots`
- `saveGlobalDeviceVariables`
- `saveGlobalAccountVariables`

Current behavior:

- `saveSlot` mutates `state.global.saveSlots`
- then it emits a `saveSlots` effect
- the effect handler persists the full slot map to `localStorage`

Load is different:

- `loadSlot` only restores in-memory engine state from `state.global.saveSlots`
- it does not read `localStorage` itself

### Dynamic Slot Selection

The engine contract is based on action payload `slotId`.

The store stringifies that internally for map lookup, but authored/integration payloads should target `slotId`.

Current supported patterns:

```yaml
# Static slot binding
click:
  payload:
    actions:
      saveSlot:
        slotId: 1
```

```yaml
# Template-time slot binding from saveSlots selector data
click:
  payload:
    actions:
      loadSlot:
        slotId: ${slot.slotId}
```

```yaml
# Event-time slot binding through Route Graphics event data
click:
  payload:
    _event:
      slotId: 3
    actions:
      saveSlot:
        slotId: "_event.slotId"
```

Important details:

- `_event` is the only supported event-context key at the engine/template layer
- `"_event.*"` bindings are resolved before jempl interpolation
- unresolved `"_event.*"` bindings fail fast
- the Route Graphics bridge also accepts `event` and normalizes it into `_event`

Current recommendation:

- if the slot identity is known when the element is rendered, bind it directly in the payload
- use `_event` only when the event source itself determines the slot dynamically
- keep example UI copy terse; prefer short labels such as `Save`, `Load`, `Page 1`, `Saved`, `Empty`, and `Image`

For save/load grids rendered from `saveSlots`, direct template binding is the clearer default:

- `slotId: ${slot.slotId}`

Open design note:

- whether save/load UI should standardize on direct/template slot binding or formalize `_event`-driven slot routing as a first-class pattern is still an explicit product decision to revisit

### Thumbnail Capture From Environment

The core engine does not capture screenshots itself.

`saveSlot` simply accepts `thumbnailImage` if the host/integration provides one and stores it as slot `image`.

Current VT/browser harness behavior:

1. intercept Route Graphics event payloads before action dispatch
2. detect `payload.actions.saveSlot`
3. call `routeGraphics.extractBase64("story")`
4. inject the result into `payload.actions.saveSlot.thumbnailImage`
5. also register the captured image as a Route Graphics asset under `saveThumbnailImage:${slotId}:${savedAt}`

The engine-facing contract is only step 4.

The asset registration step is harness-specific behavior and is not required by the core save/load store API unless a UI explicitly relies on that asset-id convention.

Current recommendation:

- keep thumbnail capture outside the store
- let the host/integration obtain the screenshot from the active renderer/environment
- pass the final image string into `saveSlot`

Important constraint:

- a single UI event may contain multiple authored actions
- in that case, the host should still dispatch one `handleActions(...)` call for the whole batch
- do not split save into a separate `handleAction("saveSlot", ...)` call just because it needs a screenshot

Rationale:

- authored action order should stay intact
- rollback action batching should stay intact
- save plus other authored actions should continue to behave as one logical interaction

Current simple shape:

```js
if (payload?.actions?.saveSlot) {
  const thumbnailImage = await routeGraphics.extractBase64("story");
  payload.actions.saveSlot.thumbnailImage = thumbnailImage;
}
```

Preferred general integration shape:

```js
async function prepareActionsForDispatch(actions, routeGraphics) {
  if (!actions?.saveSlot) {
    return actions;
  }

  const nextActions = structuredClone(actions);

  if (!nextActions.saveSlot.thumbnailImage) {
    nextActions.saveSlot.thumbnailImage =
      await routeGraphics.extractBase64("story");
  }

  return nextActions;
}

const nextActions = await prepareActionsForDispatch(
  payload.actions,
  routeGraphics,
);

engine.handleActions(
  nextActions,
  payload._event ? { _event: payload._event } : undefined,
);
```

Why this is preferred:

- no in-place mutation of the original event payload
- preserves one multi-action dispatch
- keeps screenshot capture in the host/integration layer
- avoids changing authored action semantics

Dedicated helpers such as `saveToSlot(slot)` are still viable for UIs where a click means only one save action, but they should not replace the batched `handleActions` path for generic event payloads that may include multiple actions.

### Host App Responsibilities

The host app is responsible for:

- hydrating `initialState.global.saveSlots` from durable storage before engine init
- hydrating persistent global variables before engine init
- providing thumbnail image payloads when a save action wants one
- mapping dynamic UI/event data into the action `slotId` field when save/load is triggered from generated UI
- executing storage effects emitted by the engine

The system store itself does not own browser storage reads.

## Data Contract

The effective slot structure is:

```yaml
formatVersion: 1
slotId: 1
savedAt: 1700000000000
image: data:image/webp;base64,...
state:
  viewedRegistry:
    sections:
      - ...
    resources:
      - ...
  contexts:
    - currentPointerMode: read
      pointers:
        read:
          sectionId: section1
          lineId: "3"
        history: "..."
      configuration: "..."
      views:
        - ...
      bgm: "..."
      variables: "..."
      rollback:
        currentIndex: 2
        isRestoring: false
        replayStartIndex: 0
        timeline:
          - ...
```

Important constraints:

- `formatVersion` is required on every loadable save slot
- `state.contexts` is authoritative for story restoration
- `state.viewedRegistry` is authoritative for seen-state restoration
- runtime-only globals are not part of this slot payload

## How It Works Today

### Initialization

At initialization:

- `createInitialState` receives `payload.global.saveSlots`
- `createInitialState` also receives preloaded persistent global variables
- those become part of initial in-memory system state

This means startup hydration is split:

- slot map comes from the host app into store initialization
- persistent globals come from the host app into store initialization

### Save Flow

Current save flow:

1. clone current `contexts`
2. strip obsolete rollback-only compatibility fields from cloned contexts
3. clone `global.viewedRegistry`
4. write `{ slotId, savedAt, image, state }` into `state.global.saveSlots`
5. append `saveSlots` effect
6. append `render` effect

The store writes to the in-memory slot map first.

Persistence to `localStorage` happens later through the effect handler.

### Load Flow

Current load flow:

1. look up `state.global.saveSlots[String(slotId)]`
2. if missing, leave state unchanged
3. validate and normalize `slotData.state`
4. normalize `viewedRegistry`
5. validate each loaded read pointer against current `projectData`
6. normalize loaded contexts and rollback state
7. reset transient runtime globals to a clean playable baseline
8. queue timer-clear effects and append `render`

## Relationship to Rollback

Rollback state is part of context state and therefore part of slot state.

Required behavior:

- saving must preserve rollback timeline/cursor
- loading must preserve rollback ability from the loaded point
- old saves without rollback state may be upgraded to a minimal rollback state
- rollback restore start state is recomputed from project defaults, not from saved baseline snapshots

## Validation and Compatibility Rules

### Validation

The save/load path should validate enough to guarantee a coherent playable state.

At minimum:

- `slotId` should be numeric in authored save/load actions
- `state.contexts` should be an array with at least one valid context
- each loaded context should have a valid read pointer
- `viewedRegistry` should be normalized to a safe shape

### Compatibility

Older save formats may exist.

Compatibility rules should be explicit:

- new saves should always write an explicit `formatVersion`
- missing or invalid `formatVersion` values should fail fast before mutation
- older saves without rollback state may be normalized
- obsolete rollback-only compatibility fields should be ignored/stripped
- unsupported future `formatVersion` values should fail fast before mutation
- malformed save data should throw before any live-state mutation is committed

If compatibility is intentionally broken in the future, that should be documented clearly.

## Required Specs

The save/load test surface should cover:

- save writes slot metadata and state into `saveSlots`
- save emits `saveSlots` effect
- save overwrites an existing slot deterministically
- save preserves rollback timeline/cursor
- save/load works against live Immer drafts
- load from existing slot restores contexts and viewed registry
- load from missing slot leaves state unchanged
- load restores rollback timeline/cursor from slot data
- load initializes a minimal rollback timeline for older saves without rollback data
- load reinitializes transient runtime globals to defaults
- load clears prior auto/skip/next-line timers
- load does not replace persistent global variables from slot data
- load rejects or safely normalizes malformed slot payloads

## Non-Goals

This document does not define:

- cloud sync
- multi-device account sync
- save slot thumbnails generation strategy
- save slot UI layout design
- exact storage backend beyond current local effect semantics
