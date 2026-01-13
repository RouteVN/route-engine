import { createSystemStore } from "./stores/system.store.js";

/**
 * Creates a RouteEngine instance.
 */
export default function createRouteEngine(options) {
  let _systemStore;

  const { handlePendingEffects } = options;

  const processEffectsUntilEmpty = () => {
    while (_systemStore.selectPendingEffects().length > 0) {
      const snapshot = [..._systemStore.selectPendingEffects()];
      _systemStore.clearPendingEffects();
      handlePendingEffects(snapshot);
    }
  };

  const init = ({ initialState }) => {
    _systemStore = createSystemStore(initialState);
    _systemStore.appendPendingEffect({ name: "render" });
    handleLineActions();
    processEffectsUntilEmpty();
  };

  const selectPresentationState = () => {
    return _systemStore.selectPresentationState();
  };

  const selectPresentationChanges = () => {
    return _systemStore.selectPresentationChanges();
  };

  const selectSectionLineChanges  = (payload) => {
    return _systemStore.selectSectionLineChanges(payload);
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
    processEffectsUntilEmpty();
  };

  const handleActions = (actions) => {
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
    selectPresentationChanges,
    selectSectionLineChanges,
    selectSaveSlots,
    handleLineActions,
  };
}
