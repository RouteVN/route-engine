import { createSystemStore } from "./stores/system.store.js";
import { processActionTemplates } from "./util.js";

/**
 * Creates a RouteEngine instance.
 */
export default function createRouteEngine(options) {
  let _systemStore;
  let _renderSequence = 0;

  const { handlePendingEffects } = options;

  const processEffectsUntilEmpty = () => {
    while (_systemStore.selectPendingEffects().length > 0) {
      const snapshot = [..._systemStore.selectPendingEffects()];
      _systemStore.clearPendingEffects();
      try {
        handlePendingEffects(snapshot);
      } catch (error) {
        _systemStore.clearPendingEffects();
        snapshot.forEach((effect) => {
          _systemStore.appendPendingEffect(effect);
        });
        throw error;
      }
    }
  };

  const init = ({ initialState }) => {
    _systemStore = createSystemStore(initialState);
    _renderSequence = 0;
    _systemStore.appendPendingEffect({ name: "handleLineActions" });
    processEffectsUntilEmpty();
  };

  const selectPresentationState = () => {
    return _systemStore.selectPresentationState();
  };

  const selectPresentationChanges = () => {
    return _systemStore.selectPresentationChanges();
  };

  const selectSectionLineChanges = (payload) => {
    return _systemStore.selectSectionLineChanges(payload);
  };

  const selectRenderState = () => {
    _renderSequence += 1;
    const renderState = _systemStore.selectRenderState();
    return {
      ...renderState,
      id: `render-${_renderSequence}`,
    };
  };

  const selectSystemState = () => {
    return _systemStore.selectSystemState();
  };

  const selectSaveSlotMap = () => {
    return _systemStore.selectSaveSlotMap();
  };

  const selectSaveSlot = (payload) => {
    return _systemStore.selectSaveSlot(payload);
  };

  const selectSaveSlotPage = (payload) => {
    return _systemStore.selectSaveSlotPage(payload);
  };

  const selectSkipMode = () => {
    return _systemStore.selectSkipMode();
  };

  const selectAutoMode = () => {
    return _systemStore.selectAutoMode();
  };

  const handleAction = (actionType, payload) => {
    if (!_systemStore[actionType]) {
      return;
    }
    _systemStore[actionType](payload);
    processEffectsUntilEmpty();
  };

  const handleInternalAction = (actionType, payload) => {
    handleAction(actionType, payload);
  };

  const buildActionTemplateContext = (eventContext) => {
    if (!eventContext) {
      return {
        variables: _systemStore.selectAllVariables
          ? _systemStore.selectAllVariables()
          : undefined,
      };
    }
    if (Object.prototype.hasOwnProperty.call(eventContext, "event")) {
      throw new Error(
        'eventContext key "event" is no longer supported. Use "_event".',
      );
    }
    const { _event, ...additionalContext } = eventContext;
    const variables = _systemStore.selectAllVariables
      ? _systemStore.selectAllVariables()
      : undefined;
    return {
      ...additionalContext,
      _event,
      variables,
    };
  };

  const handleActions = (actions, eventContext) => {
    const context = buildActionTemplateContext(eventContext);
    const processedActions = processActionTemplates(actions, context);
    _systemStore.beginRollbackActionBatch({});
    try {
      Object.entries(processedActions).forEach(([actionType, payload]) => {
        handleAction(actionType, payload);
      });
    } finally {
      _systemStore.endRollbackActionBatch({});
    }
  };

  const handleLineActions = () => {
    const line = _systemStore.selectCurrentLine();
    if (line?.actions) {
      handleActions(line.actions);
      return true;
    }

    return false;
  };

  return {
    init,
    handleAction,
    handleInternalAction,
    handleActions,
    selectRenderState,
    selectPresentationState,
    selectPresentationChanges,
    selectSectionLineChanges,
    selectSystemState,
    selectSaveSlotMap,
    selectSaveSlot,
    selectSaveSlotPage,
    selectSaveSlots: selectSaveSlotMap,
    handleLineActions,
  };
}
