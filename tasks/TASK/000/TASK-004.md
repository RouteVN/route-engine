---
title: Add overlays
status: done
priority: high
assignee: 738NGX
---

# Description

system state should have an array.


```js
const sytemState = {
  ...
  overlayStack: [{
    resourceId: ...
  }]
}
```

you can think of this as a overlay. it is a layoutId that will show on top of the presentationState.

- in constructRenderState we need to check for systemState.overlayStack. and then search for the resourceId/layoutId and add it to the elements.
- needs to implement at least the following actions for systemState:
  - pushOverlay
  - popOverlay (will remove the last one)
  - replaceLastOverlay (will replace the last one)
  - clearOverlays (set it to empty array)

## Implement Plan

We already have `addModals` in `src/stores/constructRenderState.js` but it havn't been used yet. If ok we can just reuse that.

Could this work for now? I found it uses undefined resolveFile, hardcoded empty array.

Should it be kept? if not can just rename it into `addOverlayStack` and make a full implement on it.

The implement way:

- based on the current code & implement undefined things

Then in `src/stores/system.store.js`:

- in `createInitialState` define initial `overlayStack: []`
- add a selector to get overlays
- make `selectRenderState` pass overlays
- implement 4 actions for systemState

finally create tests in `spec/system/renderState`
