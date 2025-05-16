import jsone from "json-e";
import * as vnDataSelectors from "./vnDataSelectors";
import * as systemStateSelectors from './systemStateSelectors';

/**
 * @typedef {Object} TransformParams
 * @property {Object} elements
 * @property {Object} transitions
 * @property {Object} state
 * @property {Object} resources
 * @property {Object} screen
 * @property {Object} template
 * @property {Object} ui
 * @property {Object} runtimeState
 * @property {Function} resolveFile
 */


/**
 * @param {TransformParams} params
 * @returns
 */
const generateScreenBackgroundElement = ({
  elements,
  transitions,
  screen,
}) => {
  const newElements = elements.concat([
    {
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
    },
  ]);
  return [newElements, transitions];
};

/**
 * 
 * @param {TransformParams} params 
 */
const addBackgrundOrCg = ({
  elements,
  transitions,
  state,
  resources,
  resolveFile,
}) => {
  let newElements = elements.concat([]);
  let newTransitions = transitions.concat([]);
  if (state.background) {
    if (state.background.backgroundId) {
      const background = resources.backgrounds[state.background.backgroundId];
      newElements = newElements.concat([
        {
          id: "bg-cg",
          type: "sprite",
          x: 0,
          y: 0,
          url: resolveFile(background.fileId),
        },
      ]);
    }

    if (state.background.animations) {
      if (state.background.animations.in) {
        const animation = resources.animations[state.background.animations.in];
        newTransitions = newTransitions.concat([
          {
            id: "bg-cg-animation",
            type: "keyframes",
            event: "add",
            elementId: "bg-cg",
            animationProperties: animation.properties,
          },
        ]);
      }

      if (state.background.animations.out) {
        const animation = resources.animations[state.background.animations.out];
        newTransitions = newTransitions.concat([
          {
            id: "bg-cg-animation-2",
            type: "keyframes",
            event: "remove",
            elementId: "bg-cg",
            animationProperties: animation.properties,
          },
        ]);
      }
    }
  }
  return [newElements, newTransitions];
};

/**
 * 
 * @param {TransformParams} params 
 */
const addCharacters = ({
  elements,
  transitions,
  state,
  resources,
  resolveFile,
}) => {
  let newElements = elements.concat([]);
  if (state.character) {
    const items = state.character.items;

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

      newElements.push(characterContainer);
    }
  }
  return [newElements, transitions];
};

/**
 * 
 * @param {TransformParams} params 
 */
const addVisuals = ({
  elements,
  transitions,
  template,
  resources,
  resolveFile,
}) => {
  let newElements = elements.concat([]);
  let newTransitions = transitions.concat([]);
  if (template.visual) {
    const items = template.visual.items;
    for (const item of items) {
      if (item.visualId) {
        const visual = resources.visuals[item.visualId];
        const position = resources.positions[item.positionId];
        newElements = newElements.concat([
          {
            id: `visual-${item.id}`,
            type: "sprite",
            url: resolveFile(visual.fileId),
            x: position.x,
            y: position.y,
            xa: position.xa,
            ya: position.ya,
          },
        ]);
      }

      if (item.animations) {
        if (item.animations.in) {
          const animation = resources.animations[item.animations.in];
          newTransitions = newTransitions.concat([
            {
              id: `${item.id}-animation`,
              type: "keyframes",
              event: "add",
              elementId: `visual-${item.id}`,
              animationProperties: animation.properties,
            },
          ]);
        }

        if (item.animations.out) {
          const animation = resources.animations[item.animations.out];
          newTransitions = newTransitions.concat([
            {
              id: `${item.id}-animation-2`,
              type: "keyframes",
              event: "remove",
              elementId: `visual-${item.id}`,
              animationProperties: animation.properties,
            },
          ]);
        }
      }
    }
  }
  return [newElements, newTransitions];
};

/**
 * 
 * @param {TransformParams} params 
 */
const addDialogue = ({ elements, transitions, state, ui, resources }) => {
  let newElements = elements.concat([]);
  if (state.dialogue) {
    const dialogueBoxScreen = ui.screens[state.dialogue.dialogueBoxId];

    let character;

    if (state.dialogue.characterId) {
      character = resources.characters[state.dialogue.characterId];
    }

    newElements = newElements.concat(
      jsone(dialogueBoxScreen.elements, {
        dialogue: {
          text: state.dialogue.text,
          character: {
            name: character?.name,
          },
        },
      })
    );
  }
  return [newElements, transitions];
};

/**
 * 
 * @param {TransformParams} params 
 */
const addScreens = ({
  elements,
  transitions,
  template,
  ui,
  runtimeState,
}) => {
  let newElements = elements.concat([]);
  if (template.screen) {
    const screen = ui.screens[template.screen.screenId];
    newElements = newElements.concat(
      jsone(screen.elements, {
        runtimeState,
      })
    );
  }
  return [newElements, transitions];
};

/**
 * 
 * @param {Object} params 
 */
const addChoices = ({ elements, transitions, state, resources, ui }) => {
  let newElements = elements.concat([]);
  if (state.choices) {
    const screen = ui.screens[state.choices.choiceScreenId];

    newElements = newElements.concat(
      jsone(screen.elements, {
        choices: {
          items: state.choices.items,
        },
      })
    );
  }
  return [newElements, transitions];
};

// List of transformations to apply in sequence
const transformers = [
  generateScreenBackgroundElement,
  addBackgrundOrCg,
  addCharacters,
  addVisuals,
  addDialogue,
  addScreens,
  addChoices,
];

/**
 * 
 * @param {Object} params 
 */
const combineSystemState = ({ template, state: systemState, data }) => {
  let elements = [];
  let transitions = [];

  // Extract required resources from data
  const resources = data.resources || {};
  const ui = data.ui || {};
  const runtimeState = systemStateSelectors.selectRuntimeState(systemState) || {};
  const resolveFile = (path) => `file:${path}`;
  const screen = vnDataSelectors.selectScreen(data);

  // Initial state
  const initialResult = [elements, transitions];

  // Apply all transformers in sequence
  [elements, transitions] = transformers.reduce(
    (result, transformer) =>
      transformer({
        elements: result[0],
        transitions: result[1],
        state: systemState,
        template,
        resources,
        resolveFile,
        ui,
        screen,
        runtimeState,
      }),
    initialResult
  );

  return {
    elements,
    transitions,
  };
};

export default combineSystemState;
