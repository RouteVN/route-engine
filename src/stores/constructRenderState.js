import { parseAndRender } from "jempl";
import { createSequentialActionsExecutor, formatDate } from "../util.js";

const jemplFunctions = {
  objectValues: (obj) =>
    Object.entries(obj).map(([id, value]) => ({ id, ...value })),
  formatDate,
};

export const createInitialState = () => {
  return {
    elements: [
      {
        id: "story",
        type: "container",
        x: 0,
        y: 0,
        children: [],
      },
    ],
    animations: [],
    audio: [],
    global: {},
  };
};

/**
 * @param {Object} params
 */
export const addBase = (state, { presentationState, resources }) => {
  const { elements } = state;
  if (presentationState.base) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) {
      return state;
    }

    if (presentationState.base.resourceId) {
      const layout = resources?.layouts[presentationState.base.resourceId];

      if (layout) {
        // Add base as the first child of story container
        storyContainer.children.unshift({
          id: "base",
          type: "container",
          children: layout.elements,
        });
      }
    }
  }
  return state;
};

/**
 *
 * @param {Object} params
 */
export const addBackgroundOrCg = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources = {},
    variables,
    autoMode,
    skipMode,
    currentLocalizationPackageId,
  }, // resolveFile
) => {
  const { elements } = state;
  const animations = state.animations || [];
  if (presentationState.background) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) {
      return state;
    }

    if (presentationState.background.resourceId) {
      const { images = {}, videos = {} } = resources;
      const background =
        images[presentationState.background.resourceId] ||
        videos[presentationState.background.resourceId];
      if (background) {
        const isVideo =
          videos[presentationState.background.resourceId] !== undefined;
        const element = {
          id: `bg-cg-${presentationState.background.resourceId}`,
          type: isVideo ? "video" : "sprite",
          x: 0,
          y: 0,
          src: background.fileId,
          width: background.width,
          height: background.height,
        };

        if (isVideo) {
          element.loop = background.loop ?? false;
          element.volume = background.volume ?? 500;
        }

        storyContainer.children.push(element);
      }
    }

    if (presentationState.background.resourceId) {
      const { layouts = {} } = resources;
      const layout = layouts[presentationState.background.resourceId];
      if (layout) {
        storyContainer.children.push({
          id: `bg-cg-${presentationState.background.resourceId}`,
          type: "container",
          children: layout.elements,
        });
      }
    }

    if (presentationState.background.animations) {
      if (presentationState.background.animations.in) {
        const tweenId = presentationState.background.animations.in.resourceId;
        const tween = resources?.tweens[tweenId];
        if (tween) {
          animations.push({
            id: "bg-cg-animation-in",
            type: "tween",
            targetId: `bg-cg-${presentationState.background.resourceId}`,
            properties: tween.properties,
          });
        }
      }

      if (presentationState.background.animations.out) {
        const tweenId = presentationState.background.animations.out.resourceId;
        const targetResourceId =
          previousPresentationState?.background?.resourceId;
        const tween = resources?.tweens[tweenId];
        if (tween && targetResourceId) {
          animations.push({
            id: "bg-cg-animation-out",
            type: "tween",
            targetId: `bg-cg-${targetResourceId}`,
            properties: tween.properties,
          });
        }
      }

      if (presentationState.background.animations.update) {
        const tweenId =
          presentationState.background.animations.update.resourceId;
        const tween = resources?.tweens[tweenId];
        if (tween) {
          animations.push({
            id: "bg-cg-animation-update",
            type: "tween",
            targetId: `bg-cg-${presentationState.background.resourceId}`,
            properties: tween.properties,
          });
        }
      }
    }
  }
  return state;
};

/**
 *
 * @param {Object} params
 */
