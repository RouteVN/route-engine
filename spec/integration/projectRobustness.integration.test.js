import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../../src/RouteEngine.js";
import createEffectsHandler from "../../src/createEffectsHandler.js";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
  createIntegrationTicker,
} from "./helpers/createEngineIntegrationHarness.js";

const createProject = (lines = [{ id: "start", actions: {} }]) =>
  createIntegrationProject({
    sections: {
      main: { lines },
      safe: { lines: [{ id: "start", actions: {} }] },
    },
  });

const withDuplicateLines = (project) => {
  const updated = structuredClone(project);
  updated.story.scenes.scene.sections.main.lines.push({
    id: "start",
    actions: {},
  });
  return updated;
};

describe("story line identity validation", () => {
  it.each(["initialize", "update"])(
    "checks duplicate IDs in inactive scenes during %s",
    (operation) => {
      const projectData = createProject();
      projectData.story.scenes.unused = {
        initialSectionId: "unused-section",
        sections: {
          "unused-section": {
            lines: [
              { id: "later", actions: {} },
              { id: "between", actions: {} },
              { id: "later", actions: {} },
            ],
          },
        },
      };
      const h = createEngineIntegrationHarness({
        projectData: createProject(),
      });
      const before = h.getState();
      expect(() =>
        operation === "initialize"
          ? h.engine.init({
              namespace: "invalid",
              initialState: { projectData },
            })
          : h.engine.handleAction("updateProjectData", { projectData }),
      ).toThrow(
        /Duplicate lineId "later".*unused.*unused-section.*lines\[2\].*lines\[0\]/,
      );
      expect(h.getState()).toEqual(before);
      h.engine.dispose();
    },
  );

  it("rejects duplicates before initialization dispatches any effects", () => {
    const harness = createEngineIntegrationHarness({
      projectData: withDuplicateLines(createProject()),
      autoInitialize: false,
    });

    expect(() => harness.initialize()).toThrow(
      /Duplicate lineId "start".*scene.*main.*lines\[1\]/,
    );
    expect(harness.routeGraphics.render).not.toHaveBeenCalled();
    expect(harness.ticker.size).toBe(0);
  });

  it.each(["update", "reinitialize"])(
    "preserves a running game when a duplicate-ID %s fails",
    (operation) => {
      const projectData = createProject();
      const harness = createEngineIntegrationHarness({ projectData });
      harness.completeLatestRender();
      harness.engine.handleAction("saveSlot", { slotId: "saved" });
      const before = harness.getState();
      const renderCount = harness.renderStates.length;
      const invalidProject = withDuplicateLines(projectData);

      expect(() => {
        if (operation === "update") {
          harness.engine.handleAction("updateProjectData", {
            projectData: invalidProject,
          });
        } else {
          harness.engine.init({
            namespace: "invalid-reinitialization",
            initialState: { projectData: invalidProject },
          });
        }
      }).toThrow(/Duplicate lineId "start"/);

      expect(harness.getState()).toEqual(before);
      expect(harness.renderStates).toHaveLength(renderCount);
      expect(harness.engine.getNamespace()).toBe("integration-test");
      harness.engine.handleAction("jumpToLine", {
        sectionId: "safe",
        lineId: "start",
      });
      expect(harness.getPointer()).toMatchObject({ sectionId: "safe" });
    },
  );

  it("allows the same line ID in different sections", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createProject(),
    });
    harness.engine.handleAction("jumpToLine", {
      sectionId: "safe",
      lineId: "start",
    });
    expect(harness.getPointer()).toEqual({
      sectionId: "safe",
      lineId: "start",
    });
  });
});

describe("long-section rendering", () => {
  it("advances without cloning the full engine state and keeps public snapshots detached", () => {
    const projectData = createProject(
      Array.from({ length: 100 }, (_, index) => ({
        id: String(index),
        actions: {},
      })),
    );
    const harness = createEngineIntegrationHarness({ projectData });
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      for (let index = 1; index < 100; index += 1) {
        harness.engine.handleAction("markLineCompleted", {});
        harness.engine.handleAction("nextLine", {});
      }
      expect(
        clone.mock.calls.filter(([value]) => value?.projectData),
      ).toHaveLength(0);
    } finally {
      clone.mockRestore();
    }
    expect(harness.getPointer().lineId).toBe("99");
    const snapshot = harness.getState();
    snapshot.projectData.story.scenes.scene.sections.main.lines[99].id =
      "mutated";
    expect(
      harness.getState().projectData.story.scenes.scene.sections.main.lines[99]
        .id,
    ).toBe("99");
    harness.engine.dispose();
  });
});

