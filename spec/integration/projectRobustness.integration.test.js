import { resetActionCases } from "../helpers/resetActionCases.js";
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
    ["self section transition", { sectionTransition: { sectionId: "main" } }],
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
        expect.objectContaining({
          message: expect.stringMatching(
            /exceeded 1000 synchronous effect batches.*main.*loop/,
          ),
          code: "routing_cycle",
          pointer: { sectionId: "main", lineId: "loop" },
          cycle: [{ sectionId: "main", lineId: "loop" }],
        }),
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

  it.each(resetActionCases)(
    "invalidates automatic timers after a two-section cycle and allows reset via %s %j",
    (actionType, options) => {
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
        expect.objectContaining({
          message: expect.stringMatching(
            /exceeded 1000 synchronous effect batches/,
          ),
          code: "routing_cycle",
          pointer: {
            sectionId: expect.stringMatching(/^(main|other)$/),
            lineId: "loop",
          },
          cycle: expect.arrayContaining([
            { sectionId: "main", lineId: "loop" },
            { sectionId: "other", lineId: "loop" },
          ]),
        }),
      );
      expect(guarded.ticker.size).toBe(0);
      guarded.resetWatchdog();
      guarded.engine.handleAction(actionType, {
        ...options,
        sectionId: "safe",
      });
      expect(
        guarded.engine.selectSystemState().contexts[0].pointers.read.sectionId,
      ).toBe("safe");
      guarded.engine.dispose();
    },
  );

  const catchRoutingCycle = (run) => {
    try {
      run();
    } catch (error) {
      return error;
    }
    throw new Error("Expected a routing cycle error");
  };

  // The cycle starts with the line the engine stopped on, which may be any
  // line of the loop, and then follows the loop's order.
  const expectCycleInOrder = (error, loopLines) => {
    expect(error.code).toBe("routing_cycle");
    const start = loopLines.findIndex(
      (line) =>
        line.sectionId === error.pointer.sectionId &&
        line.lineId === error.pointer.lineId,
    );
    expect(start).not.toBe(-1);
    expect(error.cycle).toEqual([
      ...loopLines.slice(start),
      ...loopLines.slice(0, start),
    ]);
  };

  it("names both lines of a two-section cycle", () => {
    const project = createProject([
      { id: "first", actions: { sectionTransition: { sectionId: "other" } } },
    ]);
    project.story.scenes.scene.sections.other = {
      lines: [
        { id: "second", actions: { sectionTransition: { sectionId: "main" } } },
      ],
    };
    const guarded = createGuardedEngine(project);

    expectCycleInOrder(
      catchRoutingCycle(() => guarded.initialize()),
      [
        { sectionId: "main", lineId: "first" },
        { sectionId: "other", lineId: "second" },
      ],
    );
    guarded.engine.dispose();
  });

  it("names the lines of a cycle, without the lines that led into it", () => {
    const project = createProject([
      { id: "entry", actions: { jumpToLine: { lineId: "a" } } },
      { id: "a", actions: { sectionTransition: { sectionId: "other" } } },
      { id: "c", actions: { jumpToLine: { lineId: "a" } } },
    ]);
    project.story.scenes.scene.sections.other = {
      lines: [
        {
          id: "b",
          actions: {
            conditional: {
              branches: [
                {
                  when: true,
                  actions: {
                    jumpToLine: { sectionId: "main", lineId: "c" },
                  },
                },
              ],
            },
          },
        },
      ],
    };
    const guarded = createGuardedEngine(project);

    expectCycleInOrder(
      catchRoutingCycle(() => guarded.initialize()),
      [
        { sectionId: "main", lineId: "a" },
        { sectionId: "other", lineId: "b" },
        { sectionId: "main", lineId: "c" },
      ],
    );
    guarded.engine.dispose();
  });

  it("names a line a conditional continues past on its way around a cycle", () => {
    const guarded = createGuardedEngine(
      createProject([
        {
          id: "check",
          actions: {
            conditional: { branches: [{ when: true, actions: {} }] },
          },
        },
        { id: "back", actions: { jumpToLine: { lineId: "check" } } },
      ]),
    );

    expectCycleInOrder(
      catchRoutingCycle(() => guarded.initialize()),
      [
        { sectionId: "main", lineId: "check" },
        { sectionId: "main", lineId: "back" },
      ],
    );
    guarded.engine.dispose();
  });

  it("lists a line once when the story passes it twice in a turn", () => {
    const setFlag = (value) => ({
      id: `flag${value}`,
      operations: [{ variableId: "flag", op: "set", value }],
    });
    const project = createIntegrationProject({
      resources: {
        variables: { flag: { type: "number", scope: "context", default: 0 } },
      },
      sections: {
        main: {
          lines: [
            // Goes to "b" and "c" in turn.
            {
              id: "a",
              actions: {
                conditional: {
                  branches: [
                    {
                      when: { eq: [{ var: "variables.flag" }, 0] },
                      actions: {
                        updateVariable: setFlag(1),
                        jumpToLine: { lineId: "b" },
                      },
                    },
                    {
                      actions: {
                        updateVariable: setFlag(0),
                        jumpToLine: { lineId: "c" },
                      },
                    },
                  ],
                },
              },
            },
            { id: "b", actions: { jumpToLine: { lineId: "a" } } },
            { id: "c", actions: { jumpToLine: { lineId: "a" } } },
          ],
        },
      },
    });
    const guarded = createGuardedEngine(project);

    const error = catchRoutingCycle(() => guarded.initialize());

    expect(error.cycle).toHaveLength(3);
    expect(error.cycle[0]).toEqual(error.pointer);
    expect(error.cycle).toEqual(
      expect.arrayContaining([
        { sectionId: "main", lineId: "a" },
        { sectionId: "main", lineId: "b" },
        { sectionId: "main", lineId: "c" },
      ]),
    );
    guarded.engine.dispose();
  });

  it("names the lines of a cycle that crosses scenes", () => {
    const project = createProject([
      { id: "first", actions: { sectionTransition: { sectionId: "far" } } },
    ]);
    project.story.scenes.elsewhere = {
      initialSectionId: "far",
      sections: {
        far: {
          lines: [
            {
              id: "second",
              actions: { sectionTransition: { sectionId: "main" } },
            },
          ],
        },
      },
    };
    const guarded = createGuardedEngine(project);

    expectCycleInOrder(
      catchRoutingCycle(() => guarded.initialize()),
      [
        { sectionId: "main", lineId: "first" },
        { sectionId: "far", lineId: "second" },
      ],
    );
    guarded.engine.dispose();
  });

  it("names the lines of a cycle the player starts from a waiting line", () => {
    const guarded = createGuardedEngine(
      createProject([
        { id: "start", actions: {} },
        { id: "a", actions: { jumpToLine: { lineId: "b" } } },
        { id: "b", actions: { jumpToLine: { lineId: "a" } } },
      ]),
    );
    guarded.initialize();

    expectCycleInOrder(
      catchRoutingCycle(() =>
        guarded.engine.handleAction("jumpToLine", { lineId: "a" }),
      ),
      [
        { sectionId: "main", lineId: "a" },
        { sectionId: "main", lineId: "b" },
      ],
    );
    guarded.engine.dispose();
  });

  it("names only the lines of the latest cycle after recovering from another", () => {
    const project = createProject([
      { id: "start", actions: {} },
      { id: "a", actions: { jumpToLine: { lineId: "b" } } },
      { id: "b", actions: { jumpToLine: { lineId: "a" } } },
      { id: "c", actions: { jumpToLine: { lineId: "c" } } },
    ]);
    const guarded = createGuardedEngine(project);
    guarded.initialize();
    catchRoutingCycle(() =>
      guarded.engine.handleAction("jumpToLine", { lineId: "a" }),
    );
    guarded.resetWatchdog();
    guarded.engine.handleAction("sectionTransition", {
      sectionId: "safe",
      resetStory: true,
    });
    guarded.resetWatchdog();

    const error = catchRoutingCycle(() =>
      guarded.engine.handleAction("jumpToLine", {
        sectionId: "main",
        lineId: "c",
      }),
    );

    expect(error.cycle).toEqual([{ sectionId: "main", lineId: "c" }]);
    guarded.engine.dispose();
  });

  it("names no cycle when a chain of lines outruns the budget without repeating", () => {
    const lines = Array.from({ length: 1200 }, (_, index) => ({
      id: String(index),
      actions:
        index < 1199 ? { jumpToLine: { lineId: String(index + 1) } } : {},
    }));
    const guarded = createGuardedEngine(createProject(lines));

    const error = catchRoutingCycle(() => guarded.initialize());

    expect(error.code).toBe("routing_cycle");
    expect(error.pointer.sectionId).toBe("main");
    expect(error.cycle).toEqual([]);
    guarded.engine.dispose();
  });

  it("gives a cycle the host can keep and change", () => {
    const guarded = createGuardedEngine(
      createProject([
        { id: "loop", actions: { jumpToLine: { lineId: "loop" } } },
      ]),
    );
    const error = catchRoutingCycle(() => guarded.initialize());

    error.cycle[0].lineId = "changed";
    error.cycle.push({ sectionId: "main", lineId: "extra" });

    expect(error.pointer).toEqual({ sectionId: "main", lineId: "loop" });
    expect(
      guarded.engine.selectSystemState().contexts[0].pointers.read.lineId,
    ).toBe("loop");
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
