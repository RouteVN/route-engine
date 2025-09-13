export const createInitialState = ({
  sectionId,
  lineId,
  saveData,
  variables,
}) => {
  const state = {
    pendingEffects: [],
    variables,
    saveData: saveData || {},
    modals: [],
    story: {
      lastLineAction: undefined,
      dialogueUIHidden: false,
      currentPointer: "read",
      nextConfig: {},
      autoMode: false,
      skipMode: false,
      pointers: {
        read: {
          sectionId,
          lineId,
        },
        menu: {
          sectionId: undefined,
          lineId: undefined,
        },
        history: {
          sectionId: undefined,
          lineId: undefined,
          historyEntryIndex: undefined,
        },
        // title: {
        //   sectionId: undefined,
        //   lineId: undefined
        // },
      },
      history: {
        entries: [],
        // entries: [{
        //   sectionId: 'asdkjl32',
        // }, {
        //   sectionId: '3jd3kd'
        // }, {
        //   sectionId: '39fk32'
        // }, {
        //   sectionId: '39cksk3',
        //   // this is current actual lineId the user is lastest on
        //   lineId: 'line3'
        // }]
      },
    },
  };
  state.story.history.entries.push({
    sectionId,
  });
  return state;
};

/**************************
 * Selectors
 *************************/


export const selectState = ({ state }) => {
  return state;
}

export const selectPendingEffects = ({ state }) => {
  return state.pendingEffects;
};

export const selectSortedPendingEffects = ({ state }) => {
  const effects = state.pendingEffects;
  const effectMap = new Map();

  // Keep only the last effect with each name
  effects.forEach(effect => {
    effectMap.set(effect.name, effect);
  });

  return Array.from(effectMap.values());
};

export const selectCurrentPointer = ({ state }) => {
  return state.story.pointers[state.story.currentPointer];
};

export const selectCurrentPresetId = ({ state }) => {
  // Presets are no longer used
  return null;
};

export const selectCurrentPreset = ({ state, projectDataStore }) => {
  // Presets are no longer used
  return null;
};

export const selectSkipMode = ({ state }) => {
  return state.story.skipMode;
};

export const selectAutoMode = ({ state }) => {
  return state.story.autoMode;
};

export const selectPointers = ({ state }) => {
  return state.story.pointers;
};

export const selectNextConfig = ({ state }) => {
  return state.story.nextConfig;
};

export const selectRuntimeState = ({ state }) => {
  return state.runtimeState;
};

export const selectPointerMode = ({ state }) => {
  return state.story.currentPointer;
};

export const selectDialogueUIHidden = ({ state }) => {
  return state.story.dialogueUIHidden;
};

export const selectHistory = ({ state }) => {
  return state.story.history;
};

export const selectSpecificPointer = ({ state, mode }) => {
  return state.story.pointers[mode];
};

export const selectSaveData = ({ state }) => {
  return state.saveData;
};

export const selectSaveDataPage = ({ state }, payload) => {
  const { page, numberPerPage } = payload;

  const start = page * numberPerPage;

  let items = [];
  for (let i = start; i < start + numberPerPage; i++) {
    const item = state.saveData[i] ? {
      id: i,
      label: new Date(state.saveData[i].date).toISOString().split('T')[0],
      hasData: true
    } : {
      id: i,
      label: 'No Data',
      hasData: false,
    }
    items.push(item)
  }

  return items;
}

export const selectVariables = ({ state }) => {
  return state.variables;
};

export const selectDeviceVariables = ({ state, projectDataStore }) => {
  const variableDefinitions = projectDataStore.selectVariables();
  const currentVariables = state.variables;

  const deviceVariables = {};
  Object.entries(variableDefinitions).forEach(([key, definition]) => {
    if (definition.persistence === 'device' && currentVariables.hasOwnProperty(key)) {
      deviceVariables[key] = currentVariables[key];
    }
  });

  return deviceVariables;
};

/*************************
 * Actions
 *************************/

export const clearPendingEffects = ({ state }) => {
  state.pendingEffects = [];
};

