# Feature Systems Architecture

Status: proposed implementation architecture for image galleries, music boxes,
inventories, localization, and scene replay.

This document defines the shared boundary and data rules used by the five
feature plans:

- [ImageGallery.md](./ImageGallery.md)
- [MusicBox.md](./MusicBox.md)
- [Inventory.md](./Inventory.md)
- [L10n.md](./L10n.md)
- [ReplayScene.md](./ReplayScene.md)

It is a design document, not a description of already implemented behavior.

## Decision Summary

The features must extend Route Engine's existing state-driven architecture.
They must not become domain-specific plugins inside Route Graphics.

- Authored contracts, runtime state, action payloads, persistence payloads, and
  render state remain JSON-serializable data. No authored callback functions,
  Python snippets, JavaScript expressions, or arbitrary JSON-path patches are
  introduced.
- Route Engine owns feature meaning and validates every feature action.
- Route Graphics owns pixels, audio playback, animation playback, clipping,
  scrolling, hit testing, and generic input/lifecycle events.
- Layout resources remain the customizable UI layer. The engine supplies
  feature projections to layout templates; it does not hard-code gallery,
  inventory, music-box, or replay screens.
- Account progress is separate from save-slot state. Unlocks and viewed
  resources survive new games and slot loads.
- Story-local inventory and replay state live in contexts and participate in
  the same save/load and rollback rules as other story-local state.
- Localization is a read-only resolution layer over canonical source project
  data. It never rewrites source data or stores translated strings in saves.

## Current Architecture We Are Extending

Route Engine already follows this pipeline:

```text
projectData + systemState
          -> presentationState
          -> renderState
          -> Route Graphics
          -> semantic event
          -> Route Engine action
          -> next systemState
```

Existing foundations that should be reused are:

- immutable `projectData`
- JSON Schema validation for project and system state
- context-scoped, device-scoped, and account-scoped variables
- a stack-shaped `contexts` state model
- account-scoped `accountViewedRegistry`
- save slots that serialize contexts but not project data or account state
- scoped persistence effects for device and account writes
- semantic JSON conditions
- layout templates with stable element IDs, conditionals, and `$for` loops
- declarative Route Graphics element, animation, audio, and event state
- persistent multi-sound BGM in the active context

The implementation should add missing contracts to these systems instead of
creating a second store or having a UI maintain authoritative feature state.

## Research Findings

### Ren'Py

