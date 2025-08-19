/**
 *
 * Applies background from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applyBackground = (state, presentation) => {
  if (presentation.background) {
    state.background = { ...presentation.background };
  }
};

/**
 * Applies sound effects from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applySfx = (state, presentation) => {
  if (presentation.sfx) {
    state.sfx = presentation.sfx;
  } else if (state.sfx) {
    delete state.sfx;
  }
};

/**
 * Applies background music from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applyBgm = (state, presentation) => {
  if (presentation.bgm) {
    if (!presentation.bgm.audioId) {
      state.bgm = undefined;
      return;
    }

    state.bgm = {
      ...presentation.bgm,
      loop: presentation.bgm.loop || presentation.bgm.loop === undefined,
    };
  }
};

/**
 * Applies visual items from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applyVisual = (state, presentation) => {
  if (presentation.visual) {
    state.visual = presentation.visual;
  }
};

/**
 * Applies dialogue from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applyDialogue = (state, presentation) => {
  if (!presentation.dialogue) {

    if (state.dialogue) {
      state.dialogue.content = undefined;
      state.dialogue.characterId = undefined;
    }

    return;
  }

  // Start with existing dialogue or empty object
  if (!state.dialogue) {
    state.dialogue = {};
  }

  state.dialogue.content = undefined;
  state.dialogue.characterId = undefined;

  // Apply presentation dialogue properties
  Object.assign(state.dialogue, presentation.dialogue);

  if (presentation.dialogue.content) {
    // Remove segments if content is provided
    delete state.dialogue.segments;
  }

  // Handle character name
  if (
    presentation.dialogue.character &&
    !presentation.dialogue.character.characterName &&
    state.dialogue.character
  ) {
    delete state.dialogue.character.characterName;
  }
};

/**
 * Applies character from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applyCharacter = (state, presentation) => {
  if (!presentation.character) {
    return;
  }

  // Handle case where there is no existing character
  if (!state.character) {
    state.character = JSON.parse(JSON.stringify(presentation.character));
    return;
  }

  // Update existing character properties
  Object.assign(state.character, presentation.character);

  // Keep existing items that aren't in the presentation
  if (!state.character.items) {
    state.character.items = [];
  }

  // Process each existing item
  for (let i = 0; i < state.character.items.length; i++) {
    const existingItem = state.character.items[i];
    const matchingItem = presentation.character.items.find(
      (item) => item.id === existingItem.id,
    );

    if (!matchingItem) {
      // Item not in presentation, remove inAnimation
      delete existingItem.inAnimation;
    } else {
      // Item is in presentation, update it
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
  presentation.character.items.forEach((presentationItem) => {
    if (
      !state.character.items.some((item) => item.id === presentationItem.id)
    ) {
      state.character.items.push(presentationItem);
    }
  });
};

/**
 * Applies animation from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applyAnimation = (state, presentation) => {
  if (presentation.animation) {
    state.animation = presentation.animation;
  } else if (state.animation) {
    delete state.animation;
  }
};

/**
 * Applies layout from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applyLayout = (state, presentation) => {
  if (presentation.layout) {
    state.layout = presentation.layout;
  } else if (state.layout) {
    delete state.layout;
  }
};

/**
 * Applies choice from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applyChoice = (state, presentation) => {
  if (presentation.choice) {
    state.choice = presentation.choice;
  } else if (state.choice) {
    delete state.choice;
  }
};

/**
 * Cleans all state if cleanAll is provided
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const applyCleanAll = (state, presentation) => {
  if (presentation.cleanAll) {
    // Clear all properties
    Object.keys(state).forEach((key) => {
      delete state[key];
    });
  }
};

export const createInitialState = () => {
  return {};
};

export default [
  applyCleanAll,
  applyBackground,
  applySfx,
  applyBgm,
  applyVisual,
  applyDialogue,
  applyCharacter,
  applyAnimation,
  applyLayout,
  applyChoice,
];
