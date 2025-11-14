
export const createInitialState = (payload) => {
  const {
    global: {
      currentLocalizationPackageId,
    },
    initialPointer,
    projectData,
  } = payload;
  const state = {
    // projectData,
    projectData: {
      story: {
        scenes: {
          somesceneid: {
            sections: {
              somesectionid: {
                lines: [{
                  id: '3fal',
                  actions: {}
                }, {
                  id: '3fal',
                  actions: {}
                }]
              }
            }
          }
        }
      }
    },
    global: {
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
          requireComplete: false,
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
        history: { sectionId: undefined, lineId: undefined },
      },
      history: [],
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

  if (!lastContext) {
    return undefined;
  }

  const pointer = lastContext.pointers?.[lastContext.currentPointerId];

  return {
    currentPointerMode: lastContext.currentPointerId,
    pointer: pointer !== undefined ? pointer : undefined
  };
};

/**
 * Selects a section from the project data by sectionId
 * @param {Object} state - Current state object
 * @param {Object} payload - Payload containing sectionId
 * @param {string} payload.sectionId - The section ID to find
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
 * @param {Object} payload - Action payload
 * @param {Object} payload.nextLineConfig - Configuration object
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
 * @param {Object} payload - Action payload
 * @param {string} payload.slotKey - The key identifying the save slot
 * @param {number} payload.date - Unix timestamp for when the save was created
 * @param {string} payload.image - Base64 encoded save image/screenshot
 * @param {Object} payload.state - The game state to be saved
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
 * Adds an item to the history of the last context
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {Object} payload.item - The history item to add (can be any structure)
 * @returns {Object} Updated state object
 */
export const addToHistory = ({ state }, payload) => {
  const { item } = payload;

  // Get the last context (assuming we want to add to the most recent context)
  const lastContext = state.contexts[state.contexts.length - 1];

  if (lastContext && lastContext.history) {
    lastContext.history.push(item);
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

