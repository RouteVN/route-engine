# Rollback Design

This document defines the intended product behavior and engine model for rollback in `route-engine`.

It is the behavior contract for the current rollback implementation. Sections
that describe future rollback policies are explicitly labeled as future work.

## Purpose

Rollback is a core reading control in a visual novel.

Its job is to let the player move backward through prior rollback landing points
and restore the corresponding story state so the game can be re-read or
re-branch from that point.

Rollback is not the same as dialogue history.

- `Back` means rollback.
- `History` is a separate read-only feature and is out of scope for this document.
- Neither rollback nor dialogue history is an account-level "seen ever" record.

## Product Summary

The rollback model for `route-engine` is:

- `Back` performs true rollback.
- Rollback is line-level.
- `Back` resolves to the previous rollback landing point and skips transient
  control-flow lines.
- Rollback crosses section boundaries.
- Rollback policy is `free` for now.
- The model should be extensible to support additional policies later.
- Presentation is always reconstructed from story state after rollback.
- Seen-line tracking does not roll back.
- Persistent/global device/account variables do not roll back.
- Rollback stops auto mode and skip mode.
- If the user rolls back and then advances again, future rollback history after that point is discarded and replaced by the new branch. The shared past before the rollback point remains in the timeline.
- Rollback timeline is stored in save data and restored on load.

## Terminology

### Rollback

Rollback means restoring a prior rollback landing point from the checkpoint
timeline and making that line the current playable position.

Rollback changes story state.

### History

History means showing previously displayed dialogue in a read-only UI.

History does not change story state.

History is a separate feature and should not be conflated with rollback.

In the current engine, dialogue history is a render-time projection for the current section. It is not the same data as `rollback.timeline`, and it is not a durable all-sections visit log.

### Checkpoint

A checkpoint is a line-level entry in the internal rollback timeline. It is
used to reconstruct story state and may or may not be a player-facing rollback
landing point.

Checkpoint state is defined as:

- the state after rollbackable story actions for that line have been applied

That means rollback reconstruction to a target checkpoint replays rollbackable story actions up to that target line inclusively.

For v1, the authoritative replay source for a checkpoint is:

- the project-data line identified by that checkpoint's `sectionId` and `lineId`
- filtered to rollbackable story mutations only

The checkpoint entry itself does not need to duplicate the mutation payload as long as replay remains deterministic for the supported rollbackable action set.

### Rollback landing point

A line can be present in the internal rollback timeline without being a valid
place for the player to stop.

A **rollback landing point** is a line whose entry processing settled as a
playable reading position before the story moved on. A **transient control-flow
line** is entered only to route the story elsewhere before the player can read
or interact with that line.

At minimum, line-entry control flow is transient when it:

- executes a line-authored `conditional` and automatically continues
- successfully invokes a line-authored `sectionTransition`

The distinction is based on how the line was entered and settled, not merely
on whether an action type appears somewhere in its authored data. A line
remains a valid landing point when the player first reaches it and later
triggers a conditional or section transition through a click, choice, form, or
other interaction.

## Back Button Semantics

The main `Back` action in reading UI should perform rollback, not history preview.

Expected behavior:

- If the player presses `Back`, the engine rolls back to the nearest earlier
  rollback landing point.
- The engine skips any transient control-flow entries between the current line
  and that target in the same `Back` action.
- The engine must not render, pause on, or require another press to pass a
  transient control-flow line.
- This should work even if the current line is incomplete.
- `Back` should not first "complete the current line" and require a second press.

For example, if the reached path is:

```text
A (settled) -> B (conditional auto-continue) -> C (settled)
```

one press of `Back` from `C` restores `A`, not `B`. Likewise, if `B` is a
line-entry `sectionTransition`, `Back` from the destination section restores
`A` in one press. Consecutive transient lines are all skipped.

If no earlier landing point exists, `Back` is a no-op and the Back control
should be disabled.

`resetStoryAtSection` is different: it intentionally creates a new rollback
timeline. `Back` cannot cross that destructive reset boundary because the
pre-reset timeline is no longer part of the active story run.

This target-selection rule is implemented by resolving player-facing offsets
over eligible landing points rather than adjacent raw timeline entries.

Rationale:

- Advance and rollback should have different semantics.
- Advancing is incremental and often reveal-aware.
- Rollback is an explicit undo/navigation action and should be decisive.

## Rollback Policy

Current product policy is:

- `free`

Meaning:

- The player may roll back to an earlier landing point.
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

Checkpoints and internal timeline entries are line-level.

That means:

- every reached line may be retained in the timeline for deterministic replay
  and bookkeeping
- only rollback landing points are eligible `Back` destinations
- rollback moves between eligible lines, not between arbitrary internal action
  steps

This is intentionally simple and predictable.

For now, we do not introduce finer-grained checkpoint kinds.

