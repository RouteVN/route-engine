import { describe, expect, it, vi } from "vitest";
import {
  createDeferred,
  createEngineIntegrationHarness,
  createIntegrationProject,
} from "./helpers/createEngineIntegrationHarness.js";

const createLinearProject = () =>
  createIntegrationProject({
    sections: {
      main: {
        lines: ["line1", "line2", "line3"].map((id) => ({
          id,
          actions: {},
        })),
      },
    },
  });

const createMusicRoomProject = () =>
  createIntegrationProject({
    resources: {
      sounds: {
        openingSound: { fileId: "opening.ogg" },
      },
      musicRoom: {
        pageSize: 1,
        tracks: [
          {
            id: "opening",
            soundId: "openingSound",
            title: "Opening",
          },
        ],
      },
    },
    sections: {
      main: {
        lines: [{ id: "line1", actions: {} }],
      },
    },
  });

const createRetainingTicker = () => {
  const callbacks = new Set();
  const registeredCallbacks = [];

  return {
    add: vi.fn((callback) => {
      callbacks.add(callback);
      registeredCallbacks.push(callback);
    }),
    remove: vi.fn((callback) => callbacks.delete(callback)),
    get size() {
      return callbacks.size;
    },
    get registeredCallbacks() {
      return [...registeredCallbacks];
    },
  };
};

describe("RouteEngine lifecycle ownership", () => {
  it("disposes owned timers and rejects events and actions idempotently", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
      global: { runtime: { skipUnseenText: true } },
    });
    const renderId = harness.renderStates.at(-1).id;
    harness.engine.handleAction("startSkipMode", {});
    expect(harness.ticker.size).toBe(1);

    harness.engine.dispose();
    harness.engine.dispose();

    expect(harness.ticker.size).toBe(0);
    expect(
      harness.effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: renderId,
        aborted: false,
      }),
    ).toBe(false);
    expect(() => harness.engine.handleAction("nextLine", {})).toThrow(
      'RouteEngine action "nextLine" requires an active engine',
    );
    expect(harness.getPointer().lineId).toBe("line1");
  });

  it("invalidates pending asynchronous input across disposal and reinit", async () => {
    const deferred = createDeferred();
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
      preprocessPayload: async (_eventName, payload) => {
        if (payload.defer === true) {
          await deferred.promise;
        }
        return payload;
      },
    });
    const pendingClick = harness.eventHandler("click", {
      defer: true,
      actions: { nextLine: {} },
    });

    harness.engine.dispose();
    harness.reinitialize();
    deferred.resolve();

    expect(await pendingClick).toBe(false);
    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.completeLatestRender()).toBe(true);
    expect(harness.getState().global.isLineCompleted).toBe(true);
  });

  it("makes removed timer callbacks harmless even if a host ticker retained them", () => {
    const ticker = createRetainingTicker();
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
      ticker,
    });
    harness.engine.handleAction("startSkipMode", {});
    const staleCallback = ticker.registeredCallbacks.at(-1);
    expect(typeof staleCallback).toBe("function");

    harness.reinitialize();
    expect(ticker.size).toBe(0);

    staleCallback({ deltaMS: 1000 });

    expect(ticker.size).toBe(0);
    expect(harness.getPointer().lineId).toBe("line1");
  });

  it("stops an old effect batch when an effect replaces the engine generation", () => {
    const projectData = createLinearProject();
    const harness = createEngineIntegrationHarness({
      projectData,
      handleUnhandledEffect: (effect, { engine }) => {
        if (effect.name === "integration:reinitialize") {
          engine.init({
            namespace: "effect-reinitialized",
            initialState: { projectData },
          });
        }
      },
    });

    harness.engine.handleActions({
      appendPendingEffect: { name: "integration:reinitialize" },
      startSkipMode: {},
    });

    expect(harness.ticker.size).toBe(0);
    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.getState().global.skipMode).toBe(false);
    expect(harness.completeLatestRender()).toBe(true);
  });

  it("rejects stale command-controlled audio events after disposal and reinit", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createMusicRoomProject(),
      global: {
        accountViewedRegistry: {
          sections: [],
          resources: [{ resourceId: "openingSound" }],
        },
      },
    });
    const dispatchSoundEvent = (eventName, event) =>
      harness.effectsHandler.handleRouteGraphicsEvent(eventName, {
        _event: {
          id: "music-room:player",
          ...event,
        },
      });

    harness.engine.handleAction("playMusicRoomTrack", {
      trackId: "opening",
    });
    const staleCommandId =
      harness.getState().global.musicRoomPlayer.playback.commandId;
    dispatchSoundEvent("soundReady", {
      commandId: staleCommandId,
      positionMs: 0,
      durationMs: 100,
    });

    harness.engine.dispose();
    harness.reinitialize();
    harness.engine.handleAction("playMusicRoomTrack", {
      trackId: "opening",
    });
    const currentCommandId =
      harness.getState().global.musicRoomPlayer.playback.commandId;
    expect(currentCommandId).toBeGreaterThan(staleCommandId);

    dispatchSoundEvent("soundReady", {
      commandId: staleCommandId,
      positionMs: 0,
      durationMs: 100,
    });
    expect(harness.engine.selectMusicRoom().playback.readiness).toBe("loading");

    dispatchSoundEvent("soundReady", {
      commandId: currentCommandId,
      positionMs: 0,
      durationMs: 100,
    });
    expect(harness.engine.selectMusicRoom().playback.readiness).toBe("ready");

    dispatchSoundEvent("soundProgress", {
      commandId: staleCommandId,
      positionMs: 50,
      durationMs: 100,
    });
    dispatchSoundEvent("soundComplete", {
      commandId: staleCommandId,
      positionMs: 100,
      durationMs: 100,
    });
    dispatchSoundEvent("soundError", {
      commandId: staleCommandId,
      errorCode: "playback-failed",
    });
    expect(harness.engine.selectMusicRoom().playback).toMatchObject({
      status: "playing",
      readiness: "ready",
      positionMs: 0,
      durationMs: 100,
    });

    dispatchSoundEvent("soundProgress", {
      commandId: currentCommandId,
      positionMs: 25,
      durationMs: 100,
    });
    expect(harness.engine.selectMusicRoom().playback.positionMs).toBe(25);
  });

  it("keeps the active generation running when a replacement init is invalid", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
      global: { runtime: { skipUnseenText: true } },
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startSkipMode", {});
    expect(harness.ticker.size).toBe(1);

    expect(() =>
      harness.engine.init({
        namespace: "invalid-replacement",
        initialState: { projectData: {} },
      }),
    ).toThrow();

    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(80);
    expect(harness.getPointer().lineId).toBe("line2");
  });
});
