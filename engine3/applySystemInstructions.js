/**
 * Actions are performed on the engine to change state or cause side effects
 * All changes should be triggered by actions
 */

/**
 * @typedef {Object} ApplyParams
 * @property {Object} payload - The input data for the action
 * @property {Object} systemState - The current state of the system
 * @property {Object} vnData - The visual novel data
 * @property {Object} effects - Side effects to be applied
 * @property {Object} systemInstructions - Instructions to apply
 */

/**
 * 
 * @param {ApplyParams} params 
 */
const nextStep = ({systemState, effects }) => {
  if (systemState.autoNext) {
    if (systemState.autoNext.preventManual) {
      return {
        systemState,
        effects
      }
    }
  }
  return [{
    ...systemState,
  }, effects]
};

/**
 * 
 * @param {ApplyParams} params 
 */
const prevStep = ({ systemState, effects }) => {
  // to all the things you need to do
  return [
    {
      ...systemState,
      stepPointers: {
        ...systemState.stepPointers,
      }
    },
    effects
  ]
};

/**
 * TODO check if to split actions that affect state and actios that don't affect state
 *    
 * @param {ApplyParams} params 
 */
const goToSectionScene = ({payload, systemState, effects }) => {
  const { sectionId, sceneId } = payload;
  let mode = payload.mode || systemState.mode;
  return [
    {
      ...systemState,
      mode,
      stepPointers: { ...systemState.stepPointers, [mode]: { sectionId, sceneId } }
    },
    effects
  ]
};

/**
 * @param {ApplyParams} params 
 */
const setRuntimeVariable = ({ payload, systemState, effects }) => {
  return [
    {
      ...systemState,
      variables: {
        ...systemState.variables,
        runtime: { ...systemState.variables.runtime, ...payload }
      }
    },
    effects
  ]
};

/**
 * @param {ApplyParams} params 
 */
const setPreset = ({payload, systemState, effects }) => {
  return [
    {
      ...systemState,
      currentPresetId: payload.presetId
    },
    effects
  ]
};

/**
 * @param {ApplyParams} params 
 */
const clearCurrentMode = ({payload, systemState, effects }) => {
  const newSystemState = {
    ...systemState,
    mode: payload.mode,
    currentPresetId: undefined,
  };
  newSystemState.stepPointers[systemState.mode] = {};
  return [
    newSystemState,
    effects
  ]
};

const instructions = {
  nextStep,
  prevStep,
  goToSectionScene,
  setRuntimeVariable,
  setPreset,
  clearCurrentMode,
};

/**
 * Applies system instructions to the current state
 * @param {ApplyParams} params
 * @returns {Object} Object containing new system state and effects
 */
const applySystemInstructions = ({ systemInstructions, systemState, vnData }) => {
  let newSystemState = { ...systemState };
  let effects = [];
  Object.entries(systemInstructions).forEach(([instructionName, payload]) => {
    [newSystemState, effects] = instructions[instructionName]({
      payload,
      systemState: newSystemState,
      vnData,
      effects
    });
  });
  return {
    systemState: newSystemState,
    effects
  };
};

export default applySystemInstructions;
