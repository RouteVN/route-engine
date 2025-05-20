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
 */

/**
 * Handles step completion and manages auto-next behavior
 * @param {ApplyParams} params
 */
const stepCompleted = ({ systemState, effects, vnData }) => {
  const autoMode = systemStateSelectors.selectAutoMode(systemState);

  if (autoMode) {
    effects.push({
      name: "systemInstructions",
      options: {
        delay: 1000,
        systemInstructions: {
          nextStep: {
            forceSkipAutonext: true,
          },
        },
      },
    });
    return;
  }

  const skipMode = systemStateSelectors.selectSkipMode(systemState);

  if (skipMode) {
    effects.push({
      name: "systemInstructions",
      options: {
        delay: 300,
        systemInstructions: {
          nextStep: {
            forceSkipAutonext: true,
          },
        },
      },
    });
    return;
  }

  const autoNext = systemStateSelectors.selectAutoNext(systemState);

  if (!autoNext) {
    return;
  }

  const { nextTrigger, delay } = autoNext;


  switch (nextTrigger) {
    case "onComplete":
      // Clear autoNext state and immediately proceed to next step
      delete systemState.story.autoNext;
      nextStep({ systemState, effects, vnData, payload: {} });
      break;

    case "fromComplete":
      // Schedule next step to occur after delay
      effects.push({
        name: "systemInstructions",
        options: {
          delay: delay,
          systemInstructions: {
            nextStep: {
              forceSkipAutonext: true,
            },
          },
        },
      });
      break;

    case "manual":
      // Just clear autoNext state in manual mode
      delete systemState.story.autoNext;
      break;

    default:
      // Clear unknown autoNext states
      delete systemState.story.autoNext;
      break;
  }
};

/**
 * Advances to the next step in the story
 * @param {ApplyParams} params
 */
const nextStep = ({ systemState, effects, vnData, payload = {} }) => {
  const dialogueUIHidden =
    systemStateSelectors.selectDialogueUIHidden(systemState);

  if (dialogueUIHidden) {
    toggleDialogueUIHidden({ systemState, effects });
    return;
  }

  // Early return if manual advance is prevented
  const { forceSkipAutonext = false } = payload;
  if (
    !forceSkipAutonext &&
    systemState.story.autoNext &&
    systemState.story.autoNext.preventManual
  ) {
    return;
  }

  // Get current position
  const currentPointer = systemStateSelectors.selectCurrentPointer(systemState);
  const pointerMode = systemStateSelectors.selectPointerMode(systemState);
  const steps = vnDataSelectors.selectSectionSteps(
    vnData,
    currentPointer.sectionId
  );

  // Find next step
  const currentStepIndex = steps.findIndex(
    (step) => step.id === currentPointer.stepId
  );
  const nextStep = steps[currentStepIndex + 1];

  // No next step available
  if (!nextStep) {
    if (systemStateSelectors.selectAutoMode(systemState)) {
      systemState.story.autoMode = false;
    }
    if (systemStateSelectors.selectSkipMode(systemState)) {
      systemState.story.skipMode = false;
    }
    return;
  }

  // Update pointer state
  systemState.story.pointers[pointerMode].stepId = nextStep.id;
  systemState.story.pointers[pointerMode].presetId =
    systemStateSelectors.selectCurrentPresetId(systemState);

  // Manage autoNext state
  if (payload.autoNext) {
    systemState.story.autoNext = payload.autoNext;
  } else {
    delete systemState.story.autoNext;
  }

  systemState.story.lastStepAction = 'nextStep'

  // Trigger render effect
  effects.push({
    name: "render",
  });
};

/**
 * @param {ApplyParams} params
 */
const prevStep = ({ systemState, effects, vnData }) => {
  const pointerMode = systemStateSelectors.selectPointerMode(systemState);
  const currentPointer = systemStateSelectors.selectCurrentPointer(systemState);

  const steps = vnDataSelectors.selectSectionSteps(
    vnData,
    currentPointer.sectionId
  );
  const currentStepIndex = steps.findIndex(
    (step) => step.id === currentPointer.stepId
  );
  const prevStep = steps[currentStepIndex - 1];

  if (!prevStep) {
    console.log({pointerMode, 'systemState.story.historyEntryIndex': systemState.story.historyEntryIndex});
    if (pointerMode === "history") {
      if (systemState.story.historyEntryIndex > 0) {
        systemState.story.historyEntryIndex--;
      } else {
        return;
      }
      console.log('systemState.story.historyEntryIndex', systemState.story.historyEntryIndex)
      systemState.story.pointers["history"].sectionId =
        systemState.story.history.entries[
          systemState.story.historyEntryIndex
        ].sectionId;
      const prevSectionSteps = vnDataSelectors.selectSectionSteps(
        vnData,
        systemState.story.pointers["history"].sectionId
      );
      console.log('prevSectionSteps', prevSectionSteps)
      systemState.story.pointers["history"].stepId =
        prevSectionSteps[prevSectionSteps.length - 1].id;
      console.log({
        stepId: systemState.story.pointers["history"].stepId,
        sectionId: systemState.story.pointers["history"].sectionId,
      })

      systemState.story.lastStepAction = 'prevStep'

      effects.push({
        name: "render",
      });
    }

    return;
  }

  if (pointerMode === "read") {
    systemState.story.currentPointer = "history";
    systemState.story.historyEntryIndex =
      systemState.story.history.entries.length - 1;
  }

  systemState.story.pointers["history"].stepId = prevStep.id;
  systemState.story.pointers["history"].sectionId = currentPointer.sectionId;
  systemState.story.lastStepAction = 'prevStep'

  effects.push({
    name: "render",
  });
};

