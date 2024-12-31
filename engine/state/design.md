
## Preset

A preset is a set of game configuration.
The game can be in one preset at a time.
Instead of changing game configurations individually, we change presets instead.

Presets together with Pointer modes, enables us to implement different engine behaviors needed for title screen, read mode, menu etc...

Presets is made up of `events` and `options`

Events

Events are inputs from a system or user. 

* `leftClick`: 
* `rightClick`: 
* `scrollUp`: 

Options

* `recordHistory`: whether steps will be added into history

A common setup is:


```yaml
presets:
  read:
    events:
      leftClick:
        action: next
      rightClick:
        action: openMenu
        payload:
          preset: menu
          sectionId: akljdfakl
      scrollUp:
        action: historyPrev
    options:
      recordHistory: true
  title:
    eventHandlers: []
      recordHistory: false
  menu:
    eventHandlers: []
```

## Pointer Mode

Pointers are needed because the engine needs to store multiple pointers at the same time.
For example when the game is in history mode and is exiting history mode, it needs to know what is the read pointer mode pointing at.

There are also hardcoded functionalities attached to each pointer mode, a as the history related features.


read: default pointer mode


menu: pointer to be used for dislpaying menus


history: pointer used for pointing at a history


## Pointer

A pointer points to a specific step with sectionId and stepId


## Step

Basic unit


## Actions

* `nextStep`: moves to the next step
* `prevStep`: if is in read mode, change to history mode and move to previous step. if is alrady in history mode, move to previous step.
* `startRead`: clears game history and move to section
* `openMenu`: open menu 
* `closeMenu`: close menu
* `exitHistory`: close history

# Usage

```js

const engine = new RvnEngine();

const gameData = {...}

// loads game data into the engine
engine.loadGameData(gameData);

connectDomAndEngine(element, engine)

// performs the initial render
engine.init();


const connectDomAndEngine = (element, engine) => {
  const render = () => {

  }

  engine.onChangeGameStage = render;
}

```


## Temporary State

Lifetime temporarly state is to live in a section or during the game.
It does not need to be persisted.

Example:

In menu page, store which menu item is currently selected. so that in the UI it can be highlighted.


```yaml
customState:
  currentPage: about
```

TODO change naming from "custom state"


## Persistent Config

Configuration that should be persisted, but also used during the reading

Includes things such as text speed, music volume, user's inputted name etc...

The engine should be connected to a persistence interface interface


```js


engine.persistentConfigInterface = {
  set: (key, data) => {
      if (data === undefined) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(data));
  },
  get: (key) => {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : undefined;
  }
}


```

## Save data

Save data is made up of save slots.

```yaml

saveData:
  1:
    date: 2314123212
    image: base64image
    title: ...
  2:
    date: ...
    image: ...
    title: ...

```





