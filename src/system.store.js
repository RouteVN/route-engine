
export const selectCurrentPointer = (state) => {
  return state.story.pointers[state.story.currentPointer];
};

export const selectCurrentPresetId = (state) => {
  return state.story.pointers[state.story.currentPointer].presetId;
};

export const selectSkipMode = (state) => {
  return state.story.skipMode;
};

export const selectAutoMode = (state) => {
  return state.story.autoMode;
};

export const selectPointers = (state) => {
  return state.story.pointers;
};

export const selectAutoNext = (state) => {
  return state.story.autoNext;
};

export const selectRuntimeState = (state) => {
  return state.runtimeState;
};

export const selectPointerMode = (state) => {
  return state.story.currentPointer;
};

export const selectDialogueUIHidden = (state) => {
  return state.story.dialogueUIHidden;
};

export const selectHistory = (state) => {
  return state.story.history;
};

export const selectSpecificPointer = (state, mode) => {
  return state.story.pointers[mode];
}

export const selectSaveData = (state) => {
  return state.saveData;
}

export const selectVariables = (state) => {
  return state.variables;
}

export const updateCurrentPointerStepId = (state, stepId) => {
  console.log('zzzzzzzzzzzzzzzzzzzzzz', {
    state, stepId, currentPointer: state.story.currentPointer
})
  state.story.pointers[state.story.currentPointer].stepId = stepId;
  console.log('yyyyyyyyyyyyyyyyyy', state.story.pointers[state.story.currentPointer].stepId)
  // state.story.pointers[pointerMode].presetId =
  //   systemStore.selectCurrentPresetId();
}

export const createInitialState = ({ sectionId, stepId, presetId, autoNext, saveData, variables }) => {
  const state = {
    variables,
    saveData,
    story: {
      lastStepAction: undefined,
      dialogueUIHidden: false,
      currentPointer: 'read',
      autoNext: autoNext,
      autoMode: false,
      skipMode: false,
      pointers: {
        read: {
          presetId,
          sectionId,
          stepId
        },
        menu: {
          // TODO remove hardcode
          presetId: '3ijasdk3',
          sectionId: undefined,
          stepId: undefined
        },
        history: {
          presetId,
          sectionId: undefined,
          stepId: undefined,
          historyEntryIndex: undefined
        }
        // title: {
        //   presetId: undefined,
        //   sectionId: undefined,
        //   stepId: undefined
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
        //   // this is current actual stepId the user is lastest on
        //   stepId: 'step3'
        // }]
      }
    }
  };
  state.story.history.entries.push({
    sectionId,
  });
  return state;
};
