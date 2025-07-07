import jsone from "json-e";

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
  { presentationState, resources, resolveFile },
) => {
  if (presentationState.background) {
    if (presentationState.background.backgroundId) {
      const background =
        resources.backgrounds[presentationState.background.backgroundId];
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
          resources.animations[presentationState.background.animations.in];
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
          resources.animations[presentationState.background.animations.out];
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
  { presentationState, resources, resolveFile },
) => {
  if (presentationState.character) {
    const items = presentationState.character.items;

    for (const item of items) {
      const { positionId, spriteParts } = item;
      const spritePartIds = spriteParts.map(({ spritePartId }) => spritePartId);
      const position = resources.positions[positionId];
      const characterContainer = {
        type: "container",
        id: `character-container-${item.id}`,
        x: position.x,
        y: position.y,
        xa: position.xa,
        ya: position.ya,
        anchor: position.anchor,
        children: [],
      };

      const matchedSpriteParts = [];
      Object.entries(resources.characters).flatMap(([key, character]) => {
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
  { presentationState, resources, resolveFile },
) => {
  if (presentationState.visual) {
    const items = presentationState.visual.items;
    for (const item of items) {
      if (item.visualId) {
        const visual = resources.visuals[item.visualId];
        const position = resources.positions[item.positionId];
        elements.push({
          id: `visual-${item.id}`,
          type: "sprite",
          url: resolveFile(visual.fileId),
          x: position.x,
          y: position.y,
          xa: position.xa,
          ya: position.ya,
        });
      }

      if (item.animations) {
        if (item.animations.in) {
          const animation = resources.animations[item.animations.in];
          transitions.push({
            id: `${item.id}-animation`,
            type: "keyframes",
            event: "add",
            elementId: `visual-${item.id}`,
            animationProperties: animation.properties,
          });
        }

        if (item.animations.out) {
          const animation = resources.animations[item.animations.out];
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
  { elements, transitions },
  { presentationState, ui, resources, dialogueUIHidden },
) => {
  if (!dialogueUIHidden && presentationState.dialogue) {
    const dialogueBoxScreen =
      ui.screens[presentationState.dialogue.dialogueBoxId];

    let character;

    if (presentationState.dialogue.characterId) {
      character = resources.characters[presentationState.dialogue.characterId];
    }

    const dialogueElements = jsone(dialogueBoxScreen.elements, {
      dialogue: {
        text: presentationState.dialogue.text,
        character: {
          name: character?.name,
        },
      },
    });

    elements.push(...dialogueElements);
  }
};

/**
 *
 * @param {Object} params
 */
export const addScreens = (
  { elements, transitions },
  { presentationState, ui, variables },
) => {
  if (presentationState.screen) {
    const screen = ui.screens[presentationState.screen.screenId];
    const screenElements = jsone(screen.elements, {
      variables,
    });

    elements.push(...screenElements);
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
  if (presentationState.choices) {
    const screen = ui.screens[presentationState.choices.choiceScreenId];

    const choiceElements = jsone(screen.elements, {
      choices: {
        items: presentationState.choices.items,
      },
    });

    elements.push(...choiceElements);
  }
};

export default [
  generateScreenBackgroundElement,
  addBackgrundOrCg,
  addCharacters,
  addVisuals,
  addDialogue,
  addScreens,
  addChoices,
];