Ren'Py separates gallery/music/replay behavior from the screen used to present
it. Its Gallery and MusicRoom objects manage availability and navigation, while
the screen is authored separately. Gallery buttons may contain multiple images
and composite displayables. Music rooms expose play, pause, next, previous,
shuffle, loop, and locked-track behavior. Replay creates an isolated execution
mode, returns to the caller, preserves the caller's game state, and disables
save/load while active. See Ren'Py's
[Image Gallery, Music Room, and Replay Actions](https://www.renpy.org/doc/html/rooms.html).

Ren'Py persists unlock-like progress outside individual saves, and recommends
set-union behavior when merging cumulative achievements or endings. See
[Persistent Data](https://www.renpy.org/doc/html/persistent.html).

Ren'Py does not impose an inventory domain model. Its screen language displays
data and dispatches actions, while drag/drop is a generic UI primitive that can
be used for inventories. See [Screens and Screen Language](https://www.renpy.org/doc/html/screens.html)
and [Drag and Drop](https://www.renpy.org/doc/html/drag_drop.html).

Ren'Py localization starts with one canonical source language and handles
dialogue, UI strings, files/images, and styles/fonts. See
[Translation](https://www.renpy.org/doc/html/translation.html).

### Naninovel

Naninovel uses one persistent unlockable service for CG galleries, music
galleries, achievements, and similar systems. Unlock state is global rather
than save-slot-local. That is a useful precedent for a Route Engine unlockable
registry shared by gallery, music box, and replay rather than three unrelated
boolean stores. See [Unlockables](https://naninovel.com/guide/unlockables).

Naninovel separates game state, global state, and settings, and demonstrates an
inventory as custom game state so it automatically participates in save/load
and rollback. See [State Management](https://naninovel.com/guide/state-management).

Naninovel also keeps a source locale, supports locale-specific assets and
fonts, and generates stable localization documents. See
[Localization](https://naninovel.com/guide/localization) and
[Managed Text](https://naninovel.com/guide/managed-text).

### Lessons Applied to Route Engine

The useful pattern is not to copy another engine's API names. It is to retain
three separations:

1. feature state/projections are not renderer nodes
2. account progress is not save-slot state
3. story execution is not renderer playback

Those separations align with Route Engine's existing data flow.

Static gallery membership is the deliberate exception to putting every
feature definition in its own resource collection. It is capability data on an
ordinary layout, following the existing save/load layout pattern. Route Engine
still owns the projected state and guarded behavior.

## Layer Ownership

| Concern                          | Route Engine                        | Route Graphics                           | Host/tooling                |
| -------------------------------- | ----------------------------------- | ---------------------------------------- | --------------------------- |
| Project catalogs and schemas     | Owns                                | Unaware                                  | Author/editor supplies JSON |
| Unlock decisions                 | Owns                                | Receives only projected booleans/visuals | Persists account patch      |
| Inventory quantities and rules   | Owns                                | Unaware                                  | None                        |
| Locale and fallback selection    | Owns                                | Receives resolved text/assets/styles     | Loads packages/assets       |
| Replay context and restrictions  | Owns                                | Unaware                                  | None                        |
| UI layout and feature projection | Builds/resolves                     | Renders generic nodes                    | Author styles layouts       |
| Image composition and clipping   | Selects resource IDs and transforms | Owns pixels and clipping                 | Loads assets                |
| Animation intent                 | Selects animation resource/target   | Owns timing and interpolation            | None                        |
| Music playlist policy            | Owns order, lock, repeat, shuffle   | Owns sound cursor and output             | Loads audio                 |
| Pointer, wheel, click, drag      | Converts events to actions          | Owns hit testing and event emission      | Forwards event payload      |
| Persistent storage               | Emits scoped JSON updates           | Unaware                                  | Adapter writes data         |

### Route Graphics Must Stay Domain-Neutral

Do not add `gallery`, `inventory`, `musicBox`, `locale`, or `replay` node types
to Route Graphics.

Route Graphics already has or should have generic primitives for these
features:

- containers with horizontal/vertical layout and clipping/scrolling
- sprites, text, rects, and videos
- stable element IDs and replace/update animations
- semantic click, wheel, change, and drag events
- audio channels and sound nodes
- generic paused playback and sound-complete events, which are still missing
  and are specified as music-box prerequisites

For example, an inventory grid is expanded by Route Engine's layout templating
into ordinary container, sprite, text, and rect nodes. Route Graphics never
receives an "inventory item".

### Route Engine Must Not Own Pixels or Playback Cursors

Route Engine should not measure text, construct Pixi objects, decode audio,
keep Web Audio clock positions, detect pointer overlap, or implement visual
tween interpolation.

It may own declarative intent such as "gallery item B is selected" or "track A
is paused". Route Graphics performs the corresponding playback.

## JSON-Only Contract Rule

All new public data must pass `structuredClone` and JSON serialization without
loss.

Allowed:

```yaml
when:
  gte:
    - var: variables.trust
    - 70
```

Not allowed:

```yaml
when: variables.trust >= 70
onUse: function () { grantHealth(10); }
```

New conditions reuse the existing semantic JSON condition grammar. A small,
whitelisted set of engine condition functions may be added for progress
queries, but calls are still authored as JSON and cannot execute arbitrary
code.

## Shared Unlockable Model

Gallery entries, music tracks, and replay entries need the same account-level
availability behavior. Add one shared static catalog and one shared persistent
registry.

### Static Project Data

```yaml
resources:
  unlockables:
    cg.sunset:
      when:
        call: isResourceViewed
        args:
          - images
          - cgSunset
    music.mainTheme:
      when:
        call: isResourceViewed
        args:
          - sounds
          - mainTheme
    replay.firstMeeting:
      when:
        call: isLineViewed
        args:
          - chapter1Meeting
          - line30
    extras.alwaysAvailable:
      initiallyUnlocked: true
```

Rules:

- A feature entry without `unlockableId` is always available.
- An unlockable is available when `initiallyUnlocked` is true, its ID is in
  the account unlock registry, or its optional `when` condition is true.
- `when` may read account-scoped variables and use whitelisted progress
  functions. It must not read context state, transient runtime state, wall
  clock time, random values, or renderer state.
- Unknown unlockable IDs are schema/build errors in feature catalogs and action
  payloads.
- Unlock decisions are always rechecked by the action, not trusted from a
  button's projected `unlocked` field.

The approved condition functions are:

```yaml
conditionFunctions:
  - isLineViewed(sectionId, lineId)
  - isResourceViewed(resourceType, resourceId)
  - isUnlockRecorded(unlockableId)
```

These are engine-owned pure queries. They are not supplied by project data.

### Runtime State

```yaml
global:
  accountUnlockRegistry:
    ids:
      - cg.sunset
      - music.mainTheme
```

The registry is account-scoped, outside slots, and monotonic in v1. Additions
merge by set union. Relocking is intentionally not supported because deletion
does not merge safely across devices and conflicts with the normal meaning of
earned extras.

### Actions and Persistence

```yaml
unlockContent:
  unlockableId: cg.sunset
```

`unlockContent` is idempotent. On the first addition it queues an account
scoped update:

```yaml
scope: account
operations:
  - path: unlockRegistry
    op: add
    value: cg.sunset
```

The built-in IndexedDB adapter and external account adapters apply this as a
set union.

### Viewed Resource Identity Upgrade

The current viewed registry stores only `resourceId`. Resource IDs are scoped
by resource collection, so an image and sound can legally share an ID. Gallery
and music auto-unlocks need qualified identity.

New entries should be:

```yaml
resourceType: images
resourceId: sunset
```

This is an additive upgrade. The existing public
`addViewedResource({ resourceId })` action and account-scoped `markViewed`
resource payload remain valid; integrations are not required to invent a type.
Both contracts gain an optional `resourceType`, and engine-owned presentation
writes supply it whenever the presenting action already knows the collection.

The normalization and lookup rules are:

- A write with `resourceType` is stored and merged by the
  `(resourceType, resourceId)` pair.
- For an untyped `addViewedResource` call, the engine may add the type only when
  `resourceId` exists in exactly one project resource collection. If the ID is
  absent or appears in multiple collections, the engine preserves an untyped
  entry and reports a migration diagnostic; it must not guess.
- Scoped persistence adapters accept and preserve both typed and untyped
  `markViewed` resource entries. Because an adapter does not necessarily have
  project data, it never infers a type itself. Untyped entries merge by
  `resourceId` as they do today.
- On hydration, the engine applies the same exactly-one-collection rule to
  legacy untyped entries. Unambiguous entries may normalize to typed entries;
  ambiguous or unknown entries remain untyped.
- The existing untyped selector continues to match any entry with the same
  `resourceId`, preserving its public behavior. The new typed lookup first
  matches the exact pair. It may treat an untyped entry as a match only when
  current project metadata places that ID in exactly one collection and that
  collection equals the requested `resourceType`.
- If typed and untyped entries for the same ID coexist, normalization may
  coalesce them only when the untyped entry passes that same unambiguous
  inference rule. An ambiguous untyped entry is never a wildcard for typed
  unlock checks.
- New feature schemas always author both type and ID.

Viewed resources should be recorded by the engine when a presentation action
commits the resource for normal story playback, not as a side effect of a pure
selector or Route Graphics render. Replay and extras browsing do not write new
story progress.

## State Lifetimes

| Data                             | Location                           | Slot                   | Rollback           | Persistence             |
| -------------------------------- | ---------------------------------- | ---------------------- | ------------------ | ----------------------- |
| Catalog definitions              | `projectData.resources`            | No                     | No                 | Packaged project data   |
| Source localization config       | `projectData.localization`         | No                     | No                 | Packaged project data   |
| Active locale                    | `global.locale`                    | No                     | No                 | Device settings         |
| Viewed lines/resources           | `global.accountViewedRegistry`     | No                     | No                 | Account scoped          |
| Explicit unlock IDs              | `global.accountUnlockRegistry`     | No                     | No                 | Account scoped          |
| Inventory contents               | active `context.inventories`       | Yes                    | Yes                | Slot                    |
| Gallery entry definitions        | `resources.layouts.*.imageGallery` | No                     | No                 | Packaged project data   |
| Gallery browser session          | transient global feature session   | No                     | No                 | None                    |
| Music-box browser/player session | transient global feature session   | No                     | No                 | None                    |
| Replay execution                 | temporary replay context           | Never saveable         | Within replay only | None                    |
| Underlying context during replay | lower context stack entry          | Existing slot behavior | Unchanged          | Slot when not replaying |

## Feature Projection Contract

Layouts should consume read-only projections rather than raw system state.
This follows the existing `saveSlots`, `runtime`, `dialogue`, and `form`
template model.

The combined template root may contain these optional keys:

```yaml
imageGallery: {}
musicBox: {}
inventory: {}
replayGallery: {}
localization:
  activeLocale: en
  sourceLocale: en
  locales: []
```

Rules:

- Projections are cloned JSON snapshots.
- Locked entries expose safe presentation metadata only. They do not expose
  hidden source file IDs or replay destinations.
- Layout events carry stable IDs through `_event` and dispatch engine actions.
- The engine action re-resolves the ID against current state.
- Layouts never mutate projections.
- Dynamic arrays are expanded by the existing JSON template loop before Route
  Graphics receives render state.

## Context Identity and Kind

Replay requires explicit context metadata. Add these required fields to new
context state:

```yaml
id: context-7
kind: story
pointers:
  read:
    sectionId: chapter1
    lineId: line1
```

Supported v1 kinds are `story` and `replay`. Old slots without these fields are
normalized to a generated stable-in-slot ID and `kind: "story"`.

This metadata enables:

- replay-only action guards
- context-specific audio identity
- save rejection while the active context is a replay
- devtools inspection without inferring purpose from stack position

Title/menu behavior can remain a story context until a separate menu-context
feature is actually required.

## Failure and Security Rules

- Invalid catalog references fail project validation before play.
- Public actions reject malformed payloads before mutating state.
- Locked-entry actions are safe no-ops or return structured failure results;
  they never reveal hidden IDs in render state.
- Locale patches can replace only explicitly localizable leaves. They cannot
  add actions, alter conditions, change story routing, or rename IDs.
- Replay blocks save/load and persistent mutations even if a malicious layout
  dispatches those actions directly.
- Inventory operations validate capacity, quantity, and item existence
  atomically.
- Pure selectors do not write state or queue effects.

## Versioning and Migration

These features change both project and persisted state formats. Introduce
explicit format versions rather than relying on shape guesses:

```yaml
projectFormatVersion: 2
persistenceFormatVersion: 2
saveSlotFormatVersion: 2
```

Exact version numbers should be chosen at implementation time based on the
then-current released formats. Required migrations are:

- untyped viewed resources to backward-compatible typed reads
- missing account unlock registry to `{ "ids": [] }`
- old contexts to `id` and `kind`
- old slots to empty/default inventory maps
- missing locale setting to the project's default/source locale

Never mutate persisted input before full validation. Normalize into a new
object and apply it atomically.

## Cross-Feature Implementation Order

1. Add shared schema helpers, context `id`/`kind`, backward-compatible typed
   viewed-resource reads/writes, and the account unlock registry.
2. Extend scoped persistence and hydration for viewed-resource types, unlocks,
   and active locale without rejecting legacy untyped resource entries.
3. Implement localization resolution because all new catalog metadata should
   be localizable from its first release.
4. Implement inventory state/actions/projection; it has no required Route
   Graphics changes.
5. Add image-gallery layout capability data, session/projection, and creator
   compiler lowering analogous to save/load; do not add a gallery resource
   collection.
6. Add generic paused sound and sound-complete support to Route Graphics, then
   implement music box.
7. Implement replay context push/pop, persistent-write guards, and replay
   catalog/projection.
8. Add creator/editor authoring and localization extraction only after runtime
   contracts and schemas are locked.

## Cross-Feature Test Standard

Every implementation phase requires:

- JSON Schema acceptance and rejection tests
- store unit tests for each state transition and rejected transition
- selector/projection tests proving locked data is not leaked
- persistence round-trip and migration tests
- typed and legacy viewed-resource action/persistence tests, including
  duplicate IDs across resource collections
- save/load and rollback tests for context-owned data
- Route Graphics contract tests for any new generic renderer field/event
- focused VT pages with one feature behavior per page
- browser-level input reproduction for click, wheel, drag, pause/resume,
  locale switching, and replay enter/exit paths as applicable

Do not use a single extras page to claim gallery, music, localization, and
replay are all visually correct. Each VT/browser fixture must isolate the state
transition it is intended to verify.
