# Reset Story At Section

This document defines the public behavior of `resetStoryAtSection`.

Status: implemented

## Goal

Support common destructive restart flows like:

- title -> start game
- in-game -> return to title

without overloading `sectionTransition`.

## Public Action

```yaml
resetStoryAtSection:
  sectionId: gameStart
```

### Schema Shape

```yaml
resetStoryAtSection:
  type: object
  description: Reset story-local state and enter the first line of a section
  properties:
    sectionId:
      type: string
  required: [sectionId]
  additionalProperties: false
```

## Core Semantics

`resetStoryAtSection` is destructive navigation.

It:

1. resets story-local runtime state
2. moves the read pointer to the first line of `sectionId`
3. treats that destination line as the new rollback root

The destination line then runs as normal through queued `handleLineActions`.

## What It Preserves

- `projectData`
- `global.saveSlots`
- `global.variables` for `device` and `account` scopes
- `global.accountViewedRegistry`

## What It Resets

- current context variables:
  - replaced with project defaults for `scope: context`
- current context pointer mode:
  - forced to `read`
- current context rollback:
  - replaced with a single checkpoint anchored at the destination line
- runtime viewed state:
  - `viewedRegistry.sections = []`
  - `viewedRegistry.resources = []`
- transient runtime globals:
  - `autoMode = false`
  - `skipMode = false`
  - `dialogueUIHidden = false`
  - `confirmDialog = null`
  - `overlayStack = []`
  - `nextLineConfig = DEFAULT_NEXT_LINE_CONFIG`

After the destination line is entered, normal line-entry behavior applies, so
`isLineCompleted` becomes `false` and `handleLineActions` is queued.

## Effects

`resetStoryAtSection` appends effects. It does not replace the pending queue.

It enqueues:

- `clearAutoNextTimer`
- `clearSkipNextTimer`
- `clearNextLineConfigTimer`
- `render`
- `handleLineActions`

## Relation To `sectionTransition`

Use `sectionTransition` for non-destructive movement within the current story
state:

```yaml
sectionTransition:
  sectionId: chapter2
```

Use `resetStoryAtSection` when the destination must start from fresh
story-local state:

```yaml
resetStoryAtSection:
  sectionId: title
```

The difference is intentional:

- `sectionTransition` preserves rollback, runtime viewed state, account viewed state, and context variables
- `resetStoryAtSection` clears rollback, runtime viewed state, and context variables, but preserves account viewed state

## Examples

Start game from title:

```yaml
resetStoryAtSection:
  sectionId: gameStart
```

Return to title from gameplay:

```yaml
resetStoryAtSection:
  sectionId: title
```

## Rollback Behavior

`resetStoryAtSection` creates a new rollback timeline anchored at the
destination:

```js
{
  currentIndex: 0,
  isRestoring: false,
  replayStartIndex: 0,
  timeline: [
    {
      sectionId: "destination",
      lineId: "firstLine",
      rollbackPolicy: "free",
    },
  ],
}
```

That means:

- `Back` after a restart stays inside the new story run
- the player cannot roll back into the pre-reset title/gameplay state

## RouteEngine Interface

```js
engine.handleAction("resetStoryAtSection", {
  sectionId: "title",
});
```

## Rationale

Why not overload `sectionTransition`:

- destructive fresh-start behavior is too easy to miss behind a flag
- normal navigation and destructive restart have different review/debug risk
- common destructive behavior deserves a first-class authored verb

Why not keep a public reset-only action:

- the primary product need is destructive restart to a destination section
- a combined action is simpler to audit in authored data
- it avoids reset-only intermediate renders during multi-action batches
