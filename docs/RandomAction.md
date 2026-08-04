# Random Action Design

## Status

This document defines the authored and runtime contract for the `random` system
action implemented in Route Engine 1.38.0.

## Purpose

The `random` action provides game-friendly random sampling and passes the
resolved result into a nested action batch. Authors can use the existing
`conditional` action to route based on that result, or explicitly store the
result with `updateVariable` when later lines need it.

The action is synchronous and non-presentational. It does not display dice,
wait for player input, or produce an animation. A choice, layout button, or
other renderer event may dispatch it when the roll should be player-triggered.

## Goals

- Support a small set of useful, explicitly typed random distributions.
- Reuse the existing action batch and conditional grammars.
- Make the common case readable in YAML and straightforward for an editor to
  generate.
- Preserve the exact sampled outcome through save/load and rollback
  reconstruction.
- Keep transient results out of game variables unless the author chooses to
  store them.
- Preserve typed values when a result is passed to another action.

## Non-goals

- A built-in dice or random-result UI.
- Dice-roll animations or reveal timing.
- Cryptographic or security-sensitive random decisions.
- A dice-notation parser such as `2d6+1`.
- Continuous/normal distributions, exploding dice, reroll rules, or shuffled
  bags in the first version.
- A story-authored seed or random-number-generator selection.

## Authored Interface

The action has one `distribution` and one nested `actions` batch:

```yaml
actions:
  random:
    distribution:
      type: dice
      count: 1
      sides: 20
      modifier: "${variables.lockpickBonus}"

    actions:
      updateVariable:
        id: storeLockpickRoll
        operations:
          - variableId: lastLockpickRoll
            op: set
            value: "_random.value"

      conditional:
        branches:
          - when:
              gte:
                - var: _random.value
                - 15
            actions:
              jumpToLine:
                lineId: lockOpened

          - actions:
              jumpToLine:
                lineId: lockFailed
```

`actions` is required and uses the normal system-action schema recursively. An
empty object is valid and means that the engine samples and immediately
continues, matching the existing allowance for empty conditional branch action
objects.

Outcome identity is internal. Authors do not provide an ID merely to support
rollback bookkeeping. The engine identifies an occurrence from its rollback
source occurrence, structural action path, nesting, and execution ordinal.

The `random` action deliberately does not define its own `branches` language.
Authors compose it with `conditional`, which keeps ordering, comparison, lazy
template evaluation, and navigation behavior identical to other routes.

## Result Context

Nested actions receive a scoped `_random` context. Every result has these
fields:

```yaml
_random:
  type: dice
  value: 17
```

- `type` is the selected distribution type.
- `value` is the primary typed result.

Dice results additionally expose their breakdown:

```yaml
_random:
  type: dice
  value: 17
  rolls: [14]
  keptRolls: [14]
  discardedRolls: []
  modifier: 3
```

The result object is an immutable snapshot for the nested action batch. Values
copied into engine state must be cloned rather than retained by reference.

### Direct bindings

A bare `_random` binding returns the referenced typed value directly:

```yaml
value: "_random.value"
value: "_random.rolls"
value: "_random"
```

This follows the existing `_event.value` action-binding convention. It avoids
requiring Jempl interpolation for ordinary value passing and preserves numbers,
booleans, arrays, and objects without string conversion.

Exact bindings are accepted anywhere the receiving action accepts an
action-template string. After binding resolution, that action performs its
normal type and domain validation.

Jempl syntax remains available when interpolation is actually intended:

```yaml
value: "The roll was ${_random.value}"
```

The binding rules are:

- A string equal to `_random` returns the complete result object.
- A string beginning with `_random.` resolves that path and returns its exact
  value.
- A missing path throws an explicit action-template error.
- `_random` is an engine-reserved context name. Caller-supplied event context
  must not define or replace it.
- `_random` is available only to actions that execute synchronously while
  processing that random action's nested action batch.
- Deferred batches do not capture `_random`. For example, confirm-dialog
  confirm/cancel actions and form submit/cancel actions run after the scope that
  created them. An author must store any needed result in a declared variable
  before opening the deferred interaction.
- A nested random action shadows `_random` only in its own nested action tree.
  Later sibling actions in the outer batch continue to see the outer result.
