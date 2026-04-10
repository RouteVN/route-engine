# Rollback Implementation Plan

This document translates [Rollback.md](/home/han4wluc/repositories/RouteVN/route-engine/docs/Rollback.md) into an implementation plan for `route-engine`.

It is intentionally technical.

## Goal

Replace the current mixed "history mode + section replay" rollback behavior with a true rollback system that:

- uses line-level checkpoints
- supports cross-section rollback
- recomputes rollbackable story state from full rollback history
- reconstructs presentation after restoration
- remains extensible for future rollback policies

## Scope

In scope:

- rollback model and engine actions
- checkpoint storage
- pointer restoration
- branch truncation after rollback
- stopping auto/skip on rollback
- tests and docs

Out of scope:

- dialogue history UI
- fixed rollback
- blocked rollback
- roll-forward
- save UI changes

## Current State

The current engine has two different backward-navigation concepts:

1. `prevLine`
- moves a `history` pointer
- behaves like preview/history navigation
- does not represent the intended final `Back` semantics

2. `rollbackToLine` / `rollbackByOffset`
- resets context variables to a section `initialState`
- replays recorded `updateVariable` actions
- is limited by the current section-oriented history structure

The implementation currently depends on:

- `contexts[*].historySequence`
- `pointers.read`
- `pointers.history`
- `currentPointerMode`
- event-sourced replay of context variable mutations inside a section

This is not the right long-term model for:

- cross-section rollback
- line-level checkpoints across the full playthrough
- future rollback policy expansion

## Target Model

Each context should own one ordered rollback timeline.

Conceptually:

```js
contexts: [
  {
    pointers: {
      read: { sectionId, lineId },
    },
    rollback: {
      currentIndex: 12,
      isRestoring: false,
      timeline: [
        {
          sectionId: "intro",
          lineId: "line1",
          rollbackPolicy: "free",
        },
      ],
    },
  },
];
```

### Required properties

Each checkpoint should eventually be able to hold:

- `sectionId`
- `lineId`
- `rollbackPolicy`

For initial implementation:

- the array index is the sequence identity
- `rollbackPolicy` can default to `"free"`

No separate `sequenceId` is required as long as:

- timeline order is preserved
- `currentIndex` is the rollback cursor

## High-Level Approach

Use the visited-line timeline as the source of truth for rollbackable story state.

Specifically:

- store visited lines in playthrough order
- do not snapshot presentation
- do not treat variable snapshots as the source of truth
- on rollback:
  - reset context variables to the default values of context-scoped variables derived from project data
  - replay rollbackable story actions from the start of the timeline up to the target index
  - move `read` pointer to the target checkpoint
  - reconstruct presentation/render state from restored story state

For now, the only required rollbackable story mutation type is:

- `updateVariable`

Implementation default for v1:

- replay source is the project-data line actions for each visited checkpoint
- replay only the rollbackable subset of those actions
- do not duplicate mutation payloads into checkpoint entries yet

Checkpoint semantics must be defined as:

- checkpoint N represents state after rollbackable story actions for line N have been applied

So rollback replay to target index is inclusive.

This can be expanded later if more rollbackable action types are introduced.

## Restore Guard

Rollback restoration requires an explicit temporary guard:

```js
rollback.isRestoring = true;
```

This is an internal implementation flag, not a user-facing mode.

Its purpose is to prevent the restore process from being mistaken for normal forward progression.

During restore:

- do not append new rollback checkpoints
- do not execute normal live mutation side effects
- do not double-apply `updateVariable`
- do not perform fresh progression bookkeeping

Without this guard, rollback reconstruction can:

- execute story mutations more than once
- append duplicate timeline entries
- corrupt recomputed state

Implementation rule:

- rollback restore must use a dedicated restore path
- it must not rely on normal live line-action execution

## Data Structure Migration

### Phase 1: Introduce rollback timeline alongside current structures

Add a new context-local structure:

```js
rollback: {
  currentIndex: 0,
  isRestoring: false,
  timeline: [],
}
```

Target model rule:

