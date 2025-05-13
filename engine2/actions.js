
/**
 * Actions are performed on the engine to change state or cause side effects
 * All changes should be triggered by actions
 */


/**
 * 
 * @param {*} payload 
 * @param {*} deps 
 */
const nextStep = (payload, deps) => {
  deps.stepManager.nextStep();
  const renderObject = deps.generateRender();
  if (renderObject) {
    deps.dispatchEvent("render", renderObject);
  }
};

/**
 * 
 * @param {*} payload 
 * @param {*} deps 
 */
const prevStep = (payload, deps) => {
  // to all the things you need to do
  deps.stepManager.prevStep();
};

/**
 * TODO check if to split actions that affect state and actios that don't affect state
 * @param {Object} payload 
 * 
 * @param {string} payload.sceneId
 * @param {string} payload.sectionId
 * 
 * @param {*} deps 
 */
const goToSectionScene = (payload, deps) => {
  const { sectionId, sceneId } = payload;
  deps.stepManager.goToSectionScene(sectionId, sceneId);
  const renderObject = deps.generateRender();
  deps.dispatchEvent("render", renderObject);
};

export default {
  nextStep,
  prevStep,
  goToSectionScene,
};