- Semantic conditions reference it through the existing variable-path form,
  for example `{ var: _random.value }`.
- A directly resolved value is terminal. A weighted result that happens to look
  like `${variables.value}`, `_event.value`, or another binding is returned as
  literal data and is not interpreted again.
- Directly returned arrays and objects are cloned before they enter mutable
  engine state.
- Within the active scope, the literal strings `_random` and `_random.*` are
  reserved bindings. There is no escape syntax for treating them as literal
  strings.

The direct-binding behavior is implemented as a generic scoped binding
mechanism shared with `_event`, rather than as unrelated parsing logic. Path
lookup must use own properties, reject `__proto__`, `prototype`, and
`constructor`, and deliberately support array indexes without exposing object
prototypes.

## Distributions

`distribution.type`, collection shape/order, weighted outcome values, and the
dice keep mode are static authored data. Only numeric fields may be numbers or
action-template strings: dice count/sides/modifier/keep count, integer min/max,
chance probability, and weights. Numeric templates are resolved immediately
before sampling, then the resolved values are validated strictly. Numeric
strings are not coerced.

The `distribution` wrapper is intentional. It keeps generator configuration
separate from control fields such as `actions` and leaves one discriminated
place for future distribution types.

### Dice

```yaml
distribution:
  type: dice
  count: 2
  sides: 20
  modifier: 3
  keep:
    type: highest
    count: 1
```

- `count` defaults to `1` and must be an integer from `1` through `100`.
- `sides` is required and must be an integer from `2` through `4294967296`
  (`2^32`).
- `modifier` defaults to `0` and must be a safe integer.
- `keep` is optional and has a static `type` of `highest` or `lowest` plus a
  `count` that resolves to an integer from `1` through the dice count.
- Without `keep`, every roll is kept.
- `value` is the sum of `keptRolls` plus `modifier`.
- `rolls` preserves generation order. `keptRolls` and `discardedRolls` also
  preserve their relative generation order.
- Equal dice are selected stably by generation order when only some equal dice
  can be kept.
- The minimum and maximum possible kept total plus modifier must both be safe
  integers. This is validated before any dice are sampled.

The count limit prevents an authored action from creating unbounded synchronous
work. The sides limit matches the engine's unsigned 32-bit random-source
contract and permits unbiased rejection sampling.

### Uniform integer

```yaml
distribution:
  type: integer
  min: 1
  max: 100
```

- `min` and `max` are required safe integers.
- `min` must be less than or equal to `max`.
- The inclusive range may contain at most `4294967296` (`2^32`) integers.
- Both endpoints are inclusive.
- Every representable integer in the range has equal probability.
- `value` is an integer.

### Chance

```yaml
distribution:
  type: chance
  probability: 0.25
```

- `probability` is required and must be a finite number from `0` through `1`.
- `0` always produces `false`; `1` always produces `true`.
- Other probabilities are quantized to the engine's `2^-53` unit-interval
  resolution.
- `value` is a boolean.

### Weighted selection

```yaml
distribution:
  type: weighted
  outcomes:
    - value: common
      weight: 70
    - value: rare
      weight: 25
    - value: legendary
      weight: 5
```

- `outcomes` is required and contains from `1` through `1000` entries.
- Outcome values are static, unique strings from `1` through `128` Unicode code
  points long.
- A weight must resolve to a finite number greater than or equal to `0`.
- At least one resolved weight must be greater than `0`.
- The resolved total weight must be finite.
- Selection is proportional to resolved weight within IEEE-754 precision and
  the engine's `2^-53` unit-interval resolution.
- Every positive normalized weight must be at least `2^-53`; smaller positive
  outcomes are rejected rather than silently becoming unreachable.
- Zero-weight outcomes cannot be selected.
- `_random.value` is the selected authored outcome value.

Static strings are used instead of arbitrary weighted values so conditions,
save data, debugging output, and future authoring tools have one predictable
representation. Branch actions may translate the selected value into any other
game value.

## Schema and Runtime Validation

The Draft-07 system-action schema defines `random.distribution` as a
discriminated `oneOf`; every distribution variant and nested object has
`additionalProperties: false`. `random.actions` recursively references the
system-action root and may be empty.

