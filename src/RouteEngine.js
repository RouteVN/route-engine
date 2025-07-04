import { createStore, createSequentialActionsExecutor } from "./util.js";
import * as constructPresentationStateStore from "./stores/constructPresentationState.js";
import constructRenderStateSelectorsAndActions, {
  createInitialState as createConstructRenderStateInitialState,
} from "./stores/constructRenderState.js";
import * as systemStore from "./stores/system.store.js";
import * as projectDataStore from "./stores/projectData.store.js";

const {
  createInitialState: createConstructPresentationStateInitialState,
  ...constructPresentationStateSelectorsAndActions
} = constructPresentationStateStore;

const {
  createInitialState: createSystemInitialState,
  ...systemStateSelectorsAndActions
} = systemStore;

const {
  createInitialState: createProjectDataInitialState,
  ...projectDataSelectorsAndActions
} = projectDataStore;

/**
 * RouteEngine is the main class for the engine.
 * Look at ../docs/RouteEngine.md for more information.
 */
class RouteEngine {
  _projectDataStore;
  _systemStore;
  _constructRenderState;
  _constructPresentationState;
  _applySystemInstruction;

  _eventCallback = (event) => {};

  constructor() {}

  /**
   * Initialize the engine with visual novel data and rendering functions
   */
  init = ({ projectData }) => {
    this._projectDataStore = createStore(
      projectData,
      projectDataSelectorsAndActions
    );
    const initialIds = this._projectDataStore.selectInitialIds();
    this._systemStore = createStore(
      createSystemInitialState({
        sectionId: initialIds.sectionId,
        stepId: initialIds.stepId,
        presetId: initialIds.presetId,
        autoNext: initialIds.autoNext,
        saveData: {},
        variables: {},
      }),
      systemStateSelectorsAndActions,
      {
        transformActionFirstArgument: (state) => ({
          state,
          projectDataStore: this._projectDataStore,
        }),
      }
    );

    this._constructRenderState = createSequentialActionsExecutor(
      createConstructRenderStateInitialState,
      constructRenderStateSelectorsAndActions
    );

    this._constructPresentationState = createSequentialActionsExecutor(
      createConstructPresentationStateInitialState,
      constructPresentationStateSelectorsAndActions
    );

    this._render();
  };

  onEvent = (callback) => {
    this._eventCallback = callback;
    return this;
  };

  offEvent = () => {
    this._eventCallback = () => {};
    return this;
  };

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

    // TODO get it dynamically
    const eventTypeToInstructionMap = {
      LeftClick: "nextStep",
    };

    const instructionType = eventTypeToInstructionMap[eventType];

    console.log("aaaaaaaaaaaa", {
      instructionType,
      payload,
    });

    this._systemStore[instructionType](payload);

    const pendingEffects = this._systemStore.selectPendingEffects();

    // TODO de duplicate
    pendingEffects.forEach((effect) => {
      if (effect.name === "render") {
        this._render();
      }
    });

    this._systemStore.clearPendingEffects();
  };

  /**
   * Renders the current state of the visual novel
   */
  _render = () => {
    const currentPointer = this._systemStore.selectCurrentPointer();
    const currentSteps = this._projectDataStore.selectSectionSteps(
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

    // Create presentation state
    const presentationActions = currentSteps.map(
      (step) => step.presentation || {}
    );

    const presentationState =
      this._constructPresentationState(presentationActions);
    const renderState = this._constructRenderState({
      // TODO
      template: presentationState,
      screen: this._projectDataStore.selectScreen(),
      resolveFile: (f) => `file:${f}`,
      resources: this._projectDataStore.selectResources(),
      ui: this._projectDataStore.selectUi(),
    });

    this._eventCallback({
      eventType: "render",
      payload: renderState,
    });
  };
}

export default RouteEngine;
