
Class that handles logic for the Visual Novel.


## Usage

```js
import RouteEngine from "route-engine";

const engine = new RouteEngine();

const callback = (event) => {
  const { eventType, payload } = event;

}

engine.onEvent(callback);

engine.init({
  // follows this schema ...
  vnData: {
    ...
  },
  // does not render automatically
  preventFirstRender: false
});

engine.handleEvent({
  eventType: "nextStep",
  payload: {
    // ...
  }
})
```


## List of onEvent eventTypes

This is events sent from engine to the outside world

- `render` - when the engine wants to render the current state of the visual novel
example:

```js
{
  eventType: "render",
  payload: {
    elements: [...],
    transitions: [...]
  }
}

```

- `save`



## List of handleEvent eventTypes

This is events sent from the outside world to the engine

- `ClickLeftScreen`: when the user left clicks the screen
- `ClickRightScreen`: when the user right clicks the screen
- `ScrollUpScreen`
- `KeyboardSpace`: 
- `KeyboardEnter`:
- `KeyboardEsc`: 
- `SaveDataUpdate`:
