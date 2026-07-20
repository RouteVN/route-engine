# Rollback Implementation Plan

This document translates [Rollback.md](/home/han4wluc/repositories/RouteVN/route-engine/docs/Rollback.md) into an implementation plan for `route-engine`.

It is intentionally technical.

The landing-point eligibility slice described below is implemented. The
remaining future-policy and cleanup items continue to serve as a roadmap.

## Goal

Replace the current mixed "history mode + section replay" rollback behavior with a true rollback system that:

- uses line-level checkpoints
- distinguishes rollback landing points from transient control-flow entries
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

The previous engine mixed history-pointer navigation with rollback. That has
been removed from gameplay back behavior.

The current rollback entry points are:

1. `rollbackToLine` / `rollbackByOffset`

- resets context variables to a section `initialState`
- replays recorded `updateVariable` actions
- is limited by the current section-oriented history structure

The implementation currently depends on:

- `contexts[*].historySequence`
- `pointers.read`
- `pointers.history`
- `currentPointerMode`
- event-sourced replay of context variable mutations inside a section

Player-facing target selection resolves offsets over eligible landing points.
Internal timeline entries for lines that immediately route elsewhere remain
available for replay but are skipped as Back destinations.

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
          // Omitted means eligible; transient entries use false.
          returnable: false,
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
- whether the entry is a rollback landing point

For initial implementation:

- the array index is the sequence identity
- `rollbackPolicy` can default to `"free"`
- newly created entries are eligible by default; line-entry processing writes
  `returnable: false` as soon as an action actually routes away, before
  destination effects or later sibling actions can save state
- saved entries without eligibility metadata require an explicit migration or
  deterministic derivation; they must not all be treated as landing points

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
  returnable: false, // optional; omitted means eligible
}
```

Implementation notes:

- checkpoint creation should happen through one internal helper, not inline in many actions
- `rollbackPolicy` should be present or defaultable from one helper
- landing-point eligibility should be recorded or resolved through one helper
- `currentIndex` should be the array-index cursor into `timeline`

Current pointer rule:

- `rollback.currentIndex` is the single source of truth for rollback position inside the timeline
- array order is the sequence identity

### Phase 2: Keep old history structures temporarily

Do not remove these immediately:

- `historySequence`
- `pointers.history`
- `currentPointerMode`

Reason:

- they may still be needed by existing tests or non-rollback flows
- history/log is a separate feature and may still temporarily depend on some of them

But rollback actions should stop depending on them as the new timeline becomes authoritative.

Recommended deprecation stance:

- history pointers may remain temporarily for non-rollback features
- they should not be considered part of gameplay back semantics

### Phase 3: Decommission old rollback dependencies

Once rollback actions and tests are migrated:

- remove rollback dependence on `historySequence`
- remove rollback dependence on `pointers.history`
- stop using section-oriented replay for rollback

Possible later cleanup:

- fully remove `currentPointerMode === "history"` if it is no longer used by any feature

That decision should be made separately from rollback.

## Checkpoint Creation Rules

Checkpoints and internal timeline entries are line-level.

An entry should exist for each line the player reaches in read flow when that
entry is needed for replay. Not every entry is a rollback landing point.

### Landing-point eligibility

A line is returnable when its entry settles as a playable reading position. A
line is transient when line-entry processing routes away before the player can
read or interact with it.

Required transient cases are:

- a line-authored `conditional` that performs its automatic continuation
- a line-authored `sectionTransition` that successfully enters another section

Eligibility must be based on settled line-entry behavior. A conditional or
section transition triggered later by a click, choice, form, or other
interaction does not make the already-presented source line transient.

Transient entries may remain in `rollback.timeline` so state replay and
bookkeeping stay deterministic. They must be marked or otherwise resolved as
ineligible before player-facing rollback target selection.
Classification and exact saved-occurrence ownership continue across deferred
`handleLineActions` batches until the entered destination either settles or
routes again.

### Required checkpoint creation points

1. Engine init

- create initial checkpoint for the initial line

2. `nextLine`

- after advancing to the new line

3. `nextLineFromSystem`

- after advancing to the new line

4. `sectionTransition`

- after landing on the destination section's first line

5. `resetStoryAtSection`

- replace the existing timeline with a fresh checkpoint for the destination
  section's first line, including when its pointer IDs match the current line
- classify that replacement occurrence through its queued line-entry actions

6. `jumpToLine`

- excluded from rollback timeline for now

Rationale:

- `jumpToLine` can be used for tooling, debugging, or non-player transport
- automatically recording it as player rollback history would pollute the timeline

### Rule for timing

Checkpoint should represent the line the player is now on, not the line they left.

That keeps rollback semantics intuitive:

- back from line 10 goes to line 9
- current line is represented in the timeline
- a transient source can be represented without becoming a place where Back
  stops

### Occurrence identity rule

Do not deduplicate successful line entries solely because their `sectionId`,
`lineId`, and rollback policy match the adjacent checkpoint. A successful
checkpoint-creating navigation owns a fresh occurrence, including an
interaction-triggered `sectionTransition` back to the current section's first
line. Its eligibility must be classified independently so a later route cannot
rewrite an earlier settled occurrence.

This is distinct from accidentally appending twice for one navigation action.
Checkpoint creation remains centralized so each successful
checkpoint-creating action records exactly one occurrence, whether it appends
to or replaces the timeline.
`rollback.isRestoring` continues to suppress live checkpoint creation during
restoration.

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
- append exactly one new occurrence for each successful append-style
  checkpoint-creating navigation, even when its pointer matches the adjacent
  checkpoint
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

### Gameplay Back Uses Rollback

`Back` in gameplay should call rollback directly:

- UI-facing back action should call `rollbackByOffset({ offset: -1 })`

### Rollback target resolution

Player-facing rollback must resolve offsets over landing points rather than raw
array positions.

For `offset: -1`, scan backward from `rollback.currentIndex - 1` and select the
first returnable entry. Skip any number of transient entries without rendering
or restoring them as the current pointer. Larger negative offsets count only
returnable entries.

The same negative-offset resolver must drive `selectLineIdByOffset`,
`rollbackByOffset`, and `selectCanRollback`; the Back control must not be
enabled merely because an earlier raw timeline entry exists. Positive
`selectLineIdByOffset` traversal retains its existing raw-timeline contract.
If there is no earlier landing point, rollback is a no-op.

`resetStoryAtSection` remains a destructive boundary. It creates a new timeline
root, so target resolution cannot scan into pre-reset history.

### `rollbackByOffset`

Target behavior:

1. validate offset is negative
2. scan backward and count only returnable checkpoints until the requested
   offset is resolved
3. if out of bounds, no-op
4. delegate to one internal restore helper

### `restoreRollbackCheckpoint`

Introduce an internal restore helper:

```js
restoreRollbackCheckpoint(state, checkpointIndex);
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

