# Reset Story At Section

This document defines what a story reset does when entering a section.

Status: implemented

## Preferred Form

Reset the story with `sectionTransition` and `resetStory: true`:

```yaml
sectionTransition:
  sectionId: gameStart
  resetStory: true
```

`resetStory` defaults to `false`, which is plain non-destructive navigation.

## Deprecated `resetStoryAtSection`

`resetStoryAtSection` is deprecated. It keeps working so existing project data
does not break, and it behaves exactly like `sectionTransition` with
`resetStory: true`:

```yaml
# Deprecated
resetStoryAtSection:
  sectionId: gameStart

# Equivalent
sectionTransition:
  sectionId: gameStart
  resetStory: true
```

Both forms accept the same optional `screen` payload. Everything below
describes the reset under either spelling; the examples use the deprecated
action name.

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

`screen` is optional and uses the same shape as line-level whole-screen
transitions:

```yaml
resetStoryAtSection:
  sectionId: gameStart
  screen:
    animations:
      resourceId: screenCrossFade
```

### Schema Shape

```yaml
resetStoryAtSection:
  type: object
  description: Reset story-local state and enter the first line of a section
  properties:
    sectionId:
      type: string
    screen:
      $ref: presentationActions.yaml#/properties/screen
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
- `global.accountReplayRegistry`

## What It Resets

- current context variables:
  - replaced with project defaults for `scope: context`
- current context pointer mode:
  - forced to `read`
- current context rollback:
  - replaced with a single checkpoint anchored at the destination line
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

When `screen` is present, the intermediate reset `render` is skipped so the
first destination render can consume the screen transition.

## Relation To `sectionTransition`

Use `sectionTransition` without `resetStory` for non-destructive movement
within the current story state:

```yaml
sectionTransition:
  sectionId: chapter2
```

Set `resetStory: true` when the destination must start from fresh story-local
state:

```yaml
sectionTransition:
  sectionId: title
  resetStory: true
```

The difference is intentional:

- a plain `sectionTransition` preserves rollback, runtime viewed state, account viewed state, and context variables
- a resetting transition clears rollback, runtime viewed state, and context variables, but preserves account viewed state

A resetting transition is also rejected while a scene replay is active, and an
action batch may still contain only one navigation action.

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

Return to title with a whole-screen transition:

```yaml
resetStoryAtSection:
  sectionId: title
  screen:
    animations:
      resourceId: screenMaskReveal
```

If both `resetStoryAtSection.screen` and the destination line's
`screen.animations` are defined, `resetStoryAtSection.screen` wins for the first
destination render only. The destination line's own screen animation still
applies when the line is entered without a reset screen payload.

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

The destination root is a fresh checkpoint occurrence even when the reset
targets the section and first line already under the current read pointer. Its
queued line-entry actions classify that replacement root normally: if they
immediately route elsewhere, the root becomes transient and `Back` does not
stop on it.

## RouteEngine Interface

```js
engine.handleAction("resetStoryAtSection", {
  sectionId: "title",
});
```

## Rationale

Why the reset is an option on `sectionTransition`:

- both are the same navigation to a section's first line, so one action with
  an explicit option is simpler to author and to present in editors
- `resetStory` defaults to `false`, so the destructive behavior is always
  opted into explicitly

Why not keep a public reset-only action:

- the primary product need is destructive restart to a destination section
- a combined action is simpler to audit in authored data
- it avoids reset-only intermediate renders during multi-action batches
