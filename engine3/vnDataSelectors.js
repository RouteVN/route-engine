export const selectPresets = (vnData) => {
  return vnData.presets;
};

export const selectInitialPreset = (vnData) => {
  return vnData.presets[vnData.story.initialPresetId];
};

export const selectPreset = (vnData, presetId) => {
  return vnData.presets[presetId];
};

export const selectResources = (vnData) => {
  return vnData.resources;
};

export const selectUi = (vnData) => {
  return vnData.ui;
};

export const selectScreen = (vnData) => {
  return vnData.screen;
};

export const selectInitialIds = (vnData) => {
  const initialScene = vnData.story.scenes[vnData.story.initialSceneId];
  const initialSection = initialScene.sections[initialScene.initialSectionId];
  return {
    sceneId: vnData.story.initialSceneId,
    sectionId: initialScene.initialSectionId,
    presetId: vnData.story.initialPresetId,
    stepId: initialSection.steps[0].id,
  };
};

export const selectSectionSteps = (vnData, sectionId, stepId) => {
  const sections = Object.values(vnData.story.scenes)
    .flatMap((scene) => {
      return Object.entries(scene.sections).map(([id, section]) => ({
        ...section,
        id
      }));
    });
  const currentSection = sections.find((section) => section.id === sectionId);
  if (stepId) {
    const currentStepIndex = currentSection.steps.findIndex((step) => step.id === stepId);
    return currentSection.steps.slice(0, currentStepIndex + 1);
  }
  return currentSection.steps;
}; 