- rollback should go immediately to the previous landing point
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
- when invoked during unsettled line-entry processing, mark the source entry as
  transient so Back skips it

### `conditional`

When a line-authored conditional automatically continues during line-entry
processing, retain any replay data needed for the source entry but mark the
source as transient. Do not mark a previously presented line transient when a
conditional is invoked by a later player interaction.

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
- keep explicit-target semantics separate from player-facing Back; reading UI
  must use the landing-point-aware offset resolver

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
- landing-point eligibility must survive save/load
- older entries without eligibility metadata must be migrated or derived before
  Back target selection
- legacy derivation must follow statically knowable first-match conditional
  semantics; false branches and branches after a definite match must not be
  treated as evidence that line entry routed to the next checkpoint, while
  dynamic guards remain conservatively possible
- a blocking choice or form remains a landing point when only an unreachable
  line conditional names the destination that the interaction actually entered
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
12. rollback on incomplete line goes immediately to the previous landing point
13. re-advance after rollback truncates old future branch
14. each successful checkpoint-creating navigation records exactly one
    occurrence, including append-style adjacent re-entry to the same story
    pointer
15. `rollback.isRestoring` prevents duplicate checkpoint append
16. `rollback.isRestoring` prevents duplicate `updateVariable` execution
17. old-save compatibility initializes a minimal rollback timeline correctly
18. rollback restore start state is derived from project defaults, not serialized baseline snapshots
19. Back skips matched, default, and unmatched conditional auto-continue
    sources and restores the preceding landing point in one action
20. Back skips a line-entry section-transition source and restores the
    preceding landing point across the section boundary
21. Back skips consecutive transient control-flow entries
22. an interaction-triggered conditional or section transition leaves its
    already-presented source eligible for rollback
23. failed routing or a conditional that cannot advance is not classified as
    transient merely from its authored action keys
24. `selectLineIdByOffset`, `rollbackByOffset`, and `selectCanRollback` count
    landing points rather than raw entries
25. save/load preserves target eligibility and repeated line IDs or loops are
    resolved by occurrence order
26. restoring an earlier landing point excludes mutations from skipped future
    transient entries, while restoring a later point still replays them
27. Back cannot cross a `resetStoryAtSection` timeline boundary
28. a destination or sibling `saveSlot`, whether it runs before or after
    routing, persists the transient marker; load followed by Back still skips
    the source
29. multiple navigations in one line-entry batch mark every intermediate,
    never-settled checkpoint transient
30. a save taken after routing but before destination line actions is corrected
    if that destination immediately routes, including the emitted persistence
    payload and a later load-plus-Back flow
31. a same-pointer `resetStoryAtSection` refreshes the replacement checkpoint
    before a later sibling route classifies it
32. re-entering an adjacent checkpoint creates a fresh occurrence regardless of
    the previous occurrence's eligibility; each occurrence is classified
    independently
33. same-pointer reset and load replacements finalize exact saves from the
    outgoing occurrence before installing the replacement cursor
34. an interaction-triggered transition to the current section's first line
    preserves the settled prior occurrence when the queued re-entry routes away
35. marker-less legacy migration follows statically knowable first-match
    conditional semantics and keeps a choice/form checkpoint returnable when
    its only matching route is in a false or otherwise unreachable branch

### Browser/VT regression coverage

The actual Back input path has isolated visual pages for:

- one transient line-authored conditional between settled A and C
- one transient line-authored section transition between settled A and C
- a route-then-save whose queued destination entry immediately routes again,
  followed by load and one Back click
- a same-pointer reset root followed by a sibling route, where one Back action
  must be a no-op at the destination
- a transient occurrence that is re-entered and settles, where Back must choose
  the fresh occurrence
- a settled first-line occurrence re-entered through an interaction, where the
  queued re-entry routes and Back must restore the prior settled occurrence

Each page uses its real layout control and a distinct failure render. Keep these
cases separate so a page exercises one control-flow problem, and pair them with
the targeted unit/system state-transition coverage above.

Marker-less legacy eligibility derivation remains unit/system-only. The VT
harness starts from authored project data and newly written, version-marked
slots; it cannot faithfully author the legacy slot shape without adding a
test-only initial-state injection path. The migration changes no renderer or
input behavior, while the existing Back pages cover the resulting visible
navigation.

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
12. evaluate whether history pointers can be simplified or removed later

## Risks

### 1. Double checkpoint creation

If both navigation action and line handling append checkpoints, timeline will drift.

Mitigation:

- centralize checkpoint appending in one helper
- test that one navigation appends once and a second same-pointer navigation
  appends a distinct occurrence

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
