import { createSystemStore } from "./stores/system.store.js";

/**
 * Creates a RouteEngine instance.
 */
export default function createRouteEngine(options) {
  let _systemStore;

  const { handlePendingEffects } = options;
  const init = ({ initialState }) => {
    _systemStore = createSystemStore(initialState);
    _systemStore.appendPendingEffect({ name: "render" });
    handleLineActions();
    handlePendingEffects(_systemStore.selectPendingEffects());
    _systemStore.clearPendingEffects();
  };

  const selectPresentationState = () => {
    return _systemStore.selectPresentationState();
  };

  const selectRenderState = () => {
    return _systemStore.selectRenderState();
  };

  const selectSaveSlots = () => {
    return _systemStore.selectSaveSlots();
  };

  const handleAction = (actionType, payload) => {
    if (!_systemStore[actionType]) {
      return;
    }
    _systemStore[actionType](payload);
    handlePendingEffects(_systemStore.selectPendingEffects());
    _systemStore.clearPendingEffects();
  };

  const handleActions = (actions) => {
    console.log('handleActoin, handleActions')
    Object.entries(actions).forEach(([actionType, payload]) => {
      handleAction(actionType, payload);
    });
  };

  const handleLineActions = () => {
    const line = _systemStore.selectCurrentLine();
    if (line && line.actions) {
      handleActions(line.actions);
    }
  };

  return {
    init,
    handleAction,
    handleActions,
    selectRenderState,
    selectPresentationState,
    selectSaveSlots,
    handleLineActions,
  };
}
