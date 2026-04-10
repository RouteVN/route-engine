# Story Session Reset Proposal

This document proposes a new public system action for resetting story-local
session state without changing the current read pointer directly.

Status: implemented

## Goal

Support flows like:

- title -> start game
- in-game -> exit to title

where the engine should:

- reset context-scoped variables to project defaults
- clear rollback/session-local history
- clear seen/viewed state
- clear transient runtime UI/playback state
- preserve `device` and `account` variables

without introducing dedicated `startGame` / `exitGame` engine actions.

## Proposed Public Action

```yaml
resetStorySession: {}
```

### Proposed Schema Shape

```yaml
resetStorySession:
  type: object
  description: Reset story-local session state around the current read pointer
  properties: {}
  additionalProperties: false
```

## Core Semantics

`resetStorySession` resets story-local runtime state while preserving the
current context read pointer.

It does not choose a destination section itself.

That means:

- `pointers.read.sectionId` is preserved
- `pointers.read.lineId` is preserved
- `sectionTransition` remains the action used for navigation

## State Changes

When `resetStorySession` runs, the engine should:

### Preserve

- current context read pointer
- `global.variables` for `device` and `account`
- `projectData`
- `global.saveSlots`

### Reset

- current context variables:
  - replace with project-defined defaults for variables with `scope: context`
- current context pointer mode:
  - set `currentPointerMode` to `read`
- current context history pointer:
  - set `pointers.history` to an empty pointer
- current context rollback state:
  - replace with a minimal rollback timeline anchored at the preserved read
    pointer
- global viewed state:
  - clear `viewedRegistry.sections`
  - clear `viewedRegistry.resources`
- transient runtime globals:
  - `autoMode = false`
  - `skipMode = false`
  - `dialogueUIHidden = false`
  - `confirmDialog = null`
  - `layeredViews = []`
  - `nextLineConfig = DEFAULT_NEXT_LINE_CONFIG`
  - `isLineCompleted = true`

### Effects

The action should append reset effects without replacing already queued effects.

It should enqueue:

- `clearAutoNextTimer`
- `clearSkipNextTimer`
- `clearNextLineConfigTimer`
- `render`

It must not replace `pendingEffects`, because the action may be used inside a
larger authored batch.

## Non-Goals

`resetStorySession` should not:

- change the read pointer directly
- pick a title section or gameplay start section
- mutate persistent global variables
- remove save slots
- replay line actions automatically
- load a slot

## Composition With `sectionTransition`

This action is intended to compose with `sectionTransition`.

### Recommended Batch Order

If the caller wants to move to a new section and start a fresh story session at
that destination, author the batch in this order:

```yaml
resetStorySession: {}
sectionTransition:
  sectionId: gameStart
```

Why this order:

- `resetStorySession` clears story-local state before the destination line runs
- `sectionTransition` then moves to the destination pointer
- inside the same action batch, the engine treats the transition as the new
  rollback anchor
- the destination line's actions run against fresh session state

This avoids both:

- carrying the old title/gameplay pointer as the new rollback anchor
- running destination line actions before the reset occurs

### Example: Start Game From Title

```yaml
resetStorySession: {}
sectionTransition:
  sectionId: gameStart
```

Final intended result:

- pointer lands at `gameStart`
- context variables are reset to defaults
- viewed state is empty
- rollback starts at `gameStart`
- persistent globals are unchanged

### Example: Exit To Title

```yaml
resetStorySession: {}
sectionTransition:
  sectionId: title
```

Final intended result:

- pointer lands at `title`
- context variables are reset to defaults
- viewed state is empty
- rollback starts at `title`
- persistent globals are unchanged

## Rollback Behavior

`resetStorySession` is a session boundary action.

It should not be recorded as a normal rollbackable story mutation. Instead, it
replaces the active rollback state with a new minimal timeline:

```js
{
  currentIndex: 0,
  isRestoring: false,
  replayStartIndex: 0,
  timeline: [
    {
      sectionId: currentReadPointer.sectionId,
      lineId: currentReadPointer.lineId,
      rollbackPolicy: "free",
    },
  ],
}
```

## Rationale

Why not `startGame` / `exitGame`:

- they encode product flows, not engine primitives
- they would overlap with `sectionTransition`
- they do not generalize beyond title/gameplay

Why not only `resetContextVariables`:

- the requirement is broader than variables
- rollback, viewed state, and transient runtime state also need reset

Why not overload `sectionTransition`:

- `sectionTransition` is navigation within the current session
- session reset has different semantics and different failure/debug surface

## Proposed RouteEngine Interface

```js
engine.handleAction("resetStorySession");
```

Inside authored action batches:

```yaml
actions:
  sectionTransition:
    sectionId: title
  resetStorySession: {}
```

## Test Cases To Add On Implementation

- resets context-scoped variables to project defaults
- preserves current read pointer
- clears history pointer and forces `currentPointerMode = "read"`
- resets rollback to a single checkpoint anchored at the current read pointer
- clears `viewedRegistry.sections`
- clears `viewedRegistry.resources`
- preserves `device` and `account` variables
- clears transient globals and queues timer-clear effects
- appends effects instead of replacing the pending queue
- when ordered after `sectionTransition` in the same batch, anchors rollback at
  the destination pointer

## Open Questions

Current proposal:

- `isLineCompleted` resets to `true` to avoid resuming stale reveal/timer state
- the action does not automatically invoke `handleLineActions`

That keeps the action side-effect-safe when used before navigation inside a
single authored batch.
