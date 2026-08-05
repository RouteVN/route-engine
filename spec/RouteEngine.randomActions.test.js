import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import { selectCanRollback } from "../src/stores/system.store.js";

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
      readonlyScore: {
        type: "number",
        scope: "context",
        default: 0,
        readonly: true,
      },
      computedScore: {
        type: "number",
        scope: "context",
        computed: { expr: 1 },
      },
      deviceScore: { type: "number", scope: "device", default: 0 },
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
  it("stores the dice total before later actions and continues once", () => {
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
        variableId: "score",
      },
      conditional: {
        branches: [
          {
            when: { gte: [{ var: "variables.score" }, 15] },
            actions: setVariable("success", "bonus", "${variables.score}"),
          },
          { actions: setVariable("failure", "bonus", -1) },
        ],
      },
    });

    const state = engine.selectSystemState();
    expect(state.contexts[0].variables.score).toBe(17);
    expect(state.contexts[0].variables.bonus).toBe(17);
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

  it("enforces dice and weighted payload ownership", () => {
    const randomSource = createQueuedRandomSource(0, 0);
    const engine = createEngine(createProjectData(), randomSource);

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
    ).toThrow("random action.actions is not supported");

    expect(() =>
      engine.handleActions({
        random: {
          distribution: {
            type: "weighted",
            outcomes: [{ weight: 1, actions: {} }],
          },
          variableId: "score",
        },
      }),
    ).toThrow("does not support variableId");

    expect(() =>
      engine.handleActions({
        random: {
          distribution: { type: "dice", sides: 6 },
        },
      }),
    ).toThrow("requires variableId");

    for (const variableId of [
      "result",
      "missingScore",
      "readonlyScore",
      "computedScore",
      "deviceScore",
    ]) {
      expect(() =>
        engine.handleActions({
          random: {
            distribution: { type: "dice", sides: 6 },
            variableId,
          },
        }),
      ).toThrow("writable context number variable");
    }
    expect(randomSource.calls).toBe(0);
  });

  it("rolls back the stored dice value when a later sibling fails", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(4),
    );

    expect(() =>
      engine.handleActions({
        random: {
          distribution: { type: "dice", sides: 10 },
          variableId: "score",
        },
        ...setVariable("invalidValue", "bonus", "invalid"),
      }),
    ).toThrow('requires value to be a number for variable "bonus"');

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(0);
  });

  it("records and replays line outcomes without rerolling on rollback", () => {
    const randomSource = createQueuedRandomSource(6);
    const engine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: { type: "dice", sides: 10 },
            variableId: "score",
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
          type: "dice",
          result: {
            type: "dice",
            value: 7,
            rolls: [7],
            keptRolls: [7],
            discardedRolls: [],
            modifier: 0,
          },
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

  it("marks an auto-continuing line random action as a transient Back source", () => {
    const engine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: { type: "dice", sides: 10 },
            variableId: "score",
          },
        },
        extraLines: [{ id: "line2", actions: {} }],
      }),
      createQueuedRandomSource(6),
      { handleLineActions: true },
    );

    const state = engine.selectSystemState();
    expect(state.contexts[0].pointers.read.lineId).toBe("line2");
    expect(state.contexts[0].rollback.timeline[0].returnable).toBe(false);
    expect(selectCanRollback({ state })).toBe(false);

    engine.handleAction("rollbackByOffset", {});
    expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
      "line2",
    );
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
                      distribution: { type: "dice", sides: 10 },
                      variableId: "score",
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
          type: "dice",
          result: {
            type: "dice",
            value: 7,
            rolls: [7],
            keptRolls: [7],
            discardedRolls: [],
            modifier: 0,
          },
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

  it("renders ordinary variable templates in weighted rollback replay", () => {
    const randomSource = createQueuedRandomSource(0, 0);
    const engine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: {
              type: "weighted",
              outcomes: [
                {
                  weight: 1,
                  actions: setVariable(
                    "templatedValue",
                    "score",
                    "${variables.bonus}",
                  ),
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

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(2);
    expect(() =>
      engine.handleAction("rollbackToLine", {
        sectionId: "section1",
        lineId: "line1",
      }),
    ).not.toThrow();
    expect(engine.selectSystemState().contexts[0].variables.score).toBe(2);
    expect(randomSource.calls).toBe(2);
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
                distribution: { type: "dice", sides: 10 },
                variableId: "score",
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

  it("records same-line re-entry as a distinct replay occurrence", () => {
    const randomSource = createQueuedRandomSource(1, 8);
    const engine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: { type: "dice", sides: 10 },
            variableId: "score",
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
            distribution: { type: "dice", sides: 10 },
            variableId: "score",
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
          type: "dice",
          result: {
            type: "dice",
            value: 7,
            rolls: [7],
            keptRolls: [7],
            discardedRolls: [],
            modifier: 0,
          },
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
          distribution: { type: "dice", sides: 10 },
          variableId: "score",
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
                  distribution: { type: "dice", sides: 10 },
                  variableId: "score",
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
      type: "dice",
      result: {
        type: "dice",
        value: 6,
        rolls: [6],
        keptRolls: [6],
        discardedRolls: [],
        modifier: 0,
      },
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
            distribution: { type: "dice", sides: 10 },
            variableId: "score",
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
          distribution: {
            type: "weighted",
            outcomes: [{ weight: 1, actions: {} }],
          },
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
          distribution: { type: "dice", sides: 10 },
          variableId: "score",
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

  it("rejects unsupported persisted outcome versions transactionally", () => {
    const projectData = createProjectData({
      lineActions: {
        random: {
          distribution: { type: "dice", sides: 10 },
          variableId: "score",
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
    saveSlots["1"].state.contexts[0].rollback.timeline[0].randomOutcomeVersion =
      2;

    const engine = createEngine(projectData, createQueuedRandomSource(), {
      global: { saveSlots },
    });
    const before = engine.selectSystemState();

    expect(() => engine.handleAction("loadSlot", { slotId: 1 })).toThrow(
      "unsupported rollback random outcome version: 2",
    );
    expect(engine.selectSystemState()).toEqual(before);
    expect(() =>
      engine.handleAction("updateProjectData", {
        projectData: structuredClone(projectData),
      }),
    ).toThrow("unsupported rollback random outcome version: 2");
    expect(engine.selectSystemState()).toEqual(before);
  });
});
