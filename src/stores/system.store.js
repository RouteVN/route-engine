

import { createStore } from "../util.js";
import { constructPresentationState } from "./constructPresentationState.js";
import { constructRenderState } from "./constructRenderState.js";

export const createInitialState = (payload) => {
  const {
    global: {
      currentLocalizationPackageId,
    },
    // initialPointer,
    projectData,
  } = payload;

  const initialPointer = {
    sceneId: projectData.story.initialSceneId,
    sectionId: projectData.story.scenes[projectData.story.initialSceneId].initialSectionId,
    lineId: projectData.story.scenes[projectData.story.initialSceneId]
      .sections[projectData.story.scenes[projectData.story.initialSceneId].initialSectionId]
      .lines[0].id,
  }

  const state = {
    projectData,
    global: {
      isLineCompleted: false,
      pendingEffects: [],
      autoMode: false,
      skipMode: false,
      dialogueUIHidden: false,
      currentLocalizationPackageId: currentLocalizationPackageId,
      viewedRegistry: {
        sections: [],
        resources: []
      },
      nextLineConfig: {
        manual: {
          enabled: true,
          requireLineCompleted: false,
        },
        auto: {
          enabled: false,
        }
      },
      saveSlots: {},
    },
    contexts: [{
      currentPointerMode: 'read',
      pointers: {
        read: initialPointer,
        history: { sectionId: undefined, lineId: undefined, historySequenceIndex: undefined },
      },
      historySequence: [{
        sectionId: '...',
      }],
      configuration: {},
      views: [],
      bgm: {
        resourceId: undefined,
      },
      variables: {},
    }]
  };
  return state;
};

/**************************
 * Selectors
 *************************/
export const selectPendingEffects = ({ state }) => {
  return state.global.pendingEffects;
};

export const selectSkipMode = ({ state }) => {
  return state.global.skipMode;
};

export const selectAutoMode = ({ state }) => {
  return state.global.autoMode;
};

export const selectDialogueUIHidden = ({ state }) => {
  return state.global.dialogueUIHidden;
};

export const selectCurrentLocalizationPackageId = ({ state }) => {
  return state.global.currentLocalizationPackageId;
};

export const selectIsLineViewed = ({ state }, payload) => {
  const { sectionId, lineId } = payload;
  const section = state.global.viewedRegistry.sections.find(
    section => section.sectionId === sectionId
  );

  if (!section) {
    return false;
  }

  // If section.lastLineId is undefined, it means the entire section is viewed
  if (section.lastLineId === undefined) {
    return true;
  }

  // If lineId is not provided, check if section exists (which it does at this point)
  if (lineId === undefined) {
    return true;
  }

  // If both section.lastLineId and lineId are present, compare them
  // Use selectSection to get the section data
  const foundSection = selectSection({ state }, { sectionId });

  if (!foundSection || !foundSection.lines || !Array.isArray(foundSection.lines)) {
    // If we can't find the section or lines, fallback to original behavior
    return false;
  }

  // Find indices of both lines in the lines array
  const lastLineIndex = foundSection.lines.findIndex(line => line.id === section.lastLineId);
  const currentLineIndex = foundSection.lines.findIndex(line => line.id === lineId);

  // If we can't find either line in the array, fallback to simple comparison
  if (lastLineIndex === -1 || currentLineIndex === -1) {
    return section.lastLineId === lineId;
  }

  // Line is viewed if its index is < last viewed line index
  return currentLineIndex < lastLineIndex;
};

export const selectIsResourceViewed = ({ state }, payload) => {
  const { resourceId } = payload;
  const resource = state.global.viewedRegistry.resources.find(
    resource => resource.resourceId === resourceId
  );

  return !!resource;
};

export const selectNextLineConfig = ({ state }) => {
  return state.global.nextLineConfig;
};

export const selectSaveSlots = ({ state }) => {
  return state.global.saveSlots;
};

export const selectSaveSlot = ({ state }, payload) => {
  const { slotKey } = payload;
  return state.global.saveSlots[slotKey];
};

/**
 * Selects the current pointer from the last context
 * @param {Object} state - Current state object
 * @returns {Object} Current pointer object with currentPointerMode and pointer properties
 * @returns {string} returns.currentPointerMode - The current pointer mode identifier
 * @returns {Object} returns.pointer - The pointer configuration for the current mode
 */
