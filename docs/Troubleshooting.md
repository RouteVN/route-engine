# Troubleshooting Guide

This guide helps you diagnose and fix common issues when working with route-engine.

## Table of Contents

- [Error Handling Best Practices](#error-handling-best-practices)
- [Installation Issues](#installation-issues)
- [Initialization Problems](#initialization-problems)
- [Rendering Issues](#rendering-issues)
- [Navigation Problems](#navigation-problems)
- [Audio Issues](#audio-issues)
- [Save/Load Issues](#save-load-issues)
- [Variable Issues](#variable-issues)
- [Performance Issues](#performance-issues)
- [Debugging Tips](#debugging-tips)

## Error Handling Best Practices

### Wrapping Engine Operations

The engine can throw errors for invalid operations. Wrap critical operations in try-catch blocks:

```javascript
// Safe initialization
const initializeEngine = async () => {
  try {
    const response = await fetch('/projectData.yaml');
    const projectDataText = await response.text();
    const projectData = jsYaml.load(projectDataText);

    engine.init({
      initialState: {
        global: { currentLocalizationPackageId: 'en' },
        projectData
      }
    });
  } catch (error) {
    console.error('Failed to initialize engine:', error);
    // Show user-friendly error message
    showErrorScreen('Failed to load game data. Please refresh.');
  }
};

// Safe action handling
const safeHandleAction = (actionType, payload) => {
  try {
    engine.handleAction(actionType, payload);
  } catch (error) {
    console.error(`Action failed: ${actionType}`, error);
    // Recover or notify user
  }
};
```

### Safe localStorage Access

Always wrap localStorage operations to handle quota errors and unavailability:

```javascript
const safeLocalStorage = {
  getItem: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.warn(`Failed to read ${key} from localStorage:`, error);
      return defaultValue;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Failed to write ${key} to localStorage:`, error);
      return false;
    }
  }
};

// Usage
const saveSlots = safeLocalStorage.getItem('saveSlots', {});
const globalDeviceVariables = safeLocalStorage.getItem('globalDeviceVariables', {});
```

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Section not found: {id}` | Invalid `sectionId` in `sectionTransition` | Verify section exists in project data |
| `Line not found: {id}` | Invalid `lineId` in `jumpToLine` | Verify line exists in target section |
| `No context available` | Action called before `init()` | Ensure `engine.init()` completes first |
| `updateVariable requires an id field` | Missing `id` in `updateVariable` action | Add unique `id` to action definition |
| `rollbackByOffset requires negative offset` | Positive offset passed to rollback | Use negative values (e.g., `-1`, `-2`) |

### Graceful Degradation

When errors occur, degrade gracefully rather than crashing:

```javascript
const effectsHandler = createEffectsHandler({
  getEngine: () => engine,
  routeGraphics,
  ticker
});

// Wrap the effects handler to catch rendering errors
const safeEffectsHandler = async (effects) => {
  try {
    await effectsHandler(effects);
  } catch (error) {
    console.error('Effects handler error:', error);

    // Attempt recovery - at minimum, try to render current state
    try {
      const renderState = engine.selectRenderState();
      routeGraphics.render(renderState);
    } catch (renderError) {
      console.error('Recovery render failed:', renderError);
    }
  }
};

const engine = createRouteEngine({
  handlePendingEffects: safeEffectsHandler
});
```

### Validating Project Data

Validate project data before initialization to catch configuration errors early:

```javascript
const validateProjectData = (data) => {
  const errors = [];

  // Required fields
  if (!data.story?.initialSceneId) {
    errors.push('Missing story.initialSceneId');
  }

  // Initial scene must exist
  const initialScene = data.story?.scenes?.[data.story?.initialSceneId];
  if (!initialScene) {
    errors.push(`Initial scene '${data.story?.initialSceneId}' not found`);
  }

  // Initial section must exist
  if (initialScene && !initialScene.sections?.[initialScene.initialSectionId]) {
    errors.push(`Initial section '${initialScene.initialSectionId}' not found`);
  }

  // Section must have lines
  const initialSection = initialScene?.sections?.[initialScene?.initialSectionId];
  if (initialSection && (!initialSection.lines || initialSection.lines.length === 0)) {
    errors.push('Initial section has no lines');
  }

  return errors;
};

// Usage
const errors = validateProjectData(projectData);
if (errors.length > 0) {
  console.error('Project data validation failed:', errors);
  throw new Error('Invalid project data: ' + errors.join(', '));
}
```

## Installation Issues

### Module not found errors

**Symptom:** `Cannot find module 'route-engine-js'` or similar errors.

**Solutions:**
1. Verify installation:
   ```bash
   npm list route-engine-js
   ```
2. Reinstall dependencies:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
3. Check your import statement uses the correct package name:
   ```javascript
   // Correct
   import createRouteEngine from 'route-engine-js';

   // Wrong
   import createRouteEngine from 'route-engine';
   ```

### ES Module issues

**Symptom:** `SyntaxError: Cannot use import statement outside a module`

**Solutions:**
1. Add `"type": "module"` to your `package.json`
2. Or use `.mjs` file extension
3. Or use dynamic imports:
   ```javascript
   const { default: createRouteEngine } = await import('route-engine-js');
   ```

## Initialization Problems

### Engine not initializing

**Symptom:** `engine.init()` throws an error or nothing happens.

**Checklist:**
1. Verify projectData structure:
   ```javascript
   console.log('projectData:', projectData);
   // Should have: story.initialSceneId, story.scenes
   ```
2. Check for required fields:
   ```javascript
   // Required structure
   engine.init({
     initialState: {
       global: {
         currentLocalizationPackageId: 'en'  // Must match a l10n package
       },
       projectData: {
         story: {
           initialSceneId: 'scene_id',
           scenes: { /* at least one scene */ }
         }
       }
     }
   });
   ```
3. Ensure the initial scene/section/line exists and is valid.

### YAML parsing errors

**Symptom:** YAML fails to parse with syntax errors.

**Solutions:**
1. Use a YAML validator (VS Code extension or online tool)
2. Check for common YAML issues:
   - Incorrect indentation (must use spaces, not tabs)
   - Missing colons after keys
   - Unquoted strings with special characters
   - Duplicate keys

**Example fix:**
```yaml
# Wrong - tabs
lines:
	- id: line_1  # Tab character

# Correct - spaces
lines:
  - id: line_1  # 2 spaces
```

## Rendering Issues

### Nothing renders to screen

**Symptoms:** Canvas is blank or shows only background color.

**Checklist:**

1. **Verify effects handler is set up:**
   ```javascript
   const engine = createRouteEngine({
     handlePendingEffects: (effects) => {
       console.log('Effects:', effects);  // Should log effects
       effects.forEach(effect => {
         if (effect.name === 'render') {
           const renderState = engine.selectRenderState();
           console.log('Render state:', renderState);  // Should have data
           routeGraphics.render(renderState);
         }
       });
     }
   });
   ```

2. **Check route-graphics initialization:**
   ```javascript
   await routeGraphics.init({
     width: 1920,
     height: 1080,
     plugins: { elements, animations, audio },
     eventHandler: (eventName, payload) => {
       console.log('Event:', eventName, payload);  // Debug events
     }
   });
   ```

3. **Verify canvas is in DOM:**
   ```javascript
   const container = document.getElementById('canvas');
   console.log('Container:', container);  // Should not be null
   container.appendChild(routeGraphics.canvas);
   ```

### Elements positioned incorrectly

**Symptom:** Sprites, text, or backgrounds appear in wrong positions.

**Solutions:**
1. Check transform definitions:
   ```yaml
   transforms:
     center:
       x: 960          # Center of 1920 width
       y: 540          # Center of 1080 height
       anchorX: 0.5    # Anchor at center
       anchorY: 0.5
   ```
2. Verify element references correct transform:
   ```yaml
   character:
     items:
       - id: sprite
         transformId: center  # Must match defined transform
   ```

### Animations not playing

**Symptom:** Elements appear but don't animate.

**Checklist:**
1. Verify tween plugin is loaded in route-graphics
2. Check tween definition syntax:
   ```yaml
   tweens:
     fadeIn:
       properties:
         alpha:
           initialValue: 0
           keyframes:
             - duration: 1000
               value: 1
               easing: linear
   ```
3. Verify animation reference in element:
   ```yaml
   background:
     resourceId: bg_image
     animations:
       in:
         resourceId: fadeIn  # Must match defined tween
   ```

## Navigation Problems

### Lines not advancing

**Symptom:** Clicking/pressing keys doesn't advance to next line.

**Checklist:**

1. **Check nextLineConfig:**
   ```yaml
   # Ensure manual advance is enabled
   - id: line_1
     actions:
       setNextLineConfig:
         manual:
           enabled: true  # Must be true
           requireLineCompleted: false
   ```

2. **Verify event handler:**
   ```javascript
   eventHandler: async (eventName, payload) => {
     if (payload.actions) {
       console.log('Actions:', payload.actions);  // Debug
       engine.handleActions(payload.actions);
     }
   }
   ```

3. **Check if line has choices blocking advance:**
   ```yaml
   # Choice lines won't auto-advance
   - id: choice_line
     actions:
       choice:
         items:
           - id: option_1
             content: "Option 1"
   ```

### Auto mode not working

**Symptom:** Auto mode starts but lines don't advance.

**Checklist:**
1. Verify ticker is running:
   ```javascript
   const ticker = new Ticker();
   ticker.start();  // Must be started
   ```
2. Check auto config:
   ```yaml
   setNextLineConfig:
     auto:
       enabled: true
       trigger: fromComplete  # or fromStart
       delay: 2000
   ```
3. Ensure `handleLineActions` effect is processed.

### Section transitions failing

**Symptom:** `sectionTransition` doesn't navigate to new section.

**Solutions:**
1. Verify target section exists:
   ```yaml
   story:
     scenes:
       my_scene:
         sections:
           target_section:  # Must exist
             lines: [...]
   ```
2. Check action syntax:
   ```yaml
   sectionTransition:
     sectionId: target_section  # Exact match required
   ```

## Audio Issues

### Background music not playing

**Symptom:** BGM action executes but no sound.

**Checklist:**
1. Verify audio plugin is loaded:
   ```javascript
   plugins: {
     audio: [soundPlugin]
   }
   ```
2. Check resource is loaded:
   ```javascript
   await routeGraphics.loadAssets(audioAssets);
   ```
3. Verify browser autoplay policy - user interaction may be required first

### Sound effects not playing

**Symptom:** SFX actions execute but no sound.

**Solutions:**
1. Same as BGM checks above
2. Verify SFX item structure:
   ```yaml
   sfx:
     items:
       - id: effect_1
         resourceId: sfx_click  # Must match loaded resource
   ```

## Save/Load Issues

### Saves not persisting

**Symptom:** Save slots are empty after page reload.

**Checklist:**
1. Verify `saveSlots` effect handler:
   ```javascript
   if (effect.name === 'saveSlots') {
     localStorage.setItem('saveSlots', JSON.stringify(effect.payload.saveSlots));
   }
   ```
2. Check localStorage is available and not full
3. Load saved slots on init:
   ```javascript
   const saveSlots = JSON.parse(localStorage.getItem('saveSlots')) ?? {};
   engine.init({
     initialState: {
       global: { saveSlots },
       projectData
     }
   });
   ```

### Load slot failing

**Symptom:** Loading a save doesn't restore state.

**Solutions:**
1. Verify save data structure is valid
2. Check for schema changes between saves
3. Add error handling:
   ```javascript
   try {
     engine.handleAction('loadSaveSlot', { slot: 1 });
   } catch (error) {
     console.error('Load failed:', error);
   }
   ```

## Variable Issues

### Variables not updating

**Symptom:** `updateVariable` action doesn't change values.

**Checklist:**
1. Verify variable is defined in resources:
   ```yaml
   resources:
     variables:
       myVar:
         type: number
         scope: context
         default: 0
   ```
2. Check updateVariable syntax:
   ```yaml
   updateVariable:
     id: update_1
     operations:
       - variableId: myVar  # Must match defined variable
         op: increment
         value: 1
   ```
3. Verify scope is appropriate:
   - `context`: Reset on new game
   - `global-device`: Persisted to device
   - `global-account`: Persisted to account

### Variable persistence failing

**Symptom:** Global variables reset on reload.

**Solutions:**
1. Handle save effects:
   ```javascript
   if (effect.name === 'saveGlobalDeviceVariables') {
     localStorage.setItem('globalDeviceVariables',
       JSON.stringify(effect.payload.globalDeviceVariables));
   }
   ```
2. Load on init:
   ```javascript
   const globalDeviceVariables = JSON.parse(
     localStorage.getItem('globalDeviceVariables')
   ) ?? {};

   engine.init({
     initialState: {
       global: {
         variables: globalDeviceVariables
       },
       projectData
     }
   });
   ```

## Resource Cleanup

### Destroying the Application

When navigating away from your visual novel (e.g., SPA route changes, page unload), properly cleanup resources to prevent memory leaks:

```javascript
// Complete cleanup pattern
const cleanup = () => {
  // 1. Stop the ticker
  ticker.stop();

  // 2. Destroy route-graphics (releases textures, audio, PixiJS app)
  routeGraphics.destroy();

  // 3. Remove canvas from DOM
  const canvas = document.getElementById('canvas');
  if (canvas) {
    canvas.innerHTML = '';
  }
};

// React example
useEffect(() => {
  // ... initialization code

  return () => {
    cleanup();
  };
}, []);

// Vanilla JS example
window.addEventListener('beforeunload', cleanup);
```

**What `routeGraphics.destroy()` handles:**
- Destroys all loaded textures
- Stops and releases all audio
- Destroys the PixiJS application
- Removes internal asset loader extensions

### Route Engine State

Route Engine itself is a pure state management layer and doesn't hold browser resources. When you're done with an engine instance, simply stop referencing it and let JavaScript garbage collection handle cleanup. There's no explicit `destroy()` method needed.

If you need to reset the engine to initial state (e.g., "New Game"):
```javascript
// Re-initialize with fresh state
engine.init({
  initialState: {
    global: {
      currentLocalizationPackageId: 'en',
      saveSlots: {}, // Start fresh, or preserve existing saves
      variables: {}
    },
    projectData
  }
});
```

### Memory Leak Prevention Checklist

1. **Ticker cleanup**: Always call `ticker.stop()` before destroying
2. **Event listeners**: Remove any custom event listeners you've added
3. **Timers**: Clear any `setInterval`/`setTimeout` you've created
4. **References**: Nullify references to engine and graphics instances
5. **Canvas**: Remove canvas element from DOM after destroy

```javascript
// Complete cleanup example
const fullCleanup = () => {
  // Stop ticker callbacks
  ticker.stop();

  // Clear any custom timers
  if (customTimerId) {
    clearInterval(customTimerId);
  }

  // Remove custom event listeners
  window.removeEventListener('keydown', customKeyHandler);

  // Destroy graphics (textures, audio, PixiJS)
  routeGraphics.destroy();

  // Remove canvas from DOM
  document.getElementById('canvas').innerHTML = '';

  // Clear references (optional but good practice)
  engine = null;
  routeGraphics = null;
};
```

## Performance Issues

### Slow rendering

**Symptoms:** Low FPS, stuttering, or lag.

**Solutions:**
1. Reduce texture sizes if possible
2. Limit simultaneous animations
3. Use sprite sheets instead of individual images
4. Profile with browser DevTools
5. Check for memory leaks (unreleased textures)

### Memory growing over time

**Symptom:** Browser memory usage increases continuously.

**Solutions:**
1. Ensure textures are properly disposed when not needed
2. Check for event listener leaks
3. Profile memory with browser DevTools
4. Clear caches periodically if applicable

## Debugging Tips

### Enable verbose logging

Add console logs to understand data flow:

```javascript
const effectsHandler = (effects) => {
  console.group('Processing Effects');
  effects.forEach(effect => {
    console.log(`Effect: ${effect.name}`, effect.payload);
  });
  console.groupEnd();
  // ... process effects
};

// Log state after actions
engine.handleAction('nextLine');
console.log('Presentation State:', engine.selectPresentationState());
console.log('Render State:', engine.selectRenderState());
```

### Validate project data

Create a validation script:

```javascript
const validateProjectData = (data) => {
  const errors = [];

  // Check required fields
  if (!data.story?.initialSceneId) {
    errors.push('Missing story.initialSceneId');
  }

  // Check initial scene exists
  const initialScene = data.story?.scenes?.[data.story.initialSceneId];
  if (!initialScene) {
    errors.push(`Initial scene '${data.story.initialSceneId}' not found`);
  }

  // Add more checks...

  return errors;
};
```

### Use browser DevTools

1. **Console**: Check for errors and warnings
2. **Network**: Verify assets are loading correctly
3. **Performance**: Profile render performance
4. **Memory**: Track memory usage over time
5. **Application > Local Storage**: Inspect saved data

## Getting More Help

If you're still stuck:

1. Check the [Discord community](https://discord.gg/8J9dyZSu9C) for support
2. Search existing GitHub issues
3. Create a minimal reproduction case
4. Include browser console output and relevant code snippets

## Related Documentation

- [Getting Started](./GettingStarted.md)
- [Core Concepts](./Concepts.md)
- [API Reference](./RouteEngine.md)
- [Project Data Schema](./ProjectDataSchema.md)