- rollback state should not store a duplicate `baselineVariables` snapshot
- restore start state should be derived on demand from project-defined defaults for context-scoped variables

Checkpoint shape:

```js
{
  sectionId,
  lineId,
  rollbackPolicy: "free",
}
```

Implementation notes:

- checkpoint creation should happen through one internal helper, not inline in many actions
- `rollbackPolicy` should be present or defaultable from one helper
- `currentIndex` should be the array-index cursor into `timeline`

Current pointer rule:

- `rollback.currentIndex` is the single source of truth for rollback position inside the timeline
- array order is the sequence identity

### Phase 2: Keep old history structures temporarily

Do not remove these immediately:

- `historySequence`
- `pointers.history`
- `currentPointerMode`
- `prevLine`

Reason:

- they may still be needed by existing tests or non-rollback flows
- history/log is a separate feature and may still temporarily depend on some of them

But rollback actions should stop depending on them as the new timeline becomes authoritative.

Recommended deprecation stance:

- `prevLine` and history pointers may remain temporarily for non-rollback features
- they should no longer be considered part of gameplay back semantics

### Phase 3: Decommission old rollback dependencies

Once rollback actions and tests are migrated:

- remove rollback dependence on `historySequence`
- remove rollback dependence on `pointers.history`
- stop using section-oriented replay for rollback

Possible later cleanup:

- fully remove `currentPointerMode === "history"` if it is no longer used by any feature

That decision should be made separately from rollback.

## Checkpoint Creation Rules

Checkpoints are line-level.

A checkpoint should exist for each line the player reaches in read flow.

### Required checkpoint creation points

1. Engine init
- create initial checkpoint for the initial line

2. `nextLine`
- after advancing to the new line

3. `nextLineFromSystem`
- after advancing to the new line

4. `sectionTransition`
- after landing on the destination section's first line

5. `jumpToLine`
- excluded from rollback timeline for now

Rationale:

- `jumpToLine` can be used for tooling, debugging, or non-player transport
- automatically recording it as player rollback history would pollute the timeline

### Rule for timing

Checkpoint should represent the line the player is now on, not the line they left.

That keeps rollback semantics intuitive:

- back from line 10 goes to line 9
- current line is always represented in the timeline

### Deduplication rule

Do not create duplicate adjacent checkpoints for the same:

- `sectionId`
- `lineId`

unless future policy metadata requires it.

Use one helper like:

```js
appendRollbackCheckpoint(state, {
  sectionId,
  lineId,
  rollbackPolicy: "free",
});
```

The helper should also:

- truncate future timeline if `currentIndex` is not already at the end
- append the new checkpoint
- move `currentIndex` to the new last index

## Replay Rules

Rollback reconstruction should replay only rollbackable story actions.

It must not replay arbitrary line actions as if they were live gameplay.

### Initial rollbackable action set

Start with:

- `updateVariable`

Future rule:

- any new story-mutating action must explicitly declare whether it is rollbackable before it participates in rollback replay

### Non-replayed actions during restore

Do not replay as story mutations during restore:

- dialogue presentation actions
- background/character/visual/layout presentation actions
- seen-state updates
- persistent/global variable writes
- save-related effects
- any other forward-progression bookkeeping

This is why rollback restore must not call the normal live line-action path.

Presentation should still appear correctly because it is derived from the restored story state and current pointer.

## Rollback Action Design

### Replace `prevLine` as gameplay back

`Back` in gameplay should no longer use `prevLine`.

Instead:

- UI-facing back action should call `rollbackByOffset({ offset: -1 })`

`prevLine` may remain temporarily for history/log work, but it should not be the primary gameplay back implementation.

### `rollbackByOffset`

Target behavior:

1. validate offset is negative
2. find target checkpoint from `rollback.currentIndex + offset`
3. if out of bounds, no-op
4. delegate to one internal restore helper

### `restoreRollbackCheckpoint`

Introduce an internal restore helper:

```js
restoreRollbackCheckpoint(state, checkpointIndex)
```

Responsibilities:

