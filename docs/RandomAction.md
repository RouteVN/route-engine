# Random Action Design

## Status

This document defines the authored and runtime contract for the `random` system
action implemented in Route Engine 1.38.0.

## Purpose

`random` is a synchronous, non-presentational action with exactly two
distribution types:

- `integer` generates a uniformly distributed integer and stores it directly
  in a declared variable.
- `weighted` selects and executes one authored action branch.

There is no temporary result binding and no shared `random.actions` batch.
Integer results are read through their declared variable by later sibling
actions. Weighted selection needs no result value because every outcome owns
its actions.

The action does not display a result, wait for input, or animate. A choice,
layout button, or other renderer event may dispatch it.

## Authored Interface

### Uniform integer

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
            lineId: highResult
      - actions:
          jumpToLine:
            lineId: lowResult
```

`variableId` is required and must reference a declared, writable,
context-scoped number variable. The generated integer is stored before the next
sibling action executes.

Integer configuration:

- `min` and `max` are required safe integers.
- Both bounds are inclusive.
- `min` must be less than or equal to `max`.
- The inclusive range may contain at most `4294967296` (`2^32`) integers.
- Every integer in the range has equal probability.
- A one-value range is valid and always stores that value.
- There is no authored shape or mode field; uniform selection is the only
  integer behavior.

For example, `{ min: -2, max: 2 }` can produce `-2`, `-1`, `0`, `1`, or `2`,
each with the same probability.

### Weighted actions

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
- Weighted selection has no `variableId`, gameplay value, or top-level action
  batch. Its selected array index exists only in internal rollback state.

A percentage-like route uses two weighted branches:

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

The Draft-07 action schema defines `random` as a closed `oneOf`:

- Integer requires `distribution` and `variableId` and forbids other fields.
- Weighted requires only `distribution`; each outcome recursively references
  the normal system-action root through `actions`.

All distribution fields are fixed authored JSON/YAML values. They do not
resolve variables or action templates. Integer bounds are schema-limited to the
JavaScript safe-integer range. The runtime additionally validates bound order
and inclusive range width, which Draft-07 cannot express by comparing sibling
properties. Weighted outcome actions retain ordinary lazy action-template
behavior.

Direct API and renderer payloads receive the same runtime checks. Invalid
payloads and invalid integer target variables fail before a random word is
requested.

## Execution and Continuation

Execution is ordered and synchronous:

1. Validate the payload and integer target variable, when present.
2. Validate and sample the distribution.
3. For a line-source action, record the internal result on its exact rollback
   occurrence.
4. Integer stores its value; weighted processes the selected outcome's actions.
5. Request one conditional-style automatic continuation after the outer action
   batch settles.

Integer `random` runs in the State phase and `conditional` runs in the Decision
phase. Integer writes are therefore visible to a sibling conditional regardless
of their YAML property order. Weighted `random` runs in the Decision phase
immediately before `conditional`. Every selected outcome action object is a
nested batch and uses the same canonical schedule.

Continuation follows the same rules as `conditional`:

- If no action moves the story pointer, the engine advances to the next line
  once.
- A move to another line or section suppresses that automatic advance.
- `sectionTransition` and `resetStoryAtSection` also suppress it.
- Nested conditional/random continuation requests coalesce, so the outer batch
  advances at most once.
- Existing choice and form authorization remains in force.

A line-authored random action that automatically continues is a transient Back
source. Player-facing Back skips it rather than pausing on an empty random line.
An interaction-triggered random action does not make its already-presented line
transient.

## Uniformity and Random Source

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

Integer sampling maps an unsigned 32-bit word into the inclusive range using
rejection sampling. It never uses a biased `word % rangeSize` result when the
range size does not divide `2^32`. A sample may reject at most `128` words
before failing transactionally. The full `2^32` cardinality is supported.

Weighted selection combines two words into a 53-bit unit interval `[0, 1)`.

## Transactions

Sampling, the integer variable write, selected weighted actions, and final
state validation participate in the surrounding action-batch transaction.

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
- `{ type: "integer", value }` for integer results, or
  `{ type: "weighted", outcomeIndex }` for weighted selections

Save data never supplies executable actions. Replay resolves the current
canonical project action, validates the stored result, and then:

- writes the recorded integer to the canonical `variableId`, or
- executes the canonical weighted outcome actions at the recorded index.

Replay never consults `randomSource`. Nested random actions receive distinct
structural paths. Multiple entries into the same line receive distinct replay
occurrences, including jump-created non-returnable occurrences.

Each outcome-aware occurrence has `randomOutcomeVersion: 1`, and the version
and outcome array must appear together. An absent pair means legacy history, so
historical random actions are treated as absent rather than rerolled. A present
unsupported version is incompatible data and is rejected transactionally.

Malformed or duplicate records never trigger a fallback draw. During
`updateProjectData` and save loading, records whose canonical path,
distribution type, weighted branch index, writable integer target, or integer
range no longer matches are dropped as orphaned history rather than rebound.

Interaction-source integer writes are captured through the existing
chronological rollback mutation mechanism. Weighted descendant mutations
follow the same policy. The internal random result itself is not persisted as
an interaction event.

## Interaction and Presentation

`random` renders nothing by itself. A visible result uses existing systems:

1. A choice or button dispatches integer generation with a declared result
   variable.
2. A following conditional or later line reads that variable.
3. Existing dialogue/layout actions present the value or selected route.

While a form is active, renderer events cannot dispatch arbitrary top-level
random actions. Random may run inside authorized submit/cancel action trees.

## Authoring Tool Interface

```text
Random
  Distribution [ Uniform integer v ]
  Minimum      [ 1 ]
  Maximum      [ 100 ]
  Result       [ randomNumber v ]
```

The Result selector lists writable context number variables. The editor can
offer “Create variable” beside it, but serialization uses only `variableId`.

Weighted switches to branch rows:

```text
Random
  Distribution [ Weighted v ]

  Outcome 1    Weight [ 70 ]
               [ nested action builder ]
  Outcome 2    Weight [ 30 ]
               [ nested action builder ]

  [ Add outcome ]
```

There is no weighted value field or shared “after generating” action batch.

## Required Coverage

The feature is covered at four levels:

- sampler tests for inclusive and negative bounds, one-value and full-`2^32`
  ranges, safe-integer offsets, rejection sampling, source validation, weighted
  zeroes/totals/rescaling/resolution, and persisted result validation
- schema tests accepting integer-variable and recursive weighted forms while
  rejecting templates, unsafe bounds, removed fields, all-zero weights,
  mismatched persisted types, and partial ledgers
- system tests for direct variable writes, sibling ordering, invalid targets
  before sampling, continuation, transactions, occurrence identity, save/load,
  project range migration, weighted templates, and deterministic replay
- a focused browser/VT choice path that injects deterministic randomness,
  stores an integer, branches through the authored action pipeline, selects a
  weighted outcome, and renders the destination
