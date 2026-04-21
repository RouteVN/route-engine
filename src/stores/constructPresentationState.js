import { createSequentialActionsExecutor } from "../util.js";

/**
 * Helper to handle animations-only state when no resource is provided
 * @param {Object} presentation - The presentation object
 * @param {Function} hasResourceFn - Function to check if presentation has a resource
 * @returns {{ animationsOnly: boolean, state: Object|null }}
 */
const getAnimationsOnlyState = (presentation, hasResourceFn) => {
  if (!presentation) {
    return { animationsOnly: false, state: null };
  }

  if (!hasResourceFn(presentation) && presentation.animations) {
    return {
      animationsOnly: true,
      state: { animations: structuredClone(presentation.animations) },
    };
  }

  return { animationsOnly: false, state: null };
};

/**
 * Processes items array to handle animations-only items
 * @param {Array} items - The items array
 * @param {Function} hasResourceFn - Function to check if item has a resource
 * @returns {{ hasValidItems: boolean, processedItems: Array }}
 */
const processItemsWithAnimations = (items, hasResourceFn) => {
  if (!items || items.length === 0) {
    return { hasValidItems: false, processedItems: [] };
  }

  const processedItems = items
    .map((item) => structuredClone(item))
    .filter((item) => hasResourceFn(item) || item.animations);

  return {
    hasValidItems: processedItems.length > 0,
    processedItems,
  };
};

const hasOwnProperty = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

const resolveDialogueCharacterName = (dialogueAction) => {
  if (!dialogueAction) {
    return undefined;
  }

  if (hasOwnProperty(dialogueAction, "characterName")) {
    return dialogueAction.characterName;
  }

  if (
    dialogueAction.character &&
    hasOwnProperty(dialogueAction.character, "name")
  ) {
    return dialogueAction.character.name;
  }

  return undefined;
};

/**
 * Creates the initial presentation state
 * @returns {Object} Empty initial state object
 */
export const createInitialState = () => {
  return {};
};

