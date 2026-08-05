import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = ({ lineActions = {}, extraLines = [] } = {}) => ({
  screen: { width: 1920, height: 1080 },
  resources: {
    layouts: {},
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    characters: {},
    variables: {
      score: { type: "number", scope: "context", default: 0 },
      bonus: { type: "number", scope: "context", default: 2 },
      selected: { type: "string", scope: "context", default: "" },
      result: { type: "object", scope: "context", default: {} },
    },
    transforms: {},
    sectionTransitions: {},
    animations: {},
    fonts: {},
    colors: {},
    textStyles: {},
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            lines: [{ id: "line1", actions: lineActions }, ...extraLines],
          },
        },
      },
    },
  },
});

const createQueuedRandomSource = (...values) => {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    nextUint32() {
      if (calls >= values.length) {
        throw new Error("test random source exhausted");
      }
      const value = values[calls];
      calls += 1;
      return value;
    },
  };
};

const createEngine = (
  projectData,
  randomSource,
  { handleLineActions = false, global } = {},
) => {
  let engine;
  const handlePendingEffects = (effects) => {
    if (!handleLineActions) return;
    effects.forEach((effect) => {
      if (effect.name === "handleLineActions") {
        engine.handleLineActions(effect.payload);
      }
    });
  };
  engine = createRouteEngine({ handlePendingEffects, randomSource });
  engine.init({
    initialState: {
      projectData,
      ...(global === undefined ? {} : { global }),
    },
  });
  return engine;
};

const setVariable = (id, variableId, value) => ({
  updateVariable: {
    id,
    operations: [{ variableId, op: "set", value }],
  },
});