Static numeric literals receive their ordinary JSON Schema bounds. Numeric
template fields also accept strings at schema time, because their resolved type
is unavailable until execution. Runtime validation applies the full type,
integer, finite, range, total, and cross-field rules after template resolution;
the literal string `"10"` is not coerced to the number `10`.

`distribution.type`, dice keep type, weighted outcome count/order, and weighted
outcome values are schema-visible static fields and never action-templated.
Permissively shaped renderer event payloads and direct API payloads receive the
same runtime validation when each random action is reached, before that action
requests a random word. Nested actions and inactive conditional branches retain
their existing lazy validation behavior; they are not eagerly resolved merely
because they appear below `random.actions`.

The closed story action schema must explicitly expose `random` through the
system-action definition, just as it exposes `conditional`.

## Execution Semantics

Execution is ordered and synchronous:

1. Validate the static distribution shape.
2. Resolve only its numeric template fields.
3. Validate the fully resolved distribution and its worst-case bounds.
4. Draw exactly one result.
5. For a line-source action, record the resolved result on its rollback replay
   occurrence.
6. Process `actions` in insertion order with `_random` in scope.
7. Request one conditional-style automatic continuation after the entire outer
   action batch settles.

`random.actions` is an opaque/deferred template branch. It must not be rendered
before the result exists. Each nested action is templated immediately before it
executes, so it sees state mutations made by earlier nested actions as well as
the same `_random` snapshot.

The random action uses the existing conditional continuation rules:

- Nested conditional continuations coalesce with the random continuation, so
  the batch advances at most once.
- `sectionTransition` and `resetStoryAtSection` suppress the continuation.
- Any other action that changes the current story pointer also suppresses it.
- All sibling entries in the outer action object finish before continuation is
  attempted.
- Active choice and form authorization continues to apply.
- Hidden dialogue, auto mode, skip mode, and unseen-line behavior match the
  existing conditional action.

A line-authored random action that automatically continues is a transient
rollback source. A random action invoked later from an already-settled choice,
authorized form submit/cancel, click, or other interaction does not make that
source line transient.

The direct `handleAction("random", payload)` API follows the same transactional
and continuation path as an authored random action. Its return value remains
`undefined`; the result is intentionally scoped to its nested actions.

## Transactions and Failure

The random action and all nested actions participate in the existing outer
action-batch transaction.

- Invalid distribution input fails before drawing.
- If a nested action fails, no state mutation, navigation, pending effect,
  persistence write, or recorded random outcome from the batch commits.
- A later retry may draw a different result because the failed attempt had no
  committed gameplay outcome.
- Unknown or missing `_random` bindings fail fast instead of producing
  `undefined`.
- If `loadSlot`, rollback, `resetStoryAtSection`, or another state-replacing
  nested action succeeds, it intentionally replaces or discards the active
  context and its just-recorded occurrence under that action's existing
  semantics.

These guarantees cover failures during synchronous action execution and final
state validation. Queued effects are delivered only after commit; failures in
post-commit effect or persistence handlers follow their existing error/retry
contracts and cannot atomically restore external work.

## Random Source

Sampling uses an engine construction option named `randomSource`. It has one
method:

```js
const randomSource = {
  nextUint32() {
    // Return an integer from 0 through 4294967295.
  },
};
```

`nextUint32()` must synchronously return an integer in the inclusive unsigned
32-bit range. Any other result throws before an outcome commits. Tests and the
VT harness inject a deterministic implementation. Story data cannot choose the
source or provide a seed.

When omitted, the engine uses `crypto.getRandomValues` where available. A
documented `Math.random`-based adapter is the compatibility fallback; the
feature is not intended for security-sensitive decisions.

Integer and dice sampling must avoid modulo and rounding bias by using
unsigned-word rejection sampling. Chance and weighted selection combine two
unsigned words into the standard 53-bit unit interval `[0, 1)` and follow the
resolution/precision guarantees stated above.

One integer or die sample may reject at most `128` source words. Exhausting that
limit throws transactionally instead of allowing a pathological injected source
to hang the synchronous engine. The dice count limit therefore also bounds the
maximum random-source work for an action.

The specific generator algorithm is not part of authored content or save
compatibility. Save and rollback correctness is based on recording resolved
outcomes, not on reproducing a generator sequence.

