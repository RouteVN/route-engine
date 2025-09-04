export const createInitialState = ({
  sectionId,
  lineId,
  autoNext,
  saveData,
  variables,
}) => {
  const state = {
    pendingEffects: [],
    variables,
    saveData,
    modals: [],
    story: {
      lastLineAction: undefined,
      dialogueUIHidden: false,
      currentPointer: "read",
      autoNext: autoNext,
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

export const selectAutoNext = ({ state }) => {
  return state.story.autoNext;
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

export const selectVariables = ({ state }) => {
  return state.variables;
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

  const autoNext = selectAutoNext(state);

  if (!autoNext) {
    return;
  }

  const { nextTrigger, delay } = autoNext;

  switch (nextTrigger) {
    case "onComplete":
      // Clear autoNext state and immediately proceed to next line
      delete state.story.autoNext;
      // nextLine({ state, effects, projectDataStore, payload: {} });
      break;

    case "fromComplete":
      // Schedule next line to occur after delay
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

    case "manual":
      // Just clear autoNext state in manual mode
      delete state.story.autoNext;
      break;

    default:
      // Clear unknown autoNext states
      delete state.story.autoNext;
      break;
  }
};

/**
 * Advances to the next line in the story
 * @param {ApplyParams} params
 */
// export const nextLine = ({ systemState, effects, vnData, payload = {} }) => {
export const nextLine = ({ state, projectDataStore }) => {
  const { pendingEffects } = state;

  // If dialogue is hidden, show it instead of advancing
  if (state.story.dialogueUIHidden) {
    state.story.dialogueUIHidden = false;
    pendingEffects.push({
      name: "render",
    });
    return;
  }

  // Early return if manual advance is prevented
  // const { forceSkipAutonext = false } = payload;
  // if (
  //   !forceSkipAutonext &&
  //   state.story.autoNext &&
  //   state.story.autoNext.preventManual
  // ) {
  //   return;
  // }

  // Get current position
  const currentPointer = selectCurrentPointer({ state });
  const pointerMode = selectPointerMode({ state });
  const lines = projectDataStore.selectSectionLines(currentPointer.sectionId);

  // Find next line
  const currentLineIndex = lines.findIndex(
    (line) => line.id === currentPointer.lineId,
  );
  const nextLine = lines[currentLineIndex + 1];

  // No next line available
  if (!nextLine) {
    //   if (systemStore.selectAutoMode()) {
    //     state.story.autoMode = false;
    //   }
    //   if (systemStore.selectSkipMode()) {
    //     state.story.skipMode = false;
    //   }
    return;
  }

  state.story.pointers[state.story.currentPointer].lineId = nextLine.id;

  // Update pointer state
  // state.story.pointers[pointerMode].lineId = nextLine.id;

  // Manage autoNext state
  // if (payload.autoNext) {
  //   state.story.autoNext = payload.autoNext;
  // } else {
  //   delete state.story.autoNext;
  // }

  // systemState.story.lastLineAction = "nextLine";

  // Process system actions first, then render
  // Note: This will be called from RouteEngine's _processSystemActions

  // Trigger render effect
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
  state.story.autoNext = lines[0].system?.autoNext;

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
      state.variables[variableId] = (state.variables[variableId] || 0) + 1;
    } else if (op === "decrement") {
      state.variables[variableId] = (state.variables[variableId] || 0) - 1;
    }
  }

  state.pendingEffects.push({
    name: "render",
  });
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
  }
  state.story.autoMode = true;
  state.pendingEffects.push({
    name: "cancelTimerEffect",
  });
  state.pendingEffects.push({
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
};

export const stopAutoMode = ({ state }) => {
  state.story.autoMode = false;
  state.pendingEffects.push({
    name: "cancelTimerEffect",
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
  }
  state.story.skipMode = true;
  state.pendingEffects.push({
    name: "cancelTimerEffect",
  });
  state.pendingEffects.push({
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
};

export const stopSkipMode = ({ state }) => {
  state.story.skipMode = false;
  state.pendingEffects.push({
    name: "cancelTimerEffect",
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
 * Sets autoNext configuration for the current line
 * @param {ApplyParams} params
 */
export const autoNext = ({ state }, payload) => {
  state.story.autoNext = payload;
};

export const saveVnData = ({ state }, payload) => {
  state.saveData.push({
    id: Date.now().toString().slice(4, 10),
    slotIndex: payload.slotIndex,
    pointer: selectSpecificPointer({ state, mode: "read" }),
    history: selectHistory({ state }),
  });
  state.pendingEffects.push({
    name: "saveVnData",
    options: {
      saveData: [...state.saveData],
    },
  });
};

export const loadVnData = ({ state }, payload) => {
  const { slotIndex } = payload;
  const saveData = selectSaveData({ state });
  const matchedSlotSaveData = saveData.filter(
    (save) => save.slotIndex === slotIndex,
  );
  if (matchedSlotSaveData.length === 0) {
    console.warn(`No save data found for slot index ${slotIndex}`);
    return;
  }
  const { pointer, history } =
    matchedSlotSaveData[matchedSlotSaveData.length - 1];
  state.story.currentPointer = "read";
  state.story.pointers["read"] = pointer;
  state.story.history = history;
  state.pendingEffects.push({
    name: "render",
  });
};


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


