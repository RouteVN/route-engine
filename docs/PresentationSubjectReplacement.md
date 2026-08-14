# Presentation Subject Replacement Semantics

Status: proposed behavior. This document is for review and does not describe
the behavior currently implemented by Route Engine.

## Decision Summary

Presentation actions distinguish continuity from replacement by whether they
explicitly author a render subject:

- omitting a subject continues the current presentation instance
- authoring only non-subject fields patches the current instance
- explicitly authoring a subject creates or reapplies an instance from only the
  fields in that action
- subject equality is irrelevant; explicitly reauthoring the same resource or
  content still resets every omitted instance field
- explicitly authored fields on the replacement are applied normally

This rule applies consistently to backgrounds, character items, and visual
items.

Replacement resets all omitted state owned by that background, character item,
or visual item. This includes appearance, placement, layer, backing color,
resource playback overrides, and animation selection. The subject and fields
explicitly present in the replacement action are the complete new instance.

This proposal does not reset other presentation channels or screen-level
state, and it does not redefine the existing collection and removal rules for
other item IDs.

## Why

An authored resource is an instruction to present an instance, not merely a
statement about which asset ID happens to be current. Reauthoring the same
resource can intentionally replay an entrance, restore its defaults, or start
a new presentation of the asset.

Comparing the next subject with the previous subject makes intent depend on
value equality:

```yaml
# These would behave differently if equality controlled replacement.
background:
  resourceId: forest

background:
  resourceId: street
```

That is difficult to explain and prevents an author from reapplying `forest`
as a fresh instance. Presence provides a simpler contract:

> Omission means continuity. Explicit subject authoring means replacement.

It also prevents state chosen for one instance from leaking accidentally onto
the next instance. Brightness, contrast, saturation, blur, placement, layer,
backing color, playback overrides, and animations can all be specific to one
presentation of a subject.

If a project needs settings across several subjects, it should author those
settings on each replacement. A future whole-screen filter facility may
provide a separate persistent scope for global scene grading; that facility is
outside this proposal.

## Authoring Contract

Subject-bearing actions are complete declarations of the desired presentation
instance. Authors and authoring tools must include every non-default setting
the instance needs. An omitted optional field intentionally selects its normal
default; it is not a request to recover that field from the previous instance.

An intentional patch must omit the subject-bearing field. For example, a
background action without `resourceId` may adjust the active background, while
a background action with `resourceId` fully declares a new or reapplied
background instance.

The engine must not compensate for incomplete subject-bearing actions by
merging previous state. That would make a syntactically complete action depend
on execution history and recreate the ambiguity this proposal removes.

## Terminology

### Presentation instance

The active background, character item, or visual item stored in presentation
state.

Character and visual item `id` values identify persistent item slots so later
actions can find an existing item. Reusing an item ID does not by itself imply
that any state from its previous instance must be inherited. The `id` remains
on a replacement because the replacement action explicitly authors it as the
item lookup key.

### Subject

The content rendered by a presentation instance:

| Target                      | Subject-bearing authoring                                           |
| --------------------------- | ------------------------------------------------------------------- |
| Background                  | `resourceId`                                                        |
| Character item              | a non-empty `sprites` array                                         |
| Resource-backed visual item | `resourceId`                                                        |
| Inline-layout visual item   | a complete `layout` value                                           |
| Text visual item            | a complete `text` value containing both `content` and `textStyleId` |

A partial text patch containing only `content` or only `textStyleId` is not a
complete subject. It continues the existing text visual and therefore
preserves other omitted instance fields.

Changing a visual between `resourceId`, `layout`, and `text` forms is always a
subject replacement.

### Instance-owned state

All fields stored on the active target belong to its presentation instance:

| Target         | Instance-owned state                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Background     | `resourceId`, `colorId`, transform fields, `alpha`/`opacity`, `blur`, `filters`, resource playback overrides, and `animations`         |
| Character item | `id`, `sprites`, transform fields, `alpha`/`opacity`, `blur`, `filters`, and `animations`                                              |
| Visual item    | `id`, its subject form, transform fields, `layer`, `alpha`/`opacity`, `blur`, `filters`, resource playback overrides, and `animations` |

On replacement, Route Engine retains none of these fields from the previous
instance. Fields explicitly authored beside the new subject form the new
instance. Defaults for omitted fields are resolved through the existing
resource and renderer defaults.

Route Engine does not model brightness, contrast, or saturation as dedicated
action fields. Those values are renderer shader-filter parameters and reset
with the containing `filters` array.

## Normative Rules

For each target, Route Engine determines whether the current action explicitly
authors a subject. It must not compare that subject with the previous subject.

Conceptually:

```text
if action explicitly authors a subject:
    next instance = normalized explicitly authored action only
else:
    next instance = previous instance patched by authored fields
```

### Omitted action

When a line omits a presentation channel entirely, the existing channel state
continues according to its current persistence rules.