## Save, Load, and Rollback

Authored line replay is nondeterministic unless the resolved result is retained.
Line-source outcomes therefore use a dedicated ordered `randomOutcomes` ledger
on the exact rollback replay occurrence. A record contains only:

- an internal structural action path and execution ordinal
- the distribution type
- the cloned resolved result

It never stores or executes an authored nested `actions` object from save data.
Canonical project actions remain the executable source.

During replay, the engine establishes a scoped replay context for the active
checkpoint or internal replay occurrence. When canonical replay reaches a
`random` action, it consumes the one outcome record matching that structural
path and ordinal, validates its type and result shape, installs `_random`, and
lazily replays the canonical nested actions at that exact authored position. It
does not consult `randomSource`. Recursive conditional and random replay receive
the same scoped context.

The guarantee is the same sampled result, not unconditionally the same branch.
Nested templates and conditions are re-evaluated under the engine's normal
rollback rules. In particular, device/account variables do not roll back, so a
condition that depends on them may select a different branch. When every other
input reconstructs deterministically, the same result produces the same branch.

Line-entry action batches reached through `jumpToLine` currently lack their own
rollback checkpoint. A line-entry batch containing `random` must receive an
internal, non-returnable replay occurrence so its outcome can be replayed in
order without turning that destination into a player-facing Back target. This
is a required rollback extension, not an exception that permits silent
rerolling.

Interaction-source random actions are handled differently because interaction
event trees are not replayed canonically. Their already-resolved rollbackable
descendant mutations continue to be captured by the existing chronological
`executedActions` mechanism. The transient random result itself is not
persisted unless the author stores it in a variable. Repeated clicks therefore
do not create an unbounded outcome-event log.

The required behavior is:

- Saving after a line-source random action persists its outcome ledger with the
  context rollback data.
- Loading that save does not sample while normalizing or reconstructing it.
- Rolling back through a tracked line occurrence reuses the recorded result.
- Rolling back to before that occurrence and then taking a new future executes
  the action genuinely and draws a new result.
- Loading a save made before the action and executing it draws a new result.
- Multiple visits to the same line are distinct replay occurrences.
- Nested random actions have distinct structural paths and retain their authored
  nesting and execution order.
- Interaction results survive rollback only through explicitly stored variables
  and the existing interaction-recordable mutation policy.

Each checkpoint or internal replay occurrence that records an outcome carries
`randomOutcomeVersion: 1`. Versioning is per occurrence rather than per timeline
so a player can load a legacy timeline and safely append new, outcome-aware
checkpoints. The global save-slot format does not need to change solely for
these optional fields.

When an occurrence has no version marker, it is legacy: random actions reached
during its historical replay are treated as absent rather than sampled. This
represents a playthrough created before random outcomes existed. Newly recorded
outcomes add the marker to their checkpoint or jump-created replay occurrence
without changing how older checkpoints replay.

Even in a versioned occurrence, a replayed structural path may have no outcome
because that path was not executed originally and a condition now selects a
different branch under normal rollback semantics. In that case the entire
newly reached random action is treated as historically absent; neither it nor
its nested actions run, and it never samples. A structurally valid record may
likewise remain unused and must not be consumed by another path.

Duplicate records and malformed result shapes are incompatible data and must
never trigger a fallback draw. Save normalization rejects them, and a direct
rollback encountering unexpected in-memory corruption fails transactionally
with an explicit compatibility error. Ordinary rollback availability selectors
remain history-based; they are not required to perform speculative replay of
lazy branches.

`updateProjectData` transactionally validates the format and uniqueness of
active-context and saved-slot outcome records against the proposed canonical
action trees. A record whose old structural path or distribution type no longer
exists is orphaned historical data: it may be dropped during normalization and
must never be rebound to another random action. A newly introduced or moved
random action has no historical result and follows the historically-absent rule
above. Loading externally supplied save data with duplicate or malformed
records reports the slot as incompatible and does not partially replace current
state.

The recorded representation is internal system state, although it remains
visible in debugging snapshots returned by `selectSystemState()`. It is not a
gameplay selector. It must be covered by the system-state schema, save
normalization and sanitation, clone safety, project replacement, abandoned
future truncation, and compatibility tests.

