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

// Route Graphics mounts real native DOM inputs/areas keyed by the render
// state element id. Reading them at checkpoint time lets fixtures assert the
// actual typed value and focused element identity (stable layout occurrence
// ids keep this DOM identity across unrelated layout changes). The bridge may
// retain hidden inputs for reuse, so include those entries and their display state.
export const readNativeInputState = () => {
  if (typeof document === "undefined") {
    return { focusedId: null, inputs: [] };
  }

  const inputs = [
    ...document.querySelectorAll("[data-route-graphics-input-id]"),
  ].map((element) => ({
    id: element.dataset.routeGraphicsInputId,
    value: element.value ?? "",
    focused: document.activeElement === element,
    displayed: getComputedStyle(element).display !== "none",
  }));
  inputs.sort((left, right) => left.id.localeCompare(right.id));
  const focusedId =
    document.activeElement?.dataset?.routeGraphicsInputId ?? null;

  return { focusedId, inputs };
};

export const readEngineCheckpoint = (
  engine,
  { timerCount, renderState, layoutRootId } = {},
) => {
  const state = engine.selectSystemState();
  const context = state.contexts.at(-1);
  const dialogue = engine.selectPresentationState().dialogue;
  const text = (content) =>
    typeof content === "string"
      ? content
      : (content ?? []).map((part) => part?.text ?? "").join("");
  const textById = {};
  const ownerPrefix =
    layoutRootId === undefined
      ? null
      : `@layout/${encodeURIComponent(layoutRootId).replaceAll("--", "%2D%2D")}--`;
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (
      value.id &&
      Object.hasOwn(value, "content") &&
      (!ownerPrefix || value.id.startsWith(ownerPrefix))
    ) {
      const observedId =
        ownerPrefix && value.id.startsWith(ownerPrefix)
          ? decodeURIComponent(value.id.slice(ownerPrefix.length))
          : value.id;
      if (Object.hasOwn(textById, observedId)) {
        throw new Error(`Ambiguous checkpoint text id "${observedId}"`);
      }
      textById[observedId] = text(value.content);
    }
    visit(value.children);
  };
  visit(renderState?.elements);
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
    nativeInputs: readNativeInputState(),
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