```yaml
- background:
    resourceId: forest
    blur: { x: 6, y: 6 }
- dialogue:
    mode: adv
    content:
      - text: The forest remains blurred.
```

### Continuation patch

An action without a subject patches the current instance. All omitted instance
fields are inherited according to the existing patch rules.

```yaml
- background:
    resourceId: forest
    filters:
      - id: grade
        type: shader
        parameters:
          saturation: 0.5
- background:
    blur: { x: 3, y: 3 }
```

The second action keeps `forest` and its `filters`, then adds or replaces
`blur`.

### Subject replacement

An explicit subject starts a fresh instance, whether the subject value is new
or identical to the current value.

```yaml
- background:
    resourceId: forest
    alpha: 0.6
    blur: { x: 6, y: 6 }
- background:
    resourceId: forest
```

The second action produces a background state containing only
`resourceId: forest`. Alpha, blur, filters, transform, backing color, playback
overrides, and animations all use their defaults because none were authored on
the replacement.

The same rule applies to a character composition:

```yaml
- character:
    items:
      - id: alice
        transformId: center
        sprites:
          - id: body
            resourceId: alice-happy
            animationSpeed: 0.5
        x: 900
        blur: { x: 6, y: 6 }
- character:
    items:
      - id: alice
        transformId: center
        sprites:
          - id: body
            resourceId: alice-happy
```

The second `alice` item contains only its explicitly authored `id`,
`transformId`, and `sprites`. It does not inherit `x`, the sprite playback
override, blur, filters, opacity, or animations even though its item ID and
sprite resource are identical. Character `sprites` currently require an
explicit `transformId`, so that authored placement remains on the replacement.

It also applies to a resource-backed visual:

```yaml
- visual:
    items:
      - id: fog
        resourceId: fog-heavy
        transformId: fullscreen
        layer: 70
        animationSpeed: 0.5
        filters:
          - id: desaturate
            type: shader
- visual:
    items:
      - id: fog
        resourceId: fog-heavy
```

The second `fog` item contains only `id` and `resourceId`. It does not inherit
the transform, layer, resource playback override, filter, opacity, blur, or
animations. Its layer and placement therefore resolve from their defaults.

### Replacement with explicit state

Explicit fields apply to the new instance:

```yaml
background:
  resourceId: street
  transformId: fullscreen
  alpha: 0.8
  filters:
    - id: night-grade
      type: shader
```

This produces `street` with the authored transform, alpha, and filter. Every
other field uses its default.

### Explicit clearing remains valid

Existing clear forms remain useful for continuation patches:

- `alpha: 1` resets alpha
- `blur: null` clears blur
- `filters: []` clears filters

A subject replacement does not need to emit clear or default values merely to
avoid inheritance. Absence on a replacement already means the field is absent
from the new instance and its normal default applies.

## Behavior Matrix

| Authored action                           | Subject replacement | Inherit any omitted instance state |
| ----------------------------------------- | ------------------: | ---------------------------------: |
| Channel omitted                           |                  No |                                Yes |
| Background patch without `resourceId`     |                  No |                                Yes |
| Background with any defined `resourceId`  |                 Yes |                                 No |
| Character item patch without `sprites`    |                  No |                                Yes |
| Character item with non-empty `sprites`   |                 Yes |                                 No |
| Visual item patch without a full subject  |                  No |                                Yes |
| Visual item with any defined `resourceId` |                 Yes |                                 No |
| Visual item with complete `layout`        |                 Yes |                                 No |
| Visual item with complete `text`          |                 Yes |                                 No |
| Visual item with partial `text` patch     |                  No |                                Yes |

“Any defined `resourceId`” includes the same string already present in state.
The engine checks authored presence, not equality.

## Current Behavior

The current presentation-state reducer applies a mixture of replacement and
persistence rules when subject content is explicitly supplied.

For backgrounds, the reducer can copy previous `colorId`, inline transform
overrides, opacity, blur, filters, and a compatible persistent animation when
the next action omits those fields. Several of those copies are not conditional
on whether the action contains `resourceId`, while other fields such as
`transformId` and resource playback overrides already reset in some
replacement paths.

For character and visual items, transform and appearance persistence helpers
run after item processing and can copy fields from the previous item with the
same `id`. Compatible persistent animations can also be restored. These steps
are not consistently conditional on whether the item supplied a new or
reasserted subject. Other fields, including visual `layer`, may already reset.

As a result, this sequence currently transfers the first background's
appearance to the second:

```yaml
- background:
    resourceId: forest
    blur: { x: 6, y: 6 }
- background:
    resourceId: street
```

The implemented result is `street` with the previous blur. The proposed result
is a new instance containing only `resourceId: street`.

## Implementation Direction

The implementation should introduce one shared concept of explicit subject
authoring rather than adding resource-equality branches to each reducer.

