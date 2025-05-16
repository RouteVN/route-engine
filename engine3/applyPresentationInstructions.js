/**
 * @typedef {Object} ApplyParams
 * @property {Object} state - The current state of the system
 * @property {Object} instruction - The instruction to apply
 */

/**
 * 
 * Applies background from instruction to state
 * @param {ApplyParams} params
 * @returns state
 */
const applyBackground = ({ state, instruction }) => {
  if (instruction.background) {
    return {
      ...state,
      background: instruction.background,
    };
  } else if (instruction.background === null) {
    const { background, ...rest } = state;
    return rest;
  }
  return state;
};

/**
 * Applies sound effects from instruction to state
 * @param {ApplyParams} params
 * @returns state
 */
const applySfx = ({ state, instruction }) => {
  if (instruction.sfx) {
    return {
      ...state,
      sfx: instruction.sfx,
    };
  } else if (state.sfx) {
    const { sfx, ...rest } = state;
    return rest;
  }
  return state;
};

/**
 * Applies background music from instruction to state
 * @param {ApplyParams} params
 * @returns state
 */
const applyBgm = ({ state, instruction }) => {
  if (instruction.bgm) {
    return {
      ...state,
      bgm: {
        ...instruction.bgm,
        loop: instruction.bgm.loop || instruction.bgm.loop === undefined,
      },
    };
  }
  return state;
};

/**
 * Applies visual items from instruction to state
 * @param {ApplyParams} params
 * @returns state
 */
const applyVisual = ({ state, instruction }) => {
  if (instruction.visual) {
    return {
      ...state,
      visual: instruction.visual,
    };
  } else if (state.visual) {
    return {
      ...state,
      visual: {
        ...state.visual,
        items: state.visual.items.filter((visual) => !!visual.visualId),
      },
    };
  }
  return state;
};

/**
 * Applies dialogue from instruction to state
 * @param {ApplyParams} params
 * @returns state
 */
const applyDialogue = ({ state, instruction }) => {
  if (!instruction.dialogue) {
    return state;
  }

  // Start with existing dialogue or empty object
  const baseDialogue = state.dialogue || {};
  let newDialogue = { ...baseDialogue };

  // Apply instruction dialogue properties
  newDialogue = {
    ...newDialogue,
    ...instruction.dialogue,
  };

  // Handle segments/text mutual exclusivity
  if (instruction.dialogue.segments) {
    const { text, ...dialogueWithoutText } = newDialogue;
    newDialogue = dialogueWithoutText;
  }

  if (instruction.dialogue.text) {
    const { segments, ...dialogueWithoutSegments } = newDialogue;
    newDialogue = dialogueWithoutSegments;
  }

  // Handle character name
  if (
    instruction.dialogue.character &&
    !instruction.dialogue.character.characterName
  ) {
    if (newDialogue.character) {
      const { characterName, ...characterWithoutName } = newDialogue.character;
      newDialogue = {
        ...newDialogue,
        character: characterWithoutName,
      };
    }
  }

  // Handle incremental text
  if (instruction.dialogue.incremental) {
    const existingTexts = newDialogue.texts || [];
    newDialogue = {
      ...newDialogue,
      texts: [
        ...existingTexts,
        {
          template: instruction.dialogue.template,
          text: instruction.dialogue.text,
        },
      ],
    };
  }

  return {
    ...state,
    dialogue: newDialogue,
  };
};

/**
 * Applies character from instruction to state
 * @param {ApplyParams} params
 * @returns state
 */
const applyCharacter = ({ state, instruction }) => {
  if (!instruction.character) {
    return state;
  }

  // Handle case where there is no existing character
  if (!state.character) {
    return {
      ...state,
      character: JSON.parse(JSON.stringify(instruction.character)),
    };
  }

  // Copy existing character and items
  const newCharacter = { ...state.character };
  let newItems = [...newCharacter.items];

  // Process each item in the instruction
  newItems = newItems.map((existingItem) => {
    // Find if this item is in the instruction
    const matchingItem = instruction.character.items.find(
      (i) => i.id === existingItem.id
    );

    if (!matchingItem) {
      // Item not in instruction, remove inAnimation
      return {
        ...existingItem,
        inAnimation: undefined,
      };
    }

    // Item is in instruction, update it
    const updatedItem = {
      ...existingItem,
      ...matchingItem,
    };

    // Handle animations without using delete
    if (!matchingItem.inAnimation) {
      updatedItem.inAnimation = undefined;
    }

    if (!matchingItem.outAnimation) {
      updatedItem.outAnimation = undefined;
    }

    return updatedItem;
  });

  // Add new items that aren't already in the state
  instruction.character.items.forEach((instructionItem) => {
    if (!newItems.some((item) => item.id === instructionItem.id)) {
      newItems.push(instructionItem);
    }
  });

  return {
    ...state,
    character: {
      ...newCharacter,
      items: newItems,
    },
  };
};

/**
 * Applies animation from instruction to state
 * @param {ApplyParams} params
 * @returns state
 */
const applyAnimation = ({ state, instruction }) => {
  if (instruction.animation) {
    return {
      ...state,
      animation: instruction.animation,
    };
  } else if (state.animation) {
    const { animation, ...rest } = state;
    return rest;
  }
  return state;
};

/**
 * Applies screen from instruction to state
 * @param {ApplyParams} params
 * @returns state
 */
const applyScreen = ({ state, instruction }) => {
  if (instruction.screen) {
    return {
      ...state,
      screen: instruction.screen,
    };
  } else if (state.screen) {
    const { screen, ...rest } = state;
    return rest;
  }
  return state;
};

/**
 * Applies choices from instruction to state
 * @param {ApplyParams} params
 * @returns state
 */
const applyChoices = ({ state, instruction }) => {
  if (instruction.choices) {
    return {
      ...state,
      choices: instruction.choices,
    };
  } else if (state.choices) {
    const { choices, ...rest } = state;
    return rest;
  }
  return state;
};

/**
 * Cleans all state if cleanAll is true
 * @param {ApplyParams} params
 * @returns state
 */
const applyCleanAll = ({ state, instruction }) => {
  if (instruction.cleanAll) {
    return {};
  }
  return state;
};

/**
 * List of all instruction handlers
 */
const instructionHandlers = [
  applyBackground,
  applySfx,
  applyBgm,
  applyVisual,
  applyDialogue,
  applyCharacter,
  applyAnimation,
  applyScreen,
  applyChoices,
  applyCleanAll,
];

const INITIAL_STATE = Object.freeze({});

/**
 * Takes presentation instructions and applies them to the state
 * @param {Object} presentationInstructions
 * @returns presentation template
 */
const applyPresentationInstructions = (presentationInstructions) => {
  if (!presentationInstructions) {
    return {
      ...INITIAL_STATE
    };
  }
  return presentationInstructions.reduce((state, instruction) => {
    let newState = {...state}
    for (const handler of instructionHandlers) {
      newState = handler({ state: newState, instruction });
    }
    return newState;
  }, INITIAL_STATE);
};

export default applyPresentationInstructions;