1. stop auto mode
2. stop skip mode
3. set `rollback.isRestoring = true`
4. set `rollback.currentIndex`
5. reset context variables to the default values of context-scoped variables derived from project data
6. replay rollbackable actions from `timeline[0..checkpointIndex]`
7. restore `pointers.read`
8. set `rollback.isRestoring = false`
9. clear any stale timers via pending effects
10. set line completion state appropriately
11. queue normal render path

The target line must be rendered from reconstructed state, not by replaying normal live gameplay actions.

### Line completion on rollback

Policy from product spec:

- rollback should go immediately to previous checkpoint
- no "complete current line first" behavior

Recommended engine state after rollback:

- `isLineCompleted = true`

Reason:

- the rolled-back line should be visible immediately
- the engine should not require reveal completion before another rollback
- presentation is reconstructed, not resumed

If later you want rolled-back lines to reveal again, that should be an explicit separate product decision.

## Branch Truncation

When the user rolls back and then advances again:

- all checkpoints after `rollback.currentIndex` must be discarded before appending the new forward checkpoint

This should happen in the checkpoint append helper.

Pseudo-logic:

```js
if (rollback.currentIndex < rollback.timeline.length - 1) {
  rollback.timeline = rollback.timeline.slice(0, rollback.currentIndex + 1);
}
```

Then append the new checkpoint and move `currentIndex` to the end.

This is required for coherent free rollback.

This also means:

- after divergence, old future checkpoints are permanently discarded from the active rollback timeline

## Variable Scope Rules

Rollback restores:

- context-scoped variables only, derived by replay from the timeline

Rollback does not restore:

- device variables
- account variables
- seen registries

Implementation rule:

- rollback replay should only affect context-scoped rollbackable story actions
- do not mix global persistent variables into rollback reconstruction

Cross-branch consequence:

- previously seen content remains seen even after divergence
- this is intentional and should not be treated as a rollback bug

## Presentation and Rendering Flow

Rollback must keep the existing architectural principle:

- system state changes first
- presentation is derived
- render state is derived
- route-graphics renders the result

So rollback should not attempt to store or restore:

- presentation state
- render state
- animation progress

Instead:

1. reset story state to the default values of context-scoped variables derived from project data
2. replay rollbackable timeline entries up to target index
3. restore pointer to target line
4. queue normal render effects
5. let the engine derive presentation/render state fresh

Do not restore by executing arbitrary line actions as if the user had just progressed normally.

Restore should use:

- timeline replay for rollbackable story actions
- normal state-to-presentation derivation for rendering

## Action Changes

### `nextLine`

Update to:

- advance pointer
- reset line completion state as usual
- append checkpoint for destination line

### `nextLineFromSystem`

Update to:

- advance pointer
- append checkpoint for destination line

### `sectionTransition`

Update to:

- move pointer to target section first line
- append checkpoint for destination line

### `jumpToLine`

Do not append rollback checkpoints for `jumpToLine` in the initial implementation.

Treat it as out of the player rollback flow unless it is later reclassified as true gameplay navigation.

### `rollbackByOffset`

Rewrite to operate on the rollback timeline, not `historySequence`.

### `rollbackToLine`

Either:

- rewrite it as a lookup into the new timeline by line identity plus occurrence

or:

- deprecate it in favor of checkpoint-index-based restore helpers

Recommendation:

- keep public API if needed
- internally resolve to checkpoint index in the rollback timeline

## Save/Load

Rollback timeline should be saved and loaded as part of context state.

That is necessary for:

- consistent rollback after load
- preserving branch position correctly

Implementation requirement:

- the new `rollback` context structure must be serializable
- it must not contain renderer objects or non-serializable references
- loading a save must restore both:
  - `rollback.timeline`
  - `rollback.currentIndex`
- rollback save data should not store a duplicate `baselineVariables` snapshot
- restore start state should be recomputed from project data after load

Compatibility requirement:

- define explicit behavior for older saves that do not contain rollback state
- define whether older saves that still contain `baselineVariables` ignore that field or receive a one-time migration

Recommended default:

