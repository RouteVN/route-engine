import { parseAndRender } from "jempl";

export const createInitialState = () => {
  return {
    elements: [],
    transitions: [],
  };
};

/**
 * @param {Object} params
 * @returns
 */
export const generateScreenBackgroundElement = ({ elements }, { screen }) => {
  elements.push({
    id: "bg-screen",
    type: "rect",
    x: 0,
    width: screen.width,
    y: 0,
    height: screen.height,
    fill: screen.backgroundColor,
    clickEventName: "LeftClick",
    rightClickEventName: "RightClick",
    wheelEventName: "ScrollUp",
  });
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
    if (
      presentationState.background.resourceId &&
      presentationState.background.resourceType === "image"
    ) {
      const background =
        resources.images[presentationState.background.resourceId];
      elements.push({
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

      elements.push({
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
    const items = presentationState.character.items;
    console.log('Processing characters:', items);

    for (const item of items) {
      const { transformId, sprites } = item;
      
      // For out animations only, we don't need to create a container
      if (item.animations && item.animations.out && !sprites && !transformId) {
        // Just add the out animation transition, container should already exist
        const animationId = item.animations.out.animationId;
        const animation = resources.animations[animationId];
        console.log('Processing OUT animation:', {
          itemId: item.id,
          animationId,
          animation,
          elementId: `character-container-${item.id}`
        });
        if (animation) {
          const outTransition = {
            id: `character-animation-out`,
            type: "keyframes",
            event: "remove",
            elementId: `character-container-${item.id}`,
            properties: animation.properties,
          };
          console.log('Adding OUT transition:', outTransition);
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

      console.log('Adding character container:', characterContainer);
      elements.push(characterContainer);

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
            console.log('Character update animation:', {
              itemId: item.id,
              elementId: `character-container-${item.id}`,
              animationId,
              animation,
              updateTransition
            });
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
          elements.push({
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
  { presentationState, ui, resources, dialogueUIHidden },
) => {
  if (!presentationState.dialogue) {
    return;
  }

  if (dialogueUIHidden) {
    return;
  }

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
  const result = parseAndRender(wrappedTemplate, {
    dialogue: {
      character: {
        name: character?.name || "",
      },
      content: presentationState.dialogue.content,
    },
  });
  const dialogueElements = result?.elements;

  if (Array.isArray(dialogueElements)) {
    for (const element of dialogueElements) {
      elements.push(structuredClone(element));
    }
  } else if (dialogueElements) {
    elements.push(structuredClone(dialogueElements));
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
        elements.push(structuredClone(element));
      }
    } else if (choiceElements) {
      elements.push(structuredClone(choiceElements));
    }
  }
};

export const addBgm = (
  { elements },
  { presentationState, resources, resolveFile },
) => {
  if (presentationState.bgm) {
    const audio = resources.audio[presentationState.bgm.audioId];
    elements.push({
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
    const items = presentationState.sfx.items;
    for (const item of items) {
      const audio = resources.audio[item.audioId];
      elements.push({
        id: item.id,
        type: "audio",
        url: resolveFile(audio.fileId),
      });
    }
  }
};

export default [
  generateScreenBackgroundElement,
  addBackgrundOrCg,
  addCharacters,
  addVisuals,
  addDialogue,
  addChoices,
  addBgm,
  addSfx,
];
