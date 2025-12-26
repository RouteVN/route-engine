import { createSequentialActionsExecutor } from "../util.js";

/**
 * Creates the initial presentation state
 * @returns {Object} Empty initial state object
 */
export const createInitialState = () => {
  return {};
};

/**
 * Applies base from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const base = (state, presentation) => {
  if (presentation.base) {
    state.base = { ...presentation.base };
  }
};

/**
 *
 * Applies background from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const background = (state, presentation) => {
  if (presentation.background) {
    state.background = { ...presentation.background };
  }
};

/**
 * Applies dialogue from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const dialogue = (state, presentation) => {
  if (!presentation.dialogue) {
    if (state.dialogue && state.dialogue.mode === "adv") {
      state.dialogue.content = undefined;
      state.dialogue.characterId = undefined;
    }
    return;
  }

  // Start with existing dialogue or empty object
  if (!state.dialogue) {
    state.dialogue = {};
  }

  // Copy all dialogue properties including gui
  if (presentation.dialogue.gui) {
    state.dialogue.gui = { ...presentation.dialogue.gui };
  }

  // Handle mode-specific initialization
  if (presentation.dialogue.mode === "adv") {
    state.dialogue.content = state.dialogue.content || undefined;
    state.dialogue.characterId = state.dialogue.characterId || undefined;
    state.dialogue.mode = "adv";
  }

  if (presentation.dialogue.mode === "nvl") {
    if (state.dialogue?.mode !== "nvl") {
      state.dialogue.lines = [];
    }
    state.dialogue.mode = "nvl";
  }

  // Update content and character
  if (presentation.dialogue.content !== undefined) {
    state.dialogue.content = presentation.dialogue.content;
  }
  if (presentation.dialogue.characterId !== undefined) {
    state.dialogue.characterId = presentation.dialogue.characterId;
  }
  if (presentation.dialogue.character) {
    state.dialogue.character = { ...presentation.dialogue.character };
  }

  // Handle clear action
  if (presentation.dialogue.clear) {
    delete state.dialogue;
    return;
  }

  // Handle NVL mode content addition
  if (
    presentation.dialogue?.mode === "nvl" &&
    presentation.dialogue.content !== undefined
  ) {
    if (presentation.dialogue.clear) {
      state.dialogue.lines = [];
    }
    state.dialogue.lines.push({
      content: presentation.dialogue.content,
    });
  }
};

/**
 * Applies sound effects from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const sfx = (state, presentation) => {
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
export const bgm = (state, presentation) => {
  if (presentation.bgm) {
    if (!presentation.bgm.resourceId) {
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
export const visual = (state, presentation) => {
  if (presentation.visual) {
    state.visual = presentation.visual;
  }
};

/**
 * Applies character from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const character = (state, presentation) => {
  if (!presentation.character) {
    return;
  }

  // Simply replace the entire character state
  if (!presentation.character.items) {
    delete state.character;
  }

  state.character = structuredClone(presentation.character);
};

/**
 * Applies animation from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const animation = (state, presentation) => {
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
export const layout = (state, presentation) => {
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
export const choice = (state, presentation) => {
  if (presentation.choice) {
    state.choice = presentation.choice;
  } else if (state.choice) {
    delete state.choice;
  }
};

export const voice = (state, presentation) => {
  if (presentation.voice) {
    state.voice = presentation.voice;
  } else if (state.voice) {
    delete state.voice;
  }
};

/**
 * Cleans all state if cleanAll is provided
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const cleanAll = (state, presentation) => {
  if (presentation.cleanAll) {
    // Clear all properties
    Object.keys(state).forEach((key) => {
      delete state[key];
    });
  }
};

/**
 * Constructs presentation state by applying all presentation actions to initial state
 * @param {Array} presentations - Array of presentation objects to apply
 * @returns {Object} Final presentation state
 */
export const constructPresentationState = (presentations) => {
  const actions = [
    cleanAll,
    base,
    background,
    sfx,
    bgm,
    visual,
    dialogue,
    character,
    animation,
    layout,
    choice,
    voice,
  ];

  const executeActions = createSequentialActionsExecutor(
    createInitialState,
    actions,
  );

  return executeActions(presentations);
};
