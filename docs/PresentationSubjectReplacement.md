# Presentation Subject Replacement Semantics

Status: proposed behavior. This document is for review and does not describe
the behavior currently implemented by Route Engine.

## Decision Summary

Presentation actions distinguish continuity from replacement by whether they
explicitly author a render subject:

- omitting a subject continues the current presentation instance
- authoring only appearance fields patches the current instance
- explicitly authoring a subject creates or reapplies an instance with fresh
  appearance defaults
- subject equality is irrelevant; explicitly reauthoring the same resource or
  content still resets omitted appearance
- explicitly authored appearance on the replacement is applied normally

This rule applies consistently to backgrounds, character items, and visual
items.

The appearance fields covered by this proposal are:

- `alpha` and its legacy `opacity` alias
- `blur`
- `filters`, including filters whose parameters implement brightness,
  contrast, saturation, or other image adjustments

This proposal does not change transform, layer, backing color, resource
playback, animation, item-removal, or item-ordering semantics.

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
with its default appearance. Presence provides a simpler contract:

> Omission means continuity. Explicit subject authoring means replacement.

It also prevents adjustments chosen for one image from leaking accidentally
onto the next image. Brightness, contrast, saturation, and blur are commonly
tuned against the pixels of a particular asset and should not become implicit
global scene effects.

If a project needs one grade across several subjects, it should author that
grade on each replacement. A future whole-screen filter facility may provide a
separate persistent scope for global scene grading; that facility is outside
this proposal.

## Terminology

### Presentation instance

The active background, character item, or visual item stored in presentation
state.

Character and visual item `id` values identify persistent item slots so later
actions can find an existing item. Reusing an item ID does not by itself imply
that its subject or appearance must be inherited.

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
preserves omitted appearance.

Changing a visual between `resourceId`, `layout`, and `text` forms is always a
subject replacement.

### Appearance

The instance-owned `alpha`/`opacity`, `blur`, and `filters` fields. Route Engine
does not model brightness, contrast, or saturation as dedicated action fields;
those values are renderer shader-filter parameters and inherit or reset with
the containing `filters` array.

### Placement

Transform fields, `transformId`, inline `transform`, and visual `layer` are not
appearance for purposes of this proposal. Their existing merge and replacement
rules remain unchanged.

## Normative Rules

For each target, Route Engine determines whether the current action explicitly
authors a subject. It must not compare that subject with the previous subject.

Conceptually:

```text
if action explicitly authors a subject:
    next appearance = explicitly authored appearance only
else:
    next appearance = previous appearance patched by authored appearance
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

### Appearance-only patch

An action without a subject patches the current instance. Omitted appearance
fields are inherited.

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

An explicit subject starts with default appearance, whether the subject value
is new or identical to the current value.

```yaml
- background:
    resourceId: forest
    alpha: 0.6
    blur: { x: 6, y: 6 }
- background:
    resourceId: forest
```

The second action produces `forest` at alpha `1`, without blur or filters.

The same rule applies to a character composition:

```yaml
- character:
    items:
      - id: alice
        transformId: center
        sprites:
          - id: body
            resourceId: alice-happy
        blur: { x: 6, y: 6 }
- character:
    items:
      - id: alice
        transformId: center
        sprites:
          - id: body
            resourceId: alice-happy
```

The second `alice` item has fresh appearance even though its item ID and sprite
composition are identical.

It also applies to a resource-backed visual:

```yaml
- visual:
    items:
      - id: fog
        resourceId: fog-heavy
        transformId: fullscreen
        filters:
          - id: desaturate
            type: shader
- visual:
    items:
      - id: fog
        resourceId: fog-heavy
        transformId: fullscreen
```

The second `fog` item does not inherit the filter.

### Replacement with explicit appearance

Replacement resets only omitted appearance. Explicit fields apply to the new
instance:

```yaml
background:
  resourceId: street
  alpha: 0.8
  filters:
    - id: night-grade
      type: shader
