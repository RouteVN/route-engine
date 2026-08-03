import { vi } from "vitest";
import { createEngineIntegrationHarness } from "./createEngineIntegrationHarness.js";

const clone = (value) =>
  value === undefined ? undefined : structuredClone(value);

const sanitizeRenderState = (renderState) => {
  const { id: _renderId, ...stableRenderState } = renderState ?? {};
  return clone(stableRenderState);
};

const createTranscriptPersistence = (transcript) => {
  const record = (operation) =>
    vi.fn((payload) => {
      transcript.push({
        type: "persistence",
        operation,
        payload: clone(payload),
      });
      return Promise.resolve();
    });

  return {
    saveSlots: record("saveSlots"),
    saveGlobalDeviceVariables: record("saveGlobalDeviceVariables"),
    saveGlobalAccountVariables: record("saveGlobalAccountVariables"),
    saveGlobalRuntime: record("saveGlobalRuntime"),
    applyScopedDataUpdates: record("applyScopedDataUpdates"),
  };
};

const summarizeState = (harness) => {
  const state = harness.getState();
  const context = state.contexts.at(-1);
  const activeInteraction = harness.engine.selectActiveInteraction();

  return {
    pointer: clone(context?.pointers?.read ?? null),
    variables: clone(context?.variables ?? {}),
    rollbackCheckpointIndex: context?.rollback?.currentIndex ?? null,
    dialogueHistoryLength: context?.dialogueHistory?.currentLength ?? 0,
    interaction: activeInteraction
      ? {
          source: activeInteraction.source,
          ...(activeInteraction.formKey
            ? { formKey: activeInteraction.formKey }
            : {}),
        }
      : null,
    lineCompleted: state.global.isLineCompleted,
    autoMode: state.global.autoMode,
    skipMode: state.global.skipMode,
    saveSlotIds: Object.values(state.global.saveSlots ?? {}).map(
      (slot) => slot.slotId,
    ),
    pendingEffects: (state.global.pendingEffects ?? []).map(
      (effect) => effect.name,
    ),
  };
};

export const createActionPipelineTranscriptHarness = ({
  projectData,
  global,
  l10nData,
  namespace,
  preprocessPayload,
  onExternalEffect,
  ticker,
} = {}) => {
  const transcript = [];
  let renderSequence = 0;
  let harness;
  const persistence = createTranscriptPersistence(transcript);

  harness = createEngineIntegrationHarness({
    projectData,
    global,
    l10nData,
    namespace,
    preprocessPayload,
    ticker,
    persistence,
    autoInitialize: false,
    onRender: (renderState) => {
      transcript.push({
        type: "render",
        sequence: ++renderSequence,
        payload: sanitizeRenderState(renderState),
      });
    },
    handleUnhandledEffect: (effect, dependencies) => {
      transcript.push({
        type: "externalEffect",
        name: effect.name,
        payload: clone(effect.payload),
      });
      return onExternalEffect?.(effect, {
        ...dependencies,
        harness,
      });
    },
  });
  harness.initialize();

  const clearTranscript = () => {
    transcript.length = 0;
    renderSequence = 0;
  };

  const dispatchActions = (actions, eventContext, options) => {
    transcript.push({
      type: "dispatch",
      source: "host",
      actions: clone(actions),
    });
    try {
      const result = harness.engine.handleActions(
        actions,
        eventContext,
        options,
      );
      transcript.push({
        type: "settled",
        state: summarizeState(harness),
      });
      return result;
    } catch (error) {
      transcript.push({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        state: summarizeState(harness),
      });
      throw error;
    }
  };

  const dispatchRendererEvent = async (eventName, payload) => {
    transcript.push({
      type: "rendererEvent",
      eventName,
      payload: clone(payload),
    });
    try {
      const result = await harness.eventHandler(eventName, payload);
      transcript.push({
        type: "settled",
        state: summarizeState(harness),
      });
      return result;
    } catch (error) {
      transcript.push({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        state: summarizeState(harness),
      });
      throw error;
    }
  };

  return {
    harness,
    persistence,
    transcript,
    clearTranscript,
    dispatchActions,
    dispatchRendererEvent,
    summarizeState: () => summarizeState(harness),
  };
};
