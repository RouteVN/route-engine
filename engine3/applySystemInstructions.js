import * as vnDataSelectors from "./vnDataSelectors";
import * as systemStateSelectors from "./systemStateSelectors";

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
const nextStep = ({ systemState, effects, vnData }) => {
  if (systemState.autoNext) {
    if (systemState.autoNext.preventManual) {
      return {
        systemState,
        effects,
      };
    }
  }

  const currentPointer = systemStateSelectors.selectCurrentPointer(systemState);
  const pointerMode = systemStateSelectors.selectPointerMode(systemState);
  const steps = vnDataSelectors.selectSectionSteps(
    vnData,
    currentPointer.sectionId
  );

  const currentStepIndex = steps.findIndex(
    (step) => step.id === currentPointer.stepId
  );
  const nextStep = steps[currentStepIndex + 1];

  if (!nextStep) {
    return [systemState, effects];
  }

  const newState = {
    ...systemState,
    story: {
      ...systemState.story,
      pointers: {
        ...systemState.story.pointers,
        [pointerMode]: {
          sectionId: currentPointer.sectionId,
          stepId: nextStep.id,
        },
      },
    },
  };

  return [newState, effects];
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
      },
    },
    effects,
  ];
};

/**
 * TODO check if to split actions that affect state and actios that don't affect state
 *
 * @param {ApplyParams} params
 */
const goToSectionScene = ({ payload, systemState, effects }) => {
  const { sectionId, sceneId, mode } = payload;
  // let mode = payload.mode || systemState.mode;

  // const mode = systemStateSelectors.selectPointerMode(systemState);
  const _mode = mode || systemStateSelectors.selectPointerMode(systemState);

  return [
    {
      ...systemState,
      story: {
        ...systemState.story,
        currentPointer: _mode,
        pointers: {
          ...systemState.story.pointers,
          [_mode]: { sectionId, sceneId },
        },
      },
    },
    effects,
  ];
};

/**
 * @param {ApplyParams} params
 */
const setRuntimeVariable = ({ payload, systemState, effects }) => {
  return [
    {
      ...systemState,
      runtimeState: {
        ...systemState.runtimeState,
        ...payload,
      },
    },
    effects,
  ];
};

/**
 * @param {ApplyParams} params
 */
const setPreset = ({ payload, systemState, effects }) => {
  return [
    {
      ...systemState,
      currentPresetId: payload.presetId,
    },
    effects,
  ];
};

/**
 * @param {ApplyParams} params
 */
const clearCurrentMode = ({ payload, systemState, effects }) => {
  const newSystemState = {
    ...systemState,
    story: {
      ...systemState.story,
      currentPointer: payload.mode,
    }
  };
  return [newSystemState, effects];
};

const startAutoMode = ({ systemState, effects }) => {
  return [
    {
      ...systemState,
      story: {
        ...systemState.story,
        autoMode: true,
      },
    },
    effects,
  ];
};

const stopAutoMode = ({ systemState, effects }) => {
  return [
    {
      ...systemState,
      story: {
        ...systemState.story,
        autoMode: false,
      },
    },
    effects,
  ];
};

const toggleAutoMode = ({ systemState, effects }) => {
  return [
    {
      ...systemState,
      story: {
        ...systemState.story,
        autoMode: !systemState.story.autoMode,
      },
    },
    effects,
  ];
};

const startSkipMode = ({ systemState, effects }) => {
  return [
    {
      ...systemState,
      story: {
        ...systemState.story,
        skipMode: true,
      },
    },
    effects,
  ];
};

const stopSkipMode = ({ systemState, effects }) => {
  return [
    {
      ...systemState,
      story: {
        ...systemState.story,
        skipMode: false,
      },
    },
    effects,
  ];
};

const toggleSkipMode = ({ systemState, effects }) => {
  return [
    {
      ...systemState,
      story: {
        ...systemState.story,
        skipMode: !systemState.story.skipMode,
      },
    },
    effects,
  ];
};

const instructions = {
  nextStep,
  prevStep,
  goToSectionScene,
  setRuntimeVariable,
  setPreset,
  clearCurrentMode,
  startAutoMode,
  stopAutoMode,
  toggleAutoMode,
  startSkipMode,
  stopSkipMode,
  toggleSkipMode,
};

/**
 * Applies system instructions to the current state
 * @param {Object} params
 * @returns {Object} Object containing new system state and effects
 */
const applySystemInstructions = ({
  systemInstructions,
  systemState,
  vnData,
}) => {
  let newSystemState = { ...systemState };
  let effects = [
    {
      name: "render",
    },
  ];
  Object.entries(systemInstructions).forEach(([instructionName, payload]) => {
    [newSystemState, effects] = instructions[instructionName]({
      payload,
      systemState: newSystemState,
      vnData,
      effects,
    });
  });
  return {
    systemState: newSystemState,
    effects,
  };
};

export default applySystemInstructions;