describe("RouteEngine random actions", () => {
  it("exposes a typed dice result to nested actions and continues once", () => {
    const engine = createEngine(
      createProjectData({
        extraLines: [{ id: "line2", actions: {} }],
      }),
      createQueuedRandomSource(14),
    );

    engine.handleActions({
      random: {
        distribution: {
          type: "dice",
          sides: 20,
          modifier: 2,
        },
        actions: {
          ...setVariable("storeResult", "result", "_random"),
          conditional: {
            branches: [
              {
                when: { gte: [{ var: "_random.value" }, 15] },
                actions: setVariable("success", "score", "_random.value"),
              },
              { actions: setVariable("failure", "score", -1) },
            ],
          },
        },
      },
    });

    const state = engine.selectSystemState();
    expect(state.contexts[0].variables.result).toEqual({
      type: "dice",
      value: 17,
      rolls: [15],
      keptRolls: [15],
      discardedRolls: [],
      modifier: 2,
    });
    expect(state.contexts[0].variables.score).toBe(17);
    expect(state.contexts[0].pointers.read.lineId).toBe("line2");
  });

  it("runs only the selected weighted outcome actions", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(0xffff_ffff, 0xffff_ffff),
    );

    engine.handleActions({
      random: {
        distribution: {
          type: "weighted",
          outcomes: [
            {
              weight: 3,
              actions: setVariable("common", "selected", "common"),
            },
            {
              weight: 1,
              actions: setVariable("rare", "selected", "rare"),
            },
          ],
        },
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.selected).toBe(
      "rare",
    );
  });

  it("rejects top-level actions and does not expose a weighted result binding", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(0, 0),
    );

    expect(() =>
      engine.handleActions({
        random: {
          distribution: {
            type: "weighted",
            outcomes: [{ weight: 1, actions: {} }],
          },
          actions: {},
        },
      }),
    ).toThrow("does not support top-level actions");

    expect(() =>
      engine.handleActions({
        random: {
          distribution: {
            type: "weighted",
            outcomes: [
              {
                weight: 1,
                actions: setVariable(
                  "invalidWeightedBinding",
                  "selected",
                  "_random.value",
                ),
              },
            ],
          },
        },
      }),
    ).toThrow('requires event context "_random"');
    expect(engine.selectSystemState().contexts[0].variables.selected).toBe("");
  });

  it("shadows nested random context without changing later outer siblings", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(2, 8),
    );

    engine.handleActions({
      random: {
        distribution: { type: "integer", min: 1, max: 10 },
        actions: {
          random: {
            distribution: { type: "integer", min: 1, max: 10 },
            actions: setVariable("inner", "score", "_random.value"),
          },
          ...setVariable("outer", "bonus", "_random.value"),
        },
      },
    });

    const variables = engine.selectSystemState().contexts[0].variables;
    expect(variables.score).toBe(9);
    expect(variables.bonus).toBe(3);
  });

  it("rejects caller injection and prototype traversal of _random", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(0, 0),
    );

    expect(() =>
      engine.handleAction(
        "random",
        {
          distribution: { type: "integer", min: 1, max: 1 },
          actions: {},
        },
        { _random: { value: 99 } },
      ),
    ).toThrow("reserved by RouteEngine");

    expect(() =>
      engine.handleActions({
        random: {
          distribution: { type: "integer", min: 1, max: 1 },
          actions: setVariable("unsafe", "score", "_random.constructor"),
        },
      }),
    ).toThrow("could not be resolved");
  });

  it("rolls back earlier nested mutations when a later binding fails", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(4),
    );

    expect(() =>
      engine.handleActions({
        random: {
          distribution: { type: "integer", min: 1, max: 10 },
          actions: {
            ...setVariable("firstMutation", "score", "_random.value"),
            conditional: {
              branches: [
                {
                  actions: setVariable(
                    "invalidBinding",
                    "bonus",
                    "_random.missing",
                  ),
                },
              ],
            },
          },
        },
      }),
    ).toThrow("could not be resolved");

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(0);
  });

  it("records and replays line outcomes without rerolling on rollback", () => {
    const randomSource = createQueuedRandomSource(6);
    const engine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: { type: "integer", min: 1, max: 10 },
            actions: setVariable("rolled", "score", "_random.value"),
          },
        },
        extraLines: [{ id: "line2", actions: {} }],
      }),
      randomSource,
      { handleLineActions: true },
    );

    let state = engine.selectSystemState();
    expect(state.contexts[0].variables.score).toBe(7);
    expect(state.contexts[0].pointers.read.lineId).toBe("line2");
    expect(randomSource.calls).toBe(1);
    expect(state.contexts[0].rollback.timeline[0]).toMatchObject({
      randomOutcomeVersion: 1,
      randomOutcomes: [
        {
          path: "random",
          ordinal: 0,
          type: "integer",
          result: { type: "integer", value: 7 },
        },
      ],
    });

    engine.handleAction("saveSlot", { slotId: 1, savedAt: 100 });
    engine.handleActions(setVariable("mutate", "score", 0));
    engine.handleAction("loadSlot", { slotId: 1 });
    expect(engine.selectSystemState().contexts[0].variables.score).toBe(7);
    expect(randomSource.calls).toBe(1);

    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });

    state = engine.selectSystemState();
    expect(state.contexts[0].variables.score).toBe(7);
    expect(state.contexts[0].pointers.read.lineId).toBe("line1");
    expect(randomSource.calls).toBe(1);
  });

  it("records and replays the selected weighted branch without rerolling", () => {
    const randomSource = createQueuedRandomSource(0xffff_ffff, 0xffff_ffff, 6);
    const engine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: {
              type: "weighted",
              outcomes: [
                {
                  weight: 1,
                  actions: setVariable("common", "selected", "common"),
                },
                {
                  weight: 3,
                  actions: {
                    ...setVariable("rare", "selected", "rare"),
                    random: {
                      distribution: { type: "integer", min: 1, max: 10 },
                      actions: setVariable(
                        "nestedRoll",
                        "score",
                        "_random.value",
                      ),
                    },
                  },
                },
              ],
            },
          },
        },
        extraLines: [{ id: "line2", actions: {} }],
      }),
      randomSource,
      { handleLineActions: true },
    );

    let state = engine.selectSystemState();
    expect(state.contexts[0].variables.selected).toBe("rare");
    expect(state.contexts[0].rollback.timeline[0]).toMatchObject({
      randomOutcomeVersion: 1,
      randomOutcomes: [
        {
          path: "random",
          ordinal: 0,
          type: "weighted",
          result: { type: "weighted", outcomeIndex: 1 },
        },
        {
          path: "random.distribution.outcomes.1.actions.random",
          ordinal: 0,
          type: "integer",
          result: { type: "integer", value: 7 },
        },
      ],
    });
    expect(state.contexts[0].variables.score).toBe(7);
    expect(randomSource.calls).toBe(3);

    engine.handleActions(setVariable("clear", "selected", ""));
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });

    state = engine.selectSystemState();
    expect(state.contexts[0].variables.selected).toBe("rare");
    expect(state.contexts[0].variables.score).toBe(7);
    expect(randomSource.calls).toBe(3);
  });

  it("drops a recorded weighted branch removed by a project update", () => {
    const randomSource = createQueuedRandomSource(0xffff_ffff, 0xffff_ffff);
    const originalProjectData = createProjectData({
      lineActions: {
        random: {
          distribution: {
            type: "weighted",
            outcomes: [
              { weight: 1, actions: {} },
              {
                weight: 3,
                actions: setVariable("selected", "selected", "rare"),
              },
            ],
          },
        },
      },
      extraLines: [{ id: "line2", actions: {} }],
    });
    const engine = createEngine(originalProjectData, randomSource, {
      handleLineActions: true,
    });
    engine.handleAction("saveSlot", { slotId: 1, savedAt: 100 });

    const replacementProjectData = createProjectData({
      lineActions: {
        random: {
          distribution: {
            type: "weighted",
            outcomes: [{ weight: 1, actions: {} }],
          },
        },
      },
      extraLines: [{ id: "line2", actions: {} }],
    });
    engine.handleAction("updateProjectData", {
      projectData: replacementProjectData,
    });

    const state = engine.selectSystemState();
    expect(state.contexts[0].rollback.timeline[0].randomOutcomes).toEqual([]);
    expect(
      state.global.saveSlots["1"].state.contexts[0].rollback.timeline[0]
        .randomOutcomes,
    ).toEqual([]);
    expect(() =>
      engine.handleAction("rollbackToLine", {
        sectionId: "section1",
        lineId: "line1",
      }),
    ).not.toThrow();
    expect(randomSource.calls).toBe(2);
  });

  it("draws a new result after rolling back past the occurrence", () => {
    const randomSource = createQueuedRandomSource(1, 8);
    const engine = createEngine(
      createProjectData({
        extraLines: [
          {
            id: "line2",
            actions: {
              random: {
                distribution: { type: "integer", min: 1, max: 10 },
                actions: setVariable("rolled", "score", "_random.value"),
              },
            },
          },
          { id: "line3", actions: {} },
        ],
      }),
      randomSource,
      { handleLineActions: true },
    );

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    expect(engine.selectSystemState().contexts[0].variables.score).toBe(2);
    expect(randomSource.calls).toBe(1);

    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });
    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(9);
    expect(randomSource.calls).toBe(2);
  });

  it("records distinct nested paths and replays both scoped results", () => {
    const randomSource = createQueuedRandomSource(2, 8);
    const engine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: { type: "integer", min: 1, max: 10 },
            actions: {
              ...setVariable("outer", "bonus", "_random.value"),
              random: {
                distribution: { type: "integer", min: 1, max: 10 },
                actions: setVariable("inner", "score", "_random.value"),
              },
            },
          },
        },
        extraLines: [{ id: "line2", actions: {} }],
      }),
      randomSource,
      { handleLineActions: true },
    );

    let state = engine.selectSystemState();
    expect(state.contexts[0].rollback.timeline[0].randomOutcomes).toEqual([
      {
        path: "random",
        ordinal: 0,
        type: "integer",
        result: { type: "integer", value: 3 },
      },
      {
        path: "random.actions.random",
        ordinal: 0,
        type: "integer",
        result: { type: "integer", value: 9 },
      },
    ]);

    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });
    state = engine.selectSystemState();
    expect(state.contexts[0].variables.bonus).toBe(3);
    expect(state.contexts[0].variables.score).toBe(9);
    expect(randomSource.calls).toBe(2);
  });

  it("records same-line re-entry as a distinct replay occurrence", () => {
    const randomSource = createQueuedRandomSource(1, 8);
    const engine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: { type: "integer", min: 1, max: 10 },
            actions: setVariable("rolled", "score", "_random.value"),
          },
        },
      }),
      randomSource,
      { handleLineActions: true },
    );

    engine.handleAction("jumpToLine", { lineId: "line1" });

    const occurrences = engine
      .selectSystemState()
      .contexts[0].rollback.timeline.filter(
        ({ randomOutcomeVersion }) => randomOutcomeVersion === 1,
      );
    expect(occurrences).toHaveLength(2);
    expect(
      occurrences.map(({ randomOutcomes }) => randomOutcomes[0].result.value),
    ).toEqual([2, 9]);
    expect(randomSource.calls).toBe(2);
  });

  it("keeps outcomes on the source occurrence when an earlier sibling navigates", () => {
    const randomSource = createQueuedRandomSource(6);
    const engine = createEngine(
      createProjectData({
        lineActions: {
          jumpToLine: { lineId: "line2" },
          random: {
            distribution: { type: "integer", min: 1, max: 10 },
            actions: setVariable("rolled", "score", "_random.value"),
          },
        },
        extraLines: [
          { id: "line2", actions: {} },
          { id: "line3", actions: {} },
        ],
      }),
      randomSource,
      { handleLineActions: true },
    );

    let state = engine.selectSystemState();
    expect(state.contexts[0].rollback.timeline[0]).toMatchObject({
      sectionId: "section1",
      lineId: "line1",
      randomOutcomes: [
        {
          path: "random",
          ordinal: 0,
          type: "integer",
          result: { type: "integer", value: 7 },
        },
      ],
    });

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleActions(setVariable("clear", "score", 0));
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });

    state = engine.selectSystemState();
    expect(state.contexts[0].variables.score).toBe(7);
    expect(randomSource.calls).toBe(1);
  });

  it("drops active and saved outcomes orphaned by a project update", () => {
    const randomSource = createQueuedRandomSource(6);
    const originalProjectData = createProjectData({
      lineActions: {
        random: {
          distribution: { type: "integer", min: 1, max: 10 },
          actions: setVariable("rolled", "score", "_random.value"),
        },
      },
      extraLines: [{ id: "line2", actions: {} }],
    });
    const engine = createEngine(originalProjectData, randomSource, {
      handleLineActions: true,
    });
    engine.handleAction("saveSlot", { slotId: 1, savedAt: 100 });

    const replacementProjectData = createProjectData({
      lineActions: {
        random: {
          distribution: { type: "dice", sides: 6 },
          actions: setVariable("rolled", "score", "_random.value"),
        },
      },
      extraLines: [{ id: "line2", actions: {} }],
    });
    engine.handleAction("updateProjectData", {
      projectData: replacementProjectData,
    });

    let state = engine.selectSystemState();
    expect(state.contexts[0].rollback.timeline[0].randomOutcomes).toEqual([]);
    expect(
      state.global.saveSlots["1"].state.contexts[0].rollback.timeline[0]
        .randomOutcomes,
    ).toEqual([]);
    expect(() =>
      engine.handleAction("rollbackToLine", {
        sectionId: "section1",
        lineId: "line1",
      }),
    ).not.toThrow();
    state = engine.selectSystemState();
    expect(state.contexts[0].variables.score).toBe(0);
    expect(randomSource.calls).toBe(1);
  });

  it("retains outcomes that still match a nested canonical action", () => {
    const projectData = createProjectData({
      lineActions: {
        conditional: {
          branches: [
            {
              actions: {
                random: {
                  distribution: { type: "integer", min: 1, max: 10 },
                  actions: setVariable("rolled", "score", "_random.value"),
                },
              },
            },
          ],
        },
      },
      extraLines: [{ id: "line2", actions: {} }],
    });
    const engine = createEngine(projectData, createQueuedRandomSource(5), {
      handleLineActions: true,
    });
    engine.handleAction("saveSlot", { slotId: 1, savedAt: 100 });
    engine.handleAction("updateProjectData", {
      projectData: structuredClone(projectData),
    });

    const state = engine.selectSystemState();
    const expectedOutcome = {
      path: "conditional.branches.0.actions.random",
      ordinal: 0,
      type: "integer",
      result: { type: "integer", value: 6 },
    };
    expect(state.contexts[0].rollback.timeline[0].randomOutcomes).toEqual([
      expectedOutcome,
    ]);
    expect(
      state.global.saveSlots["1"].state.contexts[0].rollback.timeline[0]
        .randomOutcomes,
    ).toEqual([expectedOutcome]);
  });

  it("drops an orphaned outcome when loading an older save", () => {
    const originalEngine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: { type: "integer", min: 1, max: 10 },
            actions: setVariable("rolled", "score", "_random.value"),
          },
        },
        extraLines: [{ id: "line2", actions: {} }],
      }),
      createQueuedRandomSource(3),
      { handleLineActions: true },
    );
    originalEngine.handleAction("saveSlot", { slotId: 1, savedAt: 100 });
    const saveSlots = originalEngine.selectSystemState().global.saveSlots;

    const replacementProjectData = createProjectData({
      lineActions: {
        random: {
          distribution: { type: "chance", probability: 0.5 },
          actions: {},
        },
      },
      extraLines: [{ id: "line2", actions: {} }],
    });
    const engine = createEngine(
      replacementProjectData,
      createQueuedRandomSource(),
      { global: { saveSlots } },
    );

    expect(() => engine.handleAction("loadSlot", { slotId: 1 })).not.toThrow();
    expect(
      engine.selectSystemState().contexts[0].rollback.timeline[0]
        .randomOutcomes,
    ).toEqual([]);
  });

  it("rejects malformed saved ledgers transactionally during project updates", () => {
    const projectData = createProjectData({
      lineActions: {
        random: {
          distribution: { type: "integer", min: 1, max: 10 },
          actions: {},
        },
      },
      extraLines: [{ id: "line2", actions: {} }],
    });
    const originalEngine = createEngine(
      projectData,
      createQueuedRandomSource(2),
      { handleLineActions: true },
    );
    originalEngine.handleAction("saveSlot", { slotId: 1, savedAt: 100 });
    const saveSlots = originalEngine.selectSystemState().global.saveSlots;
    const randomOutcomes =
      saveSlots["1"].state.contexts[0].rollback.timeline[0].randomOutcomes;
    randomOutcomes.push(structuredClone(randomOutcomes[0]));

    const engine = createEngine(projectData, createQueuedRandomSource(), {
      global: { saveSlots },
    });
    const before = engine.selectSystemState();

    expect(() =>
      engine.handleAction("updateProjectData", {
        projectData: structuredClone(projectData),
      }),
    ).toThrow("invalid rollback random outcome at index 1");
    expect(engine.selectSystemState()).toEqual(before);
  });
});