export const selectCurrentPointer = ({ state }) => {
  const lastContext = state.contexts[state.contexts.length - 1];

  console.log('lastContext', lastContext);

  if (!lastContext) {
    return undefined;
  }

  const pointer = lastContext.pointers?.[lastContext.currentPointerMode];
  console.log('lastContext.pointers', lastContext.pointers)
  console.log('lastContext.currentPointerMode', lastContext.currentPointerMode)

  console.log('pointer', pointer)

  return {
    currentPointerMode: lastContext.currentPointerMode,
    pointer
  };
};

/**
 * Selects a section from the project data by sectionId
 * @param {Object} state - Current state object
 * @param {Object} initialState - Payload containing sectionId
 * @param {string} initialState.sectionId - The section ID to find
 * @returns {Object|undefined} The section object if found, undefined otherwise
 */
export const selectSection = ({ state }, payload) => {
  const { sectionId } = payload;
  const scenes = state.projectData?.story?.scenes || {};

  // Search through all scenes to find the section
  for (const sceneId in scenes) {
    const scene = scenes[sceneId];
    if (scene.sections && scene.sections[sectionId]) {
      return scene.sections[sectionId];
    }
  }

  return undefined;
};

export const selectPresentationState = ({ state }) => {
  const { sectionId, lineId } = selectCurrentPointer({ state }).pointer;
  const section = selectSection({ state }, { sectionId });

  // get all lines up to the current line index, inclusive
  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex(line => line.id === lineId);

  // Return all lines up to and including the current line
  const currentLines = lines.slice(0, currentLineIndex + 1);

  console.log('currentLines', currentLines);

  // Create presentation state from unified actions
  const presentationActions = currentLines.map((line) => {
    const actions = line.actions || {};
    const presentationData = {};

    // Extract only presentation-related actions
    Object.keys(actions).forEach((actionType) => {
      presentationData[actionType] = actions[actionType];
    });

    return presentationData;
  });

  const presentationState = constructPresentationState(presentationActions)
  return presentationState
}

export const selectRenderState = ({ state }) => {
  const presentationState = selectPresentationState({ state });
  return constructRenderState({
    presentationState,
    resources: state.projectData.resources,
  });
}

/**************************
 * Actions
 *************************/
