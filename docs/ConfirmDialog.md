# Confirm Dialog

This document defines the implemented confirm-dialog contract for
`route-engine` and records the design rationale behind it.

## Purpose

The first supported use case is save-slot overwrite confirmation:

- saving into an empty slot should save immediately
- saving into an occupied slot should show a confirmation dialog
- confirming should execute the deferred save
- cancelling should dismiss the dialog without changing slot data

The runtime treats this as a dedicated confirm-dialog system,
not as a generic use of overlays.

## Product Goals

- confirm dialogs are transient runtime UI
- confirm dialogs are authored with a normal layout resource
- confirm dialogs can dispatch a deferred action batch on confirm or cancel
- confirm dialogs do not require stable magic element IDs
- confirm dialogs work with the current save screenshot injection path
- confirm dialogs must not leak into save/load persistence
- confirm dialogs are not part of rollback-restored story state

## Non-Goals

- a fully generic modal/dialogue framework
- a generic deferred-action queue for arbitrary features
- making overlays responsible for carrying deferred action payloads

## Why This Is A Special System

Overlays already exist, but they are a presentation overlay mechanism.
They currently store arbitrary payload objects in state, yet their template data
only receives generic UI/runtime fields such as `variables`, `saveSlots`, and
`historyDialogue`.

While it is technically possible to extend overlays with custom
`templateData`, that would make save overwrite confirmation depend on a more
generic and less explicit payload-passthrough mechanism. The chosen direction is
to keep confirm dialogs as a dedicated transient concept in system state.

## Chosen Direction

The engine stores dedicated transient `confirmDialog` state and exposes
explicit actions to show and hide it.

Normalized state shape:

```yaml
global:
  confirmDialog:
    resourceId: saveOverwriteConfirmLayout
    confirmActions:
      hideConfirmDialog: {}
      saveSlot:
        slotId: 3
    cancelActions:
      hideConfirmDialog: {}
```

Actions:

- `showConfirmDialog({ resourceId, confirmActions, cancelActions? })`
- `hideConfirmDialog()`

The dialog is rendered through a normal authored layout resource, but the
runtime behavior is specialized.

## Layout Contract

The confirm dialog uses a normal `resources.layouts[...]` entry.

The layout itself owns:

- panel structure
- copy
- colors
- button visuals

The layout does not need fixed IDs for runtime action injection.

Instead, button clicks bind directly to confirm-dialog actions through template
injection:

```yaml
click:
  payload:
    actions: ${confirmDialog.confirmActions}
```

and:

```yaml
click:
  payload:
    actions: ${confirmDialog.cancelActions}
```

This keeps authored layouts flexible and avoids making random/generated element
IDs part of the runtime API contract.

## Why Template Injection Is Preferred

The main alternative was ID-based action injection, where the engine would find
special elements such as `confirm-confirm-button` and mutate their click
payloads at render time.

That approach was rejected because:

- it would make specific element IDs part of the public layout contract
- IDs are often better treated as implementation details
- it couples runtime behavior to authored node naming

Template injection is preferred because:

- it keeps the layout declarative
- it does not require stable IDs
- it works with the current templating model
- it preserves authored freedom over structure and nesting

## Why Overlay Payload Injection Is Not Preferred

Another alternative was:

1. `pushOverlay(...)`
2. pass deferred actions through overlay payload/template data
3. have the confirm layout dispatch those actions

This works technically, but it has several downsides:

- it uses overlays as a deferred-action carrier rather than just an overlay
- it broadens the overlay contract for a very specific product need
- overlay actions are currently rollback-restorable, which is the wrong
  default lifecycle for a transient confirm prompt
- it mixes confirm-dialog behavior with a more generic presentation feature

For this reason, confirm dialogs use dedicated state and actions.

## Save Overwrite Flow

Save-screen behavior:

1. user clicks a slot card
2. if the slot is empty, dispatch `saveSlot(...)` immediately
3. if the slot already has save data, dispatch `showConfirmDialog(...)`
4. confirm dialog appears
5. if user confirms, the deferred save action executes
6. if user cancels, only the dialog closes

The save screen itself decides whether a slot is empty or occupied from save
slot selector data.

Example authored flow:

```yaml
click:
  payload:
    _event:
      slotId: ${slot.slotId}
    actions:
      $if slot.image:
        showConfirmDialog:
          resourceId: saveOverwriteConfirmLayout
          confirmActions:
            saveSlot:
              slotId: "_event.slotId"
      $else:
        saveSlot:
          slotId: "_event.slotId"
```