/**
 * Handles line completion and manages auto-next behavior
 */
export const lineCompleted = ({ state, projectDataStore }) => {
  const autoMode = selectAutoMode(state);

  const { pendingEffects } = state;

  if (autoMode) {
    pendingEffects.push({
      name: "systemInstructions",
      options: {
        delay: 1000,
        systemInstructions: {
          nextLine: {
            forceSkipAutonext: true,
          },
        },
      },
    });
    return;
  }

  const skipMode = selectSkipMode(state);

  if (skipMode) {
    pendingEffects.push({
      name: "systemInstructions",
      options: {
        delay: 300,
        systemInstructions: {
          nextLine: {
            forceSkipAutonext: true,
          },
        },
      },
    });
    return;
  }

  const nextConfig = selectNextConfig(state);

  if (!nextConfig || !nextConfig.auto) {
    return;
  }

  const { trigger, delay } = nextConfig.auto;

  switch (trigger) {
    case "fromComplete":
      // Schedule next line to occur after delay from completion
      pendingEffects.push({
        name: "systemInstructions",
        options: {
          delay: delay,
          systemInstructions: {
            nextLine: {
              forceSkipAutonext: true,
            },
          },
        },
      });
      break;

    case "fromStart":
      // For fromStart, the delay should have been scheduled at line start
      // This is handled elsewhere, so we just clear the config here
      delete state.story.nextConfig;
      break;

    default:
      // Clear unknown nextConfig states
      delete state.story.nextConfig;
      break;
  }
};

/**
 * Advances to the next line in the story
 * @param {ApplyParams} params
 */
export const nextLine = ({ state, projectDataStore }, payload = {}) => {
  const { pendingEffects } = state;

  // If dialogue is hidden, show it instead of advancing
  if (state.story.dialogueUIHidden) {
    state.story.dialogueUIHidden = false;
    pendingEffects.push({
      name: "render",
    });
    return;
  }

  const { forceSkipAutonext = false } = payload;
  const nextConfig = selectNextConfig({ state });

  if (!forceSkipAutonext && nextConfig && nextConfig.manual) {
    // Check if manual advance is disabled
    if (!nextConfig.manual.enabled) {
      return;
    }
    // Check if line must be complete before manual advance
    if (nextConfig.manual.requireComplete && !state.lineComplete) {
      return;
    }
  }

  const currentPointer = selectCurrentPointer({ state });
  const lines = projectDataStore.selectSectionLines(currentPointer.sectionId);

  const currentLineIndex = lines.findIndex(
    (line) => line.id === currentPointer.lineId,
  );
  const nextLine = lines[currentLineIndex + 1];

  if (!nextLine) {
    state.story.skipMode = false;
    state.story.autoMode = false;
    pendingEffects.push({
      name: 'clearAutoNextTimer'
    })
    pendingEffects.push({
      name: 'clearSkipNextTimer'
    })
    return;
  }

  state.story.pointers[state.story.currentPointer].lineId = nextLine.id;

  delete state.story.nextConfig;

  pendingEffects.push({
    name: "render",
  });
};

/**
 */
export const prevLine = ({ state, projectDataStore }) => {
  const pointerMode = selectPointerMode({ state });
  const currentPointer = selectCurrentPointer({ state });

  const lines = projectDataStore.selectSectionLines(currentPointer.sectionId);
  const currentLineIndex = lines.findIndex(
    (line) => line.id === currentPointer.lineId,
  );
  const prevLine = lines[currentLineIndex - 1];

  if (!prevLine) {
    if (pointerMode === "history") {
      if (state.story.historyEntryIndex > 0) {
        state.story.historyEntryIndex--;
      } else {
        return;
      }
      state.story.pointers["history"].sectionId =
        state.story.history.entries[state.story.historyEntryIndex].sectionId;
      const prevSectionLines = projectDataStore.selectSectionLines(
        state.story.pointers["history"].sectionId,
      );
      state.story.pointers["history"].lineId =
        prevSectionLines[prevSectionLines.length - 1].id;

      state.story.lastLineAction = "prevLine";

      state.pendingEffects.push({
        name: "render",
      });
    }

    return;
  }

  if (pointerMode === "read") {
    state.story.currentPointer = "history";
    state.story.historyEntryIndex = state.story.history.entries.length - 1;
  }

  state.story.pointers["history"].lineId = prevLine.id;
  state.story.pointers["history"].sectionId = currentPointer.sectionId;
  state.story.lastLineAction = "prevLine";

  state.pendingEffects.push({
    name: "render",
  });
};

