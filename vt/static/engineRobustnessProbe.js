// Test-only observations shared by browser fixtures and their integration tests.
export const dispatchEngineActionsEvent = (engine, event) => {
  const detail =
    typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
  const actions =
    typeof detail?.actions === "string"
      ? JSON.parse(detail.actions)
      : detail?.actions;
  if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
    throw new Error("VT engineActions requires an actions object");
  }
  engine.handleActions(actions);
};

export const readEngineCheckpoint = (
  engine,
  { timerCount, renderState } = {},
) => {
  const state = engine.selectSystemState();
  const context = state.contexts.at(-1);
  const dialogue = engine.selectPresentationState().dialogue;
  const text = (content) =>
    typeof content === "string"
      ? content
      : (content ?? []).map((part) => part?.text ?? "").join("");
  const textById = {};
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.id && Object.hasOwn(value, "content")) {
      textById[value.id] = text(value.content);
    }
    Object.values(value).forEach(visit);
  };
  visit(renderState);
  return {
    pointer: {
      sectionId: context.pointers.read.sectionId,
      lineId: context.pointers.read.lineId,
    },
    completed: engine.selectRuntime().isLineCompleted === true,
    pendingEffects: state.global.pendingEffects.map((effect) => effect.name),
    timerCount,
    dialogueText: text(dialogue?.content),
    nvlTexts: (dialogue?.lines ?? []).map((line) => text(line.content)),
    historyLineIds: (context.dialogueHistory?.entries ?? [])
      .slice(0, context.dialogueHistory?.currentLength ?? 0)
      .map((entry) => entry.lineId),
    textById,
  };
};

export const createExpectedErrorHandler =
  ({ getEngine, handleEvent, observe }) =>
  async (eventName, payload = {}) => {
    const expected = payload._vtExpectedError;
    if (!expected) return handleEvent(eventName, payload);
    const before = JSON.stringify(getEngine().selectSystemState());
    observe({ matched: false, statePreserved: false, message: null });
    try {
      await handleEvent(eventName, payload);
    } catch (error) {
      if (!error.message.includes(expected)) throw error;
      observe({
        matched: true,
        statePreserved:
          before === JSON.stringify(getEngine().selectSystemState()),
        message: error.message,
      });
      return;
    }
    throw new Error(
      `VT expected an action error containing "${expected}", but the action succeeded.`,
    );
  };
