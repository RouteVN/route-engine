---
title: implement visuals
status: todo
priority: high
assignee: JeffY
---

# Description

## Relevant code

constructPresentationsState.js:

```js
/**
 * Applies visual items from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const visual = (state, presentation) => {
  if (presentation.visual) {
    state.visual = presentation.visual;
  }
};
```

constructRenderState.js

```js
export const addVisuals = (
...
```

## Context


- visuals should work the same as background
- background and visuals can take a resourceId. resourceId can be:
  - imageId
  - layoutId
  - videoId (once is implemented)


- background has only 1 resourceId. it takes only 1 and shows at the bottom z index.
- visuals takes an array, so we can add multiple images or layout or what, creating almost infinite possibilities


## Phase 1

Make sure basic functionality for layouts work and baisc specs in the vt/specs folder are written

## Phase 2

Make sure it works for both imageId and layoutId

- resourceId works for both imageId and layoutId
- write a spec with a background, and a layoutId with a snow/rain effect

## Phase 3

Make sure all these features are implemented:

- can customize the x and y position of the visual. or rather, should be able to select a transform?
  - it should also update correctly across multiple lines
- animations work, similar to background

