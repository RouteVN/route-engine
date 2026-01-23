# Project Data Schema Reference

This document describes the YAML schema for defining visual novel content in route-engine. The project data file is the heart of your visual novel, containing all story content, resources, and configuration.

## Table of Contents

- [Overview](#overview)
- [Top-Level Structure](#top-level-structure)
- [Screen Configuration](#screen-configuration)
- [Localization (l10n)](#localization-l10n)
- [Resources](#resources)
- [Story](#story)
- [Complete Example](#complete-example)

## Overview

Project data is a YAML file that defines everything about your visual novel:

```yaml
screen:     # Display configuration
l10n:       # Localization/translations
resources:  # Images, audio, characters, transforms, tweens, etc.
story:      # Scenes, sections, and lines
```

## Top-Level Structure

```yaml
screen:
  width: 1920
  height: 1080
  backgroundColor: "#000000"

l10n:
  packages: { ... }

resources:
  variables: { ... }
  images: { ... }
  characters: { ... }
  transforms: { ... }
  tweens: { ... }
  audio: { ... }
  layouts: { ... }
  keyboards: { ... }

story:
  initialSceneId: scene_id
  scenes: { ... }
```

## Screen Configuration

Defines the canvas dimensions and background color.

```yaml
screen:
  width: 1920          # Canvas width in pixels
  height: 1080         # Canvas height in pixels
  backgroundColor: "#000000"  # Background color (hex)
```

## Localization (l10n)

Supports multiple languages for your visual novel.

```yaml
l10n:
  packages:
    en:                        # Package ID (used in currentLocalizationPackageId)
      label: English           # Display name
      lang: en                 # Language code
      keys:                    # Translation key-value pairs
        greeting: "Hello!"
        farewell: "Goodbye!"

    ja:
      label: 日本語
      lang: ja
      keys:
        greeting: "こんにちは！"
        farewell: "さようなら！"
```

Use localization keys in dialogue:

```yaml
dialogue:
  content: "$l10n.greeting"
```

## Resources

### Variables

Game variables with different scopes.

```yaml
resources:
  variables:
    # Device-scoped (persisted to localStorage per device)
    textSpeed:
      type: number
      scope: global-device
      default: 5

    musicVolume:
      type: number
      scope: global-device
      default: 50

    # Account-scoped (persisted to localStorage per account)
    hasCompletedGame:
      type: boolean
      scope: global-account
      default: false

    # Context-scoped (reset on new game)
    currentRoute:
      type: string
      scope: context
      default: "neutral"

    affection:
      type: number
      scope: context
      default: 0

    # Complex types
    inventory:
      type: object
      scope: context
      default:
        items: []
```

**Variable Types:**
- `number`: Numeric values
- `boolean`: true/false values
- `string`: Text values
- `object`: Complex nested data

**Variable Scopes:**
- `global-device`: Saved to device localStorage
- `global-account`: Saved to account localStorage
- `context`: Reset when starting new game

### Images

Define image resources for backgrounds, sprites, UI elements.

```yaml
resources:
  images:
    background_school:
      fileId: background_school    # Asset ID for loading
      width: 1920
      height: 1080

    character_portrait:
      fileId: character_portrait
      width: 400
      height: 600
```

### Characters

Character definitions for dialogue attribution.

```yaml
resources:
  characters:
    narrator:
      name: ""           # Empty for narration

    protagonist:
      name: "Alex"

    friend:
      name: "Sam"
      # Additional character metadata can be added
```

### Transforms

Position and anchor definitions for placing elements.

```yaml
resources:
  transforms:
    center:
      x: 960
      y: 540
      anchorX: 0.5
      anchorY: 0.5

    left:
      x: 400
      y: 540
      anchorX: 0.5
      anchorY: 0.5

    right:
      x: 1520
      y: 540
      anchorX: 0.5
      anchorY: 0.5

    fullscreen:
      x: 0
      y: 0
      anchorX: 0
      anchorY: 0

    dialogue_box:
      x: 960
      y: 950
      anchorX: 0.5
      anchorY: 0.5
```

### Tweens (Animations)

Animation definitions for transitions and effects.

```yaml
resources:
  tweens:
    fadeIn_1s:
      name: "Fade In 1s"
      properties:
        alpha:
          initialValue: 0
          keyframes:
            - duration: 1000
              value: 1
              easing: linear

    fadeOut_1s:
      name: "Fade Out 1s"
      properties:
        alpha:
          keyframes:
            - duration: 1000
              value: 0
              easing: linear

    slideInFromLeft:
      name: "Slide In From Left"
      properties:
        x:
          initialValue: -500
          keyframes:
            - duration: 500
              value: 0
              easing: easeOut
        alpha:
          initialValue: 0
          keyframes:
            - duration: 300
              value: 1
              easing: linear
```

**Available Easing Functions:**
- `linear`
- `easeIn`, `easeOut`, `easeInOut`
- `easeInQuad`, `easeOutQuad`, `easeInOutQuad`
- `easeInCubic`, `easeOutCubic`, `easeInOutCubic`
- And more...

### Audio

Audio resource definitions.

```yaml
resources:
  audio:
    bgm_main:
      fileId: bgm_main
      type: bgm

    sfx_click:
      fileId: sfx_click
      type: sfx

    voice_001:
      fileId: voice_001
      type: voice
```

### Layouts

UI layouts for menus, dialogue boxes, etc.

```yaml
resources:
  layouts:
    dialogue_layout:
      # Layout definition (structure depends on route-graphics)

    main_menu_layout:
      # Menu layout definition
```

### Keyboards

Keyboard shortcut mappings.

```yaml
resources:
  keyboards:
    gameplay:
      mappings:
        Space: nextLine
        Enter: nextLine
        Escape: toggleMenu
        a: toggleAutoMode
        s: toggleSkipMode
```

## Story

### Structure

```yaml
story:
  initialSceneId: splash_screen    # Starting scene
  scenes:
    splash_screen:                  # Scene ID
      name: "Splash Screen"         # Display name
      initialSectionId: intro       # Starting section
      sections:
        intro:                      # Section ID
          name: "Introduction"      # Display name
          lines:                    # Array of lines
            - id: line_1
              actions: { ... }
            - id: line_2
              actions: { ... }
```

### Lines and Actions

Each line can have multiple actions that execute together.

```yaml
lines:
  - id: unique_line_id
    actions:
      # Presentation actions
      background: { ... }
      dialogue: { ... }
      character: { ... }
      visual: { ... }
      bgm: { ... }
      sfx: { ... }
      voice: { ... }
      layout: { ... }
      choice: { ... }

      # System actions
      setNextLineConfig: { ... }
      updateVariable: { ... }
```

### Presentation Actions

#### background

Display a background image.

```yaml
background:
  resourceId: background_school
  animations:
    in:
      resourceId: fadeIn_1s
    out:
      resourceId: fadeOut_1s
```

#### dialogue

Display dialogue text.

```yaml
dialogue:
  characterId: protagonist    # Character speaking (optional)
  content: "Hello, world!"    # Dialogue text (string format)
```

**Content Formats:**

The `content` field accepts two formats:

```yaml
# String format (simple)
dialogue:
  content: "Hello, world!"
  content: "$l10n.greeting"    # Localization reference

# Array format (advanced - for text styling/segments)
dialogue:
  content:
    - text: "Hello, world!"
```

Use string format for simple text. Use array format when you need multiple text segments with different styling (handled by route-graphics).

#### character

Display character sprites.

```yaml
character:
  items:
    - id: protagonist_sprite
      transformId: center
      sprites:
        - id: body
          imageId: protagonist_normal
      animations:
        in:
          resourceId: fadeIn_1s
```

#### visual

Display visual elements (CGs, effects, etc.).

```yaml
visual:
  items:
    - id: effect_sparkle
      resourceId: sparkle_effect
      transformId: center
      animations:
        in:
          resourceId: fadeIn_1s
```

#### bgm

Control background music.

```yaml
bgm:
  resourceId: bgm_emotional
  # Or to stop:
  resourceId: null
```

#### sfx

Play sound effects.

```yaml
sfx:
  items:
    - id: door_open
      resourceId: sfx_door
```

#### voice

Play voice audio.

```yaml
voice:
  fileId: voice_line_001
  volume: 1.0
```

#### layout

Display UI layouts.

```yaml
layout:
  resourceId: game_menu_layout
```

#### choice

Display choice menu.

```yaml
choice:
  resourceId: choice_layout
  items:
    - id: choice_1
      content: "Go left"
    - id: choice_2
      content: "Go right"
```

#### cleanAll

Clear all presentation state (background, characters, dialogue, audio, etc.).

```yaml
cleanAll: true
```

### System Actions

#### setNextLineConfig

Control line advancement behavior.

```yaml
setNextLineConfig:
  manual:
    enabled: true              # Allow user to advance manually
    requireLineCompleted: false  # Require animation to finish first
  auto:
    enabled: true              # Enable auto-advance
    trigger: fromComplete      # fromStart or fromComplete
    delay: 2000                # Milliseconds before advancing
```

#### updateVariable

Modify game variables.

```yaml
updateVariable:
  id: update_1
  operations:
    - variableId: affection
      op: increment
      value: 5
    - variableId: hasMetCharacter
      op: set
      value: true
```

**Available Operations:**
- `set`: Set to value
- `increment`: Add to value (numbers)
- `decrement`: Subtract from value (numbers)
- `multiply`: Multiply by value (numbers)
- `divide`: Divide by value (numbers)
- `toggle`: Toggle boolean value

#### sectionTransition

Navigate to a different section.

```yaml
sectionTransition:
  sectionId: next_section
```

#### pushLayeredView / popLayeredView

Manage view layer stack (for menus, overlays).

```yaml
# Push a new layer
pushLayeredView:
  resourceId: settings_menu

# Pop current layer
popLayeredView: {}

# Replace current layer
replaceLastLayeredView:
  resourceId: new_menu

# Clear all layers
clearLayeredViews: {}
```

#### startAutoMode / stopAutoMode

Control auto-advance mode.

```yaml
startAutoMode: {}
# or
stopAutoMode: {}
# or toggle
toggleAutoMode: {}
```

#### startSkipMode / stopSkipMode

Control skip mode.

```yaml
startSkipMode: {}
# or
stopSkipMode: {}
# or toggle
toggleSkipMode: {}
```

#### saveSaveSlot / loadSaveSlot

Save and load game state.

```yaml
saveSaveSlot:
  slot: 1

loadSaveSlot:
  slot: 1
```

## Complete Example

```yaml
screen:
  width: 1920
  height: 1080
  backgroundColor: "#000000"

l10n:
  packages:
    en:
      label: English
      lang: en
      keys:
        hello: "Hello there!"
        choice_yes: "Yes"
        choice_no: "No"

resources:
  variables:
    textSpeed:
      type: number
      scope: global-device
      default: 5
    playerName:
      type: string
      scope: context
      default: "Player"

  characters:
    narrator:
      name: ""
    alex:
      name: "Alex"

  images:
    bg_park:
      fileId: bg_park
      width: 1920
      height: 1080

  transforms:
    center:
      x: 960
      y: 540
      anchorX: 0.5
      anchorY: 0.5

  tweens:
    fadeIn:
      properties:
        alpha:
          initialValue: 0
          keyframes:
            - duration: 500
              value: 1
              easing: linear

story:
  initialSceneId: main
  scenes:
    main:
      name: Main Story
      initialSectionId: opening
      sections:
        opening:
          name: Opening
          lines:
            - id: line_1
              actions:
                background:
                  resourceId: bg_park
                  animations:
                    in:
                      resourceId: fadeIn
                dialogue:
                  characterId: narrator
                  content: "The sun was shining brightly..."

            - id: line_2
              actions:
                dialogue:
                  characterId: alex
                  content: "$l10n.hello"

            - id: line_3
              actions:
                choice:
                  items:
                    - id: yes
                      content: "$l10n.choice_yes"
                    - id: no
                      content: "$l10n.choice_no"
```

## Best Practices

1. **Use meaningful IDs**: Choose descriptive IDs for lines, sections, and resources
2. **Organize sections logically**: Group related content into sections
3. **Leverage localization**: Even for single-language games, use l10n keys for easy editing
4. **Keep transforms reusable**: Define common positions once and reference them
5. **Use variables wisely**: Choose appropriate scopes based on persistence needs
6. **Comment complex sections**: Add YAML comments to explain complex logic

## Related Documentation

- [Getting Started Guide](./GettingStarted.md)
- [Core Concepts](./Concepts.md)
- [API Reference](./RouteEngine.md)