```

This produces `street` with alpha `0.8`, the authored filter, and no blur.

### Explicit clearing remains valid

Existing clear forms remain useful for appearance-only patches:

- `alpha: 1` resets alpha
- `blur: null` clears blur
- `filters: []` clears filters

A subject replacement does not need to emit these values merely to avoid
inheritance. Absence on a replacement already means the default appearance.

## Behavior Matrix

| Authored action                           | Subject replacement | Inherit omitted appearance |
| ----------------------------------------- | ------------------: | -------------------------: |
| Channel omitted                           |                  No |                        Yes |
| Background appearance only                |                  No |                        Yes |
| Background with any defined `resourceId`  |                 Yes |                         No |
| Character item appearance/transform only  |                  No |                        Yes |
| Character item with non-empty `sprites`   |                 Yes |                         No |
| Visual item appearance/transform only     |                  No |                        Yes |
| Visual item with any defined `resourceId` |                 Yes |                         No |
| Visual item with complete `layout`        |                 Yes |                         No |
| Visual item with complete `text`          |                 Yes |                         No |
| Visual item with partial `text` patch     |                  No |                        Yes |

“Any defined `resourceId`” includes the same string already present in state.
The engine checks authored presence, not equality.

## Current Behavior

The current presentation-state reducer treats appearance as persistent item or
channel state even when subject content is explicitly supplied.

For backgrounds, the reducer copies previous opacity, blur, and filters when
the next action omits those fields. Those copies are not conditional on whether
the action contains `resourceId`.

For character and visual items, `applyPersistentItemAppearance` runs after item
processing and copies appearance from the previous item with the same `id`.
That call is likewise not conditional on whether the item supplied a new or
reasserted subject.

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
is `street` with default appearance.

## Implementation Direction

The implementation should introduce one shared concept of explicit subject
authoring rather than adding resource-equality branches to each reducer.

1. Detect background, character-item, and visual-item subject authoring using
   the table above.
2. Pass the result into appearance merging.
3. Skip previous-appearance inheritance for a subject replacement.
4. Continue normalizing explicitly authored `alpha` to the internal legacy
   `opacity` representation.
5. Leave placement, layer, backing color, playback, animation, removal, and
   ordering logic unchanged.
6. Update the public action documentation and schema descriptions in the same
   implementation PR.

Renderer changes should not be necessary. The render state already consumes
the resolved presentation state; the behavioral change belongs at the point
where presentation actions are merged.

Do not add equality checks or infer replacement from changed values. Do not add
an inheritance flag in the first implementation. Authors who intentionally
want an appearance on a replacement can state that appearance explicitly.

## Verification Requirements

The implementation is complete only when both state transitions and rendered
output are covered.

### Targeted state coverage

Add system or unit cases for background, character, and visual targets proving:

1. an omitted channel preserves existing appearance
2. an appearance-only patch preserves the subject and other appearance
3. reauthoring the same subject resets omitted appearance
4. authoring a different subject resets omitted appearance
5. replacement with explicit appearance uses the explicit values
6. `blur: null` and `filters: []` still clear appearance on patches
7. a partial visual-text patch preserves appearance
8. a complete visual-text or inline-layout subject resets appearance

At least one case per target must cover a filter with brightness, contrast, or
saturation parameters so the test protects the entire opaque filter object,
not only blur.

### Render and VT coverage

Validate the actual visual path with isolated background, character, and visual
VT scenarios. Each scenario should show:

1. a subject rendered with an unmistakable appearance adjustment
2. an appearance-only patch retaining that adjustment
3. an explicit reassertion rendering with default appearance

Keep the three targets isolated rather than combining them on one page. This
makes a failure attributable to one state transition and follows the VT
isolation requirements in `docs/vt-guidelines.md`.

The implementation PR must run the targeted automated tests and generate or
compare the relevant VT screenshots before the change is handed back for
review.

## Compatibility and Rollout

This is an intentional behavior change. Existing projects may repeat a subject
while relying on inherited opacity, blur, or filters. Those actions will render
differently under the proposed semantics.

Route Engine currently has no project-level presentation-semantics version from
which to select old versus new merging behavior. The implementation therefore
needs an explicit release decision:

- ship the change in a breaking release and document the migration; or
- keep the engine behavior temporarily and have authoring tools emit explicit
  clear values on subject replacement

For an engine-level rollout, migration tooling should identify subject-bearing
actions that omit appearance after a prior appearance was established for the
same channel or item ID. Authors who intended inheritance can copy the intended
appearance onto the replacement action. Authors who intended fresh appearance
need no additional fields after migration.

This proposal recommends adopting the engine-level rule in a breaking release.
Tool-emitted clears are an acceptable short-term bridge but leave hand-authored
projects and other tooling with different semantics.

## Out of Scope

- changing screen-level opacity or blur persistence
- adding screen-level shader filters
- changing transform or layer inheritance
- changing background `colorId` persistence
- changing spritesheet or video playback defaults
- changing persistent animation continuity
- adding per-sprite-part character appearance
- comparing previous and next resource values
- changing item removal or array replacement behavior