## Interaction and Presentation

`random` itself does not render anything. A visible roll is composed from
existing systems:

1. A choice or layout button dispatches `random`.
2. Nested actions optionally store `_random.value` in a declared variable.
3. Nested routing enters a line or layout that presents the result.

Choice dispatch uses the existing generated choice authorization. While a form
is active, a renderer event must not dispatch top-level `random` as a concurrent
form action. Random may run inside the authorized actions of a successful
`submitForm` or `cancelForm`, where the existing form authorization is carried
forward. The implementation must not add arbitrary random batches to the
shallow form-action whitelist.

Opening a form or confirm dialog from `random.actions` does not capture the
result for its later submit/confirm actions. Store the value first if those
deferred actions need it.

If the product later requires a built-in animated dice roller, that should be a
separate presentation/interaction feature. It may eventually dispatch this
same system action, but it should not change the sampling and replay contract.

## Authoring Tool Interface

An editor can expose the action without requiring authors to type internal
bindings:

```text
Random
  Method      [ Dice v ]

  Dice        [ 1 ] d [ 20 ]
  Modifier    [ Variable: lockpickBonus ]
  Keep        [ All v ]

  Insert result
    [ Value ] [ Individual rolls ]

  After rolling
    [ nested action builder ]
```

The editor may provide convenience controls that serialize to existing actions:

- "Store result in variable" generates an `updateVariable` entry whose value
  is `_random.value`.
- "Add outcome branch" generates a nested `conditional` action.
- Chance is displayed as a percentage for authors while serializing the
  `probability` value from `0` through `1`.

These are editor conveniences, not additional engine schema fields such as
`resultVariableId`, `storeAs`, or random-specific branches.

## Validation and Coverage Requirements

Implementation is not complete until it includes:

- Draft-07 discriminated `oneOf` system-action definitions for every
  distribution, with closed properties and a recursive `actions` reference
- system-action and project-data schema coverage separating statically invalid
  shapes from strings that are schema-valid templates but invalid after runtime
  resolution
- initial project validation and transactional `updateProjectData` rejection
  coverage for invalid random trees, plus retained/orphaned outcome
  reconciliation
- unit coverage for distribution boundaries, deterministic rejection-sampling
  sequences and exhaustion, random-source call counts and invalid outputs,
  keep/tie rules, weighted zeroes, invalid totals, and result shapes;
  frequency-based statistical assertions are not required
- action-template coverage for exact `_random`, nested paths, missing paths,
  typed values, terminal template-looking results, interpolated strings,
  laziness, nested shadowing, external `_random` injection, forbidden inherited
  paths, and deferred-scope expiration
- system coverage for action ordering, conditional composition, single
  continuation, navigation suppression, transaction rollback, and direct API
  dispatch
- action-pipeline inventory coverage classifying `random` as an engine-owned
  action alongside `conditional`
- save/load coverage with a source that throws if reconstruction attempts to
  sample, plus rollback coverage proving that re-entry after rolling back past
  the action does sample
- repeated-line, jump-entered, and nested-random occurrence coverage
- choice authorization, authorized form submit/cancel, blocked concurrent form
  dispatch, and scene-replay behavior coverage
- system-state schema, normalization, clone safety, malformed/forged outcome
  sanitation, mixed legacy/versioned occurrences, changed-branch missing
  outcomes, abandoned future, and incompatible save coverage
- browser- or VT-level reproduction of at least one actual choice/button input
  path that injects a deterministic source, dispatches random, branches, and
  renders the selected destination, including scenario registration and a
  passing VT report

Any visual test page must isolate the random interaction rather than combining
it with unrelated click, reveal, animation, or timing behavior.

## Expected Implementation Touch Points

The implementation affects:

- `src/schemas/systemActions.yaml`
- `src/schemas/projectData/story.yaml`
- `src/schemas/systemState/systemState.yaml`
- `src/RouteEngine.js`
- `src/util.js`
- rollback recording/replay and save normalization in
  `src/stores/system.store.js`
- public action documentation and closed action-inventory coverage
- targeted unit, integration, and browser/VT scenarios

No L10n schema or generated L10n payload-validator change is expected. Random
is a non-presentation action and its nested actions remain subject to their own
existing localization rules.
