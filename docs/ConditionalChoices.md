# Conditional Choices and Decision Rollback

Status: proposed design, reviewed against the current implementation on
2026-09-19. This document does not implement runtime changes. New authored fields
and internal APIs below are proposals unless explicitly described as current.

## Product contract

Each choice item may have a `when` condition. Matching regular items appear in
authored order. An item without `when` is an unconditional regular option.

A conditional choice list must have exactly one item with `fallback: true`.
The fallback has no `when` and appears only when no regular item qualifies.
It is a selectable option with authored behavior, not an automatic destination.
Multiple regular conditions may match; this is not first-match branching.

Back returns to the decision before its selection effects. Restore story state
first, then derive the visible options. Do not persist a separate visible-button
list as the source of truth.

## Authored example

This proposed choice has exactly one visible option in either state:

```yaml
choice:
  resourceId: doorChoices
  items:
    - id: unlock
      content: "Unlock the door"
      when:
        eq:
          - var: variables.hasKey
          - true
      events:
        click:
          actions:
            updateVariable:
              id: consumeKey
              operations:
                - variableId: hasKey
                  op: set
                  value: false
            sectionTransition:
              sectionId: inside

    - id: locked
      content: "The door is locked — walk away"
      fallback: true
      events:
        click:
          actions:
            sectionTransition:
              sectionId: outside
```

Declare `hasKey` as a boolean with `scope: context`. A layout that iterates over
`choice.items` receives the resolved visible list. It also needs to adopt the
selection path below; filtering alone does not provide item identity or a
rollback boundary.

## Validation and empty-list guarantee

A list uses the new contract when any item declares `when` or `fallback`.
For these lists:

- Require a nonempty `items` array, at least one regular item, exactly one
  fallback, and nonempty, unique item IDs.
- `fallback` may be omitted or be `true`; reject other values. A fallback cannot
  declare `when`, even `when: true`.
- Validate every condition with the existing semantic condition parser. String
  expressions are invalid. Detect `when` by property presence so `when: false`
  is not mistaken for an unconditional item.
- Require a supported click action payload on every selectable item, including
  the fallback. This guarantees an available selection, not a navigation action:
  authors can deliberately keep an interaction on the same line.
- Validate project initialization and project-data updates before acceptance,
  and dynamic/direct entry paths before mutation. YAML schema changes alone do
  not establish runtime validation.
- Report the scene, section, line, item ID/index, and invalid field where those
  locations are available. Failed updates preserve the previous project.

An unconditional regular option plus a fallback is valid, although that fallback
will not appear while the unconditional option exists.

Resolve regular items first. Return the matching regular items, or the fallback
alone if none match. Never silently skip the line, automatically select the
fallback, or invent a route.

Condition evaluation errors are errors, not false results. Do not conceal them
by displaying the fallback. An empty result after validation is an invariant
failure: report it and prevent progression.

This guarantee concerns resolved choice data. A malformed/custom layout can
still fail to draw a button; layout integration and browser coverage remain
necessary.

Existing lists without either new field retain their existing validation and
visibility behavior. Resource-only layouts, empty legacy lists, animation-only
choice continuation, and explicit choice clearing remain valid. Do not apply
the new item-count rule to those unrelated forms.

### Alternatives considered

Requiring an always-visible regular option prevents an empty list but cannot
express the requested mutually exclusive two-option case. The fallback can.

Proving that conditions cover every possible variable state is deferred.
Exhaustive checks work for small finite domains, but arbitrary numbers, strings,
computed values, and runtime dependencies need more analysis than sampling.
Coverage also does not prove exclusivity. A structural fallback guarantee avoids
requiring a condition solver.

## Evaluation and rendering

Reuse `evaluateRouteCondition` in [util.js](../src/util.js), including its strict
comparisons. Use current resolved `variables` (including computed values) and
the supported `runtime` context. There is no click event context when resolving
visibility. Conditions must not mutate state or sample random values.

Use one shared resolution rule for rendering, visibility selectors, active
interaction guards, and selection admission. Resolve after line-entry actions
settle and again after relevant state changes, rollback, and load. Keep authored
items intact; invalidate cached projections with their dependencies.

The presentation cache should retain authored definitions rather than cache a
filtered list under only a section/line key. Do not make frequent visibility
checks clone the full presentation state; existing clone-safety and bounded
lookup tests protect this property.

Expose only visible items to layout iteration. Use the filtered index for
positioning and the authored item ID for identity. Layouts that hardcode array
positions, fixed button counts, or their own destinations need review/migration.
Layout-level Back and menu controls are not item selections.

## Selection identity and admission

Current layouts dispatch arbitrary action payloads, and `tagBypassChoice` tags
clicks throughout the choice layout. Neither a filtered index nor this bypass
flag identifies a selected item.

