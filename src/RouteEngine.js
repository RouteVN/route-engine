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
 * Creates a RouteEngine instance.
 * Look at ../docs/RouteEngine.md for more information.
 */
export default function createRouteEngine() {
  let _projectDataStore;
  let _systemStore;
  let _constructRenderState;
  let _constructPresentationState;
  let _timer;
  let _eventCallback = () => { };

  /**
   * Initialize the engine with visual novel data and rendering functions
   */
  const init = ({ projectData, ticker }) => {
    _projectDataStore = createProjectDataStore(projectData);
    const initialIds = _projectDataStore.selectInitialIds();
    _systemStore = createSystemStore(initialIds, _projectDataStore);
    _constructPresentationState = constructPresentationState;
    _constructRenderState = constructRenderState;

    _timer = createTimer(ticker)
    _timer.onEvent(_handleTimerEvent)


    const saveVnData = localStorage.getItem('saveData') || '{}';
    _systemStore.setSaveData({
      saveData: JSON.parse(saveVnData),
    })

    // Initialize and load device variables
    const variableDefinitions = _projectDataStore.selectVariables();
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
      _systemStore.setDeviceVariables({ variables: deviceVariables });
      // Save the initialized device variables
      localStorage.setItem('deviceVariables', JSON.stringify(deviceVariables));
    }

    _processAndRender();
  };

  const _handleTimerEvent = ({ eventType, payload }) => {
    Object.keys(payload.payload).forEach((actionType) => {
      if (typeof _systemStore[actionType] === "function") {
        _systemStore[actionType](payload.payload[actionType]);
      } else {
        console.error(
          `System action ${actionType} not found on system store`,
        );
      }
    });
    _processAndRender();
  }

  const onEvent = (callback) => {
    _eventCallback = callback;
  };

  const offEvent = () => {
    _eventCallback = () => { };
  };

  /**
   * Use this for sending events to the engine
   */
  const handleEvent = (event) => {
    const { eventType, payload } = event;

    // Handle direct system events (e.g., from UI elements)
    if (eventType === "system" && payload?.actions) {
      const systemActions = payload.actions;
      Object.keys(systemActions).forEach((actionType) => {
        if (typeof _systemStore[actionType] === "function") {
          _systemStore[actionType](systemActions[actionType]);
        } else {
          console.error(`System action ${actionType} not found on system store`);
        }
      });
      const pendingEffects = _systemStore.selectPendingEffects();

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
          const deviceVariables = _systemStore.selectDeviceVariables();
          localStorage.setItem('deviceVariables', JSON.stringify(deviceVariables));
        }

        if (effect.name === "startAutoNextTimer") {
          _timer.setTimeout('autoMode', {
            nextLine: {
              forceSkipAutonext: true
            }
          }, 1000)
        }

        if (effect.name === "clearAutoNextTimer") {
          _timer.clear('autoMode')
        }

        if (effect.name === "startSkipNextTimer") {
          _timer.setTimeout('skipMode', {
            nextLine: {
              forceSkipAutonext: true
            }
          }, 300)
        }

        if (effect.name === "clearSkipNextTimer") {
          _timer.clear('skipMode')
        }
      });

      if (needsToRender) {
        _processAndRender();
      }

      _systemStore.clearPendingEffects();
    } else if (eventType === "completed") {

      const nextConfig = _systemStore.selectNextConfig();
      if (nextConfig) {
        if (nextConfig.auto && nextConfig.auto.trigger === 'fromComplete') {
          _timer.setTimeout('nextConfig', {
            nextLine: {
              forceSkipAutonext: true
            }
          }, nextConfig.auto.delay ?? 1000)
        }
        return;
      }
      if (_systemStore.selectAutoMode()) {
        _timer.setTimeout('autoMode', {
          nextLine: {
            forceSkipAutonext: true
          }
        }, 1000)
      } else if (_systemStore.selectSkipMode()) {
        _timer.setTimeout('skipMode', {
          nextLine: {
            forceSkipAutonext: true
          }
        }, 300)
      }
    }

  };

  /**
   * Processes system actions and renders the current state
   */
  const _processAndRender = () => {
    _processSystemActions();
    _render();
  };

  /**
   * Processes system actions from current lines
   */
  const _processSystemActions = () => {
    const currentPointer = _systemStore.selectCurrentPointer();
    const currentLines = _projectDataStore.selectSectionLines(
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
          if (typeof _systemStore[actionType] === "function") {
            _systemStore[actionType](actions[actionType]);
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
  const _render = () => {
    const currentPointer = _systemStore.selectCurrentPointer();
    const currentLines = _projectDataStore.selectSectionLines(
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
      _constructPresentationState(presentationActions);

    const renderState = _constructRenderState({
      presentationState: presentationState,
      systemState: _systemStore.selectState(),
      systemStore: _systemStore,
      screen: _projectDataStore.selectScreen(),
      resolveFile: (f) => `file:${f}`,
      resources: _projectDataStore.selectResources(),
      ui: _projectDataStore.selectUi(),
    });

    console.log('Render state:', {
      systemState: _systemStore.selectState(),
      presentationState: presentationState,
      currentPointer: currentPointer,
      renderState
    });

    _eventCallback({
      eventType: "render",
      payload: renderState,
    });
  };

  return {
    init,
    onEvent,
    offEvent,
    handleEvent
  };
}
