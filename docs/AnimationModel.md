# Animation Design

## Status

This note records the current animation model and the background-specific
behavior implemented in the engine.

## Decision

There are only two structural animation kinds:

- `update`
- `transition`

`transition` is the only lifecycle/compositing primitive.

- enter = `next` only
- exit = `prev` only
- replace = `prev + next`

`in`, `out`, and `replace` are not separate structural types. They are semantic cases of `transition`.

At the engine authoring layer, animations use a single reference:

```yaml
background:
  resourceId: bg-school
  animations:
    resourceId: bg-dissolve
```

The referenced animation resource declares the structural type through its own `type`:

- `type: update`
- `type: transition`

Legacy resource types such as `live` and `replace` are not supported.

The legacy wrapper fields are no longer supported:

- `animations.in.resourceId`
- `animations.out.resourceId`
- `animations.update.resourceId`

## Motivation

- `in` and `out` duplicate information already represented by `prev` and `next`
- separate lifecycle fields make authoring and dispatch rules harder to reason about
- `transition(prev?, next?)` already covers add, remove, and replace cleanly
- one animation resource plus diff result is enough to decide runtime behavior
- the stored presentation state should stay declarative; transient animation transforms should remain render-time only

## Execution Model

The system should separate three concerns:

1. Diffing determines what changed.
2. The referenced animation resource determines the structural animation shape.
3. The runtime chooses the correct execution path.

In practice:

- `update` animates one live subject that remains present before and after the change
- `transition` animates `prev`, `next`, or both
- add maps to `transition(next only)`
- remove maps to `transition(prev only)`
- replace maps to `transition(prev + next)`

If a `transition` resolves to the same compatible visual subject on both sides, the runtime may optimize execution into a single-subject tween. That is an execution optimization, not a separate authoring concept.

## Current Background Behavior

Background animation dispatch is based on resolved presentation state, not only
the raw action shape.

### Animations-only background actions

If a line provides:

```yaml
background:
  animations:
    resourceId: bg-slide-out
```

and a background already exists in presentation state, the engine resolves the
next background as:

- same `resourceId` as the currently resolved background
- updated `animations`

That means this shape means "animate the current background from state", not
"remove the background".

### Persistent background playback selection

If a background animation uses:

```yaml
background:
  resourceId: bg-school
  animations:
    resourceId: bg-dissolve
    playback:
      continuity: persistent
```

the animation selection stays attached to that resolved background across later
lines while the background itself is unchanged.

In practice:

- later lines do not need to repeat the same `background.animations` payload
- the selection keeps applying while the resolved background stays the same
- the selection stops when the background changes or a later background action
  replaces the animation selection

### Same-subject transitions

Because the comparison is done against resolved previous and next presentation
state:

- repeating the same `background.resourceId` with a `transition` animates
- omitting `background.resourceId` and providing only `background.animations`
  still animates if the background persists from state

For persisted backgrounds, the runtime treats the resolved subject as both the
`prev` and `next` side of the `transition`.

### Background update fallback

Background currently has one narrow compatibility fallback:

- if the referenced animation resource is `type: update`
- and the resolved lifecycle is not true `update`
- and there is an incoming background target

the engine animates the incoming background target instead of throwing.

This fallback exists for background enter/replace handling only. It should be
treated as compatibility behavior, not the general rule for all element types.

## State Rule

Animation-only values are not written back into stored presentation state.

Examples:

- `translateX`
- `translateY`
- mask progress
- any other temporary animation-only transform

On completion:

- `update` commits the authored next state
- `transition` commits the authored next state if `next` exists
- `transition` commits removal if `next` does not exist

For backgrounds specifically, an animations-only action may still resolve to a
persistent next background state if the previous presentation state already has
one. In that case the persisted `resourceId` comes from state resolution, not
from animation transforms being written back.

## Consequences

- high-level APIs like background and character do not need separate `in/out` animation fields
- a single `animations.resourceId` field is sufficient if the engine reads the referenced resource `type`
- keeping one authoring field does not remove `update`; it only removes redundant lifecycle-specific wrappers around `transition`
- `resourceType` is not part of background animation dispatch

## Non-Goal

This decision does not mean everything should be forced into `transition`.

`update` still exists because true single-subject mutation is a different execution model from prev/next composition, especially for stateful or live elements.
