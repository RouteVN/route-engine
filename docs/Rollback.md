# Rollback Design

This document defines the intended product behavior and engine model for rollback in `route-engine`.

It is a design document, not a guarantee that the current implementation already matches every rule below.

## Purpose

Rollback is a core reading control in a visual novel.

Its job is to let the player move backward through prior line checkpoints and restore the corresponding story state so the game can be re-read or re-branch from that point.

Rollback is not the same as dialogue history.

- `Back` means rollback.
- `History` is a separate read-only feature and is out of scope for this document.

## Product Summary

The rollback model for `route-engine` is:

- `Back` performs true rollback.
- Rollback is line-level.
- Rollback crosses section boundaries.
- Rollback policy is `free` for now.
- The model should be extensible to support additional policies later.
- Presentation is always reconstructed from story state after rollback.
- Seen-line tracking does not roll back.
- Persistent/global device/account variables do not roll back.
- Rollback stops auto mode and skip mode.
- If the user rolls back and then advances again, future rollback history after that point is discarded and replaced by the new branch.
- Rollback timeline is stored in save data and restored on load.

## Terminology

### Rollback

Rollback means restoring a prior story checkpoint and making that checkpoint the current playable position.

Rollback changes story state.

### History

History means showing previously displayed dialogue in a read-only UI.

History does not change story state.

History is a separate feature and should not be conflated with rollback.

### Checkpoint

A checkpoint is the unit the player can roll back to.

In this design, checkpoints are line-level.

Checkpoint state is defined as:

- the state after rollbackable story actions for that line have been applied

That means rollback reconstruction to a target checkpoint replays rollbackable story actions up to that target line inclusively.

For v1, the authoritative replay source for a checkpoint is:

- the project-data line identified by that checkpoint's `sectionId` and `lineId`
- filtered to rollbackable story mutations only

The checkpoint entry itself does not need to duplicate the mutation payload as long as replay remains deterministic for the supported rollbackable action set.

## Back Button Semantics

The main `Back` action in reading UI should perform rollback, not history preview.

Expected behavior:

- If the player presses `Back`, the engine rolls back to the previous line checkpoint.
- This should work even if the current line is incomplete.
- `Back` should not first "complete the current line" and require a second press.

Rationale:

- Advance and rollback should have different semantics.
- Advancing is incremental and often reveal-aware.
- Rollback is an explicit undo/navigation action and should be decisive.

## Rollback Policy

Current product policy is:

- `free`

Meaning:

- The player may roll back to an earlier checkpoint.
- The player may then advance again and make different decisions.
- The old future branch is discarded once the player diverges.

Future policies should be possible without redesigning the entire model:

- `fixed`
  - player may roll back and inspect prior state
  - prior decisions remain locked
- `blocked`
  - player may not roll back before a specific checkpoint

These policies are not part of the current behavior, but the internal checkpoint structure should leave room for them.

## Checkpoint Granularity

Checkpoints are line-level.

That means:

- every line that the player reaches becomes a rollback checkpoint
- rollback moves between lines, not between arbitrary internal action steps

This is intentionally simple and predictable.

For now, we do not introduce finer-grained checkpoint kinds.

The checkpoint structure should remain extensible so future metadata can be attached if needed.

## Cross-Section Rollback

Rollback must cross section boundaries.

If the player reached:

- section A, line 10
- then section B, line 1

pressing `Back` should allow rollback from section B back into section A.

Rationale:

- from the player's perspective, this is one continuous reading timeline
- restricting rollback to the current section feels arbitrary and broken

This means rollback history must be modeled as a single ordered timeline per context, not only as isolated per-section history buckets.

## Rollback Scope

### State that rolls back

Rollback restores:

- current read pointer
- current section and line
- context-scoped story variables
- current branch position in the narrative

### State that does not roll back

Rollback does not restore:

- seen-line registry
- seen-resource registry
- persistent/global device variables
- persistent/global account variables
- save slots
- external side effects outside engine state

Rationale:

- seen-state should be monotonic
- persistent/global variables are not story-local and should not behave like local branch state

Consequence:

- after rollback, previously seen content remains seen even if the player later diverges onto a different branch
- skip behavior may still treat previously seen branch content as seen

This is intentional for v1.

## Presentation Model

Rollback must not restore stored presentation snapshots.

Instead:

- rollback restores rollbackable story state
- presentation is derived from that state
- render state is derived from presentation and system state

This matches the core state-driven architecture of `route-engine`.

Implications:

