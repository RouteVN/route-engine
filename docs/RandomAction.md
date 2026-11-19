# Random Action Design

## Status

This document defines the authored and runtime contract for the `random` system
action. The action was introduced in Route Engine 1.38.0 with an `integer`
and a `weighted` distribution. Route Engine 1.55.0 removed the `integer`
distribution: a random value is drawn into a variable by an `updateVariable`
operation with `op: random`, described under "Random Variable Operations" in
[RouteEngine.md](./RouteEngine.md).

## Purpose

`random` is a synchronous, non-presentational action that selects and executes
one authored action branch by chance.

There is no result variable, no temporary result binding and no shared
`random.actions` batch. Selection needs no result value because every outcome
owns its actions.

The action does not display a result, wait for input, or animate. A choice,
layout button, or other renderer event may dispatch it.

## Authored Interface

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
        - weight: 25
          actions:
            jumpToLine:
              lineId: rareReward
        - weight: 5
          actions:
            jumpToLine:
              lineId: legendaryReward
```

- `outcomes` is required and contains from `1` through `1000` entries.
- Every outcome requires a finite numeric `weight` greater than or equal to `0`
  and an `actions` object. The action object may be empty.
- At least one outcome must have a positive weight.
- Zero-weight outcomes are never selected.
- Selection is proportional to authored weights; weights do not need to sum to
  `1` or `100`.
- Exactly one selected outcome's actions execute. Unselected actions are not
  templated or executed.
- The action has no `variableId`, gameplay value, or top-level action batch.
  Its selected array index exists only in internal rollback state.

A percentage-like route uses two outcomes:

```yaml
distribution:
  type: weighted
  outcomes:
    - weight: 25
      actions:
        jumpToLine:
          lineId: success
    - weight: 75
      actions:
        jumpToLine:
          lineId: failure
