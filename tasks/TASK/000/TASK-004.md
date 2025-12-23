---
title: Add layered views
status: todo
priority: high
assignee: JeffY
---

# Description

system state should have an array.


```js
const sytemState = {
  ...
  layeredViews: [{
    resourceId: ...
  }]
}
```

you can think of this as a layeredView. it is a layoutId that will show on top of the presentationState.

- in constructRenderState we need to check for systemState.layeredViews. and then search for the resourceId/layoutId and add it to the elements.
- needs to implement at least the following actions for systemState:
  - pushLayeredView
  - popLayeredView (will remove the last one)
  - replaceLastLayeredView (will replace the last one)
  - clearLayeredViews (set it to empty array)

## Implement Plan

We already have `addModals` in `src/stores/constructRenderState.js` but it havn't been used yet. If ok we can just reuse that.

Could this work for now? I found it uses undefined resolveFile, hardcoded empty array.

Should it be kept? if not can just rename it into `addLayeredViews` and make a full implement on it.

The implement way:

- based on the current code & implement undefined things

Then in `src/stores/system.store.js`:

- in `createInitialState` define initial `layeredViews: []`
- add a selector to get layered views
- make `selectRenderState` pass layered views
- implement 4 actions for systemState

finally create tests in `spec/system/renderState`