- transient animation progress is not restored
- presentation after rollback is reconstructed, not resumed
- rollback correctness should be defined in terms of restored story state, not exact renderer internals

## Divergence Rule

If the player rolls back and then advances again from the rollback point:

- all future checkpoints after that point are discarded
- a new future branch is created from the rollback point

This is standard rollback behavior and keeps the model coherent.

Without this rule, rollback history becomes ambiguous and harder to reason about.

## Interaction with Auto and Skip

Rollback should always stop:

- auto mode
- skip mode

Rationale:

- rollback is an explicit navigation action
- continuing auto/skip after rollback is surprising and unsafe

## Data Model Direction

The data model should support the product rules above.

### Required logical model

Each context should have a single rollback timeline ordered by playthrough sequence.

Conceptually:

```js
rollback: {
  currentIndex: 0,
  isRestoring: false,
  timeline: [
    {
      sectionId: "section1",
      lineId: "line1",
      rollbackPolicy: "free",
    },
  ],
}
```

The exact field names may differ, but the model should support:

- ordered line checkpoints across section boundaries
- replaying rollbackable story actions from timeline history
- an array-index cursor for the current rollback position
- a temporary restore guard for rollback reconstruction
- future rollback policy expansion

### Current checkpoint contents

For now, checkpoint identity only needs:

- `sectionId`
- `lineId`

But the structure should be able to grow later with:

- `rollbackPolicy`
- future interaction metadata
- future choice locking metadata

## Restoration Strategy

Rollbackable story state should be recomputed from full rollback history, not restored from per-checkpoint variable snapshots.

The model is:

- rollback timeline stores the visited line sequence
- each entry identifies a visited line by `sectionId` and `lineId`
- rollback restoration resets context-scoped story state to the context baseline
- the engine replays rollbackable story actions from the start of the timeline up to the target timeline index
- presentation is then reconstructed from the resulting story state

This means:

- presentation snapshots are never stored
- context variable snapshots are not the source of truth
- story state is derived from the rollback timeline

For now, replayability is based on line sequence plus rollbackable action classification.

Initially, the only required rollbackable story mutation type is:

- `updateVariable`

This can be expanded later if more rollbackable action types are introduced.

## Restore Guard

Rollback restoration requires an explicit temporary guard such as:

```js
rollback.isRestoring = true;
```

This is an internal implementation flag, not a user-facing mode.

Its purpose is to prevent the restore process from being mistaken for normal forward progression.

During restore:

- new rollback checkpoints must not be appended
- rollbackable story actions must not execute again as live gameplay actions
- seen-state must not be recomputed as fresh progression
- normal progression side effects must not be emitted

Restore must use a dedicated rollback restore path.

It must not reuse normal live line-action execution as if the player had just progressed forward.

For v1, `jumpToLine` is excluded from rollback history.

Rationale:

- `jumpToLine` can be used for tooling, debugging, or non-player transport
- automatically recording it as player rollback history would pollute the rollback timeline

Without this guard, rollback reconstruction can:

- execute `updateVariable` more than once
- append duplicate timeline entries
- produce incorrect derived state

## Non-Goals

This document does not define:

- dialogue history UI
- history retention rules
- fixed rollback behavior
- blocked rollback behavior
- roll-forward UX
- save/load UI behavior beyond normal state restoration

## Save/Load

Rollback timeline is part of saved runtime state.

That means:

- saves must serialize the rollback timeline
- saves must serialize the current rollback cursor
- loading a save must restore rollback ability from that saved point

Compatibility behavior for older saves without rollback timeline should be defined during implementation.

Recommended default:

- if an older save does not contain rollback state, initialize a minimal rollback timeline at the loaded current pointer
- do not attempt to reconstruct older rollback history that was never saved

Those can be defined separately later.

## Implementation Notes

The current engine already derives presentation from state, which is correct.

However, a fully correct rollback system for this product model should move toward:

- a per-context rollback timeline
- line-level checkpoints
- direct restoration of rollbackable story state
- future policy extensibility

The current code may still contain older concepts such as:

- history-mode pointers
- section-oriented history structures
- replay-based rollback logic

Those should be treated as implementation details that can be replaced if they do not fit this design.

## Review Checklist

The design is correct if all of the following are true:

- `Back` always means rollback
- rollback works on incomplete lines
- rollback crosses section boundaries
- rollback reconstructs presentation from story state
- rollback does not affect seen-state
- rollback does not affect persistent/global device/account variables
- rollback stops auto/skip
- re-advancing after rollback discards the old future branch
- the internal checkpoint model can later support `fixed` and `blocked` policies