/**
 *
 * Applies background from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const background = (state, presentation) => {
  if (presentation.background) {
    const { animationsOnly, state: animState } = getAnimationsOnlyState(
      presentation.background,
      (p) => !!p.resourceId,
    );

    if (animationsOnly) {
      state.background = state.background?.resourceId
        ? {
            ...structuredClone(state.background),
            ...animState,
          }
        : animState;
      return;
    }

    if (!presentation.background.resourceId) {
      delete state.background;
      return;
    }

    state.background = structuredClone(presentation.background);
  } else {
    // Only clear animations if they exist
    if (state.background?.animations) {
      state.background.animations = {};
    }
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
      if (state.dialogue.persistCharacter !== true) {
        delete state.dialogue.characterId;
        delete state.dialogue.character;
      }
    }
    return;
  }

  // Start with existing dialogue or empty object
  if (!state.dialogue) {
    state.dialogue = {};
  }

  // Copy all dialogue properties including ui
  if (presentation.dialogue.ui) {
    const { animationsOnly, state: animState } = getAnimationsOnlyState(
      presentation.dialogue.ui,
      (p) => !!p.resourceId,
    );

    if (animationsOnly) {
      state.dialogue.ui = {
        ...state.dialogue.ui,
        ...animState,
      };
    } else {
      state.dialogue.ui = { ...presentation.dialogue.ui };
    }
  } else if (state.dialogue?.ui?.animations) {
    // Clear animations if no ui in presentation
    state.dialogue.ui.animations = {};
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

  const persistCharacter = hasOwnProperty(
    presentation.dialogue,
    "persistCharacter",
  )
    ? presentation.dialogue.persistCharacter === true
    : state.dialogue.persistCharacter === true;

  if (persistCharacter) {
    state.dialogue.persistCharacter = true;
  } else {
    delete state.dialogue.persistCharacter;
  }

  const hasCharacterId = hasOwnProperty(presentation.dialogue, "characterId");
  const characterName = resolveDialogueCharacterName(presentation.dialogue);
  const hasCharacterName = characterName !== undefined;

  if (hasCharacterId) {
    if (presentation.dialogue.characterId) {
      state.dialogue.characterId = presentation.dialogue.characterId;
    } else {
      delete state.dialogue.characterId;
    }
  } else if (!persistCharacter) {
    delete state.dialogue.characterId;
  }

  if (hasCharacterName) {
    state.dialogue.character = { name: characterName };
  } else if (hasCharacterId || !persistCharacter) {
    delete state.dialogue.character;
  }

  // Handle clear action
  if (presentation.dialogue.clear) {
    delete state.dialogue;
    return;
  }

  // Handle NVL page clear (before adding new content)
  if (presentation.dialogue?.clearPage && state.dialogue?.mode === "nvl") {
    state.dialogue.lines = [];
  }

  // Handle NVL mode content addition
  if (
    state.dialogue?.mode === "nvl" &&
    presentation.dialogue.content !== undefined
  ) {
    const dialogueLine = {
      content: presentation.dialogue.content,
      characterId: state.dialogue.characterId ?? null,
    };

    if (state.dialogue.character) {
      dialogueLine.characterName = state.dialogue.character.name;
    }

    state.dialogue.lines.push(dialogueLine);
  }
};

/**
 * Applies sound effects from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const sfx = (state, presentation) => {
  if (presentation.sfx) {
    if (!presentation.sfx.items || presentation.sfx.items.length === 0) {
      delete state.sfx;
      return;
    }
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
    const { hasValidItems, processedItems } = processItemsWithAnimations(
      presentation.visual.items,
      (item) => !!item.resourceId,
    );

    if (hasValidItems) {
      state.visual = { items: processedItems };
    } else {
      delete state.visual;
    }
  } else {
    // Only clear animations from items that have them
    if (state.visual?.items) {
      state.visual.items = state.visual.items.map((item) => {
        if (item.animations) {
          return { ...item, animations: {} };
        }
        return item;
      });
    }
  }
};

/**
 * Applies character from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const character = (state, presentation) => {
  if (!presentation.character) {
    // Only clear animations from items that have them
    if (state.character?.items) {
      state.character.items = state.character.items.map((item) => {
        if (item.animations) {
          return { ...item, animations: {} };
        }
        return item;
      });
    }
    return;
  }

  const { hasValidItems, processedItems } = processItemsWithAnimations(
    presentation.character.items,
    (item) =>
      (item.sprites && item.sprites.length > 0) ||
      item.transformId ||
      item.resourceId,
  );

  if (hasValidItems) {
    state.character = { items: processedItems };
  } else {
    delete state.character;
  }
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
    const { animationsOnly, state: animState } = getAnimationsOnlyState(
      presentation.layout,
      (p) => !!p.resourceId,
    );

    if (animationsOnly) {
      state.layout = animState;
      return;
    }

    if (!presentation.layout.resourceId) {
      delete state.layout;
      return;
    }

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
    const { animationsOnly, state: animState } = getAnimationsOnlyState(
      presentation.choice,
      (p) => !!p.resourceId,
    );

    if (animationsOnly) {
      state.choice = {
        ...state.choice,
        ...animState,
      };
      return;
    }

    if (!presentation.choice.resourceId) {
      delete state.choice;
      return;
    }

    state.choice = presentation.choice;
  } else if (state.choice) {
    delete state.choice;
  }
};

export const control = (state, presentation) => {
  if (presentation.control) {
    if (!presentation.control.resourceId) {
      delete state.control;
      return;
    }

    state.control = presentation.control;
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
    background,
    sfx,
    bgm,
    visual,
    dialogue,
    character,
    animation,
    layout,
    choice,
    control,
    voice,
  ];

  const executeActions = createSequentialActionsExecutor(
    createInitialState,
    actions,
  );

  return executeActions(presentations);
};
