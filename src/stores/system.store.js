export const createInitialState = ({
  sectionId,
  lineId,
  presetId,
  autoNext,
  saveData,
  variables,
}) => {
  const state = {
    pendingEffects: [],
    variables,
    saveData,
    story: {
      lastLineAction: undefined,
      dialogueUIHidden: false,
      currentPointer: "read",
      autoNext: autoNext,
      autoMode: false,
      skipMode: false,
      pointers: {
        read: {
          presetId,
          sectionId,
          lineId,
        },
        menu: {
          // TODO remove hardcode
          presetId: "3ijasdk3",
          sectionId: undefined,
          lineId: undefined,
        },
        history: {
          presetId,
          sectionId: undefined,
          lineId: undefined,
          historyEntryIndex: undefined,
        },
        // title: {
        //   presetId: undefined,
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

export const selectPendingEffects = ({ state }) => {
  return state.pendingEffects;
};

export const selectCurrentPointer = ({ state }) => {
  return state.story.pointers[state.story.currentPointer];
};

export const selectCurrentPresetId = ({ state }) => {
  return state.story.pointers[state.story.currentPointer].presetId;
};

export const selectCurrentPreset = ({ state, projectDataStore }) => {
  const currentPresetId = selectCurrentPresetId({ state });
  return projectDataStore.selectPreset(currentPresetId);
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

  // const dialogueUIHidden = systemStore.selectDialogueUIHidden();

  // if (dialogueUIHidden) {
  //   toggleDialogueUIHidden({ systemState, effects });
  //   return;
  // }

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

  console.log("cccccccccccc", nextLine);

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
  // state.story.pointers[pointerMode].presetId =
  //   systemStore.selectCurrentPresetId();

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
  const pointerMode = selectPointerMode(state);
  const currentPointer = selectCurrentPointer(state);

  const lines = projectDataStore.selectSectionLines(currentPointer.sectionId);
  const currentLineIndex = lines.findIndex(
    (line) => line.id === currentPointer.lineId,
  );
  const prevLine = lines[currentLineIndex - 1];

  if (!prevLine) {
    console.log({
      pointerMode,
      "state.story.historyEntryIndex": state.story.historyEntryIndex,
    });
    if (pointerMode === "history") {
      if (state.story.historyEntryIndex > 0) {
        state.story.historyEntryIndex--;
      } else {
        return;
      }
      console.log(
        "state.story.historyEntryIndex",
        state.story.historyEntryIndex,
      );
      state.story.pointers["history"].sectionId =
        state.story.history.entries[state.story.historyEntryIndex].sectionId;
      const prevSectionLines = vnDataSelectors.selectSectionLines(
        vnData,
        systemState.story.pointers["history"].sectionId,
      );
      console.log("prevSectionLines", prevSectionLines);
      systemState.story.pointers["history"].lineId =
        prevSectionLines[prevSectionLines.length - 1].id;
      console.log({
        lineId: systemState.story.pointers["history"].lineId,
        sectionId: systemState.story.pointers["history"].sectionId,
      });

      systemState.story.lastLineAction = "prevLine";

      effects.push({
        name: "render",
      });
    }

    return;
  }

  if (pointerMode === "read") {
    systemState.story.currentPointer = "history";
    systemState.story.historyEntryIndex =
      systemState.story.history.entries.length - 1;
  }

  systemState.story.pointers["history"].lineId = prevLine.id;
  systemState.story.pointers["history"].sectionId = currentPointer.sectionId;
  systemState.story.lastLineAction = "prevLine";

  effects.push({
    name: "render",
  });
};

/**
 * @param {ApplyParams} params
 */
export const goToSectionScene = ({ state, projectDataStore }, payload) => {
  const { sectionId, sceneId, mode, presetId } = payload;
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
      state.story.history.entries[state.story.historyEntryIndex + 1]
        .sectionId
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
  state.story.autoNext = lines[0].autoNext;
  if (presetId) {
    state.story.pointers[currentMode].presetId = presetId;
  }

  state.pendingEffects.push({
    name: "render",
  });
};

/**
 * @param {ApplyParams} params
 */
export const updateVariable = ({ payload, systemState, effects, vnData }) => {
  const { operations } = payload;
  for (const operation of operations) {
    const { variableId, op, value } = operation;
    if (op === "set") {
      systemState.variables[variableId] = value;
    } else if (op === "increment") {
      systemState.variables[variableId] += value;
    } else if (op === "decrement") {
      systemState.variables[variableId] -= value;
    }
  }
  const vnDataVariables = vnDataSelectors.selectVariables(vnData);
  const localVariableKeys = Object.keys(systemState.variables).filter(
    (key) => vnDataVariables[key].persistence === "local",
  );
  const localVariables = localVariableKeys.reduce((acc, key) => {
    acc[key] = systemState.variables[key];
    return acc;
  }, {});
  effects.push({
    name: "render",
  });
  effects.push({
    name: "updateLocalVariables",
    options: {
      variables: localVariables,
    },
  });
};

/**
 * @param {ApplyParams} params
 */
export const setPreset = ({ payload, systemState, effects }) => {
  systemState.story.pointers[systemState.story.currentPointer].presetId =
    payload.presetId;
};

/**
 * @param {ApplyParams} params
 */
export const clearCurrentMode = ({ payload, systemState, effects }) => {
  systemState.story.currentPointer = payload.mode;
  effects.push({
    name: "render",
  });
};

export const startAutoMode = ({ systemState, effects }) => {
  if (systemStateSelectors.selectSkipMode(systemState)) {
    systemState.story.skipMode = false;
  }
  systemState.story.autoMode = true;
  effects.push({
    name: "cancelTimerEffect",
  });
  effects.push({
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

export const stopAutoMode = ({ systemState, effects }) => {
  systemState.story.autoMode = false;
  effects.push({
    name: "cancelTimerEffect",
  });
};

export const toggleAutoMode = ({ systemState, effects }) => {
  const autoMode = systemStateSelectors.selectAutoMode(systemState);
  if (autoMode) {
    stopAutoMode({ systemState, effects });
  } else {
    startAutoMode({ systemState, effects });
  }
};

export const startSkipMode = ({ systemState, effects }) => {
  if (systemStateSelectors.selectAutoMode(systemState)) {
    systemState.story.autoMode = false;
  }
  systemState.story.skipMode = true;
  effects.push({
    name: "cancelTimerEffect",
  });
  effects.push({
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

export const stopSkipMode = ({ systemState, effects }) => {
  systemState.story.skipMode = false;
  effects.push({
    name: "cancelTimerEffect",
  });
};

export const toggleSkipMode = ({ systemState, effects }) => {
  const skipMode = systemStateSelectors.selectSkipMode(systemState);
  if (skipMode) {
    stopSkipMode({ systemState, effects });
  } else {
    startSkipMode({ systemState, effects });
  }
};

const toggleDialogueUIHidden = ({ systemState, effects }) => {
  systemState.story.dialogueUIHidden = !systemState.story.dialogueUIHidden;
  effects.push({
    name: "render",
  });
};

export const saveVnData = ({ systemState, effects, payload }) => {
  systemState.saveData.push({
    id: Date.now().toString().slice(4, 10),
    slotIndex: payload.slotIndex,
    pointer: systemStateSelectors.selectSpecificPointer(systemState, "read"),
    history: systemStateSelectors.selectHistory(systemState),
  });
  effects.push({
    name: "saveVnData",
    options: {
      saveData: [...systemState.saveData],
    },
  });
};

export const loadVnData = ({ systemState, effects, payload }) => {
  const { slotIndex } = payload;
  console.log("systemState.saveData", systemState.saveData);
  const saveData = systemStateSelectors.selectSaveData(systemState);
  const matchedSlotSaveData = saveData.filter(
    (save) => save.slotIndex === slotIndex,
  );
  if (matchedSlotSaveData.length === 0) {
    console.warn(`No save data found for slot index ${slotIndex}`);
    return;
  }
  const { pointer, history } =
    matchedSlotSaveData[matchedSlotSaveData.length - 1];
  systemState.story.currentPointer = "read";
  systemState.story.pointers["read"] = pointer;
  systemState.story.history = history;
  effects.push({
    name: "render",
  });
};