1. Detect background, character-item, and visual-item subject authoring using
   the table above.
2. For a subject replacement, construct the next instance solely from the
   normalized authored action.
3. Do not run previous-state merge, transform persistence, appearance
   persistence, playback persistence, or persistent-animation restoration for
   that instance.
4. For a continuation patch, retain the existing field-specific patch and
   persistence behavior.
5. Continue normalizing explicitly authored `alpha` to the internal legacy
   `opacity` representation.
6. Update the public action documentation and schema descriptions in the same
   implementation PR.

Renderer changes should not be necessary. The render state already consumes
the resolved presentation state; the behavioral change belongs at the point
where presentation actions are merged.

Do not add equality checks or infer replacement from changed values. Do not add
an inheritance flag in the first implementation. Authors who intentionally
want state on a replacement can state that state explicitly.

## Verification Requirements

The implementation is complete only when both state transitions and rendered
output are covered.

### Targeted state coverage

Add system or unit cases for background, character, and visual targets proving:

1. an omitted channel preserves existing instance state
2. a continuation patch preserves the subject and every unmentioned field
3. reauthoring the same subject resets every omitted instance field
4. authoring a different subject resets every omitted instance field
5. replacement with explicit instance fields uses only the explicit values
6. `blur: null` and `filters: []` still clear appearance on patches
7. a partial visual-text patch preserves other instance state
8. a complete visual-text or inline-layout subject resets other instance state
9. screen state and unrelated item IDs are unaffected

Each target must cover representative appearance, transform, playback, and
animation fields. Visual coverage must also include `layer`, and background
coverage must include `colorId`. At least one case per target must cover a
filter with brightness, contrast, or saturation parameters so the test
protects the entire opaque filter object, not only blur.

### Render and VT coverage

Validate the actual visual path with isolated background, character, and visual
VT scenarios. Each scenario should show:

1. a subject rendered with unmistakable non-default appearance and placement
2. a continuation patch retaining the unmentioned instance state
3. an explicit reassertion rendering with default appearance, placement, and
   layer where applicable

Keep the three targets isolated rather than combining them on one page. This
makes a failure attributable to one state transition and follows the VT
isolation requirements in `docs/vt-guidelines.md`.

The implementation PR must run the targeted automated tests and generate or
compare the relevant VT screenshots before the change is handed back for
review.

## Compatibility and Rollout

This is an intentional behavior change. Existing projects may repeat a subject
while relying on any inherited instance field, including transform, layer,
backing color, playback, animation, opacity, blur, or filters. Those actions
will render differently under the proposed semantics.

The affected persistence behavior is not limited to the latest release:

| Existing behavior                                                     | Present since |
| --------------------------------------------------------------------- | ------------- |
| Background `colorId` persists across resource updates                 | v1.15.0       |
| Background opacity and blur persist across updates                    | v1.16.0       |
| Character and visual opacity and blur persist by item ID              | v1.19.0       |
| Character and visual transform overrides persist by item ID           | v1.20.0       |
| Inline background transform overrides persist                         | v1.22.0       |
| Full text-visual updates preserve placement and appearance            | v1.23.0       |
| Persistent character and visual animations survive compatible updates | v1.39.1       |
| Background, character, and visual filters persist                     | v1.42.0       |

Presentation subject merging is materially the same in v1.42.0, v1.43.0, and
v1.45.0. A project upgrading from any of those recent versions can therefore
observe the proposed change.

The break is silent rather than structural: existing YAML remains valid, but a
subject-bearing action that relies on omitted instance fields renders
differently. Actions that omit the subject for continuation, and replacements
that explicitly author every required setting, are unaffected.

The supported authoring contract expects complete subject-bearing actions, so
the practical risk for conforming projects is low. The migration risk is
concentrated in hand-authored content and older or third-party tools that used
subject-bearing actions as partial patches.

Route Engine currently has no project-level presentation-semantics version from
which to select old versus new merging behavior. The implementation therefore
needs an explicit release decision. Under the complete-action authoring
contract, this proposal treats the change as a feature release, bumps Route
Engine to v1.46.0, and documents the migration risk for partial subject-bearing
actions.

There is no universal authored clear form for every instance field, so having
authoring tools emit `alpha: 1`, `blur: null`, and `filters: []` cannot fully
reproduce fresh-instance behavior. A compatibility mode would first require a
versioned project or engine option and is not proposed here.

For an engine-level rollout, migration tooling should identify subject-bearing
actions that omit instance fields after prior state was established for the
same channel or item ID. Authors who intended inheritance can copy the intended
fields onto the replacement action. Authors who intended a fresh instance need
no additional fields after migration.

## Out of Scope

- changing screen-level opacity or blur persistence
- adding screen-level shader filters
- changing renderer or resource default values
- changing continuation-patch inheritance
- adding per-sprite-part character appearance
- comparing previous and next resource values
- changing item removal or array replacement behavior