/**
 * @param {ApplyParams} params
 */
export const sectionTransition = ({ state, projectDataStore }, payload) => {
  const { sectionId, sceneId, mode } = payload;
  const lines = projectDataStore.selectSectionLines(sectionId);

  if (mode) {
    state.story.currentPointer = mode;
  }

  const currentMode = selectPointerMode({ state });

  if (currentMode === "read") {
    state.story.history.entries.push({
      sectionId,
    });
  } else if (currentMode === "history") {
    // TODO: check if the next section is same as history next section
    if (
      sectionId ===
      state.story.history.entries[state.story.historyEntryIndex + 1].sectionId
    ) {
      state.story.historyEntryIndex++;
    } else {
      // exit history mode
      // update read pointer
    }
  }

  state.story.pointers[currentMode].sectionId = sectionId;
  state.story.pointers[currentMode].sceneId = sceneId;
  state.story.pointers[currentMode].lineId = lines[0].id;
  state.story.nextConfig = lines[0].actions?.nextConfig;

  state.pendingEffects.push({
    name: "render",
  });
};

/**
 * @param {ApplyParams} params
 */
export const updateVariable = ({ state, projectDataStore }, payload) => {
  const { operations } = payload;
  for (const operation of operations) {
    const { variableId, op, value } = operation;
    if (op === "set") {
      state.variables[variableId] = value;
    } else if (op === "add") {
      state.variables[variableId] = (state.variables[variableId] || 0) + value;
    } else if (op === "subtract") {
      state.variables[variableId] = (state.variables[variableId] || 0) - value;
    } else if (op === "multiply") {
      state.variables[variableId] = (state.variables[variableId] || 0) * value;
    } else if (op === "divide") {
      state.variables[variableId] = (state.variables[variableId] || 0) / value;
    } else if (op === "increment") {
      const { max } = operation;
      const nextValue = (state.variables[variableId] || 0) + 1;
      if (max === undefined || nextValue <= max) {
        state.variables[variableId] = (state.variables[variableId] || 0) + 1;
      }
    } else if (op === "decrement") {
      const { min } = operation;
      const nextValue = (state.variables[variableId] || 0) - 1;
      if (min !== undefined && nextValue >= min) {
        state.variables[variableId] = (state.variables[variableId] || 0) - 1;
      }
    }
  }

  state.pendingEffects.push({
    name: "render",
  });
  state.pendingEffects.push({
    name: 'saveVariables'
  })
};


/**
 * @param {ApplyParams} params
 */
export const clearCurrentMode = ({ state }, payload) => {
  state.story.currentPointer = payload.mode;
  state.pendingEffects.push({
    name: "render",
  });
};

export const startAutoMode = ({ state }) => {
  if (selectSkipMode({ state })) {
    state.story.skipMode = false;
    state.pendingEffects.push({
      name: "clearSkipNextTimer",
    });
  }
  state.story.autoMode = true;
  state.pendingEffects.push({
    name: "clearAutoNextTimer",
  });
  state.pendingEffects.push({
    name: "startAutoNextTimer",
  });
  state.pendingEffects.push({
    name: "render",
  });
};

export const stopAutoMode = ({ state }) => {
  state.story.autoMode = false;
  state.pendingEffects.push({
    name: "render",
  });
  state.pendingEffects.push({
    name: "clearAutoNextTimer",
  });
};

export const toggleAutoMode = ({ state }) => {
  const autoMode = selectAutoMode({ state });
  if (autoMode) {
    stopAutoMode({ state });
  } else {
    startAutoMode({ state });
  }
};

