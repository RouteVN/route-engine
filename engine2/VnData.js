
class VnData {
  constructor(data) {
    this.data = data;
  }

  get resources() {
    return this.data.resources;
  }

  get screen() {
    return this.data.screen;
  }

  get initialIds() {
    const initialScene = this.data.story.scenes[this.data.story.initialSceneId];
    const section = initialScene.sections[initialScene.initialSectionId];
    return {
      sceneId: initialScene.id,
      sectionId: section.id,
      stepId: section.steps[0].id,
    };
  }

  getSectionSteps(sectionId) {
    const sections = Object.values(this.data.story.scenes)
      .map((scene) => Object.values(scene.sections))
      .flat()
    const currentSection = sections.find((section) => section.id === sectionId);
    return currentSection.steps;
  }
}

export default VnData;
