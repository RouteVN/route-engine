import { parseAndRender } from "jempl";
import { createSequentialActionsExecutor } from "../util.js";

const jemplFunctions = {
  objectValues: (obj) =>
    Object.entries(obj).map(([id, value]) => ({ id, ...value })),
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
  };
};

/**
 * @param {Object} params
 */
export const addScreen = (state, { presentationState, resources }) => {
  const { elements } = state;
  if (presentationState.screen) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) {
      return state;
    }

    if (
      presentationState.screen.resourceId
    ) {
      const layout = resources?.layouts[presentationState.screen.resourceId];

      if (layout) {
        // Add screen as the first child of story container
        storyContainer.children.unshift({
          id: "screen",
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
  { presentationState, resources = {}, variables, autoMode, skipMode, currentLocalizationPackageId }, // resolveFile
) => {
  const { elements } = state;
  const animations = state.animations || [];
  if (presentationState.background) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) {
      return state;
    }

    if (
      presentationState.background.resourceId
    ) {
      const { images = {} } = resources;
      const background = images[presentationState.background.resourceId];
      if (background) {
        storyContainer.children.push({
          id: `bg-cg-${presentationState.background.resourceId}`,
          type: "sprite",
          x: 0,
          y: 0,
          src: background.fileId,
          width: background.width,
          height: background.height,
        });
      }
    }

    if (
      presentationState.background.resourceId
    ) {
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
        const animationId =
          presentationState.background.animations.in.animationId;
        const animation = resources?.animations[animationId];
        if (animation) {
          animations.push({
            id: "bg-cg-animation-in",
            type: "tween",
            targetId: `bg-cg-${presentationState.background.resourceId}`,
            properties: animation.properties,
          });
        }
      }

      if (presentationState.background.animations.out) {
        const animationId =
          presentationState.background.animations.out.animationId;
        const resourceId =
          presentationState.background.animations.out.resourceId;
        const animation = resources?.animations[animationId];
        if (animation) {
          animations.push({
            id: "bg-cg-animation-out",
            type: "tween",
            targetId: `bg-cg-${resourceId}`,
            properties: animation.properties,
          });
        }
      }

      if (presentationState.background.animations.update) {
        const animationId =
          presentationState.background.animations.update.animationId;
        const animation = resources?.animations[animationId];
        if (animation) {
          animations.push({
            id: "bg-cg-animation-update",
            type: "tween",
            targetId: `bg-cg-${presentationState.background.resourceId}`,
            properties: animation.properties,
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
export const addCharacters = (
  state,
  { presentationState, resources },
) => {
  const { elements } = state;
  const animations = state.animations || [];
  if (presentationState.character && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.character.items || [];

    for (const item of items) {
      const { transformId, sprites } = item;

      // For out animations only, we don't need to create a container
      if (item.animations && item.animations.out && !sprites && !transformId) {
        // Just add the out animation transition, container should already exist
        const animationId = item.animations.out.animationId;
        const animation = resources?.animations[animationId];
        if (animation) {
          const outTransition = {
            id: `character-animation-out`,
            type: "tween",
            targetId: `character-container-${item.id}`,
            properties: animation.properties,
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
      const transform = resources.transforms[transformId];
      if (!transform) {
        console.warn("Transform not found:", transformId);
        continue;
      }
      const characterContainer = {
        type: "container",
        id: `character-container-${item.id}`,
        x: transform.x,
        y: transform.y,
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
          id: `${item.id}-${sprite.id}`,
          url: imageResource.fileId,
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
          const animationId = item.animations.in.animationId;
          const animation = resources?.animations[animationId];
          if (animation) {
            animations.push({
              id: `character-animation-in`,
              type: "tween",
              targetId: `character-container-${item.id}`,
              properties: animation.properties,
            });
          }
        }

        if (item.animations.update) {
          const animationId = item.animations.update.animationId;
          const animation = resources?.animations[animationId];
          if (animation) {
            const updateTransition = {
              id: `character-animation-update`,
              type: "tween",
              targetId: `character-container-${item.id}`,
              properties: animation.properties,
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
export const addVisuals = (
  state,
  { presentationState, resources },
) => {
  const { elements } = state;
  const animations = state.animations || [];
  if (presentationState.visual && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.visual.items;
    for (const item of items) {
      // Check if both resourceId and resourceType exist, and resourceType is "image"
      if (item.resourceId && item.resourceType === "image") {
        let resource = resources.images[item.resourceId];

        if (resource) {
          const transform = resources.transforms[item.transformId];
          storyContainer.children.push({
            id: `visual-${item.id}`,
            type: "sprite",
            url: resource.fileId,
            width: resource.width,
            height: resource.height,
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
          const animationId =
            item.animations.in.animationId || item.animations.in;
          const animation = resources?.animations[animationId];
          if (animation) {
            animations.push({
              id: `${item.id}-animation`,
              type: "tween",
              targetId: `visual-${item.id}`,
              properties: animation.properties,
            });
          }
        }

        if (item.animations.out) {
          const animationId =
            item.animations.out.animationId || item.animations.out;
          const animation = resources?.animations[animationId];
          if (animation) {
            animations.push({
              id: `${item.id}-animation-2`,
              type: "tween",
              targetId: `visual-${item.id}`,
              properties: animation.properties,
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
  { presentationState, resources = {}, dialogueUIHidden, autoMode, skipMode, currentLocalizationPackageId, variables },
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
  if (presentationState.dialogue.gui && presentationState.dialogue.gui.resourceId) {
    const { layouts = {} } = resources;
    const guiLayout = layouts[presentationState.dialogue.gui.resourceId];
    if (guiLayout) {
      let character;
      if (presentationState.dialogue.characterId) {
        character = resources.characters[presentationState.dialogue.characterId];
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
        dialogue: {
          character: {
            name: character?.name || "",
          },
          content: presentationState.dialogue?.content || [],
          lines: presentationState.dialogue?.lines || [],
        },
        currentLocalizationPackageId,
      };

      let result = parseAndRender(wrappedTemplate, templateData, {
        functions: jemplFunctions,
      });
      result = parseAndRender(result, {
        i18n: {}
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

    const layout = resources?.layouts[presentationState.choice.resourceId];
    if (!layout || !layout.elements) return state;

    const wrappedTemplate = { elements: layout.elements };
    const result = parseAndRender(wrappedTemplate, {
      choice: {
        items: presentationState.choice.items,
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

export const addBgm = (
  state,
  { presentationState, resources },
) => {
  const { elements } = state;
  if (presentationState.bgm && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const audio = resources.audio[presentationState.bgm.audioId];
    if (!audio) return state;
    storyContainer.children.push({
      id: "bgm",
      type: "audio",
      url: audio.fileId,
      loop: audio.loop ?? true,
      volume: audio.volume ?? 0.5,
      delay: audio.delay ?? null,
    });
  }
  return state;
};

export const addSfx = (state, { presentationState, resources }) => {
  const { elements } = state;

  if (presentationState.sfx && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.sfx.items;
    for (const item of items) {
      const audio = resources.audio?.[item.audioId];
      if (!audio) continue;

      storyContainer.children.push({
        id: item.id,
        type: "audio",
        url: audio.fileId,
        loop: item.loop ?? audio.loop ?? true,
        volume: item.volume ?? audio.volume ?? 0.5,
        delay: item.delay ?? audio.delay ?? null,
      });
    }
  }

  return state;
};

export const addVoice = (state, { presentationState, resources }) => {
  const { elements } = state;

  if (!presentationState?.voice) {
    return state;
  }

  const storyContainer = elements.find((el) => el.id === "story");
  if (!storyContainer) return state;

  const { fileId, volume, loop } = presentationState.voice;

  storyContainer.children.push({
    id: `voice-${fileId}`,
    type: "audio",
    url: fileId,
    volume: volume ?? 0.5,
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
  { presentationState, resources = {}, variables, autoMode, skipMode, currentLocalizationPackageId },
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
      // saveDataArray: systemStore.selectSaveDataPage({
      //   page: systemState?.variables.currentSavePageIndex,
      //   numberPerPage: 6,
      // }),
      autoMode,
      skipMode,
      // globalAudios: systemStore.selectGlobalAudios() || [],
      currentLocalizationPackageId,
      // i18n: systemStore.selectCurrentLanguagePackKeys(),
      // languagePacks: systemStore.selectLanguagePacks(),
    };

    let processedContainer = parseAndRender(layoutContainer, templateData, {
      functions: jemplFunctions,
    });
    processedContainer = parseAndRender(processedContainer, {
      i18n: {}
      // i18n: systemStore.selectCurrentLanguagePackKeys(),
    });

    const processElementAfterRender = (element) => {
      const processedElement = { ...element };

      if (element.url && element.url.startsWith("file:")) {
        const fileId = element.url.replace("file:", "");
        processedElement.url = fileId;
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

export const addModals = (
  state,
  { resources = {}, variables, autoMode, skipMode, currentLocalizationPackageId },
) => {
  const { elements } = state;
  const animations = state.animations || [];
  // Get modals directly from the passed systemState instead of using systemStore
  // const modals = systemState.modes[systemState.currentMode].modals;
  // TODO: do this
  const modals = [];
  if (modals && modals.length > 0) {
    // Add each modal as an overlay
    modals.forEach((modal, index) => {
      if (modal.resourceType === "layout") {
        const layout = resources.layouts[modal.resourceId];

        if (!layout) {
          console.warn(`Modal layout not found: ${modal.resourceId}`);
          return;
        }

        if (Array.isArray(layout.transitions)) {
          layout.transitions.forEach((transition) => {
            animations.push(transition);
          });
        }

        // Create a container for this modal
        const modalContainer = {
          id: `modal-${index}`,
          type: "container",
          x: 0,
          y: 0,
          children: layout.elements || [],
        };

        // let currentActiveGalleryFileId;
        // let isLastFileIdIndex = false;
        //
        // if (systemState.variables.activeGalleryIndex !== undefined) {
        //   const gallery = systemState.variables.gallery.items;
        //   if (
        //     gallery &&
        //     Array.isArray(gallery) &&
        //     systemState.variables.activeGalleryIndex < gallery.length
        //   ) {
        //     currentActiveGalleryFileId =
        //       gallery[systemState.variables.activeGalleryIndex]?.fileIds[
        //       systemState.variables.activeGalleryFileIndex
        //       ];
        //   }
        //
        //   if (
        //     systemState.variables.activeGalleryFileIndex <
        //     gallery[systemState.variables.activeGalleryIndex]?.fileIds.length -
        //     1
        //   ) {
        //     isLastFileIdIndex = false;
        //   } else {
        //     isLastFileIdIndex = true;
        //   }
        // }

        const templateData = {
          variables,
          // currentActiveGalleryFileId,
          // isLastFileIdIndex,
          // saveDataArray: systemStore.selectSaveDataPage({
          //   page: systemState?.variables.currentSavePageIndex,
          //   numberPerPage: 6,
          // }),
          autoMode,
          skipMode,
          // globalAudios: systemStore.selectGlobalAudios() || [],
          // historyDialogue: systemStore.selectHistoryDialogue() || [],
          currentLocalizationPackageId
          // i18n: systemStore.selectCurrentLanguagePackKeys(),
          // languagePacks: systemStore.selectLanguagePacks(),
        };

        let processedModal = parseAndRender(modalContainer, templateData, {
          functions: jemplFunctions,
        });
        processedModal = parseAndRender(processedModal, {
          i18n: {}
        });

        // Then process file references in the result
        const processElementAfterRender = (element) => {
          const processedElement = { ...element };

          if (element.url && element.url.startsWith("file:")) {
            const fileId = element.url.replace("file:", "");
            processedElement.url = resolveFile(fileId);
          }

          if (element.children && Array.isArray(element.children)) {
            processedElement.children = element.children.map(
              processElementAfterRender,
            );
          }

          return processedElement;
        };

        elements.push(processElementAfterRender(processedModal));
      }
    });
  }
  return state;
};

export const constructRenderState = (params) => {
  const actions = [
    addScreen,
    addBackgroundOrCg,
    addCharacters,
    addVisuals,
    addDialogue,
    addChoices,
    addLayout,
    addBgm,
    addSfx,
    addVoice,
    addModals,
  ];

  const executeActions = createSequentialActionsExecutor(
    createInitialState,
    actions
  );

  return executeActions(params);
}
