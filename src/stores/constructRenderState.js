import { parseAndRender } from "jempl";
import { createSequentialActionsExecutor, formatDate } from "../util.js";

const jemplFunctions = {
  objectValues: (obj) =>
    Object.entries(obj).map(([id, value]) => ({ id, ...value })),
  formatDate,
};

/**
 * Interpolates dialogue text using jempl parseAndRender.
 * @param {string} text - The text containing ${...} patterns
 * @param {Object} data - Data object to resolve variables from
 * @returns {string} - Interpolated text
 */
const interpolateDialogueText = (text, data) => {
  if (!text || typeof text !== "string") return text;
  if (!text.includes("${")) return text;

  const rendered = parseAndRender(text, data);
  // Avoid rendering object values as "[object Object]" in text nodes.
  if (rendered && typeof rendered === "object") return text;
  return rendered;
};

/**
 * Helper to push in/out/update animations based on previous and current state
 * @param {Object} params
 * @param {Array} params.animations - The animations array to push to
 * @param {Object} params.animationsDef - The animations definition (in/out/update)
 * @param {Object} params.resources - The resources object containing tweens
 * @param {string|undefined} params.previousResourceId - Previous resource ID
 * @param {string|undefined} params.currentResourceId - Current resource ID
 * @param {string} params.idPrefix - Prefix for animation IDs
 * @param {string} params.targetId - Target element ID for in/update animations
 * @param {string} params.outTargetId - Target element ID for out animation (defaults to targetId)
 */
const pushAnimations = ({
  animations,
  animationsDef,
  resources,
  previousResourceId,
  currentResourceId,
  idPrefix,
  targetId,
  outTargetId,
}) => {
  if (!animationsDef) return;

  if (animationsDef.in) {
    const tweenId = animationsDef.in.resourceId || animationsDef.in;
    const tween = resources?.tweens?.[tweenId];
    if (tween && !previousResourceId) {
      animations.push({
        id: `${idPrefix}-animation-in`,
        type: "tween",
        targetId,
        properties: structuredClone(tween.properties),
      });
    }
  }

  if (animationsDef.out) {
    const tweenId = animationsDef.out.resourceId || animationsDef.out;
    const tween = resources?.tweens?.[tweenId];
    if (
      tween &&
      previousResourceId &&
      previousResourceId !== currentResourceId
    ) {
      animations.push({
        id: `${idPrefix}-animation-out`,
        type: "tween",
        targetId: outTargetId || targetId,
        properties: structuredClone(tween.properties),
      });
    }
  }

  if (animationsDef.update) {
    const tweenId = animationsDef.update.resourceId || animationsDef.update;
    const tween = resources?.tweens?.[tweenId];
    if (
      tween &&
      previousResourceId &&
      previousResourceId === currentResourceId
    ) {
      animations.push({
        id: `${idPrefix}-animation-update`,
        type: "tween",
        targetId,
        properties: structuredClone(tween.properties),
      });
    }
  }
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
export const addBase = (state, { presentationState, resources, variables }) => {
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
        const baseContainer = {
          id: "base",
          type: "container",
          children: layout.elements,
        };

        const processedContainer = parseAndRender(
          baseContainer,
          { variables },
          { functions: jemplFunctions },
        );

        storyContainer.children.unshift(processedContainer);
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
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
  },
) => {
  const { elements, animations } = state;
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
        const bgContainer = {
          id: `bg-cg-${presentationState.background.resourceId}`,
          type: "container",
          children: layout.elements,
        };
        const processedContainer = parseAndRender(
          bgContainer,
          { variables },
          { functions: jemplFunctions },
        );
        storyContainer.children.push(processedContainer);
      }
    }

    if (
      presentationState.background.animations &&
      !isLineCompleted &&
      !skipTransitionsAndAnimations
    ) {
      const previousResourceId =
        previousPresentationState?.background?.resourceId;
      const currentResourceId = presentationState.background.resourceId;

      pushAnimations({
        animations,
        animationsDef: presentationState.background.animations,
        resources,
        previousResourceId,
        currentResourceId,
        idPrefix: "bg-cg",
        targetId: `bg-cg-${currentResourceId}`,
        outTargetId: `bg-cg-${previousResourceId}`,
      });
    }
  }
  return state;
};

