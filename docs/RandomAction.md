# Random Action Design

## Status

This document defines the authored and runtime contract for the `random` system
action implemented in Route Engine 1.38.0.

## Purpose

`random` is a synchronous, non-presentational action with two modes:

- `dice` rolls one or more dice and stores the final numeric total directly in
  a declared variable.
- `weighted` selects and executes one authored action branch.

There is no temporary random binding and no `random.actions` batch. A dice
result is read through its declared variable by later sibling actions. Weighted
selection needs no result value because the selected outcome already owns its
actions.

The action does not display a roll, wait for input, or animate. A choice,
layout button, or other renderer event may dispatch it.

## Authored Interface

### Dice

```yaml
actions:
  random:
    distribution:
      type: dice
      count: 1
      sides: 20
      modifier: 3
    variableId: lastLockpickRoll

  conditional:
    branches:
      - when:
          gte:
            - var: variables.lastLockpickRoll
            - 15
        actions:
          jumpToLine:
            lineId: lockOpened
      - actions:
          jumpToLine:
            lineId: lockFailed
```

`variableId` is required and must reference a declared, writable,
context-scoped number variable. The dice action stores its final total before
the next sibling action executes, so the following `conditional` can read it
through `variables.<id>`.

The detailed result remains internal:

```js
{
  type: "dice",
  value: 17,
  rolls: [14],
  keptRolls: [14],
  discardedRolls: [],
  modifier: 3,
}
```

Only `value` is written to the declared variable. The full breakdown is kept in
line rollback history so the engine can validate and replay the original roll.

Dice configuration:

- `count` defaults to `1` and must be an integer from `1` through `100`.
- `sides` is required and must be an integer from `2` through `4294967296`
  (`2^32`).
- `modifier` defaults to `0` and must be a safe integer.
- `keep` is optional. Its `type` is `highest` or `lowest`, and its `count`
  must be from `1` through the dice count.
- Without `keep`, every roll is kept.
- The stored value is the sum of kept rolls plus the modifier.
- Rolls and kept/discarded breakdowns preserve generation order. Equal dice are
  selected stably by generation order.
- The minimum and maximum possible totals must both be safe integers.

A uniform integer range is represented by one die plus a modifier. For example,
the old inclusive range `5..10` is:

```yaml
distribution:
  type: dice
  sides: 6
  modifier: 4
```

This produces the same uniform values as `5..10`. A range with only one value
is not random and should use `updateVariable` directly.

### Weighted

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
- At least one weight must be positive. Zero-weight outcomes are never chosen.
- Selection is proportional to authored weights; weights do not need to sum to
  `1` or `100`.
- Exactly one selected outcome's actions execute. Unselected actions are not
  templated or executed.
- Weighted selection has no `variableId`, gameplay value, or top-level action
  batch. Its selected array index is retained only in internal rollback state.

Chance is represented directly with two weighted action branches:

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
greater than `2^-53`; weights at or below that boundary are rejected rather
than accepted as unreachable outcomes.

## Schema and Runtime Validation

The Draft-07 action schema defines `random` as a closed `oneOf`:

- Dice requires `distribution` and `variableId` and forbids other fields.
- Weighted requires only `distribution`; each outcome recursively references
  the normal system-action root through `actions`.
- Integer and chance distributions are not supported.

All numeric distribution fields are fixed authored JSON/YAML numbers. They do
not resolve variables or templates. Runtime validation repeats finite, integer,
range, total, dice keep, and variable-target checks for direct API and renderer
payloads.

Weighted outcome actions retain ordinary lazy action-template behavior. The
closed story action schema exposes `random` through the system-action
definition, just like `conditional`.

## Execution and Continuation

Execution is ordered and synchronous:

1. Validate the payload, distribution, and dice target variable.
2. Draw the dice result or weighted branch index.
3. For a line-source action, record the internal result on its exact rollback
   replay occurrence.
4. Dice sets its declared variable; weighted processes the selected outcome's
   actions.
5. Request one conditional-style automatic continuation after the entire outer
   action batch settles.

Dice writes are visible to later sibling actions in the same authored object.
Because system actions execute in insertion order, authors should place dice
before a conditional that reads its variable.

Continuation follows the same rules as `conditional`:

- If neither the random operation nor another action moves the story pointer,
  the engine advances to the next line once.
