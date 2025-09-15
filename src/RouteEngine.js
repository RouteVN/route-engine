import {
  createProjectDataStore,
  createSystemStore,
  constructPresentationState,
  constructRenderState,
} from "./stores/index.js";
import { base64ToArrayBuffer } from "./util.js";
import * as presentationHandlers from "./stores/constructPresentationState.js";
import * as systemHandlers from "./stores/system.store.js";

import createTimer from './createTimer.js';
import * as effectHandlers from './stores/effectHandlers.js';

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
  let _captureElemement;
  let _loadAssets;

  /**
   * Initialize the engine with visual novel data and rendering functions
   */
  const init = ({ projectData, ticker, captureElement, loadAssets }) => {
    _projectDataStore = createProjectDataStore(projectData);
    const initialIds = _projectDataStore.selectInitialIds();
    _systemStore = createSystemStore(initialIds, _projectDataStore);
    _constructPresentationState = constructPresentationState;
    _constructRenderState = constructRenderState;
    _captureElemement = captureElement;
    _loadAssets = loadAssets;

    _timer = createTimer(ticker)
    _timer.onEvent(_handleTimerEvent)


    const _saveVnData = localStorage.getItem('saveData') || '{}';
    const saveVnData = JSON.parse(_saveVnData);
    const saveImageAssets = Object.entries(saveVnData).filter(([key, data]) => !!data.image).map(([key, data]) => {
      const finalKey = `saveImage:${key}`
      const buffer = base64ToArrayBuffer(data.image);
      return {
        [finalKey]: {
          buffer: buffer,
          type: "image/png"
        }
      }
    }).reduce(
      (acc, curr) => ({ ...acc, ...curr }),
      {}
    )

    loadAssets(saveImageAssets).then(() => {
      console.log('All save images loaded');
    }).catch((e) => {
      console.log('Error loading save images', e);
    });

    _systemStore.setSaveData({
      saveData: saveVnData
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
        throw new Error(
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
    const { payload } = event;
    // Handle direct system events (e.g., from UI elements)
    const systemActions = payload.actions;
    Object.keys(systemActions).forEach((actionType) => {
      if (typeof _systemStore[actionType] === "function") {
        _systemStore[actionType](systemActions[actionType]);
      } else {
        throw new Error(`System action ${actionType} not found on system store`);
      }
    });
    // Process any pending effects from actions
    const pendingEffects = _systemStore.selectSortedPendingEffects();
    if (pendingEffects.length > 0) {
      const dependencies = {
        processAndRender: _processAndRender,
        timer: _timer,
        localStorage: localStorage,
        systemStore: _systemStore,
        captureElement: _captureElemement,
        loadAssets: _loadAssets,
      };

      pendingEffects.forEach((effect) => {
        const handler = effectHandlers[effect.name];
        if (!handler) {
          throw new Error(`No handler found for effect: ${effect.name}`);
        }
        handler(dependencies, effect);
      });

      _systemStore.clearPendingEffects();
    }
  };

  /**
   * Processes system actions and renders the current state
   */
  const _processAndRender = () => {
    _processSystemActions();
    _renderLine();
  };

  /**
   * Processes system actions from current lines
   */
  const _processSystemActions = () => {
    // Get the current pointer from mainPointers (not replay)
    const currentMainPointer = _systemStore.selectCurrentPointer();
    const currentLines = _projectDataStore.selectSectionLines(
      currentMainPointer.sectionId,
      currentMainPointer.lineId,
    );

    if (!currentLines.length) {
      return;
    }

    // Process unified actions from current lines
    currentLines.forEach((line) => {
      const actions = line.actions || {};

      // Process system actions only (presentation actions are handled in _renderLine)
      const systemActions = SYSTEM_ACTIONS.filter(actionType => actionType in actions)
      systemActions.forEach(actionType => {
        _systemStore[actionType](actions[actionType]);
      });
    });
  };

  /**
   * Renders the current line of the visual novel
   */
  const _renderLine = () => {
    // Get the current pointer from mainPointers (not replay)
    const currentMainPointer = _systemStore.selectCurrentPointer();
    const currentLines = _projectDataStore.selectSectionLines(
      currentMainPointer.sectionId,
      currentMainPointer.lineId,
    );

    if (!currentLines.length) {
      throw new Error(
        `No lines found for section: ${currentMainPointer.sectionId}, line: ${currentMainPointer.lineId}`,
      );
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

    const mainPresentationState =
      _constructPresentationState(presentationActions);

    // Process replay pointer if it exists
    let replayPresentationState = null;
    const currentReplayPointer = _systemStore.selectCurrentReplayPointer();
    
    if (currentReplayPointer && currentReplayPointer.sectionId && currentReplayPointer.lineId) {
      const replayLines = _projectDataStore.selectSectionLines(
        currentReplayPointer.sectionId,
        currentReplayPointer.lineId,
      );

      if (replayLines.length) {
        // Create replay presentation state
        const replayPresentationActions = replayLines.map((line) => {
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

        replayPresentationState = _constructPresentationState(replayPresentationActions);
      }
    }

    // Create main render state
    const mainRenderState = _constructRenderState({
      presentationState: mainPresentationState,
      systemState: _systemStore.selectState(),
      systemStore: _systemStore,
      screen: _projectDataStore.selectScreen(),
      resolveFile: (f) => `file:${f}`,
      resources: _projectDataStore.selectResources(),
      ui: _projectDataStore.selectUi(),
    });

    // Create replay render state if replay presentation state exists
    let replayRenderState = null;
    if (replayPresentationState) {
      replayRenderState = _constructRenderState({
        presentationState: replayPresentationState,
        systemState: _systemStore.selectState(),
        systemStore: _systemStore,
        screen: _projectDataStore.selectScreen(),
        resolveFile: (f) => `file:${f}`,
        resources: _projectDataStore.selectResources(),
        ui: _projectDataStore.selectUi(),
      });
    }

    console.log('Render states:', {
      systemState: _systemStore.selectState(),
      mainPresentationState: mainPresentationState,
      replayPresentationState: replayPresentationState,
      currentMainPointer: currentMainPointer,
      currentReplayPointer: currentReplayPointer,
      mainRenderState,
      replayRenderState
    });

    _eventCallback({
      eventType: "render",
      payload: replayRenderState || mainRenderState,
    });
  };

  return {
    init,
    onEvent,
    offEvent,
    handleEvent
  };
}
