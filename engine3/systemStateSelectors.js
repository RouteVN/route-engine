export const selectCurrentPointer = (systemState) => {
  return systemState.story.pointers[systemState.story.currentPointer];
};

export const selectCurrentPresetId = (systemState) => {
  return systemState.story.currentPresetId;
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

export const createSystemState = ({ sectionId, stepId, presetId }) => {
  return {
    runtimeState: {},
    story: {
      currentPointer: 'read',
      currentPresetId: presetId,
      autoNext: {
        delay: undefined,
        disableManual: false,
      },
      autoMode: false,
      skipMode: false,
      pointers: {
        read: {
          sectionId,
          stepId
        },
        menu: {
          sectionId: undefined,
          stepId: undefined
        },
        title: {
          sectionId: undefined,
          stepId: undefined
        },
      },
      history: {}
    }
  };
};
