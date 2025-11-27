import { base64ToArrayBuffer } from "./util.js";

import createTimer from "./createTimer.js";
import * as effectHandlers from "./stores/effectHandlers.js";

import { createSystemStore } from "./stores/system.store.js";

/**
 * Creates a RouteEngine instance.
 * Look at ../docs/RouteEngine.md for more information.
 *
 * @example
 *
 * const handlePendingEffects = (effects) => {
 *
 * }
 *
 *
 * const engine = createRouteEngine({
 *   handlePendingEffects,
 * });
 *
 *
 */
export default function createRouteEngine(options) {
  let _systemStore;

  const { handlePendingEffects } = options;
  // let _timer;
  // let _eventCallback = () => { };
  // let _captureElemement;
  // let _loadAssets;

  /**
   * Initialize the engine with visual novel data and rendering functions
   */
  // const init = ({ projectData }) => {
  //   _systemStore = createSystemStore(projectData);

  // const initialIds = _projectDataStore.selectInitialIds();
  // _systemStore = createSystemStore(initialIds, _projectDataStore);
  // _captureElemement = captureElement;
  // _loadAssets = loadAssets;
  //
  // _timer = createTimer(ticker);
  // _timer.onEvent(_handleTimerEvent);
  //
  // const _saveVnData = localStorage.getItem("saveData") || "{}";
  // const saveVnData = JSON.parse(_saveVnData);
  // const saveImageAssets = Object.entries(saveVnData)
  //   .filter(([key, data]) => !!data.image)
  //   .map(([key, data]) => {
  //     const finalKey = `saveImage:${key}`;
  //     const buffer = base64ToArrayBuffer(data.image);
  //     return {
  //       [finalKey]: {
  //         buffer: buffer,
  //         type: "image/png",
  //       },
  //     };
  //   })
  //   .reduce((acc, curr) => ({ ...acc, ...curr }), {});
  //
  // loadAssets(saveImageAssets)
  //   .then(() => {
  //     console.log("All save images loaded");
  //   })
  //   .catch((e) => {
  //     console.log("Error loading save images", e);
  //   });
  //
  // _systemStore.setSaveData({
  //   saveData: saveVnData,
  // });
  //
  // // Initialize and load device variables
  // const variableDefinitions = _projectDataStore.selectVariables();
  // const deviceVariables = {};
  //
  // // First, set all device variable defaults
  // Object.entries(variableDefinitions).forEach(([key, definition]) => {
  //   if (
  //     definition.persistence === "device" &&
  //     definition.hasOwnProperty("default")
  //   ) {
  //     deviceVariables[key] = definition.default;
  //   }
  // });
  //
  // // Then, override with saved values if they exist
  // const savedDeviceVariables = localStorage.getItem("deviceVariables");
  // if (savedDeviceVariables) {
  //   try {
  //     const parsedVariables = JSON.parse(savedDeviceVariables);
  //     // Only override values that exist in variable definitions
  //     Object.entries(parsedVariables).forEach(([key, value]) => {
  //       if (
  //         variableDefinitions[key] &&
  //         variableDefinitions[key].persistence === "device"
  //       ) {
  //         deviceVariables[key] = value;
  //       }
  //     });
  //   } catch (e) {
  //     console.error("Failed to load device variables:", e);
  //   }
  // }
  //
  // // Apply all device variables to the store
  // if (Object.keys(deviceVariables).length > 0) {
  //   _systemStore.setDeviceVariables({ variables: deviceVariables });
  //   // Save the initialized device variables
  //   localStorage.setItem("deviceVariables", JSON.stringify(deviceVariables));
  // }
  //
  // _processAndRender();
  // };
  const init = ({ initialState }) => {
    _systemStore = createSystemStore(initialState);
    _systemStore.appendPendingEffect({ name: 'render' });
    console.log('AAAAAAAAAAAAAAAAAAAAAAA')
    handleLineActions();
    handlePendingEffects(_systemStore.selectPendingEffects());
    _systemStore.clearPendingEffects();
  }

  const selectRenderState = () => {
    return _systemStore.selectRenderState();
  }

  const handleAction = (actionType, payload) => {
    console.log('RouteEngine handleAction', { actionType, payload });
    console.log('_systemStore', _systemStore)
    console.log('found action handler', _systemStore[actionType])

    if (!_systemStore[actionType]) {
      return;
    }
    _systemStore[actionType](payload);
    console.log('_systemStore.selectPendingEffects()', _systemStore.selectPendingEffects())
    handlePendingEffects(_systemStore.selectPendingEffects())
    _systemStore.clearPendingEffects();
  }

  const handleActions = (actions) => {
    console.log('RouteEngine handleActions', actions);
    Object.entries(actions).forEach(([actionType, payload]) => {
      handleAction(actionType, payload);
    });
  }

  const handleLineActions = () => {
    const line = _systemStore.selectCurrentLine();
    console.log('BBBBBBBBBBBBBBBBBB line', line)
    if (line && line.actions) {
      handleActions(line.actions);
    }
  }

  return {
    init,
    handleAction,
    handleActions,
    selectRenderState,
    handleLineActions
  };
}