export const addCharacters = (state, { presentationState, resources }) => {
  const { elements } = state;
  const animations = state.animations || [];
  if (presentationState.character && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.character.items || [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { transformId, sprites } = item;

      // For out animations only, we don't need to create a container
      if (item.animations && item.animations.out && !sprites && !transformId) {
        // Just add the out animation transition, container should already exist
        const tweenId = item.animations.out.resourceId;
        const tween = resources?.tweens[tweenId];
        if (tween) {
          const outTransition = {
            id: `character-animation-out`,
            type: "tween",
            targetId: `character-container-${item.id}`,
            properties: tween.properties,
          };
          animations.push(outTransition);
        }
        continue;
      }

      // Skip items without required properties for creating containers
      if (!sprites || sprites.length === 0 || !transformId) {
        console.warn("Character item missing sprites or transformId:", item);
        continue;
      }

      const spritePartIds = sprites.map(({ resourceId }) => resourceId);
      const containerId = `character-container-${item.id}-${i}-${spritePartIds.join("-")}`;
      const transform = resources.transforms[transformId];
      if (!transform) {
        console.warn("Transform not found:", transformId);
        continue;
      }
      const characterContainer = {
        type: "container",
        id: containerId,
        x: item.x ?? transform.x,
        y: item.y ?? transform.y,
        anchorX: transform.anchorX,
        anchorY: transform.anchorY,
        rotation: transform.rotation,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        children: [],
      };

      for (const sprite of sprites) {
        const imageResource = resources.images[sprite.resourceId];
        if (!imageResource) {
          console.warn(`Image resource not found: ${sprite.resourceId}`);
          continue;
        }

        characterContainer.children.push({
          type: "sprite",
          id: `${containerId}-${sprite.id}`,
          src: imageResource.fileId,
          width: imageResource.width,
          height: imageResource.height,
          x: 0,
          y: 0,
        });
      }

      storyContainer.children.push(characterContainer);

      // Add animation support (except out, which is handled above)
      if (item.animations) {
        if (item.animations.in) {
          const tweenId = item.animations.in.resourceId;
          const tween = resources?.tweens[tweenId];
          if (tween) {
            animations.push({
              id: `character-animation-in`,
              type: "tween",
              targetId: containerId,
              properties: tween.properties,
            });
          }
        }

        if (item.animations.update) {
          const tweenId = item.animations.update.resourceId;
          const tween = resources?.tweens[tweenId];
          if (tween) {
            const updateTransition = {
              id: `character-animation-update`,
              type: "tween",
              targetId: containerId,
              properties: tween.properties,
            };
            animations.push(updateTransition);
          }
        }
      }
    }
  }
  return state;
};

/**
 *
 * @param {Object} params
 */
export const addVisuals = (state, { presentationState, resources }) => {
  const { elements } = state;
  const animations = state.animations || [];
  if (presentationState.visual && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.visual.items;
    for (const item of items) {
      if (item.resourceId) {
        const { images = {}, videos = {}, spritesheets = {} } = resources;

        const spritesheet = spritesheets[item.resourceId];
        if (spritesheet) {
          const transform = resources.transforms?.[item.transformId] || {};
          const animationName = item.animationName;

          if (animationName) {
            const animationDef = spritesheet.animations?.[animationName];

            if (!animationDef) {
              throw new Error(
                `Animation '${animationName}' not found in spritesheet resource '${item.resourceId}'`,
              );
            }

            const element = {
              id: `visual-${item.id}`,
              type: "animated-sprite",
              x: item.x ?? transform.x ?? 0,
              y: item.y ?? transform.y ?? 0,
              width: item.width ?? 100,
              height: item.height ?? 100,
              alpha: item.alpha ?? 1,
              anchorX: transform.anchorX,
              anchorY: transform.anchorY,
              rotation: transform.rotation,
              scaleX: transform.scaleX,
              scaleY: transform.scaleY,
              spritesheetSrc: spritesheet.fileId,
              spritesheetData: spritesheet.jsonData,
              animation: {
                frames: animationDef.frames,
                animationSpeed:
                  item.animationSpeed ?? animationDef.animationSpeed ?? 0.5,
                loop: item.loop ?? animationDef.loop ?? true,
              },
            };
            storyContainer.children.push(element);
          }
        } else {
          let resource = images[item.resourceId] || videos[item.resourceId];

          if (resource) {
            const isVideo = videos[item.resourceId] !== undefined;
            const transform = resources.transforms[item.transformId];
            const element = {
              id: `visual-${item.id}`,
              type: isVideo ? "video" : "sprite",
              src: resource.fileId,
              width: resource.width,
              height: resource.height,
              x: transform.x,
              y: transform.y,
              anchorX: transform.anchorX,
              anchorY: transform.anchorY,
              rotation: transform.rotation,
              scaleX: transform.scaleX,
              scaleY: transform.scaleY,
            };

            if (isVideo) {
              element.loop = resource.loop ?? false;
              element.volume = resource.volume ?? 500;
            }

            storyContainer.children.push(element);
          }
        }
      }

      if (item.resourceId) {
        const { layouts = {} } = resources;
        let layout = layouts[item.resourceId];

        if (layout) {
          const transform = resources.transforms[item.transformId];
          storyContainer.children.push({
            id: `visual-${item.id}`,
            type: "container",
            children: layout.elements,
            x: transform.x,
            y: transform.y,
            anchorX: transform.anchorX,
            anchorY: transform.anchorY,
            rotation: transform.rotation,
            scaleX: transform.scaleX,
            scaleY: transform.scaleY,
          });
        }
      }

      if (item.animations) {
        if (item.animations.in) {
          const tweenId = item.animations.in.resourceId || item.animations.in;
          const tween = resources?.tweens[tweenId];
          if (tween) {
            animations.push({
              id: `${item.id}-animation`,
              type: "tween",
              targetId: `visual-${item.id}`,
              properties: tween.properties,
            });
          }
        }

        if (item.animations.out) {
          const tweenId = item.animations.out.resourceId || item.animations.out;
          const tween = resources?.tweens[tweenId];
          if (tween) {
            animations.push({
              id: `${item.id}-animation-2`,
              type: "tween",
              targetId: `visual-${item.id}`,
              properties: tween.properties,
            });
          }
        }
      }
    }
  }
  return state;
};