- initialize a minimal rollback timeline anchored at the loaded current pointer
- do not attempt to synthesize unsaved historical checkpoints

## Future Policy Expansion

Even though only `free` is implemented now, add a small abstraction boundary.

Recommended helper:

```js
const resolveRollbackPolicy = (checkpoint) =>
  checkpoint.rollbackPolicy ?? "free";
```

Later:

- `free`
- `fixed`
- `blocked`

can be handled in one place without redesigning checkpoint storage.

## Test Plan

### Unit/system tests

Add or migrate tests for:

1. initial checkpoint exists at engine start
2. manual line advance appends checkpoint
3. auto/skip/system advance appends checkpoint
4. section transition appends checkpoint
5. rollback by offset moves to previous line in same section
6. rollback by offset crosses section boundary
7. rollback recomputes context variables from timeline replay
8. rollback does not restore persistent globals
9. rollback does not restore seen registry
10. rollback stops auto mode
11. rollback stops skip mode
12. rollback on incomplete line goes immediately to previous checkpoint
13. re-advance after rollback truncates old future branch
14. duplicate adjacent checkpoints are not appended
15. `rollback.isRestoring` prevents duplicate checkpoint append
16. `rollback.isRestoring` prevents duplicate `updateVariable` execution
17. old-save compatibility initializes a minimal rollback timeline correctly
18. rollback restore start state is derived from project defaults, not serialized baseline snapshots

### Regression tests for divergence

This is important enough to test directly:

1. reach A -> B -> C
2. rollback to B
3. make a different choice / branch to D
4. assert old C checkpoint is gone
5. assert timeline is A -> B -> D

### Serialization tests

Add tests that:

1. save a state with rollback timeline
2. load it
3. rollback still works correctly afterward

## Migration Sequence

Recommended order:

1. add rollback timeline structure to context state
2. add `appendRollbackCheckpoint` helper
3. create checkpoints on init and forward navigation
4. add branch truncation logic
5. add `rollback.isRestoring` guard and restore helper
6. implement replay-based rollback reconstruction from timeline start
7. derive rollback restore start state from project-defined context defaults instead of stored baseline snapshots
8. switch `rollbackByOffset` to new timeline
9. switch UI-facing back flows to true rollback
10. stop rollback logic from depending on `historySequence`
11. update docs and tests
12. evaluate whether `prevLine` / `history` pointer can be simplified or removed later

## Risks

### 1. Double checkpoint creation

If both navigation action and line handling append checkpoints, timeline will drift.

Mitigation:

- centralize checkpoint appending in one helper
- write adjacency dedupe tests

### 2. Hidden dependence on `historySequence`

Some current selectors/tests may still depend on old structures.

Mitigation:

- migrate rollback tests first
- keep old structures temporarily for unrelated features

### 3. Save compatibility

Changing context shape may affect older saves.

Mitigation:

- decide whether to support a compatibility shim
- if not, document the save compatibility break clearly

### 4. Branch truncation bugs

If future checkpoints are not trimmed correctly, rollback semantics become incoherent.

Mitigation:

- add explicit branch-divergence tests

### 5. Incorrect replay classification

If non-rollbackable actions are replayed as story mutations, restore will corrupt state.

Mitigation:

- explicitly classify rollbackable actions
- start with `updateVariable` only
- add restore-guard regression tests

### 6. Unbounded timeline growth

Rollback history is intentionally unbounded for now.

Mitigation:

- accept this as a product tradeoff in v1
- keep checkpoint entries minimal
- defer compaction/pruning work until there is evidence it is needed

## Recommended First Implementation Slice

The smallest valuable vertical slice is:

1. add rollback timeline with array-index cursor
2. append checkpoints on init, `nextLine`, `nextLineFromSystem`, and `sectionTransition`
3. add `rollback.isRestoring`
4. implement replay-based `rollbackByOffset(-1)` on the new timeline
5. stop auto/skip on rollback
6. support cross-section rollback
7. add system tests for same-section and cross-section rollback

Do not start with:

- fixed rollback
- blocked rollback
- history UI
- roll-forward

Those should come later.
