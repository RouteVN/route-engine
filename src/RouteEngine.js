import { createStore, createSequentialActionsExecutor } from "./util.js";
import constructPresentationStateActions, * as constructPresentationStateStore from "./stores/constructPresentationState.js";
import constructRenderStateSelectorsAndActions, {
  createInitialState as createConstructRenderStateInitialState,
} from "./stores/constructRenderState.js";
import * as systemStore from "./stores/system.store.js";
import * as projectDataStore from "./stores/projectData.store.js";

const {
  createInitialState: createConstructPresentationStateInitialState,
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

  _eventCallback = () => { };

  constructor() { }

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
        lineId: initialIds.lineId,
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
        transformSelectorFirstArgument: (state) => ({
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
      constructPresentationStateActions
    );

    this._render();
  };

  onEvent = (callback) => {
    this._eventCallback = callback;
    return this;
  };

  offEvent = () => {
    this._eventCallback = () => { };
    return this;
  };

  /**
   * Use this for sending events to the engine
   */
  handleEvent = (event) => {

    const { eventType, payload } = event;
    const currentPreset = this._systemStore.selectCurrentPreset();
    const eventsMap = currentPreset?.eventsMap || {};
    const systemActions = eventsMap[eventType]?.systemActions;
    const actionType = systemActions ? Object.keys(systemActions)[0] : null;

    if (actionType && typeof this._systemStore[actionType] === 'function') {
      this._systemStore[actionType](payload);
    } else if (actionType) {
      console.error(`Method ${actionType} not found on system store`);
    }

    const pendingEffects = this._systemStore.selectPendingEffects();

    // TODO de duplicate
    pendingEffects.forEach((effect) => {
      if (effect.name === "render") {
        this._processSystemActions();
        this._render();
      }
    });

    this._systemStore.clearPendingEffects();
  };

  /**
   * Processes system actions from current lines
   */
  _processSystemActions = () => {
    const currentPointer = this._systemStore.selectCurrentPointer();
    const currentLines = this._projectDataStore.selectSectionLines(
      currentPointer.sectionId,
      currentPointer.lineId
    );

    if (!currentLines.length) {
      return;
    }

    // Process system actions from current lines
    currentLines.forEach((line) => {
      if (line.system) {
        Object.keys(line.system).forEach((actionType) => {
          if (typeof this._systemStore[actionType] === 'function') {
            this._systemStore[actionType](line.system[actionType]);
          } else {
            console.error(`System action ${actionType} not found on system store`);
          }
        });
      }
    });
  };

  /**
   * Renders the current state of the visual novel
   */
  _render = () => {
    const currentPointer = this._systemStore.selectCurrentPointer();
    const currentLines = this._projectDataStore.selectSectionLines(
      currentPointer.sectionId,
      currentPointer.lineId
    );

    if (!currentLines.length) {
      console.warn(
        `No lines found for section: ${currentPointer.sectionId}, line: ${currentPointer.lineId}`
      );
      return;
    }

    // Create presentation state
    const presentationActions = currentLines.map(
      (line) => line.presentation || {}
    );

    console.log('🔍 RENDER DEBUG - currentLines:', currentLines);
    console.log('🔍 RENDER DEBUG - presentationActions:', presentationActions);

    const presentationState =
      this._constructPresentationState(presentationActions);

    console.log('🔍 RENDER DEBUG - presentationState:', presentationState);

    const renderState = this._constructRenderState({
      presentationState: presentationState,
      screen: this._projectDataStore.selectScreen(),
      resolveFile: (f) => `file:${f}`,
      resources: this._projectDataStore.selectResources(),
      ui: this._projectDataStore.selectUi(),
    });

    console.log('🔍 RENDER DEBUG - renderState:', renderState);
    console.log('🔍 RENDER DEBUG - renderState.elements:', JSON.stringify(renderState.elements, null, 2));

    this._eventCallback({
      eventType: "render",
      payload: renderState,
    });
  };
}

export default RouteEngine;