export const startAutoMode = ({ state }) => {
  if (state.global.skipMode) {
    state.global.skipMode = false;
    state.global.pendingEffects.push({
      name: "clearSkipNextTimer",
    });
  }
  state.global.autoMode = true;
  state.global.pendingEffects.push({
    name: "clearAutoNextTimer",
  });
  state.global.pendingEffects.push({
    name: "startAutoNextTimer",
  });
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const stopAutoMode = ({ state }) => {
  state.global.autoMode = false;
  state.global.pendingEffects.push({
    name: "clearAutoNextTimer",
  });
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const toggleAutoMode = ({ state }) => {
  const autoMode = state.global.autoMode;
  if (autoMode) {
    stopAutoMode({ state });
  } else {
    startAutoMode({ state });
  }
  return state;
};

export const startSkipMode = ({ state }) => {
  if (state.global.autoMode) {
    state.global.autoMode = false;
    state.global.pendingEffects.push({
      name: "clearAutoNextTimer",
    });
  }
  state.global.skipMode = true;
  state.global.pendingEffects.push({
    name: "clearSkipNextTimer",
  });
  state.global.pendingEffects.push({
    name: "startSkipNextTimer",
  });

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const stopSkipMode = ({ state }) => {
  state.global.skipMode = false;
  state.global.pendingEffects.push({
    name: "clearSkipNextTimer",
  });

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const toggleSkipMode = ({ state }) => {
  const skipMode = selectSkipMode({ state });
  if (skipMode) {
    stopSkipMode({ state });
  } else {
    startSkipMode({ state });
  }
  return state;
};

export const showDialogueUI = ({ state }) => {
  state.global.dialogueUIHidden = false;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const hideDialogueUI = ({ state }) => {
  state.global.dialogueUIHidden = true;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const toggleDialogueUI = ({ state }) => {
  const dialogueUIHidden = selectDialogueUIHidden({ state });
  if (dialogueUIHidden) {
    showDialogueUI({ state });
  } else {
    hideDialogueUI({ state });
  }
  return state;
};

export const setCurrentLocalizationPackageId = ({ state }, payload) => {
  const { localizationPackageId } = payload;
  state.global.currentLocalizationPackageId = localizationPackageId;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const clearPendingEffects = ({ state }) => {
  state.global.pendingEffects = [];
  return state;
};

export const appendPendingEffect = ({ state }, payload) => {
  state.global.pendingEffects.push(payload);
  return state;
};

export const addViewedLine = ({ state }, payload) => {
  const { sectionId, lineId } = payload;
  const section = state.global.viewedRegistry.sections.find(
    section => section.sectionId === sectionId
  );

  if (section) {
    // Update existing section
    section.lastLineId = lineId;
  } else {
    // Add new section
    state.global.viewedRegistry.sections.push({
      sectionId,
      lastLineId: lineId
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const addViewedResource = ({ state }, payload) => {
  const { resourceId } = payload;
  const existingResource = state.global.viewedRegistry.resources.find(
    resource => resource.resourceId === resourceId
  );

  if (!existingResource) {
    // Add new resource only if it doesn't already exist
    state.global.viewedRegistry.resources.push({
      resourceId
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Sets the next line configuration for advancing to the next line
 * @param {Object} state - Current state object
 * @param {Object} initialState - Action payload
 * @param {Object} initialState.nextLineConfig - Configuration object
 * @param {Object} [payload.nextLineConfig.manual] - Manual navigation configuration
 * @param {boolean} [payload.nextLineConfig.manual.enabled] - Whether manual navigation is enabled
 * @param {boolean} [payload.nextLineConfig.manual.requireComplete] - Whether completion is required before advancing
 * @param {Object} [payload.nextLineConfig.auto] - Auto navigation configuration
 * @param {string} [payload.nextLineConfig.auto.trigger] - When auto navigation triggers ('fromStart' or 'fromComplete')
 * @param {number} [payload.nextLineConfig.auto.delay] - Delay in milliseconds before auto advancing
 * @returns {Object} Updated state object
 * @description
 * If both manual and auto configurations are provided, performs complete replacement.
 * If only one configuration is provided, performs partial merge with existing config.
 */
export const setNextLineConfig = ({ state }, payload) => {
  const { nextLineConfig } = payload;

  // If both manual and auto are provided, do complete replacement
  if (nextLineConfig.manual && nextLineConfig.auto) {
    state.global.nextLineConfig = {
      manual: nextLineConfig.manual,
      auto: nextLineConfig.auto
    };
  } else {
    // Partial update - merge only provided sections
    if (nextLineConfig.manual) {
      state.global.nextLineConfig.manual = {
        ...state.global.nextLineConfig.manual,
        ...nextLineConfig.manual
      };
    }

    if (nextLineConfig.auto) {
      state.global.nextLineConfig.auto = {
        ...state.global.nextLineConfig.auto,
        ...nextLineConfig.auto
      };
    }
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Replaces a save slot with new data
 * @param {Object} state - Current state object
 * @param {Object} initialState - Action payload
 * @param {string} initialState.slotKey - The key identifying the save slot
 * @param {number} initialState.date - Unix timestamp for when the save was created
 * @param {string} initialState.image - Base64 encoded save image/screenshot
 * @param {Object} initialState.state - The game state to be saved
 * @returns {Object} Updated state object
 */
export const replaceSaveSlot = ({ state }, payload) => {
  const { slotKey, date, image, state: slotState } = payload;

  state.global.saveSlots[slotKey] = {
    slotKey,
    date,
    image,
    state: slotState
  };

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Adds an item to the historySequence of the last context
 * @param {Object} state - Current state object
 * @param {Object} initialState - Action payload
 * @param {Object} initialState.item - The historySequence item to add (can be any structure)
 * @returns {Object} Updated state object
 */
export const addToHistory = ({ state }, payload) => {
  const { item } = payload;

  // Get the last context (assuming we want to add to the most recent context)
  const lastContext = state.contexts[state.contexts.length - 1];

  if (lastContext && lastContext.historySequence) {
    lastContext.historySequence.push(item);
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const nextLine = ({ state }, payload) => {
  const { sectionId } = payload;
  const section = selectSection({ state }, { sectionId });
  const pointer = selectCurrentPointer({ state })?.pointer;

  const lines = section?.lines || [];

  const currentLineIndex = lines.findIndex(line => line.id === pointer?.lineId);
  const nextLineIndex = currentLineIndex + 1;

  if (nextLineIndex < lines.length) {
    const nextLine = lines[nextLineIndex];
    const lastContext = state.contexts[state.contexts.length - 1];

    if (lastContext) {
      lastContext.pointers.read = {
        sectionId,
        lineId: nextLine.id
      };
    }

    state.global.isLineCompleted = false;

    state.global.pendingEffects.push({
      name: "render",
    });
  }
  return state;
};

/**
 * Navigate to the previous line using history pointer
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.sectionId - The section ID to navigate in
 * @returns {Object} Updated state object
 */
export const markLineCompleted = ({ state }) => {
  state.global.isLineCompleted = true;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const prevLine = ({ state }, payload) => {
  const { sectionId } = payload;
  const section = selectSection({ state }, { sectionId });

  // Return early if section doesn't exist
  if (!section || !section.lines || section.lines.length === 0) {
    return state;
  }

  const lines = section.lines;
  const lastContext = state.contexts[state.contexts.length - 1];

  if (!lastContext || !lastContext.pointers) {
    return state;
  }

  // Get current history pointer or use read pointer as fallback
  const currentPointer = lastContext.pointers.history || lastContext.pointers.read;

  // If we're already in history mode, keep history pointer and move it back
  // Otherwise, switch to history mode and initialize it (only if we have a valid currentPointer)
  if (lastContext.currentPointerMode !== 'history' || !lastContext.pointers.history) {
    // Only switch to history mode if we have a valid current pointer to work with
    if (!currentPointer) {
      return state;
    }

    // Switch to history mode, initialize history pointer with current position
    lastContext.currentPointerMode = 'history';
    lastContext.pointers.history = {
      sectionId,
      lineId: currentPointer?.lineId
    };

    // Immediately move to previous line after switching to history mode
    const currentLineIndex = lines.findIndex(line => line.id === currentPointer.lineId);
    const prevLineIndex = currentLineIndex - 1;

    if (prevLineIndex >= 0 && prevLineIndex < lines.length) {
      const prevLine = lines[prevLineIndex];
      lastContext.pointers.history = {
        sectionId,
        lineId: prevLine.id
      };
    }

    // Add render effect for mode change
    state.global.pendingEffects.push({
      name: "render",
    });

    return state;
  }

  // Already in history mode, move history pointer to previous line
  const currentLineIndex = lines.findIndex(line => line.id === lastContext.pointers.history.lineId);
  const prevLineIndex = currentLineIndex - 1;

  if (prevLineIndex >= 0 && prevLineIndex < lines.length) {
    const prevLine = lines[prevLineIndex];
    lastContext.pointers.history = {
      sectionId,
      lineId: prevLine.id
    };

    state.global.pendingEffects.push({
      name: "render",
    });
  }

  return state;
};

/**************************
 * Store Export
 *************************/

// Export the store using createStore from util.js
export const createSystemStore = (initialState) => {
  const _initialState = createInitialState(initialState);

  // Gather all selectors and actions for the store
  const selectorsAndActions = {
    // Selectors
    selectPendingEffects,
    selectSkipMode,
    selectAutoMode,
    selectDialogueUIHidden,
    selectCurrentLocalizationPackageId,
    selectIsLineViewed,
    selectIsResourceViewed,
    selectNextLineConfig,
    selectSaveSlots,
    selectSaveSlot,
    selectCurrentPointer,
    selectSection,
    selectPresentationState,
    selectRenderState,

    // Actions
    startAutoMode,
    stopAutoMode,
    toggleAutoMode,
    startSkipMode,
    stopSkipMode,
    toggleSkipMode,
    showDialogueUI,
    hideDialogueUI,
    toggleDialogueUI,
    setCurrentLocalizationPackageId,
    clearPendingEffects,
    appendPendingEffect,
    addViewedLine,
    addViewedResource,
    setNextLineConfig,
    replaceSaveSlot,
    addToHistory,
    nextLine,
    markLineCompleted,
    prevLine,
  };

  return createStore(_initialState, selectorsAndActions, {
    transformActionFirstArgument: (state) => {
      return { state }
    },
    transformSelectorFirstArgument: (state) => {
      return { state }
    },
  });
};

