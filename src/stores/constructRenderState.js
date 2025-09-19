import { parseAndRender } from "jempl";

export const createInitialState = () => {
  return {
    elements: [
      {
        id: 'story',
        type: 'container',
        x: 0,
        y: 0,
        children: []
      }
    ],
    transitions: [],
  };
};

/**
 * @param {Object} params
 */
export const addScreen = (
  { elements },
  { presentationState, resources },
) => {
  if (presentationState.screen) {
    // Find the story container
    const storyContainer = elements.find(el => el.id === 'story');
    if (!storyContainer) return;

    if (
      presentationState.screen.resourceId &&
      presentationState.screen.resourceType === "layout"
    ) {
      const layout = resources.layouts[presentationState.screen.resourceId];

      if (layout) {
        // Add screen as the first child of story container
        storyContainer.children.unshift({
          id: 'screen',
          type: "container",
          children: layout.elements,
        });
      }
    }
  }
};

/**
 *
 * @param {Object} params
 */
export const addBackgrundOrCg = (
  { elements, transitions },
  { presentationState, resources, ui, resolveFile },
) => {
  if (presentationState.background) {
    // Find the story container
    const storyContainer = elements.find(el => el.id === 'story');
    if (!storyContainer) return;

    if (
      presentationState.background.resourceId &&
      presentationState.background.resourceType === "image"
    ) {
      const background =
        resources.images[presentationState.background.resourceId];
      storyContainer.children.push({
        id: `bg-cg-${presentationState.background.resourceId}`,
        type: "sprite",
        x: 0,
        y: 0,
        url: resolveFile(background.fileId),
      });
    }

    if (
      presentationState.background.resourceId &&
      presentationState.background.resourceType === "layout"
    ) {
      const layout = resources.layouts[presentationState.background.resourceId];

      storyContainer.children.push({
        id: `bg-cg-${presentationState.background.resourceId}`,
        type: "container",
        children: layout.elements,
      });
    }

    if (presentationState.background.animations) {
      if (presentationState.background.animations.in) {
        const animationId = presentationState.background.animations.in.animationId;
        const animation = resources.animations[animationId];
        if (animation) {
          transitions.push({
            id: "bg-cg-animation-in",
            type: "keyframes",
            event: "add",
            elementId: `bg-cg-${presentationState.background.resourceId}`,
            properties: animation.properties,
          });
        }
      }

      if (presentationState.background.animations.out) {
        const animationId = presentationState.background.animations.out.animationId;
        const resourceId = presentationState.background.animations.out.resourceId;
        const animation = resources.animations[animationId];
        if (animation) {
          transitions.push({
            id: "bg-cg-animation-out",
            type: "keyframes",
            event: "remove",
            elementId: `bg-cg-${resourceId}`,
            properties: animation.properties,
          });
        }
      }

      if (presentationState.background.animations.update) {
        const animationId = presentationState.background.animations.update.animationId;
        const animation = resources.animations[animationId];
        if (animation) {
          transitions.push({
            id: "bg-cg-animation-update",
            type: "keyframes",
            event: "update",
            elementId: `bg-cg-${presentationState.background.resourceId}`,
            properties: animation.properties,
          });
        }
      }
    }
  }
};

/**
 *
 * @param {Object} params
 */
