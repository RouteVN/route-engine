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

you can think of this as a modal. it is a layoutId that will show on top of the presentationState.

- in constructRenderState we need to check for systemState.layeredViews. and then search for the resourceId/layoutId and add it to the elements.
- needs to implement at least the following actions for systemState:
  - pushLayeredView
  - popLayeredView (will remove the last one)
  - replaceLastLayeredView (will replace the last one)
  - clearLayeredViews (set it to empty array)

