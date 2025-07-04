import jsone from "json-e";

export const createInitialState = () => {
  return {
    elements: [],
    transitions: [],
  }
}

/**
 * @param {Object} params
 * @returns
 */
export const generateScreenBackgroundElement = (
  { elements, transitions },
  { screen }
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
  { template, resources, resolveFile }
) => {
  if (template.background) {
    if (template.background.backgroundId) {
      const background =
        resources.backgrounds[template.background.backgroundId];
      elements.push({
        id: "bg-cg",
        type: "sprite",
        x: 0,
        y: 0,
        url: resolveFile(background.fileId),
      });
    }

    if (template.background.animations) {
      if (template.background.animations.in) {
        const animation =
          resources.animations[template.background.animations.in];
        transitions.push({
          id: "bg-cg-animation",
          type: "keyframes",
          event: "add",
          elementId: "bg-cg",
          animationProperties: animation.properties,
        });
      }

      if (template.background.animations.out) {
        const animation =
          resources.animations[template.background.animations.out];
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
};

/**
 *
 * @param {Object} params
 */
export const addCharacters = (
  { elements, transitions },
  { template, resources, resolveFile }
) => {
  if (template.character) {
    const items = template.character.items;

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
  { template, resources, resolveFile }
) => {
  if (template.visual) {
    const items = template.visual.items;
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
  { template, ui, resources, dialogueUIHidden }
) => {
  if (!dialogueUIHidden && template.dialogue) {
    const dialogueBoxScreen = ui.screens[template.dialogue.dialogueBoxId];

    let character;

    if (template.dialogue.characterId) {
      character = resources.characters[template.dialogue.characterId];
    }

    const dialogueElements = jsone(dialogueBoxScreen.elements, {
      dialogue: {
        text: template.dialogue.text,
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
export const addScreens = ({ elements, transitions }, { template, ui, variables }) => {
  console.log("variables", variables);
  if (template.screen) {
    const screen = ui.screens[template.screen.screenId];
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
export const addChoices = ({ elements, transitions }, { template, resources, ui }) => {
  if (template.choices) {
    const screen = ui.screens[template.choices.choiceScreenId];

    const choiceElements = jsone(screen.elements, {
      choices: {
        items: template.choices.items,
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
]
