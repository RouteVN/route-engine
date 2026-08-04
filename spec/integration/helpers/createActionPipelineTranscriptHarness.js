import { vi } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationTicker,
} from "./createEngineIntegrationHarness.js";

const clone = (value) =>
  value === undefined ? undefined : structuredClone(value);

const sanitizeRenderState = (renderState) => {
  const { id: _renderId, ...stableRenderState } = renderState ?? {};
  return clone(stableRenderState);
};

const PERSISTENCE_BARRIER_KEY = "__routeEngineTranscriptBarrier";

const createTranscriptTicker = (transcript, providedTicker) => {
  const ticker = providedTicker ?? createIntegrationTicker();
  const callbackIds = new WeakMap();
  let callbackSequence = 0;
  const getCallbackId = (callback) => {
    if (!callbackIds.has(callback)) {
      callbackIds.set(callback, `ticker-callback-${++callbackSequence}`);
    }
    return callbackIds.get(callback);
  };

  return {
    add: vi.fn((callback) => {
      ticker.add(callback);
      transcript.push({
        type: "ticker",
        operation: "add",
        callbackId: getCallbackId(callback),
        liveCallbacks: ticker.size,
      });
    }),
    remove: vi.fn((callback) => {
      ticker.remove(callback);
      transcript.push({
        type: "ticker",
        operation: "remove",
        callbackId: getCallbackId(callback),
        liveCallbacks: ticker.size,
      });
    }),
    tick(deltaMS) {
      transcript.push({
        type: "tickerTick",
        deltaMS,
        liveCallbacks: ticker.size,
      });
      ticker.tick(deltaMS);
    },
    get size() {
      return ticker.size;
    },
  };
};

const createTranscriptPersistence = (transcript) => {
  let barrierSequence = 0;
  const barrierResolvers = new Map();
  const record = (operation) =>
    vi.fn((payload) => {
      transcript.push({
        type: "persistence",
        operation,
        payload: clone(payload),
      });
      return Promise.resolve();
    });

  const persistence = {
    saveSlots: record("saveSlots"),
    saveGlobalDeviceVariables: record("saveGlobalDeviceVariables"),
    saveGlobalAccountVariables: record("saveGlobalAccountVariables"),
    saveGlobalRuntime: record("saveGlobalRuntime"),
    applyScopedDataUpdates: vi.fn((payload) => {
      const barrierId = payload?.[PERSISTENCE_BARRIER_KEY];
      const resolveBarrier = barrierResolvers.get(barrierId);
      if (resolveBarrier) {
        barrierResolvers.delete(barrierId);
        resolveBarrier();
        return Promise.resolve();
      }
      transcript.push({
        type: "persistence",
        operation: "applyScopedDataUpdates",
        payload: clone(payload),
      });
      return Promise.resolve();
    }),
  };

  return {
    persistence,
    createBarrier() {
      const barrierId = `transcript-persistence-${++barrierSequence}`;
      let resolve;
      const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
      });
      barrierResolvers.set(barrierId, resolve);
      return {
        payload: { [PERSISTENCE_BARRIER_KEY]: barrierId },
        promise,
      };
    },
  };
};

