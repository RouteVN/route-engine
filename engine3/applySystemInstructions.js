import { produce } from "immer";
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
  if (systemState.autoNext && systemState.autoNext.preventManual) {
    return;
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
    return;
  }

  systemState.story.pointers[pointerMode].stepId = nextStep.id;
  systemState.story.pointers[pointerMode].presetId = systemStateSelectors.selectCurrentPresetId(systemState);
};

/**
 *
 * @param {ApplyParams} params
 */
const prevStep = ({ systemState, effects }) => {
  // to all the things you need to do
};

/**
 * TODO check if to split actions that affect state and actios that don't affect state
 *
 * @param {ApplyParams} params
 */
const goToSectionScene = ({ payload, systemState, effects, vnData }) => {
  const { sectionId, sceneId, mode, presetId } = payload;
  const _presetId = presetId || systemStateSelectors.selectCurrentPresetId(systemState);
  const _mode = mode || systemStateSelectors.selectPointerMode(systemState);
  const steps = vnDataSelectors.selectSectionSteps(vnData, sectionId);

  systemState.story.currentPointer = _mode;
  systemState.story.pointers[_mode] = { 
    sectionId, 
    sceneId, 
    stepId: steps[0].id,
    presetId: _presetId
  };
};

/**
 * @param {ApplyParams} params
 */
const setRuntimeVariable = ({ payload, systemState, effects }) => {
  Object.assign(systemState.runtimeState, payload);
};

/**
 * @param {ApplyParams} params
 */
const setPreset = ({ payload, systemState, effects }) => {
  systemState.story.pointers[systemState.story.currentPointer].presetId = payload.presetId;
};

/**
 * @param {ApplyParams} params
 */
const clearCurrentMode = ({ payload, systemState, effects }) => {
  systemState.story.currentPointer = payload.mode;
};

const startAutoMode = ({ systemState, effects }) => {
  systemState.story.autoMode = true;
};

const stopAutoMode = ({ systemState, effects }) => {
  systemState.story.autoMode = false;
};

const toggleAutoMode = ({ systemState, effects }) => {
  systemState.story.autoMode = !systemState.story.autoMode;
};

const startSkipMode = ({ systemState, effects }) => {
  systemState.story.skipMode = true;
};

const stopSkipMode = ({ systemState, effects }) => {
  systemState.story.skipMode = false;
};

const toggleSkipMode = ({ systemState, effects }) => {
  systemState.story.skipMode = !systemState.story.skipMode;
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
  let effects = [
    {
      name: "render",
    },
  ];

  return produce({ systemState, effects }, (draft) => {
    for (const instructionName of Object.keys(systemInstructions)) {
      instructions[instructionName]({
        payload: systemInstructions[instructionName],
        systemState: draft.systemState,
        vnData,
        effects: draft.effects,
      });
    }
  });
};

export default applySystemInstructions;
