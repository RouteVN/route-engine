
export const createInitialState = (payload) => {
  const {
    global: {
      currentLocalizationPackageId,
    }
  } = payload;
  const state = {
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
      history: [{
        type: 'session',
        sessiontId: '...'
      }, {
        type: 'session',
        sessionId: '...'
      }],
      currentModeId: 'normal',
      currentPointerId: 'read',
      configuration: {},
      pointers: {
        read: { sectionId: undefined, lineId: undefined },
        history: { sectionId: undefined, lineId: undefined },
      },
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
  // TODO: need to check the order from presentationData
  return false;
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
 * TODO: decide whether to overwrite or deep merge
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

