import { createSystemStore } from "./stores/system.store.js";
import { processActionTemplates } from "./util.js";

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

  const selectSectionLineChanges = (payload) => {
    return _systemStore.selectSectionLineChanges(payload);
  };

  const selectRenderState = () => {
    return _systemStore.selectRenderState();
  };

  const selectSaveSlots = () => {
    return _systemStore.selectSaveSlots();
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

  const buildActionTemplateContext = (eventContext) => {
    if (!eventContext) return undefined;
    if (Object.prototype.hasOwnProperty.call(eventContext, "event")) {
      throw new Error(
        'eventContext key "event" is no longer supported. Use "_event".',
      );
    }
    const { _event, ...additionalContext } = eventContext;
    const variables = _systemStore.selectAllVariables
      ? _systemStore.selectAllVariables()
      : undefined;
    const l10n = _systemStore.selectCurrentL10n
      ? _systemStore.selectCurrentL10n()
      : undefined;
    return {
      ...additionalContext,
      _event,
      variables,
      l10n,
    };
  };

  const handleActions = (actions, eventContext) => {
    const context = buildActionTemplateContext(eventContext);
    const processedActions = processActionTemplates(actions, context);
    Object.entries(processedActions).forEach(([actionType, payload]) => {
      handleAction(actionType, payload);
    });
  };

  const handleLineActions = () => {
    const line = _systemStore.selectCurrentLine();
    if (line?.actions) {
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
