import {
  createProjectDataStore,
  createSystemStore,
  constructPresentationState,
  constructRenderState,
} from "./stores/index.js";

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
    this._projectDataStore = createProjectDataStore(projectData);
    const initialIds = this._projectDataStore.selectInitialIds();
    this._systemStore = createSystemStore(initialIds, this._projectDataStore);
    this._constructPresentationState = constructPresentationState;
    this._constructRenderState = constructRenderState;

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

    // Handle direct system events (e.g., from UI elements)
    if (eventType === "system" && payload?.system) {
      const systemActions = payload.system;
      Object.keys(systemActions).forEach((actionType) => {
        if (typeof this._systemStore[actionType] === "function") {
          this._systemStore[actionType](systemActions[actionType]);
        } else {
          console.error(`System action ${actionType} not found on system store`);
        }
      });
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
      currentPointer.lineId,
    );

    if (!currentLines.length) {
      return;
    }

    // Process system actions from current lines
    currentLines.forEach((line) => {
      if (line.system) {
        Object.keys(line.system).forEach((actionType) => {
          if (typeof this._systemStore[actionType] === "function") {
            this._systemStore[actionType](line.system[actionType]);
          } else {
            console.error(
              `System action ${actionType} not found on system store`,
            );
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
      currentPointer.lineId,
    );

    if (!currentLines.length) {
      console.warn(
        `No lines found for section: ${currentPointer.sectionId}, line: ${currentPointer.lineId}`,
      );
      return;
    }

    // Create presentation state
    const presentationActions = currentLines.map(
      (line) => line.presentation || {},
    );

    const presentationState =
      this._constructPresentationState(presentationActions);

    const renderState = this._constructRenderState({
      presentationState: presentationState,
      systemState: this._systemStore.selectState(),
      screen: this._projectDataStore.selectScreen(),
      resolveFile: (f) => `file:${f}`,
      resources: this._projectDataStore.selectResources(),
      ui: this._projectDataStore.selectUi(),
    });

    console.log('Render state:', {
      systemState: this._systemStore.selectState(),
      presentationState: presentationState,
      currentPointer: currentPointer,
      renderState
    });

    this._eventCallback({
      eventType: "render",
      payload: renderState,
    });
  };
}

export default RouteEngine;
