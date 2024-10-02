
# rvn

rvn is a format for Visual Novels

it is a JSON/YAML format

* all properties follow `camelCase` format

This format is supposed to be used by both Readers and Editors.


Metadata

* [Project](#project)

Visual Novel Content

* [Story](#story)
  * [Routes](#routes)
  * [Chapters](#chapters)
  * [Scenes](#scenes)
  * [Sections](#sections)
  * [Steps](#steps)
  * [Actions](#actions)
* [Resources](#resources)
  * [Background](#background)
  * [CG](#cg)
  * [Background Music](#background-music)
  * [Sound Effect](#sound-effects)
  * [Characters](#characters)
  * [Variables](#variables)
* [Settings](#settings)
  * [Screen](#screen)
* [Default Configuration]

Persisted data

* [Saved Configuration](#saved-configuration)
* [Progression](#progression)
* [Save Data](#save-data)

# Metadata

## Project

`.project` is where all information about the project itself is stored.
Such information is to be used for the creator only. It is not supposed to be used by the player.

`.project.title` Name of the Visual Novel project

`.project.logo` Url to the log file. It is supposed to be a square image.


# Content


## Story

Below is the structure of a Story

*	Story: The entire narrative experience of the visual novel, containing all routes, paths, and player choices.
*	Routes: Major narrative branches that diverge based on player decisions. Each route can lead to different story outcomes or endings.
*	Chapters: Subdivisions within a route that help organize the story into key plot points or arcs. Chapters typically represent major events or transitions in the narrative.
*	Scenes: Individual segments within a chapter, representing distinct events or interactions. Scenes focus on specific settings, moments, or conversations.
* Sections: Smaller parts of a scene, used to group together related content or dialogue for better organization and flow.
* Steps: Sequential units within a section, representing specific moments in the player’s progression (e.g., displaying a line of text, triggering an animation, etc.).
*	Actions: Individual commands executed within a step, responsible for dynamic changes in the narrative. Common actions include:

### Routes

`.story.routes[]`

`.story.routes[].id`

`.story.routes[].title`

`.story.routes[].description`

`.story.routes[].chapterIds[]`


Example

```yaml
story:
  routes:
    - id: routeid1
      title: Route Title
      description: Route Description
      chapterIds: ['chapterId1', 'chapterId2']
```

### Chapters

`.story.chapters[]`

`.story.chapters[].id`

`.story.chapters[].title`

`.story.chapters[].description`

`.story.chapters[].sceneIds[]`


Example
```yaml
chapters:
  - id: chapter1
    title: Chapter 1
    description: Chapter One
    sceneIds: ['sceneId1', 'sceneId2']
```

### Scenes

`.settings.startScene` id of the scene

`story.scenes[]` a list of scenes

`story.scenes[].id` unique identifier of the scene

`story.scenes[].title` title of the scene

`story.scenes[].description` description of the scene

```yaml
story:
  scenes:
    - id: "scene0"
      title: "Title Screen"
      description: "This is the title screen"
      sections:
        - id: "section1"
          title: "Section 1"
          description: "This is the first section"
          steps:
            - id: "step1"
              video:
                - id: "video1"
                  canSkip: false
            - id: "step2"
              video:
                - id: "video2"
                  canSkip: true
            - id: "step3"
              showGui:
                - id: "gui1"
                  actions:
                    - id: "action1"
                      action:
                        type: transitionToScene
                        sceneId: "scene1"
```

### Sections

`.story.scenes[].sections[]` sections within the scene

`.story.scenes[].sections[].id` id of the section

`.story.scenes[].sections[].title` title of the section

`.story.scenes[].sections[].description` description of the section


### Steps

`.story.scenes[].sections[].steps[]` steps within the section

`.story.scenes[].sections[].steps[].id` unique identifier of the step

`.story.scenes[].sections[].steps[].actions` action of the step

# Actions
Specific commands executed within a step, enabling dynamic changes in the narrative.

Examples:
 - Change Text
 - Change Background
 - Scene Transition
 - Change Music
 - Make Choice


## Background

Shows or updates or removes background

There can be only one background.

Background and CG are treated bacically the same way

`actions.background.type`: `none` or `background` or `cg`

`actions.background.positionId`: default: center center

`actions.background.resourceId`: resourceId

`actions.background.inAnimation.id`: incoming animation

`actions.background.outAnimation.id`: outgoing animation

`actions.background.zIndex`: number

## Background Music

Plays or updates or removes background music

There can be only one background music.


`actions.bgm.type`: `none` or `bgm`

`actions.bgm.inSoundTransition.id`: incoming sound transition

`actions.bgm.outSoundTransition.id`: outgoing sound transition

`actions.bgm.volume`

`actions.bgm.loop` True

`actions.bgm.startTime`

`actions.bgm.speed`


## Character

`actions.characters.items[].id`

`actions.characters.items[].spriteId`

`actions.characters.items[].positionId`

`actions.characters.items[].inAnimationId`

`actions.characters.items[].outAnimationId`

TODO

## Sound Effects

`actions.sfx.items[]`

`actions.sfx.items[].id`

`actions.sfx.items[].sfxId`

`actions.sfx.items[].inSoundTransition.id`

`actions.sfx.items[].outSoundTransition.id`

`actions.sfx.items[].volume`

`actions.sfx.items[].loop`

`actions.sfx.items[].startTime`

`actions.sfx.items[].speed`


## Choices

`actions.choices.choiceGuiId`

`actions.choices.items[]`

`actions.choices.items[].id`

`actions.choices.items[].label`

`actions.choices.items[].actions`

`actions.choices.items[].actions.moveToSection`

`actions.choices.items[].actions.moveToSection.sectionId`

`actions.choices.items[].actions.moveToSection.stepId`

`actions.choices.items[].actions.updateVariables`

## Update Variables

`actions.variables[]`

`actions.variables[].type`

`actions.variables[].values`

Examples

```yaml

actions:
  variables:
    - type: set
      variable: characterName 
      value: Anguillo
    - type: increment
      variable: age
```


## Conditionals

Examples
```yaml
actions:
  conditions:
    case: age >= 18
    actions:
      moveToStepId: xxx
```

```yaml
actions:
  conditions:
    switch:
      - case: age < 13
        actions:
        moveToStepId: xxx
      - case: age >= 18
        actions:
        moveToStepId: xxx
      - case: default
        actions:
        moveToStepId: xxx
```



## Resources

`.resources` is where all game assets such as images and sounds are defined

### Background

`.resources.background[]` is where all backgrounds are stored

`.resources.background[].id`: unique id of the background

`.resources.background[].src`: source of the background

`.resources.background[].name`: name of the background

`.resources.background[].description`: description of the background

example

```yaml
assets:
  background:
    - id: "bg1"
      src: "https://example.com/bg1.png"
      name: "Background 1"
      description: "This is the first background"
```

### CG


`.resources.cg[]`

`.resources.cg[].id`

`.resources.cg[].src`

`.resources.cg[].name`

`.resources.cg[].description`



### Background Music

`.resources.bgm[]`

`.resources.bgm[].id` unique id of the bgm

`.resources.bgm[].src` source of the bgm

`.resources.bgm[].name` name of the bgm

`.resources.bgm[].description` description of the bgm


### Sound Effects

`.resources.sfx[]`

`.resources.sfx[].id` unique id of the sfx 

`.resources.sfx[].src` source of the sfx 

`.resources.sfx[].name` name of the sfx 

`.resources.sfx[].description` description of the sfx 

### Characters

`.resources.characters[]`

`.resources.characters[].id` unique id of the characters 

`.resources.characters[].src` source of the characters 

`.resources.characters[].name` name of the characters 

`.resources.characters[].description` description of the characters 

`.resources.characters[].sprites[]` sprites 

`.resources.characters[].sprites[].id` sprites 

`.resources.characters[].sprites[].title` sprites 

`.resources.characters[].sprites[].description` sprites 

`.resources.characters[].sprites[].src` sprites 


### Animation Effects

`.resources.animations[]`

`.resources.animations[].id`

`.resources.animations[].title`

`.resources.animations[].description`

`.resources.animations[].properties`

`.resources.animations[].properties[propetyName].keyframes[]`



### Variables

Variables are needed to implement branching logic etc... 

`.variables[]`

`.variables[].id`

`.variables[].name`

`.variables[].description`

`.variables[].type` type can be `string`, `number`, `enum`, `boolean`

`.variables[].enumOptions[]` 

`.variables[].enumOptions[].label` 

`.variables[].enumOptions[].value` 

`.variables[].enumOptions[].description` 

`.variables[].default` default value

Example

```yaml
variables:
  - id: "string1"
    name: "Variable 1"
    description: "This is the first variable"
    type: "string"
    default: "value1"
  - id: "string2"
    name: "Variable 2"
    description: "This is the second variable"
    type: "number"
    default: 12
  - id: "string3"
    name: "Variable 3"
    description: "This is the third variable"
    type: "boolean"
    default: true
  - id: enum1
    name: "Enum 1"
    description: "This is the first enum"
    type: "enum"
    default: "value1"
    enumOptions:
      - id: "value1"
        name: "Value 1"
        description: "This is the first value"
```

# Persisted Data

## Saved Configuration

Game configuration

`.config.textSpeed`

`.config.bgmVolume`

`.config.voiceVolume`

`.config.sfxVolume`

```yaml
config:
  textSpeed: 100
  bgmVolume: 100
  voiceVolume: 100
  sfxVolume: 100
```


This is a global memory. It shows which shows the items that the player has unlocked


## Progression

```yaml
progression:
  - id: 'asdf'
    type: 'bgm'
    value: 'bgm1'
  - id: '222'
    type: 'cg'
    value: 'cg1'
  - id: '333'
    type: 'bgm'
    value: 'bgm2'
  - id: '444' 
    type: 'scene1'
    value: 'scene1'
```

## Save Data

Save data is self explanatory

```yaml
saveData:
  - id: "saveData1"
    name: "Save Data 1"
    screenshot: "screenshot1.png"
    checkpoint:
      sceneId: "scene1"
      sectionId: "section1"
      stepId: "step1"
    variables:
      - id: "var1"
        value: "value1"
      - id: "var2"
        value: "value2"

```




## GUI

GUI is neede to display items such as menu items, dialogue box, and any other interactive elements.
Try to put most of the GUI stuff directly into images. if you need interactive stuff the use this GUI.

GUI specification will follow this Anchor Layout specification.

Other than that, GUI items will just be an asset item.

GUI interactions will emit those events:
