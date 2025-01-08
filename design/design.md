
## Goal

Every visual novel that can be ported into rvn, should be ported into rvn.

* Flexible, neutral, adaptable: the engine should not force a specific design, it should give the power to the creator maximum customization.
* Powerful functionalities: It should push the limits of what Visual Novels can do
* Easy to work with for visual editors: There is a visual editor project and other tools that depend on this engine. The engine should be easy enough for those tools to work with.
* Open Source, the engine must be open with a permissive license. This is vital so an ecosystem can be built on this engine so that everyone can benefit.
* Reliable: We want to build stable foundations so people have confidence to build on this engine and know it will work for decades to come. This is why there will be throughou test cases, and as few dependencies as possible, simple and documented design.
* Render engine agnostic


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


## Runtime State

Lifetime temporarly state is to live in a section or during the game.
It does not need to be persisted.

There is an initial state, and the engine will always use this initial state on game initialization.

Example 1:
Runtime state variable

In menu page, store which menu item is currently selected. so that in the UI it can be highlighted.


```yaml
runtimeState:
  currentPage: about
```

TODO change naming from "custom state"

Example 2:
Runtime state constant

When you need to store some constants, such as the numbers for pagination.
It can be stored here.

Or also list of menu items

```yaml
runtimeState:
  hideExitMenuConfirmationModal: true
  currentSavePageNumber: 0
  saveLoadSlots:
    - text: "<"
      value: -1
    - text: "A"
      value: 0
      title: Auto Save
    - text: "Q"
      value: 1
      title: Quick Save
    - text: "1"
      value: 2
      title: Page 1
    - text: "2"
      value: 3
      title: Page 2
    - text: "3"
      value: 4
      title: Page 3
    - text: "4"
      value: 5
      title: Page 4
    - text: "5"
      value: 6
      title: Page 5
    - text: "6"
      value: 7
      title: Page 6
    - text: "7"
      value: 8
      title: Page 8
    - text: "8"
      value: 9
      title: Page 9
    - text: "9"
      value: 10
      title: Page 10
    - text: "10"
      value: 11
      title: Page 11
    - text: ">"
      value: 12
```

## Readthrough State
resets on each visual novel start, it is saved during save slot:
* History
* User inputted name

## Device State
Stored locally, will not persist over devices. This data will be lost once app is uninstalled, or start with a new device. May provide some migration or cloud too to save this so it can be migrated.
* text speed, music volume, sound volume


```yaml
deviceState:
  textSpeed: 123
  musicVolume: 123
  soundVolume: 123
```

### Persistent State
* Whether user has completed vn or not (to show some extras when user completed the visual novel)
* Save data

```yaml
persistentState:
  novelCompleted: true
  saveData[0]:
    date: 2314123212 # (unix timestamp)
    image: base64image
    title: ...
    history: ...
    readthroughState: ...
  saveData[1]:
  saveData[2]:
  saveData[3]:
  saveData[4]:

```


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
    date: 2314123212 # (unix timestamp)
    image: base64image
    title: ...
  2:
    date: ...
    image: ...
    title: ...

```