/**
 *
 * @param {Object} params
 */
export const addDialogue = (
  state,
  {
    presentationState,
    resources = {},
    dialogueUIHidden,
    autoMode,
    skipMode,
    skipOnlyViewedLines,
    l10n,
    variables,
    saveSlots = [],
  },
) => {
  const { elements } = state;
  if (!presentationState.dialogue) {
    return state;
  }

  if (dialogueUIHidden) {
    return state;
  }

  // Find the story container
  const storyContainer = elements.find((el) => el.id === "story");
  if (!storyContainer) return state;

  // Handle GUI elements (dialogue layouts) from dialogue.gui.resourceId
  if (
    presentationState.dialogue.gui &&
    presentationState.dialogue.gui.resourceId
  ) {
    const { layouts = {} } = resources;
    const guiLayout = layouts[presentationState.dialogue.gui.resourceId];
    if (guiLayout) {
      let character;
      if (presentationState.dialogue.characterId) {
        character =
          resources.characters[presentationState.dialogue.characterId];
      }

      // Check if there's a character object override
      if (presentationState.dialogue.character) {
        character = {
          ...character,
          name: presentationState.dialogue.character.name,
        };
      }

      const wrappedTemplate = { elements: guiLayout.elements };

      const templateData = {
        variables,
        autoMode,
        skipMode,
        skipOnlyViewedLines,
        saveSlots,
        dialogue: {
          character: {
            name: character?.name || "",
          },
          content: presentationState.dialogue?.content || [{ text: "" }],
          lines: presentationState.dialogue?.lines || [],
        },
        l10n,
      };

      let result = parseAndRender(wrappedTemplate, templateData, {
        functions: jemplFunctions,
      });
      result = parseAndRender(result, {
        l10n,
      });
      const guiElements = result?.elements;

      if (Array.isArray(guiElements)) {
        for (const element of guiElements) {
          storyContainer.children.push(structuredClone(element));
        }
      } else if (guiElements) {
        storyContainer.children.push(structuredClone(guiElements));
      }
    }
  }

  return state;
};

/**
 *
 * @param {Object} params
 */
export const addChoices = (state, { presentationState, resources }) => {
  const { elements } = state;
  if (presentationState.choice && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    storyContainer.children.push({
      id: "choice-blocker",
      type: "rect",
      fill: "transparent",
      width: 1920,
      height: 1080,
      x: 0,
      y: 0,
      click: {
        actionPayload: {
          actions: {},
        },
      },
    });

    const layout = resources?.layouts[presentationState.choice.resourceId];
    if (!layout || !layout.elements) return state;

    const wrappedTemplate = { elements: layout.elements };
    const result = parseAndRender(wrappedTemplate, {
      choice: {
        items: presentationState.choice?.items ?? [],
      },
    });
    const choiceElements = result?.elements;

    if (Array.isArray(choiceElements)) {
      for (const element of choiceElements) {
        storyContainer.children.push(structuredClone(element));
      }
    } else if (choiceElements) {
      storyContainer.children.push(structuredClone(choiceElements));
    }
  }
  return state;
};

export const addKeyboard = (state, { presentationState, resources }) => {
  if (presentationState.keyboard?.resourceId) {
    const keyboardMapping =
      resources?.keyboards?.[presentationState.keyboard.resourceId];
    if (keyboardMapping) {
      state.global.keyboard = keyboardMapping;
    }
  }
  return state;
};

export const addBgm = (state, { presentationState, resources }) => {
  const { elements, audio } = state;
  if (presentationState.bgm && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const audioResource = resources.sounds[presentationState.bgm.resourceId];
    if (!audioResource) return state;
    audio.push({
      id: "bgm",
      type: "sound",
      src: audioResource.fileId,
      loop: presentationState.bgm.loop ?? true,
      volume: presentationState.bgm.volume ?? 500,
      delay: presentationState.bgm.delay ?? null,
    });
  }
  return state;
};