```

Weights are rescaled by the largest weight before cumulative sampling, avoiding
overflow and subnormal-total bias. Every positive normalized share must be
greater than `2^-53`; values at or below that boundary are rejected rather than
accepted as unreachable outcomes.

## Schema and Runtime Validation

The Draft-07 action schema defines `random` as a closed object that requires
only `distribution`. The distribution is `weighted`, and each outcome
recursively references the normal system-action root through `actions`.

All distribution fields are fixed authored JSON/YAML values. They do not
resolve variables or action templates. Outcome actions retain ordinary lazy
action-template behavior.

Direct API and renderer payloads receive the same runtime checks. Invalid
payloads fail before a random word is requested. A payload with the removed
`integer` distribution or a `variableId` is invalid. A project that still
holds one is not migrated: the engine refuses the action when its line runs,
and names the `updateVariable` random operation as the replacement.

## Execution and Continuation

Execution is ordered and synchronous:

1. Validate the payload.
2. Validate and sample the distribution.
3. For a line-source action, record the internal result on its exact rollback
   occurrence.
4. Process the selected outcome's actions.
5. Request one conditional-style automatic continuation after the outer action
   batch settles.

`random` runs in the Decision phase immediately before `conditional`. The
selected outcome action object is a nested batch and uses the same canonical
schedule. An `updateVariable` random operation runs in the State phase, so a
sibling `random` or `conditional` sees the value it drew.

Continuation follows the same rules as `conditional`:

- If no action moves the story pointer, the engine advances to the next line
  once.
- A move to another line or section suppresses that automatic advance.
- `sectionTransition` and the deprecated `resetStoryAtSection` also suppress it.
- Nested conditional/random continuation requests coalesce, so the outer batch
  advances at most once.
- Existing choice and form authorization remains in force.

A line-authored random action that automatically continues is a transient Back
source. Player-facing Back skips it rather than pausing on an empty random line.
An interaction-triggered random action does not make its already-presented line
transient.

## Random Source

The engine construction option is:

```js
const randomSource = {
  nextUint32() {
    // Return an integer from 0 through 4294967295.
  },
};
```

The method is synchronous. Invalid values throw. Tests and VT inject a
deterministic implementation; story data cannot select a generator or seed.
When omitted, the engine uses `crypto.getRandomValues` where available, with a
`Math.random` compatibility fallback.

Weighted selection combines two words into a 53-bit unit interval `[0, 1)`.
The `updateVariable` random operation uses the same source: its weighted
values are selected the same way, and its integers are mapped from one word
with rejection sampling.

## Transactions

Sampling, the selected actions, and final state validation participate in the
surrounding action-batch transaction.

- Invalid input fails before drawing whenever validation can determine it.
- If a later sibling or selected outcome action fails, no state mutation,
  navigation, pending effect, persistence write, or outcome record commits.
- A failed attempt may consume random-source words; retrying may draw a
  different result because no gameplay result committed.

Queued effects are delivered only after commit. Existing post-commit effect and
persistence error contracts remain unchanged.

## Save, Load, and Rollback

Line-source results are retained in a `randomOutcomes` ledger on the exact
rollback occurrence. Each record contains:

- an internal structural action path and execution ordinal
- the distribution type
- `{ type: "weighted", outcomeIndex }` for a `random` action

The ledger also holds the rolls of `updateVariable` random operations, which
record `{ type: "integer", value }` or `{ type: "weighted", outcomeIndex }`
under the path of their operation.

Save data never supplies executable actions. Replay resolves the current
canonical project action, validates the stored result, and then executes the
canonical outcome actions at the recorded index.

Replay never consults `randomSource`. Nested random actions receive distinct
structural paths. Multiple entries into the same line receive distinct replay
occurrences, including jump-created non-returnable occurrences.

Each outcome-aware occurrence has `randomOutcomeVersion: 1`, and the version
and outcome array must appear together. An absent pair means legacy history, so
historical random actions are treated as absent rather than rerolled. A present
unsupported version is incompatible data and is rejected transactionally.

Malformed or duplicate records never trigger a fallback draw. During
`updateProjectData` and save loading, records whose canonical path,
distribution type, or branch index no longer matches are dropped as orphaned
history rather than rebound. This includes an integer result that an engine
before 1.55.0 recorded for a `random` action.

Replaying a line whose record was dropped runs the line without that random
action. A save from before 1.55.0 that holds an integer result therefore loads
with its variables as they were saved, but rolling back to the line of the
roll replays it without the roll: the variable keeps the value it had before
that line, and conditionals that read it decide again. The record is not moved
to an `updateVariable` random operation that replaced the action.

Mutations made by the selected actions of an interaction-source random action
are captured through the existing chronological rollback mutation mechanism.
The internal random result itself is not persisted as an interaction event.

## Interaction and Presentation

`random` renders nothing by itself. A visible result uses existing systems:

1. A choice or button dispatches the action.
2. The selected outcome's actions route the story or change variables.
3. Existing dialogue/layout actions present the selected route.

While a form is active, renderer events cannot dispatch arbitrary top-level
random actions. Random may run inside authorized submit/cancel action trees.

## Authoring Tool Interface

```text
Random
  Outcome 1    Weight [ 70 ]
               [ nested action builder ]
  Outcome 2    Weight [ 30 ]
               [ nested action builder ]

  [ Add outcome ]
```

There is no value field, result variable or shared "after generating" action
batch.

## Required Coverage

The feature is covered at four levels:

- sampler tests for weighted zeroes/totals/rescaling/resolution, source
  validation, and persisted result validation
- schema tests accepting recursive weighted forms while rejecting templates,
  removed fields, the removed integer form, all-zero weights, mismatched
  persisted types, and partial ledgers
- system tests for ordering before `conditional`, invalid payloads before
  sampling, the removed integer form, continuation, transactions, occurrence
  identity, save/load, project updates, integer results recorded by an older
  engine, weighted templates, and deterministic replay
- a focused browser/VT choice path that injects deterministic randomness,
  rolls an integer with an `updateVariable` random operation, branches through
  the authored action pipeline, selects a weighted outcome, and renders the
  destination
