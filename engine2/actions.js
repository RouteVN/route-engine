
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
  deps.dispatchEvent("render", renderObject);
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

export default {
  nextStep,
  prevStep,
};
