class VnData {
  constructor(data) {
    this.data = data;
  }

  get presets() {
    return this.data.presets;
  }

  get initialPreset() {
    return this.data.presets[this.data.story.initialPresetId];
  }

  get resources() {
    return this.data.resources;
  }

  get ui() {
    return this.data.ui;
  }

  get screen() {
    return this.data.screen;
  }

  get initialIds() {
    const initialScene = this.data.story.scenes[this.data.story.initialSceneId];
    const initialSection = initialScene.sections[initialScene.initialSectionId];
    return {
      sceneId: this.data.story.initialSceneId,
      sectionId: initialScene.initialSectionId,
      presetId: this.data.story.initialPresetId,
      stepId: initialSection.steps[0].id,
    };
  }

  getSectionSteps = (sectionId, stepId) => {
    const sections = Object.values(this.data.story.scenes)
      .flatMap((scene) => {
        return Object.entries(scene.sections).map(([id, section]) => ({
          ...section,
          id
        }));
      });
    const currentSection = sections.find((section) => section.id === sectionId);
    const currentStepIndex = currentSection.steps.findIndex((step) => step.id === stepId);
    return currentSection.steps.slice(0, currentStepIndex + 1);
  }
}

export default VnData;