The checkpoint structure should remain extensible so target-eligibility and
future policy metadata can be attached if needed. Skipping a transient entry
does not require deleting it from the replay timeline.

Eligibility is stored sparsely: checkpoints are returnable by default, while a
transient checkpoint carries `returnable: false`. The source occurrence is
marked as soon as line-entry processing changes the story pointer, before
destination effects or a later action can save the timeline. This also covers
multiple routing actions in one line-entry batch: every intermediate entry that
the player never receives as a settled reading position is transient.
If a sibling `saveSlot` runs earlier in that same batch, the engine repairs that
exact saved occurrence once routing succeeds and emits an updated persistence
effect; action ordering cannot make the transient line returnable after load.
The same exact-occurrence handoff continues across entry batches: when a route
and save happen before the destination's queued line actions run, that saved
destination is repaired if its own entry actions immediately route again. A
destination that settles keeps its default returnability.
If a reset, load, or rollback replaces the active checkpoint without changing
its section and line IDs, the outgoing candidate and any exact saved
occurrences are finalized before the replacement cursor takes ownership.

Landing-point eligibility belongs to a line-entry occurrence, not merely to its
section and line IDs. Every successful checkpoint-creating navigation records a
fresh occurrence. Append-style navigation does so even when it re-enters the
same section's first line and the new checkpoint is adjacent to an identical
pointer. The new occurrence can settle as a landing point or be marked transient
without rewriting the prior occurrence. In particular, a settled line remains
returnable when an interaction re-enters it and the new entry immediately routes
elsewhere.

When `Back` skips a transient entry and restores an earlier landing point,
replay ends at that earlier target, so rollbackable mutations from the skipped
future entry are undone. Retaining the entry is still necessary when
reconstructing a later landing point whose state includes those mutations.

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

## Timeline Scope

`rollback.timeline` is the ordered history of the current active story branch for a context.

It keeps the playable path from the start of that context/run through the current rollback cursor. Section transitions append to the same timeline, so normal story movement across sections remains one continuous rollback path.

When the player rolls back and then advances again, the abandoned future after the rollback point is removed. For example:

1. player reaches `A -> B -> C -> D`
2. player rolls back to `B`
3. player advances to `E`
4. timeline becomes `A -> B -> E`

This does not lose the shared past. It intentionally discards only the branch the player is no longer on.

`rollback.timeline` is therefore suitable for save-local "active path from the beginning of this run" semantics. It is not suitable for account-level "everything this player has ever seen" semantics.

Save data preserves landing-point eligibility. Loads created before the
eligibility marker existed derive the known conditional and section-transition
cases from the saved path and current project data; new saves carry a
returnability format marker so that derivation is not repeated.

Legacy derivation follows statically knowable conditional branch selection, not
every route that appears syntactically in any branch. A literal-false branch or
a branch after a definite match cannot make a checkpoint transient. Historical
values for dynamic guards are unavailable in marker-less saves, so those
branches remain possible. When a blocking choice or form could have produced
the recorded destination through player interaction, an unreachable
line-entry branch alone does not make the source transient.

The timeline can be reset by destructive story navigation, such as
`resetStoryAtSection`, which creates a new context-local rollback timeline
anchored at the destination section. The replacement checkpoint is a new
occurrence even when the reset targets the section and first line already under
the read pointer. Any later line-entry route classifies that replacement root,
not the deleted pre-reset checkpoint.

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

For skip-unseen behavior, rollback history is the wrong source of truth. The engine uses `accountViewedRegistry`, a monotonic seen registry outside slot rollback state, when the product meaning is "seen by this account across all saves."

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
- deriving rollback start state from project-defined context variable defaults
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
- rollback restoration resets context-scoped story state to the default values of context-scoped variables from project data
- the engine replays rollbackable story actions from the start of the timeline up to the target timeline index
- presentation is then reconstructed from the resulting story state

This means:

- presentation snapshots are never stored
- context variable snapshots are not the source of truth
- story state is derived from the rollback timeline
- rollback state should not store a duplicate `baselineVariables` snapshot when the same start state can be derived from project data

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
- loads must recompute rollback start state from project-defined context variable defaults
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
- `Back` resolves to the previous rollback landing point in one action
- rollback never renders or pauses on a transient conditional or
  section-transition source line
- rollback works on incomplete lines
- rollback crosses section boundaries
- rollback does not cross a `resetStoryAtSection` timeline boundary
- rollback reconstructs presentation from story state
- rollback does not affect seen-state
- rollback does not affect persistent/global device/account variables
- rollback stops auto/skip
- re-advancing after rollback discards the old future branch
- repeated entries at the same story pointer keep independent landing-point
  eligibility
- legacy eligibility derivation does not treat unreachable conditional routes
  as line-entry control flow
- the internal checkpoint model can later support `fixed` and `blocked` policies
