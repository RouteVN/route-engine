import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../../src/RouteEngine.js";
import createEffectsHandler from "../../src/createEffectsHandler.js";
import { createSystemStore } from "../../src/stores/system.store.js";
import { RUN_STORE_TRANSACTION } from "../../src/util.js";
import {
  createEngineIntegrationHarness,
  createIntegrationPersistence,
  createIntegrationProject,
  createIntegrationTicker,
} from "./helpers/createEngineIntegrationHarness.js";

const createProject = ({ line1Actions = {}, line2Actions = {} } = {}) =>
  createIntegrationProject({
    resources: {
      variables: {
        score: { type: "number", scope: "context", default: 0 },
        unrelated: { type: "number", scope: "context", default: 0 },
      },
    },
    sections: {
      main: {
        lines: [
          { id: "line1", actions: line1Actions },
          { id: "line2", actions: line2Actions },
          { id: "line3", actions: {} },
        ],
      },
    },
  });

const incrementScore = {
  updateVariable: {
    id: "incrementScore",
    operations: [{ variableId: "score", op: "increment", value: 1 }],
  },
};

const authoredAuto = (trigger, delay) => ({
  setNextLineConfig: {
    auto: { enabled: true, trigger, delay },
  },
});

describe("reconciled playback scheduler integration", () => {
  it("coalesces simultaneously due global-auto and authored timers into one progression", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { autoForwardDelay: 100 } },
      projectData: createProject({
        line1Actions: authoredAuto("fromComplete", 100),
        line2Actions: incrementScore,
      }),
    });

    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});

    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(100);

    expect({
      pointer: harness.getPointer().lineId,
      score: harness.getState().contexts.at(-1).variables.score,
    }).toEqual({ pointer: "line2", score: 1 });
  });

  it("coalesces simultaneously due skip and authored timers into one progression", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { skipUnseenText: true } },
      projectData: createProject({
        line1Actions: authoredAuto("fromStart", 80),
        line2Actions: incrementScore,
      }),
    });

    harness.engine.handleAction("startSkipMode", {});
    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(80);

    expect({
      pointer: harness.getPointer().lineId,
      score: harness.getState().contexts.at(-1).variables.score,
    }).toEqual({ pointer: "line2", score: 1 });
  });

  it("lets skip-unseen stop progression and rearms a co-due authored timer", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { skipUnseenText: false } },
      projectData: createProject({
        line1Actions: authoredAuto("fromStart", 80),
        line2Actions: incrementScore,
      }),
    });

    harness.engine.handleAction("startSkipMode", {});
    harness.ticker.tick(80);

    expect({
      pointer: harness.getPointer().lineId,
      skipMode: harness.getState().global.skipMode,
      physicalCallbacks: harness.ticker.size,
    }).toEqual({ pointer: "line1", skipMode: false, physicalCallbacks: 1 });

    harness.ticker.tick(80);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("preserves a non-terminal fromStart deadline across manual completion", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createProject({
        line1Actions: authoredAuto("fromStart", 100),
      }),
    });

    harness.ticker.tick(40);
    harness.engine.handleAction("nextLine", {});
    expect(harness.getState().global.isLineCompleted).toBe(true);

    harness.ticker.tick(59);
    expect(harness.getPointer().lineId).toBe("line1");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("keeps terminal manual completion fail-closed", () => {
    const projectData = createIntegrationProject({
      sections: {
        main: {
          lines: [{ id: "only", actions: authoredAuto("fromStart", 100) }],
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });

    harness.ticker.tick(40);
    harness.engine.handleAction("nextLine", {});

    expect({
      autoEnabled: harness.getState().global.nextLineConfig.auto.enabled,
      physicalCallbacks: harness.ticker.size,
    }).toEqual({ autoEnabled: false, physicalCallbacks: 0 });
  });

  it("restarts timing for every accepted repeated explicit auto start", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { autoForwardDelay: 100 } },
      projectData: createProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});
    harness.ticker.tick(40);

    harness.engine.handleAction("startAutoMode", {});
    harness.ticker.tick(99);
    expect(harness.getPointer().lineId).toBe("line1");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("preserves a deadline across unrelated committed actions", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { autoForwardDelay: 100 } },
      projectData: createProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});
    harness.ticker.tick(40);

    harness.engine.handleAction("setMuteAll", { value: true });
    harness.ticker.tick(59);
    expect(harness.getPointer().lineId).toBe("line1");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("derives auto text without evaluating unrelated computed variables", () => {
    const projectData = createProject({
      line1Actions: {
        dialogue: {
          mode: "adv",
          content: [{ text: "Only this text is needed." }],
        },
      },
    });
    projectData.resources.variables.brokenUnlessRead = {
      type: "number",
      scope: "context",
      computed: { expr: { div: [1, 0] } },
    };
    const store = createSystemStore({ projectData });
    store.markLineCompleted({});

    expect(() => store.startAutoMode({})).not.toThrow();
    expect(store.selectDesiredPlaybackTimers().auto).toMatchObject({
      contentKey: "Only this text is needed.",
    });
  });

  it("uses exact duration arithmetic beyond Number safe-integer accumulation", () => {
    const delay = 2 ** 54 + 4;
    const harness = createEngineIntegrationHarness({
      global: { runtime: { autoForwardDelay: delay } },
      projectData: createProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});

    harness.ticker.tick(1);
    harness.ticker.tick(2 ** 54);
    harness.ticker.tick(1);
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("line1");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("does not dispatch a zero-delay timer synchronously during registration", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createProject({
        line1Actions: authoredAuto("fromStart", 0),
      }),
    });

    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(0);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("rejects malformed host deltas without consuming elapsed time", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createProject({
        line1Actions: authoredAuto("fromStart", 100),
      }),
    });
    harness.ticker.tick(40);

    for (const deltaMS of [NaN, Infinity, -1, undefined]) {
      expect(() => harness.ticker.tick(deltaMS)).toThrow(
        "deltaMS must be a finite non-negative number",
      );
      expect(harness.getPointer().lineId).toBe("line1");
    }

    harness.ticker.tick(59);
    expect(harness.getPointer().lineId).toBe("line1");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("suppresses rollback-restored authored timing until the config genuinely changes", () => {
    const config = { enabled: true, trigger: "fromStart", delay: 100 };
    const harness = createEngineIntegrationHarness({
      projectData: createProject({
        line1Actions: { setNextLineConfig: { auto: config } },
      }),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("nextLine", {});
    expect(harness.getPointer().lineId).toBe("line2");

    harness.engine.handleAction("rollbackByOffset", { offset: -1 });
    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.ticker.size).toBe(0);

    harness.engine.handleAction("setNextLineConfig", { auto: config });
    expect(harness.ticker.size).toBe(0);

    harness.engine.handleAction("setNextLineConfig", {
      auto: { ...config, delay: 101 },
    });
    expect(harness.ticker.size).toBe(1);
  });

  it("does not leak ownership or exact deadlines into public state or saves", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createProject({
        line1Actions: authoredAuto("fromStart", 100),
      }),
    });
    harness.ticker.tick(37);
    harness.engine.handleAction("saveSlot", {
      slotId: 1,
      thumbnailImage: "data:image/png;base64,test",
      savedAt: 1,
    });

    const serialized = JSON.stringify({
      state: harness.engine.selectSystemState(),
      slot: harness.engine.selectSaveSlot({ slotId: 1 }),
    });
    expect(serialized).not.toMatch(
      /lineEntryId|autoSessionId|skipSessionId|remainingQuanta|rollbackAuthoredSuppression/,
    );
  });

  it("preserves rollback suppression across A-B-A changes in one store transaction", () => {
    const configA = { enabled: true, trigger: "fromStart", delay: 100 };
    const projectData = createProject({
      line1Actions: { setNextLineConfig: { auto: configA } },
    });
    const store = createSystemStore({ projectData });
    store.setNextLineConfig({ auto: configA });
    store.clearPendingEffects();
    store.markLineCompleted({});
    store.nextLine({});
    store.clearPendingEffects();
    store.rollbackByOffset({ offset: -1 });
    store.clearPendingEffects();

    const suppressed = store.selectDesiredPlaybackTimers();
    expect(suppressed.authored).toBeNull();

    store[RUN_STORE_TRANSACTION](() => {
      store.setNextLineConfig({
        auto: { ...configA, delay: 200 },
      });
      store.setNextLineConfig({ auto: configA });
    });

    expect(store.selectDesiredPlaybackTimers().authored).toBeNull();
  });

  it("rejects exhausted private identities atomically", () => {
    const projectData = createProject();
    const store = createSystemStore(
      { projectData },
      {
        createPlaybackOwnership: () => ({
          lineEntryId: Number.MAX_SAFE_INTEGER,
          autoSessionId: 0,
          skipSessionId: 0,
          rollbackAuthoredSuppression: null,
        }),
      },
    );
    store.setNextLineConfig({
      auto: { enabled: true, trigger: "fromStart", delay: 100 },
    });
    store.clearPendingEffects();
    const stateBefore = store.selectSystemState();
    const scheduleBefore = store.selectDesiredPlaybackTimers();

    expect(() => store.jumpToLine({ lineId: "line1" })).toThrow(
      "lineEntryId is exhausted",
    );

    expect(store.selectSystemState()).toEqual(stateBefore);
    expect(store.selectDesiredPlaybackTimers()).toEqual(scheduleBefore);
  });

  it("makes nested ticker dispatch inert while the current attempt settles", () => {
    const ticker = createIntegrationTicker();
    const persistence = createIntegrationPersistence();
    let engine;
    let nested = false;
    const routeGraphics = {
      render: vi.fn(() => {
        if (nested) {
          nested = false;
          ticker.tick(100);
        }
      }),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker,
      persistence,
    });
    engine = createRouteEngine({ handlePendingEffects: effectsHandler });
    engine.init({
      initialState: {
        projectData: createProject({
          line1Actions: authoredAuto("fromStart", 100),
          line2Actions: authoredAuto("fromStart", 100),
        }),
      },
    });

    nested = true;
    ticker.tick(100);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
  });

  it("fails closed when destination rendering throws after progression commits", () => {
    const ticker = createIntegrationTicker();
    const persistence = createIntegrationPersistence();
    let engine;
    let failRender = false;
    const routeGraphics = {
      render: vi.fn(() => {
        if (failRender) {
          failRender = false;
          throw new Error("destination render failed");
        }
      }),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker,
      persistence,
    });
    engine = createRouteEngine({ handlePendingEffects: effectsHandler });
    engine.init({
      initialState: {
        projectData: createProject({
          line1Actions: authoredAuto("fromStart", 100),
          line2Actions: authoredAuto("fromStart", 100),
        }),
      },
    });

    failRender = true;
    expect(() => ticker.tick(100)).toThrow("destination render failed");
    expect({
      pointer: engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      physicalCallbacks: ticker.size,
    }).toEqual({ pointer: "line2", physicalCallbacks: 0 });

    engine.handleAction("setMuteAll", { value: true });
    expect(ticker.size).toBe(1);
  });
});