export const addCharacters = (
  { elements, transitions },
  { presentationState, resources, resolveFile },
) => {
  if (presentationState.character) {
    // Find the story container
    const storyContainer = elements.find(el => el.id === 'story');
    if (!storyContainer) return;

    const items = presentationState.character.items;

    for (const item of items) {
      const { transformId, sprites } = item;

      // For out animations only, we don't need to create a container
      if (item.animations && item.animations.out && !sprites && !transformId) {
        // Just add the out animation transition, container should already exist
        const animationId = item.animations.out.animationId;
        const animation = resources.animations[animationId];
        if (animation) {
          const outTransition = {
            id: `character-animation-out`,
            type: "keyframes",
            event: "remove",
            elementId: `character-container-${item.id}`,
            properties: animation.properties,
          };
          transitions.push(outTransition);
        }
        continue;
      }

      // Skip items without required properties for creating containers
      if (!sprites || !transformId) {
        console.warn('Character item missing sprites or transformId:', item);
        continue;
      }

      const spritePartIds = sprites.map(({ imageId }) => imageId);
      const transform = resources.transforms[transformId];
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

      const matchedSpriteParts = [];
      Object.entries(resources.characters).flatMap(([key, character]) => {
        const { sprites: characterSprites } = character;
        Object.entries(characterSprites).map(([partId, part]) => {
          if (spritePartIds.includes(partId)) {
            matchedSpriteParts.push({
              partId,
              fileId: part.fileId,
            });
          }
        });
      });

      for (const spritePart of matchedSpriteParts) {
        // @ts-ignore
        characterContainer.children.push({
          type: "sprite",
          id: `${item.id}-${spritePart.partId}`,
          url: resolveFile(spritePart.fileId),
          x: 0,
          y: 0,
        });
      }

      storyContainer.children.push(characterContainer);

      // Add animation support (except out, which is handled above)
      if (item.animations) {
        if (item.animations.in) {
          const animationId = item.animations.in.animationId;
          const animation = resources.animations[animationId];
          if (animation) {
            transitions.push({
              id: `character-animation-in`,
              type: "keyframes",
              event: "add",
              elementId: `character-container-${item.id}`,
              properties: animation.properties,
            });
          }
        }

        if (item.animations.update) {
          const animationId = item.animations.update.animationId;
          const animation = resources.animations[animationId];
          if (animation) {
            const updateTransition = {
              id: `character-animation-update`,
              type: "keyframes",
              event: "update",
              elementId: `character-container-${item.id}`,
              properties: animation.properties,
            };
            transitions.push(updateTransition);
          }
        }
      }
    }
  }
};

/**
 *
 * @param {Object} params
 */