/**
 * @param {ApplyParams} params
 */
const goToSectionScene = ({ payload, systemState, effects, vnData }) => {
  const { sectionId, sceneId, mode, presetId } = payload;
  const steps = vnDataSelectors.selectSectionSteps(vnData, sectionId);

  if (mode) {
    systemState.story.currentPointer = mode;
  }

  const currentMode = systemStateSelectors.selectPointerMode(systemState);

  if (currentMode === "read") {
    systemState.story.history.entries.push({
      sectionId,
    });
  } else if (currentMode === "history") {
    // TODO: check if the next section is same as history next section
    if (sectionId === systemState.story.history.entries[systemState.story.historyEntryIndex + 1].sectionId) {
      systemState.story.historyEntryIndex++;
    } else {
      // exit history mode
      // update read pointer
    }
  }

  systemState.story.pointers[currentMode].sectionId = sectionId;
  systemState.story.pointers[currentMode].sceneId = sceneId;
  systemState.story.pointers[currentMode].stepId = steps[0].id;
  systemState.story.autoNext = steps[0].autoNext;
  if (presetId) {
    systemState.story.pointers[currentMode].presetId = presetId;
  }

  effects.push({
    name: "render",
  });
};

/**
 * @param {ApplyParams} params
 */
const setRuntimeVariable = ({ payload, systemState, effects }) => {
  Object.assign(systemState.runtimeState, payload);
  effects.push({
    name: "render",
  });
};

/**
 * @param {ApplyParams} params
 */
const setPreset = ({ payload, systemState, effects }) => {
  systemState.story.pointers[systemState.story.currentPointer].presetId =
    payload.presetId;
};

/**
 * @param {ApplyParams} params
 */
const clearCurrentMode = ({ payload, systemState, effects }) => {
  systemState.story.currentPointer = payload.mode;
  effects.push({
    name: "render",
  });
};

const startAutoMode = ({ systemState, effects }) => {
  if (systemStateSelectors.selectSkipMode(systemState)) {
    systemState.story.skipMode = false;
  }
  systemState.story.autoMode = true;
  effects.push({
    name: "cancelTimerEffect",
  });
  effects.push({
    name: "systemInstructions",
    options: {
      delay: 1000,
      systemInstructions: {
        nextStep: {
          forceSkipAutonext: true,
        },
      },
    },
  });
};

const stopAutoMode = ({ systemState, effects }) => {
  systemState.story.autoMode = false;
  effects.push({
    name: "cancelTimerEffect",
  });
};

const toggleAutoMode = ({ systemState, effects }) => {
  const autoMode = systemStateSelectors.selectAutoMode(systemState);
  if (autoMode) {
    stopAutoMode({ systemState, effects });
  } else {
    startAutoMode({ systemState, effects });
  }
};

const startSkipMode = ({ systemState, effects }) => {
  if (systemStateSelectors.selectAutoMode(systemState)) {
    systemState.story.autoMode = false;
  }
  systemState.story.skipMode = true;
  effects.push({
    name: "cancelTimerEffect",
  });
  effects.push({
    name: "systemInstructions",
    options: {
      delay: 300,
      systemInstructions: {
        nextStep: {
          forceSkipAutonext: true,
        },
      },
    },
  });
};

const stopSkipMode = ({ systemState, effects }) => {
  systemState.story.skipMode = false;
  effects.push({
    name: "cancelTimerEffect",
  });
};

const toggleSkipMode = ({ systemState, effects }) => {
  const skipMode = systemStateSelectors.selectSkipMode(systemState);
  if (skipMode) {
    stopSkipMode({ systemState, effects });
  } else {
    startSkipMode({ systemState, effects });
  }
};

const toggleDialogueUIHidden = ({ systemState, effects }) => {
  systemState.story.dialogueUIHidden = !systemState.story.dialogueUIHidden;
  effects.push({
    name: "render",
  });
};

const saveVnData = ({ systemState, effects, payload }) => {
  systemState.saveData.push({
    id: Date.now().toString().slice(4, 10),
    slotIndex: payload.slotIndex,
    pointer: systemStateSelectors.selectSpecificPointer(systemState, 'read'),
    history: systemStateSelectors.selectHistory(systemState),
  })
  effects.push({
    name: 'saveVnData',
    options: {
      saveData: [...systemState.saveData],
    }
  })
}

const loadVnData = ({ systemState, effects, payload }) => {
  const { slotIndex } = payload;
  console.log('systemState.saveData', systemState.saveData)
  const saveData = systemStateSelectors.selectSaveData(systemState);
  const matchedSlotSaveData = saveData.filter(save => save.slotIndex === slotIndex);
  if (matchedSlotSaveData.length === 0) {
    console.warn(`No save data found for slot index ${slotIndex}`);
    return;
  }
  const { pointer, history } = matchedSlotSaveData[matchedSlotSaveData.length - 1];
  systemState.story.currentPointer = 'read';
  systemState.story.pointers['read'] = pointer;
  systemState.story.history = history;
  effects.push({
    name: 'render',
  })
}

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
  stepCompleted,
  toggleDialogueUIHidden,
  saveVnData,
  loadVnData,
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
  let effects = [];

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