Proposed integration: an engine-owned item-selection operation carries the item
ID and a token for the active decision occurrence/generation. Layouts dispatch
that operation; the engine looks up the canonical item's actions. Settle exact
API and template field names during implementation.

Before selection effects:

1. Check the token belongs to the active decision.
2. Resolve current visibility and check that the item is eligible.
3. Execute its authored actions in the existing action-batch transaction.
4. Record its rollbackable effects as outgoing decision effects.

Hidden/stale selections do nothing: no resource consumption or navigation.
Reject duplicate delivery of a consumed token. Issue a new generation after
rollback, load, or a completed interaction that keeps the decision open.
Repeated visits to a line are distinct occurrences; `(sectionId, lineId)` alone
is insufficient identity.

Do not reevaluate eligibility halfway through an accepted selection: consuming
the key may legitimately make its condition false. Validation, history updates,
and mutations must fail atomically if the action batch fails. Reuse existing
transactions and deferred effects instead of building a second transaction
system.

## Back and decision boundaries

### Current behavior requiring a deliberate change

`beginRollbackActionBatch` pins interaction records to the source checkpoint.
`recordRollbackAction` appends them to `executedActions`.
`restoreRollbackCheckpoint` replays line actions and recorded interactions
through the target checkpoint, inclusively.

Returning to a choice therefore keeps its click's variable changes. This is
explicitly asserted by [the system-state tests](../spec/RouteEngine.systemState.test.js)
and [the choice rollback VT](../vt/specs/rollback/choice-event.yaml).
The present checkpoint does not already mean “before choosing.”

### Proposed history model

Separate decision preparation from outgoing selections inside the existing
rollback journal. Establish the boundary when the choice line finishes entry
processing and becomes a playable decision, before player interactions.

```text
Earlier history → Choice entry/preparation | Selection effects → Later lines
                                          ↑
                              Back to this choice stops here
```

Prefer versioned decision metadata and an explicit outgoing interaction segment
on each checkpoint occurrence. Exact storage names are implementation details.
Do not create a second variable snapshot store or an extra visible Back step for
the selection itself.

- When reconstructing earlier checkpoints on the path to a later target, replay
  their preparation and committed outgoing effects.
- When the target is a decision, replay its preparation but exclude outgoing
  effects. Do not blanket-skip every target's `executedActions`: unrelated
  non-choice interactions and preparation records retain their defined behavior.
- Preserve earlier decisions' effects. Returning to decision B must not undo
  decision A on the retained path.
- Track all rollbackable changes after the preparation boundary, including
  same-line interactions; otherwise non-navigating clicks can leak changes into
  the restored decision state.
- On the first successful state-changing interaction after Back, truncate the
  abandoned outgoing segment and future checkpoints before appending replacement
  effects. Truncating only later checkpoints is insufficient. A failed batch
  leaves prior history and state intact.
- Back, menu reads, and rendering are not new selections. Preserve dialogue
  history truncation and the existing transient-line landing rules.

If an option stays on the same line, subsequent interactions belong after the
same preparation boundary. This proposal does not add a Back destination for
every click. After leaving and returning to that decision via Back, all its
outgoing context changes are undone.

Restore state before rendering or accepting input, then recompute options and
fallback. Keep existing behavior that stops auto/skip and clears the advance
timer. Reject stale input during restoration.

### Example acceptance behavior

1. Enter with `hasKey = true`; only `unlock` is visible.
2. Select it; `hasKey` becomes false and the story enters `inside`.
3. Back returns with `hasKey = true`; `unlock` appears again.
4. Selecting again consumes the key once, without duplicate outgoing history.
5. Go back farther, change an earlier decision so no key is acquired, and
   re-enter: only `locked` appears. Do not reuse an old visible-item list.

### Scope of the guarantee

Context-scoped story variables roll back. Computed values are derived again.
Persistent/global device/account variables, seen registries, achievements, and
external effects retain their existing non-rollback policies. Conditions using
those values, directly or through computed variables, can change after Back.
Do not promise identical options regardless of scope.

Line-entry randomness must reuse recorded occurrence outcomes during replay.
Choice-interaction randomness follows the existing interaction recording policy;
a newly committed selection is a new interaction. Changing decision boundaries
must not accidentally reroll line-entry randomness.

## Saves, localization, and compatibility

Persist decision metadata and outgoing records with a version discriminator.
Update serialization, sanitization, load normalization, and project-data
reconciliation together. Current normalization reconstructs checkpoints from
selected fields; adding runtime fields alone will not preserve them.
Malformed or unsupported versioned decision metadata must reject the load
atomically, rather than being dropped or reinterpreted as legacy history.

Load restores the saved point, including committed same-line interactions.
Loading is not implicitly Back. Retain the boundary for later rollback. Saves
issued inside a selection batch also need a defined cursor/phase: action
ordering allows persistence before terminal navigation. Test that explicitly.