export const addVisuals = (
  { elements, transitions },
  { presentationState, resources, resolveFile },
) => {
  if (presentationState.visual) {
    // Find the story container
    const storyContainer = elements.find(el => el.id === 'story');
    if (!storyContainer) return;

    const items = presentationState.visual.items;
    for (const item of items) {
      if (item.resourceId && item.resourceType) {
        let resource;
        if (item.resourceType === "image") {
          resource = resources.images[item.resourceId];
        } else {
          // Placeholder for other resource types
          continue;
        }

        if (resource) {
          const transform = resources.transforms[item.transformId];
          storyContainer.children.push({
            id: `visual-${item.id}`,
            type: "sprite",
            url: resolveFile(resource.fileId),
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
          const animationId = item.animations.in.animationId || item.animations.in;
          const animation = resources.animations[animationId];
          if (animation) {
            transitions.push({
              id: `${item.id}-animation`,
              type: "keyframes",
              event: "add",
              elementId: `visual-${item.id}`,
              properties: animation.properties,
            });
          }
        }

        if (item.animations.out) {
          const animationId = item.animations.out.animationId || item.animations.out;
          const animation = resources.animations[animationId];
          if (animation) {
            transitions.push({
              id: `${item.id}-animation-2`,
              type: "keyframes",
              event: "remove",
              elementId: `visual-${item.id}`,
              properties: animation.properties,
            });
          }
        }
      }
    }
  }
};

/**
 *
 * @param {Object} params
 */
export const addDialogue = (
  { elements },
  { presentationState, i18n, resources, systemState, systemStore },
) => {
  if (!presentationState.dialogue) {
    return;
  }

  if (systemState?.dialogueUIHidden) {
    return;
  }

  // Find the story container
  const storyContainer = elements.find(el => el.id === 'story');
  if (!storyContainer) return;

  const layout = resources.layouts[presentationState.dialogue.layoutId];

  if (!layout) {
    return;
  }

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

  const wrappedTemplate = { elements: layout.elements };

  const { defaultPackId, packs } = i18n;

  const templateData = {
    variables: systemState?.variables || {},
    saveDataArray: systemStore.selectSaveDataPage({
      page: systemState?.variables.currentSavePageIndex,
      numberPerPage: 6
    }),
    autoMode: systemStore.selectAutoMode(),
    skipMode: systemStore.selectSkipMode(),
    dialogue: {
      character: {
        name: character?.name || "",
      },
      content: presentationState.dialogue.content,
      lines: presentationState.dialogue.lines
    },
  }

  let result = parseAndRender(wrappedTemplate, templateData);
  result = parseAndRender(result, {
    i18n: packs[defaultPackId].keys || {},
  });
  const dialogueElements = result?.elements;

  if (Array.isArray(dialogueElements)) {
    for (const element of dialogueElements) {
      storyContainer.children.push(structuredClone(element));
    }
  } else if (dialogueElements) {
    storyContainer.children.push(structuredClone(dialogueElements));
  }
};

/**
 *
 * @param {Object} params
 */
export const addChoices = (
  { elements, transitions },
  { presentationState, resources, ui },
) => {

  if (presentationState.choice) {
    // Find the story container
    const storyContainer = elements.find(el => el.id === 'story');
    if (!storyContainer) return;

    const layout = resources.layouts[presentationState.choice.layoutId];

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
};

export const addBgm = (
  { elements },
  { presentationState, resources, resolveFile },
) => {
  if (presentationState.bgm) {
    // Find the story container
    const storyContainer = elements.find(el => el.id === 'story');
    if (!storyContainer) return;

    const audio = resources.audio[presentationState.bgm.audioId];
    storyContainer.children.push({
      id: "bgm",
      type: "audio",
      url: resolveFile(audio.fileId),
    });
  }
};

export const addSfx = (
  { elements },
  { presentationState, resources, resolveFile },
) => {
  if (presentationState.sfx) {
    // Find the story container
    const storyContainer = elements.find(el => el.id === 'story');
    if (!storyContainer) return;

    const items = presentationState.sfx.items;
    for (const item of items) {
      const audio = resources.audio[item.audioId];
      storyContainer.children.push({
        id: item.id,
        type: "audio",
        url: resolveFile(audio.fileId),
      });
    }
  }
};

export const addVoice = (
  { elements }, { presentationState, resolveFile }) => {

  if (
    !presentationState.voice
  ) {
    return;
  }

  const storyContainer = elements.find(el => el.id === 'story');
  if (!storyContainer) return;

  const { fileId, volume, loop } = presentationState.voice;

  storyContainer.children.push({
    id: `voice-${fileId}`,
    type: "audio",
    url: resolveFile(fileId),
    volume,
    loop
  });
};


/**
 * Adds layout elements from presentation to state
 * @param {Object} params
 */
export const addLayout = (
  { elements, transitions },
  { presentationState, resources, resolveFile, systemState, systemStore },
) => {
  if (presentationState.layout) {
    // Find the story container
    const storyContainer = elements.find(el => el.id === 'story');
    if (!storyContainer) return;

    const layout = resources.layouts[presentationState.layout.layoutId];

    if (!layout) {
      return;
    }


    if (Array.isArray(layout.transitions)) {
      layout.transitions.forEach((transition) => {
        transitions.push(transition);
      })
    }

    const processElement = (element) => {
      const processedElement = { ...element };

      if (element.url && element.url.startsWith('file:')) {
        const fileId = element.url.replace('file:', '');
        processedElement.url = resolveFile(fileId);
      }

      if (element.children && Array.isArray(element.children)) {
        processedElement.children = element.children.map(processElement);
      }

      return processedElement;
    };

    const layoutContainer = {
      id: `layout-${presentationState.layout.layoutId}`,
      type: 'container',
      x: 0,
      y: 0,
      children: layout.elements || []
    };

    const templateData = {
      variables: systemState?.variables || {},
      saveDataArray: systemStore.selectSaveDataPage({
        page: systemState?.variables.currentSavePageIndex,
        numberPerPage: 6
      }),
      autoMode: systemStore.selectAutoMode(),
      skipMode: systemStore.selectSkipMode(),
      globalAudios: systemStore.selectGlobalAudios() || [],
    }

    const processedContainer = parseAndRender(layoutContainer, templateData);
    const processElementAfterRender = (element) => {
      const processedElement = { ...element };

      if (element.url && element.url.startsWith('file:')) {
        const fileId = element.url.replace('file:', '');
        processedElement.url = resolveFile(fileId);
      }

      if (element.children && Array.isArray(element.children)) {
        processedElement.children = element.children.map(processElementAfterRender);
      }

      return processedElement;
    };

    // Push the processed container
    storyContainer.children.push(processElementAfterRender(processedContainer));
  }
};

export const addModals = (
  { elements, transitions },
  { systemState, resources, resolveFile, systemStore },
) => {
  // Get modals directly from the passed systemState instead of using systemStore
  const modals = systemState.modes[systemState.currentMode].modals;
  if (modals && modals.length > 0) {
    // Add each modal as an overlay
    modals.forEach((modal, index) => {
      if (modal.resourceType === 'layout') {
        const layout = resources.layouts[modal.resourceId];

        if (!layout) {
          console.warn(`Modal layout not found: ${modal.resourceId}`);
          return;
        }

        if (Array.isArray(layout.transitions)) {
          layout.transitions.forEach((transition) => {
            transitions.push(transition);
          })
        }

        // Process layout elements similar to addLayout
        const processElement = (element) => {
          const processedElement = { ...element };

          // Handle file references in layout elements
          if (element.url && element.url.startsWith('file:')) {
            const fileId = element.url.replace('file:', '');
            processedElement.url = resolveFile(fileId);
          }

          // Recursively process children if they exist
          if (element.children && Array.isArray(element.children)) {
            processedElement.children = element.children.map(processElement);
          }

          return processedElement;
        };

        // Create a container for this modal
        const modalContainer = {
          id: `modal-${index}`,
          type: 'container',
          x: 0,
          y: 0,
          children: layout.elements || []
        };

        let currentActiveGalleryFileId;
        let isLastFileIdIndex = false;

        if (systemState.variables.activeGalleryIndex !== undefined) {
          const gallery = systemState.variables.gallery.items;
          if (gallery && Array.isArray(gallery) && systemState.variables.activeGalleryIndex < gallery.length) {
            currentActiveGalleryFileId = gallery[systemState.variables.activeGalleryIndex]?.fileIds[systemState.variables.activeGalleryFileIndex];
          }

          if (systemState.variables.activeGalleryFileIndex < gallery[systemState.variables.activeGalleryIndex]?.fileIds.length - 1) {
            isLastFileIdIndex = false;
          } else {
            isLastFileIdIndex = true;
          }
        }

        const templateData = {
          variables: systemState.variables || {},
          currentActiveGalleryFileId,
          isLastFileIdIndex,
          saveDataArray: systemStore.selectSaveDataPage({
            page: systemState?.variables.currentSavePageIndex,
            numberPerPage: 6
          }),
          autoMode: systemStore.selectAutoMode(),
          skipMode: systemStore.selectSkipMode(),
          globalAudios: systemStore.selectGlobalAudios() || [],
          historyDialogue: systemStore.selectHistoryDialogue() || [],
        }

        const processedModal = parseAndRender(modalContainer, templateData);

        // Then process file references in the result
        const processElementAfterRender = (element) => {
          const processedElement = { ...element };

          if (element.url && element.url.startsWith('file:')) {
            const fileId = element.url.replace('file:', '');
            processedElement.url = resolveFile(fileId);
          }

          if (element.children && Array.isArray(element.children)) {
            processedElement.children = element.children.map(processElementAfterRender);
          }

          return processedElement;
        };

        elements.push(processElementAfterRender(processedModal));
      }
    });
  }
}

export const addGlobalAudios = (
  { elements },
  { systemState, resources, resolveFile },
) => {
  // Get global audios directly from the passed systemState instead of using systemStore
  const globalAudios = systemState.globalAudios;
  if (globalAudios && globalAudios.length > 0) {
    // Add each global audio
    globalAudios.forEach((audioItem, i) => {
      elements.push({
        id: `global-audio-${i}-${audioItem.audioId}`,
        type: "audio",
        url: resolveFile(audioItem.fileId),
      });
    });
  }
}

export default [
  addScreen,
  addBackgrundOrCg,
  addCharacters,
  addVisuals,
  addDialogue,
  addChoices,
  addLayout,
  addBgm,
  addSfx,
  addVoice,
  addModals,
  addGlobalAudios
];
