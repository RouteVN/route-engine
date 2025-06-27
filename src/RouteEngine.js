import { createStore, createSequentialActionsExecutor, createSelectiveActionsExecutor } from "./util.js";
import * as constructPresentationTempalteSelectorsAndActions from "./constructPresentationTemplate.js";
import * as constructPresentationStateSelectorsAndActions from "./constructPresentationState.js";
import * as systemInstructionsSelectorsAndActions from "./systemInstructions.store.js";
import * as systemStateSelectorsAndActions from "./system.store.js";
import * as vnDataSelectorsAndActions from "./vnData.store.js";

/**
 * RouteEngine is the main class for the engine.
 * Look at ../docs/RouteEngine.md for more information.
 */
class RouteEngine {
  _vnDataStore;
  _systemStore;
  _constructPresentationState;
  _constructPresentationTemplate;
  _applySystemInstruction;

  _eventCallback = (event) => {};

  constructor() {}

  /**
   * Initialize the engine with visual novel data and rendering functions
   */
  init = ({ vnData }) => {
    this._vnDataStore = createStore(vnDataSelectorsAndActions, vnData);
    const initialIds = this._vnDataStore.selectInitialIds();
    this._systemStore = createStore(
      systemStateSelectorsAndActions,
      systemStateSelectorsAndActions.createInitialState({
        sectionId: initialIds.sectionId,
        stepId: initialIds.stepId,
        presetId: initialIds.presetId,
        autoNext: initialIds.autoNext,
        saveData: {},
        variables: {},
      })
    );
    this._constructPresentationState = createSequentialActionsExecutor(
      constructPresentationStateSelectorsAndActions.createInitialState,
      constructPresentationStateSelectorsAndActions
    );

    // const saveDataString = localStorage.getItem("saveData");
    // const saveData = saveDataString ? JSON.parse(saveDataString) : [];

    // const variablesString = localStorage.getItem("variables");
    // const variables = variablesString ? JSON.parse(variablesString) : {};
    // const vnDataVariables = vnDataSelectorsAndActions.selectVariables(vnData);
    // Object.keys(vnDataVariables).forEach((key) => {
    //   if (variables[key] === undefined) {
    //     variables[key] = vnDataVariables[key].default;
    //   }
    // });


    this._applySystemInstruction = createSelectiveActionsExecutor(
      {
        systemStore: this._systemStore,
        vnDataStore: this._vnDataStore,
      },
      systemInstructionsSelectorsAndActions,
      systemInstructionsSelectorsAndActions.createInitialState
    );

    this._constructPresentationTemplate = createSequentialActionsExecutor(
      constructPresentationTempalteSelectorsAndActions.createInitialState,
      constructPresentationTempalteSelectorsAndActions
    );

    this._render();
  };

  onEvent = (callback) => {
    this._eventCallback = callback;
    return this;
  }

  offEvent = () => {
    this._eventCallback = () => {};
    return this;
  }

  // /**
  //  * Handles delayed execution of system instructions
  //  */
  // handleDelayedExecution = (options, callback) => {
  //   const { delay } = options;
  //   if (!delay) {
  //     callback();
  //     return;
  //   }

  //   let elapsedInMs = 0;
  //   const timerEffect = (time) => {
  //     elapsedInMs += time.deltaMS;
  //     if (elapsedInMs >= delay) {
  //       this._ticker.remove(timerEffect);
  //       callback();
  //     }
  //   };

  //   this._ticker.add(timerEffect);
  //   this._currentTimerEffect = timerEffect;
  // };

  // cancelTimerEffect = () => {
  //   if (this._currentTimerEffect) {
  //     this._ticker.remove(this._currentTimerEffect);
  //     this._currentTimerEffect = undefined;
  //   }
  // };

  /**
   * Use this for sending events to the engine
   */
  handleEvent = (event) => {
    const { eventType, payload } = event;
    const { effects } = this._applySystemInstruction({
      [eventType]: payload,
    });

  }


  // /**
  //  * Handles user input events by mapping them to system instructions
  //  */
  // systemEventHandler = (event, payload = {}) => {
  //   console.log("system event handler", event, payload);

  //   // Handle step completion event
  //   if (event === "completed") {
  //     this.applySystemInstructions({ stepCompleted: {} });
  //     return;
  //   }

  //   // Direct system instruction execution
  //   if (event === "systemInstructions") {
  //     this.systemInstructionsHandler(event, payload);
  //     return;
  //   }

  //   // Map events to system instructions using the current preset
  //   const presetId = systemStateSelectorsAndActions.selectCurrentPresetId(
  //     this._systemState
  //   );
  //   const preset = vnDataSelectorsAndActions.selectPreset(
  //     this._vnData,
  //     presetId
  //   );

  //   if (!preset) {
  //     console.warn(`No preset found with ID: ${presetId}`);
  //     return;
  //   }

  //   const eventMapping = preset?.eventsMap?.[event];
  //   if (!eventMapping) {
  //     console.warn(
  //       `No mapping found for event: ${event} in preset: ${presetId}`
  //     );
  //     return;
  //   }

  //   if (eventMapping) {
  //     this.applySystemInstructions(eventMapping.systemInstructions);
  //   }
  // };

  /**
   * Renders the current state of the visual novel
   */
  _render = () => {
    const currentPointer = this._systemStore.selectCurrentPointer()
    const currentSteps = this._vnDataStore.selectSectionSteps(
      currentPointer.sectionId,
      currentPointer.stepId
    );

    if (!currentSteps.length) {
      console.warn(
        `No steps found for section: ${currentPointer.sectionId}, step: ${currentPointer.stepId}`
      );
      return;
    }

    // const lastStep = currentSteps[currentSteps.length - 1];

    // Apply system instructions from the last step if present
    // TODO
    // if (lastStep.systemInstructions) {
    //   if (this._systemState.story.lastStepAction === "nextStep") {
    //     console.log("running apply system instructions from last step");
    //     this.applySystemInstructions(lastStep.systemInstructions);
    //   } else {
    //     console.log("skipping because history mode");
    //     if (!lastStep.presentation) {
    //       this.applySystemInstructions({
    //         prevStep: {},
    //       });
    //     }
    //   }
    //   return;
    // }

    // Create presentation state
    const presentationInstructions = currentSteps.map(
      (step) => step.presentation || {}
    );

    const presentationTemplate = this._constructPresentationTemplate(presentationInstructions);
    const presentationState = this._constructPresentationState({
      // TODO
      template: presentationTemplate,
      screen: {
        width: 100,
        height: 100,
        backgroundColor: 'red'
      },
      resolveFile: (f) => `file:${f}`,
      resources: this._vnDataStore.selectResources(),
      ui: this._vnDataStore.selectUi()
    });

    this._eventCallback({
      eventType: "render",
      payload: presentationState,
    })
  };
}

export default RouteEngine;
