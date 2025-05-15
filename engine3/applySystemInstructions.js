
/**
 * Actions are performed on the engine to change state or cause side effects
 * All changes should be triggered by actions
 */


/**
 * 
 * @param {Object} params 
 * @param {Object} params.payload 
 * @param {Object} params.systemState 
 * @param {Object} params.vnData 
 * @param {Object} params.effects 
 */
const nextStep = ({payload, systemState, vnData, effects }) => {
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
 * @param {Object} params 
 * @param {Object} params.payload 
 * @param {Object} params.systemState 
 * @param {Object} params.vnData 
 * @param {Object} params.effects 
 */
const prevStep = ({payload, systemState, vnData, effects }) => {
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
 * @param {Object} params 
 * @param {Object} params.payload 
 * @param {Object} params.systemState 
 * @param {Object} params.vnData 
 * @param {Object} params.effects 
 */
const goToSectionScene = ({payload, systemState, vnData, effects }) => {
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

const setRuntimeVariable = ({ payload, systemState, vnData, effects }) => {
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

const setPreset = ({payload, systemState, vnData, effects }) => {
  return [
    {
      ...systemState,
      currentPresetId: payload.presetId
    },
    effects
  ]
};

const clearCurrentMode = ({payload, systemState, vnData, effects }) => {
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
 * 
 * @param {Object} params 
 * @param {Object} params.systemInstructions 
 * @param {Object} params.systemState 
 * @param {Object} params.vnData 
 * @returns new system state
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