const summarizeState = (harness, successfulLifecycleEpoch) => {
  const state = harness.getState();
  const context = state.contexts.at(-1);
  const activeInteraction = harness.engine.selectActiveInteraction();
  const rollback = context?.rollback;
  const dialogueHistory = context?.dialogueHistory;

  return {
    successfulLifecycleEpoch,
    pointer: clone(context?.pointers?.read ?? null),
    variables: clone(context?.variables ?? {}),
    rollbackCheckpointIndex: rollback?.currentIndex ?? null,
    rollbackTimelineLength: rollback?.timeline?.length ?? 0,
    rollbackCheckpoint: clone(
      rollback?.timeline?.[rollback?.currentIndex] ?? null,
    ),
    dialogueHistoryLength: dialogueHistory?.currentLength ?? 0,
    dialogueHistory: clone(
      (dialogueHistory?.entries ?? []).slice(
        0,
        dialogueHistory?.currentLength ?? 0,
      ),
    ),
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
  onRendererEvent,
  ticker,
} = {}) => {
  const transcript = [];
  let renderSequence = 0;
  let successfulLifecycleEpoch = 0;
  let lifecycleActive = false;
  let harness;
  const transcriptPersistence = createTranscriptPersistence(transcript);
  const { persistence } = transcriptPersistence;
  const transcriptTicker = createTranscriptTicker(transcript, ticker);

  harness = createEngineIntegrationHarness({
    projectData,
    global,
    l10nData,
    namespace,
    preprocessPayload,
    onRendererEvent,
    ticker: transcriptTicker,
    persistence,
    autoInitialize: false,
    onPlaybackSchedule: (schedule) => {
      transcript.push({
        type: "playbackSchedule",
        payload: clone(schedule),
        liveCallbacksBeforeApply: transcriptTicker.size,
      });
    },
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
  const rawInitialize = harness.initialize.bind(harness);
  const rawEngineInit = harness.engine.init.bind(harness.engine);
  const rawDispose = harness.engine.dispose.bind(harness.engine);
  const trackedEngineInit = (...args) => {
    const result = rawEngineInit(...args);
    successfulLifecycleEpoch += 1;
    lifecycleActive = true;
    return result;
  };
  harness.engine.init = trackedEngineInit;
  const initialize = () => rawInitialize();
  const dispose = () => {
    const result = rawDispose();
    if (lifecycleActive) {
      successfulLifecycleEpoch += 1;
      lifecycleActive = false;
    }
    return result;
  };
  harness.initialize = initialize;
  harness.reinitialize = initialize;
  harness.engine.dispose = dispose;
  initialize();

  const settlePersistence = async () => {
    const barrier = transcriptPersistence.createBarrier();
    harness.engine.handleAction("appendPendingEffect", {
      name: "applyScopedDataUpdates",
      payload: { updates: barrier.payload },
    });
    await barrier.promise;
  };

  const clearTranscript = async () => {
    await settlePersistence();
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
        state: summarizeState(harness, successfulLifecycleEpoch),
      });
      return result;
    } catch (error) {
      transcript.push({
        type: "error",
        name: error?.constructor?.name ?? typeof error,
        message: error instanceof Error ? error.message : String(error),
        state: summarizeState(harness, successfulLifecycleEpoch),
      });
      throw error;
    }
  };

  const dispatchAction = (actionType, payload, eventContext, options) => {
    transcript.push({
      type: "dispatch",
      source: "host-single",
      actionType,
      payload: clone(payload),
    });
    try {
      const result = harness.engine.handleAction(
        actionType,
        payload,
        eventContext,
        options,
      );
      transcript.push({
        type: "settled",
        state: summarizeState(harness, successfulLifecycleEpoch),
      });
      return result;
    } catch (error) {
      transcript.push({
        type: "error",
        name: error?.constructor?.name ?? typeof error,
        message: error instanceof Error ? error.message : String(error),
        state: summarizeState(harness, successfulLifecycleEpoch),
      });
      throw error;
    }
  };

  const dispatchInternalAction = (actionType, payload) => {
    transcript.push({
      type: "dispatch",
      source: "engine-internal",
      actionType,
      payload: clone(payload),
    });
    try {
      const result = harness.engine.handleInternalAction(actionType, payload);
      transcript.push({
        type: "settled",
        state: summarizeState(harness, successfulLifecycleEpoch),
      });
      return result;
    } catch (error) {
      transcript.push({
        type: "error",
        name: error?.constructor?.name ?? typeof error,
        message: error instanceof Error ? error.message : String(error),
        state: summarizeState(harness, successfulLifecycleEpoch),
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
        state: summarizeState(harness, successfulLifecycleEpoch),
      });
      return result;
    } catch (error) {
      transcript.push({
        type: "error",
        name: error?.constructor?.name ?? typeof error,
        message: error instanceof Error ? error.message : String(error),
        state: summarizeState(harness, successfulLifecycleEpoch),
      });
      throw error;
    }
  };

  return {
    harness,
    persistence,
    transcript,
    clearTranscript,
    initialize,
    reinitialize: initialize,
    dispose,
    dispatchAction,
    dispatchActions,
    dispatchInternalAction,
    dispatchRendererEvent,
    settlePersistence,
    summarizeState: () => summarizeState(harness, successfulLifecycleEpoch),
  };
};
