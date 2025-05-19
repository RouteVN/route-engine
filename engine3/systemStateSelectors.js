export const selectCurrentPointer = (systemState) => {
  return systemState.story.pointers[systemState.story.currentPointer];
};

export const selectCurrentPresetId = (systemState) => {
  return systemState.story.pointers[systemState.story.currentPointer].presetId;
};

export const selectSkipMode = (systemState) => {
  return systemState.story.skipMode;
};

export const selectAutoMode = (systemState) => {
  return systemState.story.autoMode;
};

export const selectPointers = (systemState) => {
  return systemState.story.pointers;
};

export const selectAutoNext = (systemState) => {
  return systemState.story.autoNext;
};

export const selectRuntimeState = (systemState) => {
  return systemState.runtimeState;
};

export const selectPointerMode = (systemState) => {
  return systemState.story.currentPointer;
};

export const selectDialogueUIHidden = (systemState) => {
  return systemState.story.dialogueUIHidden;
};

export const createSystemState = ({ sectionId, stepId, presetId, autoNext }) => {
  const state = {
    runtimeState: {},
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