export const startSkipMode = ({ state }) => {
  if (selectAutoMode({ state })) {
    state.story.autoMode = false;
    state.pendingEffects.push({
      name: "clearAutoNextTimer",
    });
  }
  state.story.skipMode = true;
  state.pendingEffects.push({
    name: "clearSkipNextTimer",
  });
  state.pendingEffects.push({
    name: "startSkipNextTimer",
  });

  state.pendingEffects.push({
    name: "render",
  });
};

export const stopSkipMode = ({ state }) => {
  state.story.skipMode = false;
  state.pendingEffects.push({
    name: "clearSkipNextTimer",
  });

  state.pendingEffects.push({
    name: "render",
  });
};

export const toggleSkipMode = ({ state }) => {
  const skipMode = selectSkipMode({ state });
  if (skipMode) {
    stopSkipMode({ state });
  } else {
    startSkipMode({ state });
  }
};

export const toggleDialogueUIHidden = ({ state }) => {
  state.story.dialogueUIHidden = !state.story.dialogueUIHidden;
  state.pendingEffects.push({
    name: "render",
  });
};

/**
 * Sets nextConfig for the current line
 * @param {ApplyParams} params
 */
export const nextConfig = ({ state }, payload) => {
  state.story.nextConfig = payload;
};

export const setSaveData = ({ state }, payload) => {
  const { saveData } = payload;
  state.saveData = saveData;
}

export const setDeviceVariables = ({ state }, payload) => {
  const { variables } = payload;
  // Merge device variables into state
  Object.entries(variables).forEach(([key, value]) => {
    state.variables[key] = value;
  });
}

export const saveVnData = ({ state }, payload) => {
  const { slotIndex } = payload;
  state.saveData[slotIndex] = {
    id: String(slotIndex),
    pointer: selectSpecificPointer({ state, mode: "read" }),
    history: selectHistory({ state }),
    date: Date.now()
  };
  state.pendingEffects.push({
    name: "saveVnData",
    options: {
      saveData: { ...state.saveData },
      slotIndex,
    },
  });
};

export const loadVnData = ({ state }, payload) => {
  const { slotIndex } = payload;
  const saveData = selectSaveData({ state });
  const slotData = saveData[slotIndex];

  if (!slotData) {
    console.warn(`No save data found for slot index ${slotIndex}`);
    return;
  }

  const { pointer, history } = slotData;
  state.story.currentPointer = "read";
  state.story.pointers["read"] = pointer;
  state.story.history = history;
  state.modals = [];
  state.pendingEffects.push({
    name: "render",
  });
};

export const render = ({ state }) => {
  state.pendingEffects.push({
    name: "render",
  });
}

export const addModal = ({ state }, payload) => {
  state.modals.push({
    resourceId: payload.resourceId,
    resourceType: 'layout'
  })
  state.pendingEffects.push({
    name: "render",
  });
}

export const clearLastModal = ({ state }, payload) => {
  if (state.modals.length > 0) {
    state.modals.pop();
    state.pendingEffects.push({
      name: "render",
    });
  }
}

export const handleCompleted = ({ state }) => {
  const nextConfig = selectNextConfig({ state });
  if (nextConfig) {
    if (nextConfig.auto && nextConfig.auto.trigger === 'fromComplete') {
      state.pendingEffects.push({
        name: "startTimer",
        options: {
          timerId: 'nextConfig',
          payload: {
            nextLine: {
              forceSkipAutonext: true
            }
          },
          delay: nextConfig.auto.delay ?? 1000
        }
      });
    }
    return;
  }

  if (selectAutoMode({ state })) {
    state.pendingEffects.push({
      name: "startTimer",
      options: {
        timerId: 'autoMode',
        payload: {
          nextLine: {
            forceSkipAutonext: true
          }
        },
        delay: 1000
      }
    });
  } else if (selectSkipMode({ state })) {
    state.pendingEffects.push({
      name: "startTimer",
      options: {
        timerId: 'skipMode',
        payload: {
          nextLine: {
            forceSkipAutonext: true
          }
        },
        delay: 300
      }
    });
  }
};