Recommended legacy policy: unversioned checkpoints retain existing replay
semantics. They lack reliable selection/boundary provenance; do not guess or
retroactively remove effects. Fresh decision occurrences use the new format.
Old historical choices therefore do not automatically gain the new Back
guarantee; release notes must explain that limit.

Localization must preserve item order, IDs, events, `when`, and `fallback`.
Extend `projectChoiceBehavior` in [l10n.js](../src/l10n.js), its diagnostics, and
generated localization validators. Text and compatible layouts may be translated;
visibility and destinations remain canonical.

Unconditional item-based choices can adopt the same selection/boundary mechanism.
Do not infer item selection for arbitrary legacy clicks. Document which layouts
adopt the new operation and which retain legacy behavior.

## Implementation sequence and affected areas

1. Implement versioned decision history, restoration, save/load handling, and
   branch replacement without changing unrelated rollback behavior.
2. Add the selection operation and layout integration, including stale/duplicate
   input checks. This supplies the provenance required by step 1.
3. Add `when`/`fallback` schema fields, semantic project validation, and shared
   item resolution. Connect rendering, selectors, and admission together.
4. Update localization protection, generated validators, authoring examples,
   rollback documentation, and compatibility notes.
5. Pass state-transition and visual/input checks before release.

Steps 1 and 2 form one prerequisite milestone. Do not ship filtering alone while
selection provenance and rollback semantics remain incomplete.

Primary code areas:

- [presentationActions.yaml](../src/schemas/presentationActions.yaml): item schema.
- [util.js](../src/util.js): reuse condition parsing/evaluation.
- [RouteEngine.js](../src/RouteEngine.js): validation, selection admission,
  transactional action dispatch, settled line-entry timing.
- [system.store.js](../src/stores/system.store.js): resolution, active decisions,
  replay boundaries, branch truncation, save/load reconciliation.
- [constructRenderState.js](../src/stores/constructRenderState.js) and
  [createEffectsHandler.js](../src/createEffectsHandler.js): visible items,
  selection identity, renderer input routing.
- [l10n.js](../src/l10n.js) and
  [the validator generator](../scripts/generate-l10n-payload-validators.js):
  protected behavior and generated payload validators.

## Required implementation verification

| Area          | Required cases                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation    | Missing/duplicate fallback; fallback with `when`; false/malformed conditions; duplicate/missing IDs; invalid click payload; atomic update rejection                        |
| Resolution    | True/false; unconditional items; multiple matches; two-option case; fallback alone; computed values; live changes; no authored-data mutation                               |
| Compatibility | Legacy items; resource-only/empty layouts; animation-only continuation; clearing; clone-safety and bounded lookup                                                          |
| Input         | Hidden/stale item; double click; old render after Back/load; stable IDs; Back/menu controls; atomic failure                                                                |
| Rollback      | Key consumption; repeated select/Back; alternate branch; earlier choices retained; same-line interactions; repeated line visits; section transitions and transient routing |
| Persistence   | Save before/after selection; inside selection batch; after Back before reselection; same-line save; new metadata round trip; malformed versioned metadata; legacy policy   |
| Other state   | Context/persistent dependencies; computed dependencies; line/interaction randomness; auto/skip/timers stop on Back                                                         |
| Localization  | Conditions/fallback/order/IDs/events protected; translated text; no stale buttons after package switch                                                                     |

Add focused unit/system coverage and isolated VT or browser cases for the actual
input path. Start each visual fixture with one simple layout and one condition.
Verify the visible button, destination, restored variable, and restored option
after Back. Repeat for fallback and alternate branch. A screenshot alone cannot
establish click safety.

## Design review findings

Review method: local source and existing test inspection. This is a design
review, not a claim that the proposed behavior has been implemented or tested.

| Finding                                                                         | Design disposition                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Filtering alone leaves guards and click admission unaware of item eligibility.  | Shared resolution and item-selection admission.                       |
| Current rollback deliberately retains source click effects.                     | Versioned preparation/outgoing boundary; intentional behavior change. |
| Removing all target `executedActions` can erase unrelated interactions.         | Preserve provenance; avoid a blanket replay omission.                 |
| Truncating future checkpoints leaves the source selection recorded.             | Replace outgoing effects on successful recommit.                      |
| Existing clicks identify neither item nor decision occurrence.                  | Selection operation/token and explicit layout migration.              |
| Save normalization can discard fields; legacy records cannot reliably be split. | Versioned persistence and explicit legacy policy.                     |
| Nonempty data does not guarantee a custom layout draws it.                      | Scope the guarantee; require visual/input coverage.                   |
| Persistent dependencies may change options after Back.                          | Document scope rather than save a contradictory button snapshot.      |

The design is coherent with these constraints. Before implementation, finalize
public selection/template names, versioned journal and saved-cursor representation,
and release/migration policy for legacy layouts and historical saves. These are
integration decisions, not reasons to weaken fallback or before-selection rollback.
