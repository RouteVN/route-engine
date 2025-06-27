import { produce } from 'immer';

/**
 * 
 * Applies background from instruction to state
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applyBackground = (state, instruction) => {
  if (instruction.background) {
    if (!instruction.background?.backgroundId) {
      delete state.background;
    } else {
      state.background = instruction.background;
    }
  }
};

/**
 * Applies sound effects from instruction to state
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applySfx = (state, instruction) => {
  if (instruction.sfx) {
    state.sfx = instruction.sfx;
  } else if (state.sfx) {
    delete state.sfx;
  }
};

/**
 * Applies background music from instruction to state
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applyBgm = (state, instruction) => {
  if (instruction.bgm) {
    state.bgm = {
      ...instruction.bgm,
      loop: instruction.bgm.loop || instruction.bgm.loop === undefined,
    };
  }
};

/**
 * Applies visual items from instruction to state
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applyVisual = (state, instruction) => {
  if (instruction.visual) {
    state.visual = instruction.visual;
  }
};

/**
 * Applies dialogue from instruction to state
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applyDialogue = (state, instruction) => {
  if (!instruction.dialogue) {
    return;
  }

  // Start with existing dialogue or empty object
  if (!state.dialogue) {
    state.dialogue = {};
  }

  // Apply instruction dialogue properties
  Object.assign(state.dialogue, instruction.dialogue);

  if (instruction.dialogue.text) {
    // Remove segments if text is provided
    delete state.dialogue.segments;
  }

  // Handle character name
  if (
    instruction.dialogue.character &&
    !instruction.dialogue.character.characterName &&
    state.dialogue.character
  ) {
    delete state.dialogue.character.characterName;
  }
};

/**
 * Applies character from instruction to state
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applyCharacter = (state, instruction) => {
  if (!instruction.character) {
    return;
  }

  // Handle case where there is no existing character
  if (!state.character) {
    state.character = JSON.parse(JSON.stringify(instruction.character));
    return;
  }

  // Update existing character properties
  Object.assign(state.character, instruction.character);
  
  // Keep existing items that aren't in the instruction
  if (!state.character.items) {
    state.character.items = [];
  }
  
  // Process each existing item
  for (let i = 0; i < state.character.items.length; i++) {
    const existingItem = state.character.items[i];
    const matchingItem = instruction.character.items.find(
      (item) => item.id === existingItem.id
    );

    if (!matchingItem) {
      // Item not in instruction, remove inAnimation
      delete existingItem.inAnimation;
    } else {
      // Item is in instruction, update it
      Object.assign(existingItem, matchingItem);
      
      // Handle animations
      if (!matchingItem.inAnimation) {
        delete existingItem.inAnimation;
      }
      if (!matchingItem.outAnimation) {
        delete existingItem.outAnimation;
      }
    }
  }

  // Add new items that aren't already in the state
  instruction.character.items.forEach((instructionItem) => {
    if (!state.character.items.some((item) => item.id === instructionItem.id)) {
      state.character.items.push(instructionItem);
    }
  });
};

/**
 * Applies animation from instruction to state
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applyAnimation = (state, instruction) => {
  if (instruction.animation) {
    state.animation = instruction.animation;
  } else if (state.animation) {
    delete state.animation;
  }
};

/**
 * Applies screen from instruction to state
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applyScreen = (state, instruction) => {
  if (instruction.screen) {
    state.screen = instruction.screen;
  } else if (state.screen) {
    delete state.screen;
  }
};

/**
 * Applies choices from instruction to state
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applyChoices = (state, instruction) => {
  if (instruction.choices) {
    state.choices = instruction.choices;
  } else if (state.choices) {
    delete state.choices;
  }
};

/**
 * Cleans all state if cleanAll is true
 * @param {Object} state - The current state of the system
 * @param {Object} instruction - The instruction to apply
 */
export const applyCleanAll = (state, instruction) => {
  if (instruction.cleanAll) {
    // Clear all properties
    Object.keys(state).forEach(key => {
      delete state[key];
    });
  }
};

export const createInitialState = () => {
  return {}
}

