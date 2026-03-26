# Animation Design

## Status

This note records the intended animation model and authoring direction.

Some current engine schema and fixtures still expose `in/out/update` fields.
Those are compatibility shapes. The target design is the one described below.

## Decision

There are only two structural animation kinds:

- `update`
- `transition`

`transition` is the only lifecycle/compositing primitive.

- enter = `next` only
- exit = `prev` only
- replace = `prev + next`

`in`, `out`, and `replace` are not separate structural types. They are semantic cases of `transition`.

At the engine authoring layer, the direction is to converge on a single animation reference:

```yaml
background:
  resourceId: bg-school
  animations:
    resourceId: bg-dissolve
```

The referenced animation resource declares the structural type through its own `type`:

- `type: update`
- `type: transition`

That means the engine does not need separate author-facing fields like:

- `animations.in.resourceId`
- `animations.out.resourceId`
- `animations.replace.resourceId`

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

## Consequences

- high-level APIs like background and character do not need separate `in/out` animation fields
- a single `animations.resourceId` field is sufficient if the engine reads the referenced resource `type`
- keeping one authoring field does not remove `update`; it only removes redundant lifecycle-specific wrappers around `transition`
- `resourceType` is not part of background animation dispatch

## Non-Goal

This decision does not mean everything should be forced into `transition`.

`update` still exists because true single-subject mutation is a different execution model from prev/next composition, especially for stateful or live elements.
