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
export const generateScreenBackgroundElement = (
  { elements, transitions },
  { screen },
) => {
  elements.push({
    id: "bg-screen",
    type: "graphics",
    x1: 0,
    x2: screen.width,
    y1: 0,
    y2: screen.height,
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
  { presentationState, assets, resolveFile },
) => {
  if (presentationState.background) {
    if (presentationState.background.imageId) {
      const background = assets.images[presentationState.background.imageId];
      elements.push({
        id: "bg-cg",
        type: "sprite",
        x: 0,
        y: 0,
        url: resolveFile(background.fileId),
      });
    }

    if (presentationState.background.animations) {
      if (presentationState.background.animations.in) {
        const animation =
          assets.animations[presentationState.background.animations.in];
        transitions.push({
          id: "bg-cg-animation",
          type: "keyframes",
          event: "add",
          elementId: "bg-cg",
          animationProperties: animation.properties,
        });
      }

      if (presentationState.background.animations.out) {
        const animation =
          assets.animations[presentationState.background.animations.out];
        if (animation) {
          transitions.push({
            id: "bg-cg-animation-2",
            type: "keyframes",
            event: "remove",
            elementId: "bg-cg",
            animationProperties: animation.properties,
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
  { presentationState, assets, resolveFile },
) => {
  if (presentationState.character) {
    const items = presentationState.character.items;

    for (const item of items) {
      const { transformId, spriteParts } = item;
      const spritePartIds = spriteParts.map(({ spritePartId }) => spritePartId);
      const transform = assets.transforms[transformId];
      const characterContainer = {
        type: "container",
        id: `character-container-${item.id}`,
        x: transform.x,
        y: transform.y,
        xa: transform.xa,
        ya: transform.ya,
        anchor: transform.anchor,
        children: [],
      };

      const matchedSpriteParts = [];
      Object.entries(assets.characters).flatMap(([key, character]) => {
        const { spriteParts } = character;
        Object.entries(spriteParts).map(([partId, part]) => {
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

      elements.push(characterContainer);
    }
  }
};

/**
 *
 * @param {Object} params
 */
export const addVisuals = (
  { elements, transitions },
  { presentationState, assets, resolveFile },
) => {
  if (presentationState.visual) {
    const items = presentationState.visual.items;
    for (const item of items) {
      if (item.visualId) {
        const visual = assets.visuals[item.visualId];
        const transform = assets.transforms[item.transformId];
        elements.push({
          id: `visual-${item.visualId}`,
          type: "sprite",
          url: resolveFile(visual.fileId),
          x: transform.x,
          y: transform.y,
          xa: transform.xa,
          ya: transform.ya,
        });
      }

      if (item.animations) {
        if (item.animations.in) {
          const animation = assets.animations[item.animations.in];
          transitions.push({
            id: `${item.id}-animation`,
            type: "keyframes",
            event: "add",
            elementId: `visual-${item.id}`,
            animationProperties: animation.properties,
          });
        }

        if (item.animations.out) {
          const animation = assets.animations[item.animations.out];
          transitions.push({
            id: `${item.id}-animation-2`,
            type: "keyframes",
            event: "remove",
            elementId: `visual-${item.id}`,
            animationProperties: animation.properties,
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
export const addDialogue = (
  { elements },
  { presentationState, ui, assets, dialogueUIHidden },
) => {
  if (!presentationState.dialogue) {
    return;
  }

  if (dialogueUIHidden) {
    return;
  }

  const layout = ui.layouts[presentationState.dialogue.layoutId];

  if (!layout) {
    return;
  }

  let character;
  if (presentationState.dialogue.characterId) {
    character = assets.characters[presentationState.dialogue.characterId];
  }

  const wrappedTemplate = { elements: layout.elements };
  const result = parseAndRender(wrappedTemplate, {
    dialogue: {
      character: {
        name: character?.name || "",
      },
      text: presentationState.dialogue.text,
    },
  });
  const dialogueElements = result?.elements;

  if (Array.isArray(dialogueElements)) {
    for (const element of dialogueElements) {
      elements.push(element);
    }
  } else if (dialogueElements) {
    elements.push(dialogueElements);
  }
};

/**
 *
 * @param {Object} params
 */
export const addLayouts = (
  { elements, transitions },
  { presentationState, ui, variables },
) => {
  if (presentationState.layout) {
    const layout = ui.layouts[presentationState.layout.layoutId];
    const wrappedTemplate = { elements: layout.elements };
    const result = parseAndRender(wrappedTemplate, { variables });
    const layoutElements = result?.elements;

    if (Array.isArray(layoutElements)) {
      for (const element of layoutElements) {
        elements.push(element);
      }
    } else if (layoutElements) {
      elements.push(layoutElements);
    }
  }
};

/**
 *
 * @param {Object} params
 */
export const addChoices = (
  { elements, transitions },
  { presentationState, assets, ui },
) => {
  if (presentationState.choices) {
    const layout = ui.layouts[presentationState.choices.layoutId];

    const wrappedTemplate = { elements: layout.elements };
    const result = parseAndRender(wrappedTemplate, {
      choices: {
        items: presentationState.choices.items,
      },
    });
    const choiceElements = result?.elements;

    if (Array.isArray(choiceElements)) {
      for (const element of choiceElements) {
        elements.push(element);
      }
    } else if (choiceElements) {
      elements.push(choiceElements);
    }
  }
};

export const addBgm = (
  { elements },
  { presentationState, assets, resolveFile },
) => {
  if (presentationState.bgm) {
    const audio = assets.audios[presentationState.bgm.audioId];
    elements.push({
      id: "bgm",
      type: "audio",
      url: resolveFile(audio.fileId),
    });
  }
};

export const addSfx = (
  { elements },
  { presentationState, assets, resolveFile },
) => {
  if (presentationState.sfx) {
    const items = presentationState.sfx.items;
    for (const item of items) {
      const audio = assets.audios[item.audioId];
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
  addLayouts,
  addChoices,
  addBgm,
  addSfx,
];