/**
 *
 * @param {Object} params
 */
export const addCharacters = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources,
    isLineCompleted,
    skipTransitionsAndAnimations,
  },
) => {
  const { elements, animations } = state;
  if (presentationState.character && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.character.items || [];
    const previousItems = previousPresentationState?.character?.items || [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { transformId, sprites } = item;

      // Find previous item with same id
      const previousItem = previousItems.find((p) => p.id === item.id);
      const previousHasSprites =
        previousItem?.sprites && previousItem.sprites.length > 0;
      const currentHasSprites = sprites && sprites.length > 0;

      // For out animations only, we don't need to create a container
      if (item.animations && item.animations.out && !sprites && !transformId) {
        // Just add the out animation transition, container should already exist
        if (!isLineCompleted && previousHasSprites) {
          const tweenId = item.animations.out.resourceId;
          const tween = resources?.tweens?.[tweenId];
          if (tween) {
            const outTransition = {
              id: `character-animation-out`,
              type: "tween",
              targetId: `character-container-${item.id}`,
              properties: tween.properties,
            };
            animations.push(outTransition);
          }
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
      if (
        item.animations &&
        !isLineCompleted &&
        !skipTransitionsAndAnimations
      ) {
        // Use boolean flags as "resource IDs" for the helper
        // previousHasSprites/currentHasSprites work because helper checks truthiness and equality
        pushAnimations({
          animations,
          animationsDef: item.animations,
          resources,
          previousResourceId: previousHasSprites,
          currentResourceId: currentHasSprites,
          idPrefix: "character",
          targetId: containerId,
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
export const addVisuals = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources,
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
  },
) => {
  const { elements, animations } = state;
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
              width: item.width ?? spritesheet.width,
              height: item.height ?? spritesheet.height,
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
            storyContainer.children.push(structuredClone(element));
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
          const visualContainer = {
            id: `visual-${item.id}`,
            type: "container",
            children: structuredClone(layout.elements),
            x: transform.x,
            y: transform.y,
            anchorX: transform.anchorX,
            anchorY: transform.anchorY,
            rotation: transform.rotation,
            scaleX: transform.scaleX,
            scaleY: transform.scaleY,
          };
          const processedContainer = parseAndRender(
            visualContainer,
            { variables },
            { functions: jemplFunctions },
          );
          storyContainer.children.push(processedContainer);
        }
      }

      if (
        item.animations &&
        !isLineCompleted &&
        !skipTransitionsAndAnimations
      ) {
        const previousItems = previousPresentationState?.visual?.items || [];
        const previousItem = previousItems.find((p) => p.id === item.id);

        pushAnimations({
          animations,
          animationsDef: item.animations,
          resources,
          previousResourceId: previousItem?.resourceId,
          currentResourceId: item.resourceId,
          idPrefix: item.id,
          targetId: `visual-${item.id}`,
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
export const addDialogue = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources = {},
    dialogueUIHidden,
    autoMode,
    skipMode,
    canRollback,
    skipOnlyViewedLines,
    isLineCompleted,
    skipTransitionsAndAnimations,
    l10n,
    variables,
    saveSlots = [],
  },
) => {
  const { elements, animations } = state;

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
        canRollback,
        skipOnlyViewedLines,
        isLineCompleted,
        saveSlots,
        effectiveSoundVolume: variables?._muteAll
          ? 0
          : (variables?._soundVolume ?? 500),
        textSpeed: variables?._textSpeed ?? 50,
        dialogue: {
          character: {
            name: character?.name || "",
          },
          content: (presentationState.dialogue?.content || [{ text: "" }]).map(
            (item) => ({
              ...item,
              text: interpolateDialogueText(item.text, { variables, l10n }),
            }),
          ),
          lines: (presentationState.dialogue?.lines || []).map((line) => ({
            content: line.content?.map((item) => ({
              ...item,
              text: interpolateDialogueText(item.text, { variables, l10n }),
            })),
            characterName: line.characterId
              ? resources.characters?.[line.characterId]?.name || ""
              : "",
          })),
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

  // Handle dialogue GUI animations
  if (
    presentationState.dialogue.gui?.animations &&
    !isLineCompleted &&
    !skipTransitionsAndAnimations
  ) {
    pushAnimations({
      animations,
      animationsDef: presentationState.dialogue.gui.animations,
      resources,
      previousResourceId: previousPresentationState?.dialogue?.gui?.resourceId,
      currentResourceId: presentationState.dialogue.gui?.resourceId,
      idPrefix: "dialogue-gui",
      targetId: "dialogue-container",
    });
  }

  return state;
};

/**
 *
 * @param {Object} params
 */
export const addChoices = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources,
    isLineCompleted,
    skipTransitionsAndAnimations,
    screen,
  },
) => {
  const { elements, animations } = state;
  if (presentationState.choice && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    storyContainer.children.push({
      id: "choice-blocker",
      type: "rect",
      fill: "transparent",
      width: screen.width,
      height: screen.height,
      x: 0,
      y: 0,
      click: {
        actionPayload: {
          actions: {},
        },
      },
    });

    const layout = resources?.layouts[presentationState.choice.resourceId];
    if (layout && layout.elements) {
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

    // Handle choice animations
    if (
      presentationState.choice.animations &&
      !isLineCompleted &&
      !skipTransitionsAndAnimations
    ) {
      pushAnimations({
        animations,
        animationsDef: presentationState.choice.animations,
        resources,
        previousResourceId: previousPresentationState?.choice?.resourceId,
        currentResourceId: presentationState.choice.resourceId,
        idPrefix: "choice",
        targetId: "choice-container",
      });
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

export const addBgm = (state, { presentationState, resources, variables }) => {
  const { elements, audio } = state;
  if (presentationState.bgm && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const audioResource = resources.sounds[presentationState.bgm.resourceId];
    if (!audioResource) return state;

    // Calculate effective music volume respecting _muteAll and _musicVolume
    const effectiveMusicVolume = variables?._muteAll
      ? 0
      : (variables?._musicVolume ?? 500);

    audio.push({
      id: "bgm",
      type: "sound",
      src: audioResource.fileId,
      loop: presentationState.bgm.loop ?? true,
      volume: effectiveMusicVolume,
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
    previousPresentationState,
    resources = {},
    variables,
    autoMode,
    skipMode,
    canRollback,
    currentLocalizationPackageId,
    saveSlots = [],
    isLineCompleted,
    skipTransitionsAndAnimations,
  },
) => {
  const { elements, animations } = state;
  if (presentationState.layout) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const layout = resources.layouts[presentationState.layout.resourceId];

    if (!layout) {
      return state;
    }

    if (
      Array.isArray(layout.transitions) &&
      !isLineCompleted &&
      !skipTransitionsAndAnimations
    ) {
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
      canRollback,
      currentLocalizationPackageId,
      effectiveSoundVolume: variables?._muteAll
        ? 0
        : (variables?._soundVolume ?? 500),
      textSpeed: variables?._textSpeed ?? 50,
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

  // Handle layout animations
  if (
    presentationState.layout?.animations &&
    !isLineCompleted &&
    !skipTransitionsAndAnimations
  ) {
    const previousResourceId = previousPresentationState?.layout?.resourceId;
    const currentResourceId = presentationState.layout?.resourceId;

    pushAnimations({
      animations,
      animationsDef: presentationState.layout.animations,
      resources,
      previousResourceId,
      currentResourceId,
      idPrefix: "layout",
      targetId: `layout-${currentResourceId}`,
      outTargetId: `layout-${previousResourceId}`,
    });
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
    canRollback,
    currentLocalizationPackageId,
    layeredViews = [],
    dialogueHistory = [],
    saveSlots = [],
    l10n,
    screen,
  },
) => {
  const { elements, animations } = state;
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
        children: [
          {
            id: `layeredView-${index}-blocker`,
            type: "rect",
            fill: "transparent",
            width: screen.width,
            height: screen.height,
            x: 0,
            y: 0,
            click: {
              actionPayload: {
                actions: {},
              },
            },
          },
          ...(layout.elements || []),
        ],
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
        canRollback,
        currentLocalizationPackageId,
        saveSlots,
        effectiveSoundVolume: variables?._muteAll
          ? 0
          : (variables?._soundVolume ?? 500),
        textSpeed: variables?._textSpeed ?? 50,
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