The exact conditional authoring can vary, but the product behavior should
follow the steps above.

## Action Normalization Rules

`showConfirmDialog` normalizes its payload before storing it in state.

Rules:

- `resourceId` is required
- `confirmActions` is required
- `cancelActions` defaults to:

```yaml
hideConfirmDialog: {}
```

- `hideConfirmDialog: {}` is automatically inserted into `confirmActions` if
  it is not already present
- `hideConfirmDialog: {}` is automatically inserted into `cancelActions` if
  it is not already present
- normalized action batches execute `hideConfirmDialog` before the remaining
  deferred actions

Rationale:

- authors should not need to remember cleanup on every confirm dialog
- the dialog closes on both confirm and cancel by default
- normalizing cleanup ahead of the deferred batch is safer than requiring every
  authored site to include and correctly order hide logic

## Why Auto-Hide Is Not Sufficient For Screenshot Capture

The save screenshot integration captures `saveSlot` before the action batch is
executed. That means `hideConfirmDialog` cannot be relied on to clean the frame
before screenshot capture.

The implemented rendering path therefore:

- renders the confirm dialog outside the `story` capture target, similar
  to how save/load overlays avoid contaminating the story preview
- keeps confirm clicks as a normal top-level `saveSlot` action batch
  so the host/integration can inject `thumbnailImage` and `savedAt`

This is a critical constraint for overwrite confirmation.

## Interaction With Event Templating

The `showConfirmDialog` action resolves its top-level fields, including
`resourceId`, when the dialog is opened. Its nested `confirmActions` and
`cancelActions` remain deferred and are stored without eager template
resolution.

When a confirm or cancel control later dispatches one of those batches, normal
action-template processing resolves it against the then-current runtime,
variables, and click event. The event that opened the dialog is not retained
implicitly; a deferred `_event.*` binding refers to the later confirm/cancel
interaction and requires that interaction to provide the value.

## Persistence Rules

`confirmDialog` is transient runtime state.

It must not be included in save slots.

It is also cleared on:

- engine init
- save-slot load
- project-data replacement
- rollback and story reset
- `clearOverlays`
- any other full runtime reset path

This matches the same reasoning already used for:

- `autoMode`
- `skipMode`
- `overlayStack`
- `nextLineConfig`

## Rollback Rules

Confirm dialogs are not branch-defining story state. Their actions are not
recorded as rollback-restorable UI state. If rollback occurs while a confirm
dialog is visible, the dialog is cleared and the story returns to the rollback
target.

## Rendering Rules

The confirm dialog renders above:

- base story render
- dialogue UI
- overlays

That makes it behave as a true modal prompt.

The renderer inserts a full-screen click blocker, so the dialog blocks
interaction with everything below it.

## Current Interface

The current payload is intentionally narrow:

```yaml
showConfirmDialog:
  resourceId: saveOverwriteConfirmLayout
  confirmActions:
    saveSlot:
      slotId: 3
```

`cancelActions` is optional because the runtime defaults it to
`hideConfirmDialog: {}`.

The interface does not require:

- `title`
- `message`
- `confirmLabel`
- `cancelLabel`
- `slotId` as separate metadata

That copy belongs in the authored layout unless a later requirement needs it to
be data-driven.

## Tradeoff Summary

### Dedicated Confirm Dialog State

Pros:

- explicit product concept
- clean transient lifecycle
- easy to exclude from save/load
- easier to exclude from rollback restoration
- keeps save overwrite semantics separate from overlays

Cons:

- requires new system state and actions
- adds a dedicated render step

### Overlay Payload Passthrough

Pros:

- reuses existing overlay system
- less new state machinery

Cons:

- wrong abstraction for this product need
- would expand the overlay contract
- would likely inherit incorrect rollback semantics
- harder to explain as a save/confirm-specific feature

### ID-Based Runtime Injection

Pros:

- straightforward runtime wiring

Cons:

- makes authored IDs special API
- bad fit when IDs are generated or unstable

### Template Action Injection

Pros:

- no stable IDs required
- keeps authored layout flexible
- works with current templating model

Cons:

- depends on object injection through templates
- slightly less explicit than fixed-ID runtime mutation

Chosen combination:

- dedicated confirm-dialog state/actions
- authored layout resource
- template-based action injection from `confirmDialog.confirmActions` and
  `confirmDialog.cancelActions`

## Future Considerations

- Do we want one reusable confirm layout by convention, or should each feature
  provide its own `resourceId`?
- Should later versions allow optional dynamic copy fields such as `title` or
  `message`, or keep all copy inside authored layouts?