- A move to another line or section suppresses that automatic advance.
- `sectionTransition` and `resetStoryAtSection` also suppress it.
- Nested conditional/random continuation requests coalesce, so the outer batch
  advances at most once.
- Choice and form authorization remains in force.

A line-authored random action that automatically continues is a transient Back
source. Player-facing Back skips it rather than pausing on an empty random line.
An interaction-triggered random action does not make its already-presented line
transient.

## Transactions

Random sampling, the dice variable write, selected weighted actions, and final
state validation participate in the surrounding action-batch transaction.

- Invalid payloads and invalid dice variable targets fail before drawing.
- If a later sibling or selected outcome action fails, no state mutation,
  navigation, pending effect, persistence write, or outcome record from the
  batch commits.
- A failed attempt may consume random-source words; retrying may draw a
  different result because no gameplay result committed.

Queued effects are delivered only after commit. Existing post-commit effect and
persistence error contracts remain unchanged.

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
deterministic implementation; story data cannot choose a generator or seed.
When omitted, the engine uses `crypto.getRandomValues` where available, with a
documented `Math.random` compatibility fallback.

Dice uses unsigned-word rejection sampling to avoid modulo bias. A die may
reject at most `128` source words before failing transactionally. Weighted
selection combines two words into a 53-bit unit interval `[0, 1)`.

## Save, Load, and Rollback

Line-source results are retained in a `randomOutcomes` ledger on the exact
rollback occurrence. Each record contains:

- an internal structural action path and execution ordinal
- the distribution type
- the cloned internal result

Save data never supplies executable actions. Replay resolves the current
canonical project action, validates the stored result, and then:

- writes the recorded dice total to the canonical `variableId`, or
- executes the canonical weighted outcome actions at the recorded index.

Replay never consults `randomSource`. Nested random actions receive distinct
structural paths. Multiple entries into the same line receive distinct replay
occurrences, including jump-created non-returnable occurrences.

Each outcome-aware occurrence has `randomOutcomeVersion: 1`. An absent marker
means legacy history, so historical random actions are treated as absent rather
than rerolled. A present unsupported version is incompatible data and is
rejected transactionally.

Malformed or duplicate records never trigger a fallback draw. During
`updateProjectData` and save loading, records whose canonical path,
distribution type, weighted branch index, or writable dice target no longer
exists are dropped as orphaned history rather than rebound.

Interaction-source dice writes are captured through the existing chronological
rollback mutation mechanism. Weighted descendant mutations follow the same
policy. The transient internal random result itself is not persisted as an
interaction event.

## Interaction and Presentation

`random` renders nothing by itself. A visible roll uses existing systems:

1. A choice or button dispatches dice with a declared result variable.
2. A following conditional or later line reads that variable.
3. Existing dialogue/layout actions present the value or selected route.

While a form is active, renderer events cannot dispatch arbitrary top-level
random actions. Random may run inside authorized submit/cancel action trees.

An animated dice roller would be a separate presentation feature that can
dispatch this same system action without changing sampling or rollback.

## Authoring Tool Interface

```text
Random
  Method      [ Dice v ]
  Result      [ lastLockpickRoll v ]
  Dice        [ 1 ] d [ 20 ]
  Modifier    [ 3 ]
  Keep        [ All v ]
```

The Result selector lists writable context number variables. The editor can
offer “Create variable” beside it, but serialization uses only `variableId`.

Weighted switches to branch rows:

```text
Random
  Method      [ Weighted v ]

  Outcome 1   Weight [ 70 ]
              [ nested action builder ]
  Outcome 2   Weight [ 30 ]
              [ nested action builder ]

  [ Add outcome ]
```

There is no weighted value field or shared “after rolling” action batch.

## Required Coverage

The feature is covered at four levels:

- sampler tests for dice boundaries, keep rules, rejection sampling, weighted
  zeroes/totals/rescaling/resolution, and injected source validation
- schema tests accepting dice-variable and recursive weighted forms while
  rejecting integer, chance, templates, and cross-mode fields
- system tests for direct variable writes, sibling ordering, continuation,
  transaction rollback, line occurrence identity, save/load, project
  reconciliation, weighted templates, and deterministic replay
- a focused browser/VT choice path that injects deterministic randomness,
  stores a dice total, branches through the authored action pipeline, selects a
  weighted outcome, and renders the destination
