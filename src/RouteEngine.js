import {
  createProjectDataStore,
  createSystemStore,
  constructPresentationState,
  constructRenderState,
} from "./stores/index.js";
import * as presentationHandlers from "./stores/constructPresentationState.js";
import * as systemHandlers from "./stores/system.store.js";

import createTimer from './createTimer.js';

// Action categorization constants
const PRESENTATION_ACTIONS = Object.keys(presentationHandlers).filter(key => key !== 'default' && key !== 'createInitialState');
const SYSTEM_ACTIONS = Object.keys(systemHandlers).filter(key => !key.startsWith('select') && key !== 'createInitialState');

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

  _timer;

  _eventCallback = () => { };

  constructor() { }

  /**
   * Initialize the engine with visual novel data and rendering functions
   */
  init = ({ projectData, ticker }) => {
    this._projectDataStore = createProjectDataStore(projectData);
    const initialIds = this._projectDataStore.selectInitialIds();
    this._systemStore = createSystemStore(initialIds, this._projectDataStore);
    this._constructPresentationState = constructPresentationState;
    this._constructRenderState = constructRenderState;

    this._timer = createTimer(ticker)
    this._timer.onEvent(this._handleTimerEvent)


    const saveVnData = localStorage.getItem('saveData') || '{}';
    this._systemStore.setSaveData({
      saveData: JSON.parse(saveVnData),
    })

    // Initialize and load device variables
    const variableDefinitions = this._projectDataStore.selectVariables();
    const deviceVariables = {};

    // First, set all device variable defaults
    Object.entries(variableDefinitions).forEach(([key, definition]) => {
      if (definition.persistence === 'device' && definition.hasOwnProperty('default')) {
        deviceVariables[key] = definition.default;
      }
    });

    // Then, override with saved values if they exist
    const savedDeviceVariables = localStorage.getItem('deviceVariables');
    if (savedDeviceVariables) {
      try {
        const parsedVariables = JSON.parse(savedDeviceVariables);
        // Only override values that exist in variable definitions
        Object.entries(parsedVariables).forEach(([key, value]) => {
          if (variableDefinitions[key] && variableDefinitions[key].persistence === 'device') {
            deviceVariables[key] = value;
          }
        });
      } catch (e) {
        console.error('Failed to load device variables:', e);
      }
    }

    // Apply all device variables to the store
    if (Object.keys(deviceVariables).length > 0) {
      this._systemStore.setDeviceVariables({ variables: deviceVariables });
      // Save the initialized device variables
      localStorage.setItem('deviceVariables', JSON.stringify(deviceVariables));
    }

    this._processSystemActions();
    this._render();
  };

  _handleTimerEvent = ({ eventType, payload }) => {
    Object.keys(payload.payload).forEach((actionType) => {
      if (typeof this._systemStore[actionType] === "function") {
        this._systemStore[actionType](payload.payload[actionType]);
      } else {
        console.error(
          `System action ${actionType} not found on system store`,
        );
      }
    });
    this._processSystemActions();
    this._render();
  }

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
    if (eventType === "system" && payload?.actions) {
      const systemActions = payload.actions;
      Object.keys(systemActions).forEach((actionType) => {
        if (typeof this._systemStore[actionType] === "function") {
          this._systemStore[actionType](systemActions[actionType]);
        } else {
          console.error(`System action ${actionType} not found on system store`);
        }
      });
      const pendingEffects = this._systemStore.selectPendingEffects();

      let needsToRender = false;

      // TODO de duplicate
      pendingEffects.forEach((effect) => {
        if (effect.name === "render") {
          needsToRender = true;
        }

        if (effect.name === "saveVnData") {
          const { saveData } = effect.options;
          localStorage.setItem('saveData', JSON.stringify(saveData));
        }

        if (effect.name === "saveVariables") {
          const deviceVariables = this._systemStore.selectDeviceVariables();
          localStorage.setItem('deviceVariables', JSON.stringify(deviceVariables));
        }

        if (effect.name === "startAutoNextTimer") {
          this._timer.setTimeout('autoMode', {
            nextLine: {
              forceSkipAutonext: true
            }
          }, 1000)
        }

        if (effect.name === "clearAutoNextTimer") {
          this._timer.clear('autoMode')
        }

        if (effect.name === "startSkipNextTimer") {
          this._timer.setTimeout('skipMode', {
            nextLine: {
              forceSkipAutonext: true
            }
          }, 300)
        }

        if (effect.name === "clearSkipNextTimer") {
          this._timer.clear('skipMode')
        }
      });

      if (needsToRender) {
        this._processSystemActions();
        this._render();
      }

      this._systemStore.clearPendingEffects();
    } else if (eventType === "completed") {

      const nextConfig = this._systemStore.selectNextConfig();
      if (nextConfig) {
        if (nextConfig.auto && nextConfig.auto.trigger === 'fromComplete') {
          this._timer.setTimeout('nextConfig', {
            nextLine: {
              forceSkipAutonext: true
            }
          }, nextConfig.auto.delay ?? 1000)
        }
        return;
      }
      if (this._systemStore.selectAutoMode()) {
        this._timer.setTimeout('autoMode', {
          nextLine: {
            forceSkipAutonext: true
          }
        }, 1000)
      } else if (this._systemStore.selectSkipMode()) {
        this._timer.setTimeout('skipMode', {
          nextLine: {
            forceSkipAutonext: true
          }
        }, 300)
      }
    }

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

    // Process unified actions from current lines
    currentLines.forEach((line) => {
      const actions = line.actions || {};
      
      // Process system actions only (presentation actions are handled in _render)
      Object.keys(actions).forEach((actionType) => {
        if (SYSTEM_ACTIONS.includes(actionType)) {
          if (typeof this._systemStore[actionType] === "function") {
            this._systemStore[actionType](actions[actionType]);
          } else {
            console.error(
              `System action ${actionType} not found on system store`,
            );
          }
        }
      });
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

    // Create presentation state from unified actions
    const presentationActions = currentLines.map((line) => {
      const actions = line.actions || {};
      const presentationData = {};
      
      // Extract only presentation-related actions
      Object.keys(actions).forEach((actionType) => {
        if (PRESENTATION_ACTIONS.includes(actionType)) {
          presentationData[actionType] = actions[actionType];
        }
      });
      
      return presentationData;
    });

    const presentationState =
      this._constructPresentationState(presentationActions);

    const renderState = this._constructRenderState({
      presentationState: presentationState,
      systemState: this._systemStore.selectState(),
      systemStore: this._systemStore,
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