export const addSfx = (state, { presentationState, resources }) => {
  const { audio: audioElements } = state;

  if (presentationState.sfx && resources) {
    // Find the story container
    const items = presentationState.sfx.items;
    for (const item of items) {
      const audioResource = resources.sounds?.[item.resourceId];
      if (!audioResource) continue;

      audioElements.push({
        id: item.id,
        type: "sound",
        src: audioResource.fileId,
        loop: item.loop ?? audioResource.loop ?? true,
        volume: item.volume ?? audioResource.volume ?? 500,
        delay: item.delay ?? audioResource.delay ?? null,
      });
    }
  }

  return state;
};

export const addVoice = (state, { presentationState, resources }) => {
  const { audio } = state;

  if (!presentationState?.voice) {
    return state;
  }

  const { fileId, volume, loop } = presentationState.voice;

  audio.push({
    id: `voice-${fileId}`,
    type: "sound",
    src: fileId,
    volume: volume ?? 500,
    loop: loop ?? false,
  });

  return state;
};

/**
 * Adds layout elements from presentation to state
 * @param {Object} params
 */
export const addLayout = (
  state,
  {
    presentationState,
    resources = {},
    variables,
    autoMode,
    skipMode,
    currentLocalizationPackageId,
    saveSlots = [],
  },
) => {
  const { elements } = state;
  const animations = state.animations || [];
  if (presentationState.layout) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const layout = resources.layouts[presentationState.layout.resourceId];

    if (!layout) {
      return state;
    }

    if (Array.isArray(layout.transitions)) {
      layout.transitions.forEach((transition) => {
        animations.push(transition);
      });
    }

    const layoutContainer = {
      id: `layout-${presentationState.layout.resourceId}`,
      type: "container",
      x: 0,
      y: 0,
      children: layout.elements || [],
    };

    const templateData = {
      variables,
      saveSlots,
      autoMode,
      skipMode,
      currentLocalizationPackageId,
    };

    let processedContainer = parseAndRender(layoutContainer, templateData, {
      functions: jemplFunctions,
    });
    processedContainer = parseAndRender(processedContainer, {
      i18n: {},
      // i18n: systemStore.selectCurrentLanguagePackKeys(),
    });

    const processElementAfterRender = (element) => {
      const processedElement = { ...element };

      if (element.src && element.src.startsWith("file:")) {
        processedElement.src = element.src;
      }

      if (element.children && Array.isArray(element.children)) {
        processedElement.children = element.children.map(
          processElementAfterRender,
        );
      }

      return processedElement;
    };

    // Push the processed container
    storyContainer.children.push(processElementAfterRender(processedContainer));
  }
  return state;
};

export const addLayeredViews = (
  state,
  {
    resources = {},
    variables,
    autoMode,
    skipMode,
    currentLocalizationPackageId,
    layeredViews = [],
    dialogueHistory = [],
    saveSlots = [],
    l10n,
  },
) => {
  const { elements } = state;
  const animations = state.animations || [];
  if (layeredViews && layeredViews.length > 0) {
    // Add each layeredView as an overlay
    layeredViews.forEach((layeredView, index) => {
      const layout = resources.layouts[layeredView.resourceId];

      if (!layout) {
        console.warn(`LayeredView layout not found: ${layeredView.resourceId}`);
        return;
      }

      if (Array.isArray(layout.transitions)) {
        layout.transitions.forEach((transition) => {
          animations.push(transition);
        });
      }

      // Create a container for this layeredView
      const layeredViewContainer = {
        id: `layeredView-${index}`,
        type: "container",
        x: 0,
        y: 0,
        children: layout.elements || [],
      };

      const historyDialogueWithNames = dialogueHistory.map((item) => {
        const character = resources.characters?.[item.characterId];
        return {
          ...item,
          characterName: character?.name || "",
        };
      });

      const templateData = {
        variables,
        autoMode,
        skipMode,
        currentLocalizationPackageId,
        saveSlots,
        historyDialogue: historyDialogueWithNames,
        characters: resources.characters || {},
      };

      let processedLayeredView = parseAndRender(
        layeredViewContainer,
        templateData,
        {
          functions: jemplFunctions,
        },
      );
      processedLayeredView = parseAndRender(processedLayeredView, {
        i18n: {},
        l10n,
      });

      elements.push(processedLayeredView);
    });
  }
  return state;
};

export const constructRenderState = (params) => {
  const actions = [
    addBase,
    addBackgroundOrCg,
    addCharacters,
    addVisuals,
    addDialogue,
    addChoices,
    addKeyboard,
    addLayout,
    addBgm,
    addSfx,
    addVoice,
    addLayeredViews,
  ];

  const executeActions = createSequentialActionsExecutor(
    createInitialState,
    actions,
  );

  return executeActions(params);
};
