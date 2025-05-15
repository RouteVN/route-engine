
class SystemState {
  runtimeState = {};

  story = {
    currentPointer: 'read',
    currentPresetId: undefined,

    pointers: {
      read: {
        sectionId: undefined,
        stepId: undefined
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

  get currentPointer() {
    return this.story.pointers[this.story.currentPointer];
  }

  constructor({ sectionId, stepId, presetId}) {
    this.story.currentPointer = 'read';
    this.story.currentPresetId = presetId;
    this.setCurrentPointer({ sectionId, stepId });
  }

  setCurrentPointer = ({ sectionId, stepId }) => {
    this.story.pointers[this.story.currentPointer].sectionId = sectionId;
    this.story.pointers[this.story.currentPointer].stepId = stepId;
  }

}

export default SystemState;
