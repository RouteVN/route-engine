# Image Gallery Feature Plan

Status: proposed. No image-gallery runtime exists yet.

All authored and runtime interfaces are JSON-serializable. Examples use YAML
for readability.

## Design Goal

The common case should require only an ordered list of image IDs:

```yaml
imageGallery:
  items:
    - id: sunset
      imageId: cgSunset
    - id: festival
      imageId: cgFestival
```

Everything visual remains layout-authored. An author can completely redesign
the grid, cards, locked state, full-image viewer, buttons, labels, spacing,
scrolling, hover behavior, and responsive composition without changing the
gallery data or Route Engine.

The engine interface stays deliberately small:

- one layout capability: `imageGallery.items`
- one read-only template root: `imageGallery`
- two gallery actions
- one transient selected-item state
- no gallery resource collection
- no gallery-specific Route Graphics node

## Decision Summary

Do not add `resources.imageGalleries`.

Follow the save-slot architecture:

1. Route Engine owns unlock-aware data, selection, and action guards.
2. An ordinary layout consumes an engine projection.
3. Creator provides convenient data-bound editor elements.
4. Creator compiles those elements to generic layout JSON.
5. Route Graphics renders only generic containers, sprites, text, and input.

Gallery definition is capability data on the layout that displays it:

```yaml
resources:
  layouts:
    cgGallery:
      layoutType: image-gallery
      imageGallery:
        items: []
      elements: []
```

`layoutType` is Creator metadata. `imageGallery` is the small capability
contract Route Engine validates. Neither becomes a Route Graphics type.

## Why This Matches Save/Load

The current save/load implementation has:

- `layoutType: save-load`
- an engine-provided `saveSlots` template root
- creator-only slot reference elements
- compiler lowering to generic repeated containers, sprites, and text
- engine actions that validate slot behavior

Gallery mirrors it:

| Save/load                      | Image gallery                          |
| ------------------------------ | -------------------------------------- |
| ordinary save/load layout      | ordinary image-gallery layout          |
| `saveSlots` projection         | `imageGallery.items` projection        |
| repeated slot editor container | repeated gallery-item editor container |
| slot image/date references     | thumbnail/image/text references        |
| save/load actions              | select/next/previous actions           |
| generic compiled render nodes  | generic compiled render nodes          |

There is one necessary difference: save slots come from runtime persistence,
while gallery membership is authored project data. Keeping that small ordered
list on the layout avoids inventing a second resource collection.

## Research Applied