// Bound the pre-fix reproduction too: a broken engine must fail the test,
// rather than hanging Vitest in its synchronous effects loop.
const createGuardedEngine = (projectData) => {
  let engine;
  let effectBatches = 0;
  const ticker = createIntegrationTicker();
  const effects = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics: { render: vi.fn() },
    ticker,
    persistence: { applyScopedDataUpdates: vi.fn().mockResolvedValue() },
  });
  const guardedEffects = Object.assign((pending) => {
    effectBatches += 1;
    if (effectBatches > 1500) {
      throw new Error(
        "Test watchdog: engine failed to bound immediate routing",
      );
    }
    effects(pending);
  }, effects);
  engine = createRouteEngine({ handlePendingEffects: guardedEffects });
  return {
    engine,
    ticker,
    initialize: () =>
      engine.init({
        namespace: "routing-budget",
        initialState: { projectData },
      }),
    resetWatchdog: () => {
      effectBatches = 0;
    },
  };
};

describe("bounded synchronous routing", () => {
  it.each([1000, 1001])(
    "handles the effect-drain boundary for %i batches",
    (batchCount) => {
      let engine;
      let remaining = 0;
      let handled = 0;
      const handlePendingEffects = () => {
        if (remaining === 0) return;
        handled += 1;
        remaining -= 1;
        if (handled > 1001) throw new Error("Test watchdog: unbounded drain");
        if (remaining > 0)
          engine.handleAction("appendPendingEffect", { name: "test:continue" });
      };
      engine = createRouteEngine({ handlePendingEffects });
      engine.init({
        namespace: "boundary",
        initialState: { projectData: createProject() },
      });
      remaining = batchCount;
      const dispatch = () =>
        engine.handleAction("appendPendingEffect", { name: "test:continue" });
      if (batchCount === 1000) {
        expect(dispatch).not.toThrow();
        expect(engine.selectSystemState().global.pendingEffects).toEqual([]);
      } else {
        expect(dispatch).toThrow(/exceeded 1000 synchronous effect batches/);
        expect(engine.selectSystemState().global.pendingEffects).toEqual([
          { name: "test:continue" },
        ]);
      }
      expect(handled).toBe(1000);
      engine.dispose();
    },
  );

  it.each([
    ["self-jump", { jumpToLine: { lineId: "loop" } }],
    [
      "conditional cycle",
      {
        conditional: {
          branches: [
            { when: true, actions: { jumpToLine: { lineId: "loop" } } },
          ],
        },
      },
    ],
  ])(
    "rejects a %s during initialization and can be reinitialized",
    (_, actions) => {
      const guarded = createGuardedEngine(
        createProject([{ id: "loop", actions }]),
      );
      expect(() => guarded.initialize()).toThrow(
        /exceeded 1000 synchronous effect batches.*main.*loop/,
      );
      expect(guarded.ticker.size).toBe(0);
      guarded.resetWatchdog();
      guarded.engine.init({
        namespace: "recovered",
        initialState: { projectData: createProject() },
      });
      expect(
        guarded.engine.selectSystemState().contexts[0].pointers.read.lineId,
      ).toBe("start");
      guarded.engine.dispose();
    },
  );

  it("invalidates automatic timers after a two-section cycle and allows reset", () => {
    const project = createProject([
      { id: "start", actions: {} },
      { id: "loop", actions: { sectionTransition: { sectionId: "other" } } },
    ]);
    project.story.scenes.scene.sections.other = {
      lines: [
        {
          id: "loop",
          actions: { jumpToLine: { sectionId: "main", lineId: "loop" } },
        },
      ],
    };
    const guarded = createGuardedEngine(project);
    guarded.initialize();
    guarded.engine.handleAction("markLineCompleted", {});
    guarded.engine.handleAction("startAutoMode", {});
    expect(guarded.ticker.size).toBe(1);

    expect(() => guarded.ticker.tick(1000)).toThrow(
      /exceeded 1000 synchronous effect batches/,
    );
    expect(guarded.ticker.size).toBe(0);
    guarded.resetWatchdog();
    guarded.engine.handleAction("resetStoryAtSection", { sectionId: "safe" });
    expect(
      guarded.engine.selectSystemState().contexts[0].pointers.read.sectionId,
    ).toBe("safe");
    guarded.engine.dispose();
  });

  it("permits long finite routing chains and starts a fresh budget after settling", () => {
    const lines = Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      actions: index < 99 ? { jumpToLine: { lineId: String(index + 1) } } : {},
    }));
    const guarded = createGuardedEngine(createProject(lines));
    guarded.initialize();
    for (let iteration = 0; iteration < 12; iteration += 1) {
      guarded.resetWatchdog();
      guarded.engine.handleAction("jumpToLine", { lineId: "0" });
      expect(
        guarded.engine.selectSystemState().contexts[0].pointers.read.lineId,
      ).toBe("99");
    }
    guarded.engine.dispose();
  });
});
