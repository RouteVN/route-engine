
export const selectPresets = (state) => {
  return state.presets;
};

export const selectInitialPreset = (state) => {
  return state.presets[state.story.initialPresetId];
};

export const selectPreset = (state, presetId) => {
  return state.presets[presetId];
};

export const selectResources = (state) => {
  return state.resources;
};

export const selectUi = (state) => {
  return state.ui;
};

export const selectScreen = (state) => {
  return state.screen;
};

export const selectInitialIds = (state) => {
  const initialScene = state.story.scenes[state.story.initialSceneId];
  const initialSection = initialScene.sections[initialScene.initialSectionId];
  return {
    sceneId: state.story.initialSceneId,
    sectionId: initialScene.initialSectionId,
    presetId: state.story.initialPresetId,
    stepId: initialSection.steps[0].id,
    autoNext: initialSection.steps[0].autoNext,
  };
};

export const selectVariables = (state) => {
  return state.variables || {};
};

export const selectSectionSteps = (state, sectionId, stepId) => {
  const sections = Object.values(state.story.scenes)
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

export const createInitialState = (vnData) => {

  // Set up initial state
  const initialIds = selectInitialIds(vnData);
  const { sectionId, stepId } = initialIds;
  if (!sectionId || !stepId) {
    throw new Error("No initial sectionId found");
  }

  return vnData;
}