Ren'Py separates gallery availability/navigation from the screen that presents
it. Its screen remains author-controlled. See
[Ren'Py Image Gallery](https://www.renpy.org/doc/html/rooms.html#image-gallery).

Ren'Py persistent data and Naninovel unlockables keep extras progress outside
individual saves. See
[Ren'Py Persistent Data](https://www.renpy.org/doc/html/persistent.html) and
[Naninovel Unlockables](https://naninovel.com/guide/unlockables).

Route Engine therefore keeps gallery unlocks account-scoped while keeping the
active viewer selection transient.

## V1 Scope

### Included

- any number of gallery layouts
- an ordered list of images per layout
- optional thumbnail, title, description, and alt text
- always-unlocked or shared-unlockable entries
- locked and unlocked item projections
- a fully authored grid/list
- a fully authored selected-image viewer
- next and previous navigation across unlocked entries
- generic scrollable containers for large galleries
- opening through existing overlay actions
- account progress independent of slots and rollback
- localization of gallery item text and image resources

### Deferred

- multiple images/slides inside one entry
- gallery-specific layered image composition
- gallery-specific pagination
- slideshow timers
- wrap/shuffle navigation policy
- gallery-specific transition configuration
- video entries
- zoom/pan gestures
- remote content packs
- user-created screenshots

These are intentionally deferred. V1 should not grow a controller configuration
language to anticipate them.

If later required:

- pagination should be a generic repeated-collection capability
- slideshow should be a generic timer/pager capability
- composite content should use a generic displayable/layout reference
- visual transitions should use ordinary layout/renderer animation primitives

## Minimal Authored Contract

```yaml
resources:
  layouts:
    cgGallery:
      layoutType: image-gallery
      imageGallery:
        items:
          - id: sunset
            imageId: cgSunset
            thumbnailImageId: cgSunsetThumbnail
            title: Sunset
            description: The final evening by the sea.
            alt: Two characters standing against a sunset.
            unlockableId: cg.sunset
          - id: titleArt
            imageId: titleArt
      elements: []
```

### Required Fields

| Field                | Required | Meaning                              |
| -------------------- | -------- | ------------------------------------ |
| `imageGallery.items` | Yes      | Ordered, non-empty array             |
| item `id`            | Yes      | Stable and unique within this layout |
| item `imageId`       | Yes      | Existing `resources.images` entry    |

### Optional Item Fields

| Field              | Default   | Meaning                                       |
| ------------------ | --------- | --------------------------------------------- |
| `thumbnailImageId` | see below | Explicit public thumbnail used by the grid    |
| `title`            | `""`      | Localizable display title                     |
| `description`      | `""`      | Localizable display description               |
| `alt`              | `""`      | Localizable description of the full image     |
| `unlockableId`     | omitted   | Shared account unlock; omitted means unlocked |

That is the complete v1 definition. Navigation order is array order.

Thumbnail fallback is intentionally unlock-aware:

- an explicit `thumbnailImageId` is public gallery presentation and is
  projected for locked and unlocked items
- when omitted, an unlocked item falls back to its `imageId`
- when omitted, a locked item receives `thumbnailImageId: null`

This avoids exposing the full image by accident while allowing an author to
provide a silhouette, crop, blurred preview, or other custom locked thumbnail.

There is deliberately no authored:

- gallery ID separate from the layout resource ID
- viewer layout ID
- page size
- mode configuration
- next/previous graph
- wrap flag
- slideshow interval
- animation ID
- nested slide or layer schema
- locked-label copy

The layout supplies presentation. The engine supplies state.

## Customization Model

The small data contract does not imply a fixed gallery UI.

An image-gallery layout may contain any normal layout elements:

- containers with any supported direction, wrapping, clipping, and scrolling
- sprites, text, rects, fragments, and controls
- authored backgrounds and decorations
- hover/click/right-click interactions
- interaction sounds
- conditional visibility/overrides
- arbitrary text styles and transforms
- grid and selected-view fragments

The template projection exposes enough state for the layout to decide:

- how an unlocked item looks
- how a locked item looks
- whether locked titles are hidden or replaced with authored text
- whether the grid remains visible while viewing an image
- where next/previous buttons appear
- whether unavailable buttons are hidden, disabled, or restyled
- whether items are arranged as a grid, horizontal strip, list, or carousel

Route Engine never chooses those visuals.

## Creator Authoring Interface

Creator should not add a Gallery resource page. Gallery setup belongs in the
selected image-gallery layout.

The primary panel should use progressive disclosure:

1. **Add images** opens the normal image picker and supports multi-select.
2. Selected images become items with generated stable IDs.
3. Dragging rows changes navigation order.
4. Each row shows image preview, title, and unlock status.
5. Expanding a row reveals optional thumbnail, description, alt text, and
   unlockable fields.

Creating a gallery from selected images should therefore require no per-item
form work. Creator defaults `id` from a generated stable ID and leaves every
optional field empty.

Deleting a gallery layout deletes its capability data with it. Duplicating the
layout duplicates its items and visual composition but must regenerate any IDs
whose uniqueness scope requires it.

Creator should keep the gallery-specific element surface small:

1. `container-ref-image-gallery-item`
2. `sprite-ref-image-gallery`
3. `text-ref-image-gallery`

Creator may offer a starter gallery layout containing a scrollable grid,
selected-image viewer, return button, and previous/next buttons. Every element
must remain editable or deletable. The starter is a template, not runtime
behavior.

### Repeated Item Container

`container-ref-image-gallery-item` repeats once for every projected item. It
establishes the current `item` binding and automatically composes the guarded
select action.

```yaml
type: container-ref-image-gallery-item
name: Container (Gallery Item)
direction: vertical
click:
  inheritToChildren: true
```

Authors may place any ordinary child nodes inside it.

### Image Reference

`sprite-ref-image-gallery` has one editor property:

```yaml
source: thumbnail
```

Allowed values:

- `thumbnail`: `${item.thumbnailImageId}` inside the repeated item
- `selected`: `${imageGallery.selected.imageId}` in the viewer

Creator adds the correct presence condition. Authors still control all normal
sprite properties.

### Text Reference

`text-ref-image-gallery` has:

```yaml
source: item
field: title
```

`source` is `item` or `selected`. `field` is `title`,
`description`, or `alt`. Authors retain normal text-style and layout
controls.

### Locked Presentation

Locked presentation uses ordinary layout nodes and conditions. For example,
the author can place a normal lock sprite in the repeated item:

```yaml
type: sprite
imageId: galleryLock
$when: item.unlocked == false
```

The projected thumbnail reference is absent for a locked item unless the
author explicitly supplied `thumbnailImageId` as public gallery
presentation.

## Creator Compilation

Editor-only gallery types must compile away, just like save-slot references.

A repeated item:

```yaml
type: container-ref-image-gallery-item
children:
  - type: sprite-ref-image-gallery
    source: thumbnail
  - type: text-ref-image-gallery
    source: item
    field: title
```

becomes generic layout JSON:

```yaml
type: container
id: gallery-item-${item.id}
$each: item, i in imageGallery.items
click:
  payload:
    actions:
      setImageGalleryItem:
        resourceId: ${imageGallery.resourceId}
        itemId: ${item.id}
children:
  - type: sprite
    id: gallery-thumbnail-${item.id}
    imageId: ${item.thumbnailImageId}
    $when: item.thumbnailImageId
  - type: text
    id: gallery-title-${item.id}
    content: ${item.title}
```

The selected image reference becomes:

```yaml
type: sprite
id: gallery-selected-image
imageId: ${imageGallery.selected.imageId}
$when: imageGallery.selected
```

Compiler requirements:

- no creator-only gallery type reaches Route Engine or Route Graphics
- generated IDs remain stable and include the item ID where repeated
- generated action payloads use stable IDs, never indexes
- user-authored interaction properties are preserved
- generated conditions compose with author conditions instead of replacing
  them
- preview data matches the Route Engine projection exactly

## Unlock Semantics

An item without `unlockableId` is unlocked. Otherwise it delegates to the
shared unlockable selector.

```yaml
resources:
  unlockables:
    cg.sunset:
      when:
        call: isResourceViewed
        args:
          - images
          - cgSunset
```

Explicit story unlock remains available:

```yaml
actions:
  unlockContent:
    unlockableId: cg.sunset
```

Viewed resources are recorded only when normal story presentation commits.
The engine does not record resources while:

- building render state
- preloading
- rendering locked gallery UI
- viewing an image through the gallery
- running replay

Opening the gallery cannot unlock its own content.

## Transient State

Only the selected entry needs engine state:

```yaml
global:
  featureSessions:
    imageGallery:
      resourceId: cgGallery
      itemId: sunset
```

No session ID, page, numeric index, mode flag, timer generation, or copied item
definition is stored.

Rules:

- absence of state means grid mode
- presence of a matching layout/item means selected-view mode
- selectors derive the current index and adjacent unlocked entries
- selecting another gallery layout replaces the transient selection
- returning to the grid clears the selection
- popping the owning gallery overlay clears the selection
- replacing the owning gallery overlay clears the selection, including when the
  replacement uses the same gallery resource ID
- clear-overlays, slot load, story reset, and project update clear it
- invalid layout/item references normalize to no selection

The state is outside save slots and rollback.

## Template Projection

Route Engine builds the projection for the image-gallery layout currently being
rendered.

### Grid

```yaml
imageGallery:
  resourceId: cgGallery
  totalCount: 3
  unlockedCount: 2
  items:
    - id: sunset
      unlocked: true
      selected: false
      thumbnailImageId: cgSunsetThumbnail
      title: Sunset
      description: The final evening by the sea.
    - id: secret
      unlocked: false
      selected: false
      thumbnailImageId: null
      title: Secret Ending
      description: ""
    - id: titleArt
      unlocked: true
      selected: false
      thumbnailImageId: titleArt
      title: ""
      description: ""
  selected: null
  canPrevious: false
  canNext: false
```

### Selected Item

```yaml
imageGallery:
  resourceId: cgGallery
  totalCount: 3
  unlockedCount: 2
  items:
    - id: sunset
      unlocked: true
      selected: true
      thumbnailImageId: cgSunsetThumbnail
      title: Sunset
      description: The final evening by the sea.
    - id: secret
      unlocked: false
      selected: false
      thumbnailImageId: null
      title: Secret Ending
      description: ""
    - id: titleArt
      unlocked: true
      selected: false
      thumbnailImageId: titleArt
      title: ""
      description: ""
  selected:
    id: sunset
    imageId: cgSunset
    title: Sunset
    description: The final evening by the sea.
    alt: Two characters standing against a sunset.
  canPrevious: false
  canNext: true
```

`items` stays populated in both modes so a custom layout may keep the grid
visible or render a thumbnail strip beside the selected image.

### Projection Safety

For locked entries, the projection includes only:

- stable item ID
- `unlocked: false`
- authored public title and description
- an explicit `thumbnailImageId`, or null when it was omitted
- `selected: false`

It does not expose `imageId`, an implicit full-image thumbnail fallback, alt
text for an image that cannot be selected, or the unlock expression.

The packaged project necessarily contains authored source data, so this is not
digital-rights enforcement. It prevents accidental disclosure in layouts and
ensures actions cannot enter locked state.

Every projection is cloned JSON. Layouts never mutate it.

## Actions

Opening and closing reuse existing overlay actions:

```yaml
pushOverlay:
  resourceId: cgGallery
popOverlay: {}
```

For v1, `resourceId` must identify the image-gallery layout directly pushed
as the overlay. That layout may freely include ordinary fragments. Discovering
a gallery capability nested inside an unrelated parent overlay is deferred;
this keeps template-data scoping deterministic.

Only two gallery actions are added:

```yaml
setImageGalleryItem:
  resourceId: cgGallery
  itemId: sunset
stepImageGallery:
  offset: 1
```

### Behavior

`setImageGalleryItem`:

1. resolves `resources.layouts[resourceId]`
2. validates its `imageGallery` capability
3. if `itemId` is null, clears the matching selection and emits a render
4. otherwise resolves the item by stable ID
5. rechecks its unlock condition
6. stores only `resourceId` and `itemId`
7. emits a render

`stepImageGallery` accepts only `offset: -1` or `offset: 1`:

- derive order from the layout's item array
- skip locked entries
- stop at the first/last eligible entry
- do nothing when no selected item exists

Returning to the grid dispatches:

```yaml
setImageGalleryItem:
  resourceId: cgGallery
  itemId: null
```

`popOverlay`, `replaceLastOverlay`, and `clearOverlays` gain cleanup behavior
when removing the layout that owns the active gallery selection. Before
`replaceLastOverlay` mutates the stack, it compares the outgoing top overlay to
the session `resourceId`; when they match, it clears the gallery session before
installing the replacement. A replacement that uses the same resource ID is a
new overlay owner and starts at the grid rather than inheriting the removed
overlay's selection. None of these actions need gallery payload extensions.

### Guard Rules

- A crafted locked item ID cannot create selected state.
- The action resource ID must identify a layout with valid gallery capability.
- The layout must be the directly active gallery overlay for user-originated
  selection.
- Next/previous rechecks current unlock state on every action.
- Invalid user-originated navigation is a no-op without partial mutation.
- Malformed developer-authored configuration produces a clear contract error.

## Selectors

```yaml
selectors:
  - selectImageGalleryLayout({ resourceId })
  - selectImageGalleryState()
  - selectImageGalleryProjection({ resourceId })
  - selectIsImageGalleryItemUnlocked({ resourceId, itemId })
```

The layout selector reads `resources.layouts[resourceId].imageGallery`.
There is no gallery catalog selector and no separate gallery resource lookup.

The render path requests a projection using the layout resource it is
currently compiling. This is analogous to adding `saveSlots` to shared
template data, except gallery data is scoped to an image-gallery layout.

## Rendering

### Grid and Viewer

One layout may contain both views:

```yaml
children:
  - id: galleryGrid
    type: container
    scroll: true
    $when: imageGallery.selected == null
  - id: galleryViewer
    type: container
    $when: imageGallery.selected
```

Authors may instead keep the grid visible and show the viewer alongside it.
That choice is purely layout logic.

### Navigation Buttons

```yaml
id: galleryPrevious
type: container
$when: imageGallery.canPrevious
click:
  payload:
    actions:
      stepImageGallery:
        offset: -1
```

The author may hide the button, display a disabled style, or keep it visible
with a no-op click. Route Engine supplies only the boolean and guarded action.

### Route Graphics Contract

No Route Graphics change is required for v1. It receives:

- generic containers
- generic sprites with resolved `src`
- generic text
- existing conditional/interaction results
- stable element IDs

It never receives `imageGallery`, item unlock data, or gallery actions.

## Localization

Gallery text is patched through the owning layout:

```yaml
layouts:
  cgGallery:
    imageGallery:
      items:
        sunset:
          title:
            value: 夕焼け
            sourceHash: sha256:sunset-title
          description:
            value: 海辺で迎える最後の夕方。
            sourceHash: sha256:sunset-description
          alt:
            value: 夕焼けを背に立つ二人。
            sourceHash: sha256:sunset-alt
```

Normal layout copy is localized through layout element IDs. Localized images
use the normal image-resource override mechanism.

Localization cannot change:

- item IDs or order
- image/thumbnail IDs
- unlockable IDs
- actions or conditions

## Persistence, Save/Load, and Rollback

- Gallery definitions are packaged layout capability data.
- Unlock/viewed progress is account-scoped and outside slots.
- Selection state is transient and never saved.
- Opening/selecting gallery content creates no rollback checkpoint.
- Loading a slot closes overlays and clears gallery selection.
- Rollback cannot relock account content.
- Starting a new game clears selection and retains unlock progress.

## Validation

Do not add `resources.imageGalleries`.

Validate:

- `layoutType: image-gallery` layouts have `imageGallery.items`
- item arrays are non-empty
- item IDs are unique and non-empty
- every `imageId` references `resources.images`
- every optional `thumbnailImageId` references `resources.images`
- every optional `unlockableId` references `resources.unlockables`
- localizable fields are strings
- creator-only reference types are absent from compiled project data
- compiled bindings reference valid projection fields

Cross-resource checks belong in semantic project validation after structural
schema validation.

## Implementation Phases

1. Implement shared unlockables and typed viewed-resource identity.
2. Validate the minimal layout capability and image references.
3. Add transient selection state and the two guarded actions.
4. Add the layout-scoped `imageGallery` projection to template data.
5. Add the three Creator reference types and compiler lowering.
6. Add Creator item-list editing and exact projection-shaped preview data.
7. Add layout-scoped localization extraction and resolution.
8. Add focused engine, compiler, VT, and browser coverage.

## Test Plan

### Route Engine Unit/System Tests

- minimal two-field item is accepted
- optional metadata defaults correctly
- duplicate IDs and missing image references are rejected
- ordinary layouts remain unaffected
- always-unlocked and shared-unlockable items
- locked projection redaction
- explicit locked thumbnail versus omitted-thumbnail fallback
- authored locked title/description remain available to layout conditions
- crafted locked selection is rejected
- selection is rejected when the gallery layout is not the active overlay
- selection by stable ID
- next/previous skip locked entries and stop at boundaries
- returning to grid clears only gallery state
- pop/replace/clear/load/reset/project-update cleanup, including replacing the
  owning gallery overlay with either the same resource ID or a different layout
- unlock progress survives slot load and rollback
- localized metadata and image overrides
- selector output does not alias state/project data

### Creator Compiler Tests

- gallery references are offered only in the appropriate editor context
- multi-select image addition creates ordered minimal items
- drag reorder changes item order without changing stable IDs
- repeated item compiles to `imageGallery.items`
- image/text source choices compile to the correct bindings
- author transform/style/interaction fields survive lowering
- generated conditions compose with author conditions
- generated IDs remain stable
- compiled output has no creator-only gallery node types
- preview data exactly matches engine projection shape

### Isolated VT and Browser Tests

- custom grid with unlocked and locked cards
- locked card actual click remains in grid
- unlocked card actual click opens the viewer
- returning to the grid through an actual click
- next/previous skip a locked middle item
- custom locked artwork and label
- grid and viewer shown side-by-side
- localized title/description switch

Click paths—and any authored reveal or animation exercised by a fixture—require
both targeted state/compiler coverage and the actual browser input/render path
before the feature is considered complete. Do not combine gallery, music-box,
or replay behavior in one fixture.

## Acceptance Criteria

- A minimal gallery item needs only `id` and `imageId`.
- No `resources.imageGalleries` collection exists.
- Opening and closing reuse existing overlay actions.
- Only two gallery-specific actions are public.
- Gallery layouts can use arbitrary ordinary layout composition.
- Creator gallery elements compile to generic layout JSON.
- Route Graphics has no gallery-specific node or behavior.
- Locked items cannot be selected through crafted actions.
- Gallery selection is transient and unlock progress is account-scoped.
- Advanced features remain deferred until a reusable generic abstraction
  justifies them.
- Every authored, runtime, action, and projection value round-trips through
  JSON.
