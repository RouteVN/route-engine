import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const MAX_WORD = 0xffff_ffff;

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
      weather: { type: "string", scope: "context", default: "" },
      lucky: { type: "boolean", scope: "context", default: false },
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
  const initialState = { projectData };
  if (global !== undefined) {
    initialState.global = global;
  }
  engine.init({ initialState });
  return engine;
};

const rollInteger = (variableId, min, max) => ({
  variableId,
  op: "random",
  distribution: { type: "integer", min, max },
});

const rollWeather = {
  variableId: "weather",
  op: "random",
  distribution: {
    type: "weighted",
    values: [
      { weight: 3, value: "sunny" },
      { weight: 0, value: "snow" },
      { weight: 1, value: "rain" },
    ],
  },
};

const updateVariable = (...operations) => ({
  updateVariable: { id: "roll", operations },
});

const selectVariables = (engine) =>
  engine.selectSystemState().contexts[0].variables;

const selectTimeline = (engine) =>
  engine.selectSystemState().contexts[0].rollback.timeline;

describe("RouteEngine updateVariable random operation", () => {
  it("runs operations in list order around an integer roll", () => {
    const randomSource = createQueuedRandomSource(6);
    const engine = createEngine(createProjectData(), randomSource);

    engine.handleActions(
      updateVariable(
        { variableId: "score", op: "set", value: 100 },
        rollInteger("score", 1, 10),
        { variableId: "score", op: "increment", value: 2 },
      ),
    );

    expect(selectVariables(engine).score).toBe(9);
    expect(randomSource.calls).toBe(1);
  });

  it("rolls every random operation of one action separately", () => {
    const randomSource = createQueuedRandomSource(0, 9);
    const engine = createEngine(createProjectData(), randomSource);

    engine.handleActions(
      updateVariable(rollInteger("score", 1, 10), rollInteger("bonus", 1, 10)),
    );

    expect(selectVariables(engine)).toMatchObject({ score: 1, bonus: 10 });
    expect(randomSource.calls).toBe(2);
  });

  it("stores the selected weighted value and never a zero-weight one", () => {
    const first = createEngine(
      createProjectData(),
      createQueuedRandomSource(0, 0),
    );
    first.handleActions(updateVariable(rollWeather));
    expect(selectVariables(first).weather).toBe("sunny");

    const last = createEngine(
      createProjectData(),
      createQueuedRandomSource(MAX_WORD, MAX_WORD),
    );
    last.handleActions(updateVariable(rollWeather));
    expect(selectVariables(last).weather).toBe("rain");
  });

  it("stores weighted boolean and number values", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(0, 0, MAX_WORD, MAX_WORD),
    );

    engine.handleActions(
      updateVariable(
        {
          variableId: "lucky",
          op: "random",
          distribution: {
            type: "weighted",
            values: [
              { weight: 1, value: true },
              { weight: 1, value: false },
            ],
          },
        },
        {
          variableId: "score",
          op: "random",
          distribution: {
            type: "weighted",
            values: [
              { weight: 1, value: 0.5 },
              { weight: 1, value: 250 },
            ],
          },
        },
      ),
    );

    expect(selectVariables(engine)).toMatchObject({ lucky: true, score: 250 });
  });

  it("rolls through the direct action API", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(4),
    );

    engine.handleAction("updateVariable", {
      id: "roll",
      operations: [rollInteger("score", 1, 10)],
    });

    expect(selectVariables(engine).score).toBe(5);
  });

  it("refuses an invalid operation before drawing", () => {
    const cases = [
      [rollInteger("missing", 1, 10), "must reference a writable variable"],
      [
        rollInteger("readonlyScore", 1, 10),
        "must reference a writable variable",
      ],
      [
        rollInteger("computedScore", 1, 10),
        "must reference a writable variable",
      ],
      [rollInteger("weather", 1, 10), "needs a number variable"],
      [rollInteger("score", 10, 1), "random integer range must contain"],
      [rollInteger("score", 1.5, 10), "min must be a safe integer"],
      [{ ...rollInteger("score", 1, 10), value: 3 }, "does not support value"],
      [
        { variableId: "score", op: "random" },
        "random distribution must be an object",
      ],
      [
        { variableId: "score", op: "random", distribution: { type: "normal" } },
        'distribution.type must be "integer" or "weighted"',
      ],
      [
        { ...rollWeather, variableId: "score" },
        "does not match the number variable",
      ],
      [
        {
          variableId: "result",
          op: "random",
          distribution: {
            type: "weighted",
            values: [{ weight: 1, value: { nested: true } }],
          },
        },
        "value must be a string, a finite number or a boolean",
      ],
      [
        {
          variableId: "weather",
          op: "random",
          distribution: {
            type: "weighted",
            values: [{ weight: 0, value: "sunny" }],
          },
        },
        "total weight must be positive",
      ],
      [
        {
          variableId: "weather",
          op: "random",
          distribution: { type: "weighted", values: [] },
        },
        "must contain from 1 through 1000 items",
      ],
    ];

    cases.forEach(([operation, message]) => {
      const randomSource = createQueuedRandomSource(0, 0);
      const engine = createEngine(createProjectData(), randomSource);

      expect(() => engine.handleActions(updateVariable(operation))).toThrow(
        message,
      );
      expect(randomSource.calls).toBe(0);
      expect(selectVariables(engine).score).toBe(0);
    });
  });

  it("refuses a random operation that comes out of a template", () => {
    const randomSource = createQueuedRandomSource(0);
    const engine = createEngine(createProjectData(), randomSource);

    expect(() =>
      engine.handleActions(
        updateVariable(rollInteger("score", 1, "${variables.bonus}")),
      ),
    ).toThrow("does not support templates");
    expect(randomSource.calls).toBe(0);
  });

  it("keeps no roll when a later operation fails", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(4),
    );

    expect(() =>
      engine.handleActions(
        updateVariable(rollInteger("score", 1, 10), {
          variableId: "bonus",
          op: "set",
          value: "invalid",
        }),
      ),
    ).toThrow('requires value to be a number for variable "bonus"');

    expect(selectVariables(engine).score).toBe(0);
  });

  it("does not continue to the next line by itself", () => {
    const engine = createEngine(
      createProjectData({
        lineActions: updateVariable(rollInteger("score", 1, 10)),
        extraLines: [{ id: "line2", actions: {} }],
      }),
      createQueuedRandomSource(6),
      { handleLineActions: true },
    );

    const state = engine.selectSystemState();
    expect(state.contexts[0].variables.score).toBe(7);
    expect(state.contexts[0].pointers.read.lineId).toBe("line1");
  });

  it("records a line roll and replays it without rerolling", () => {
    const randomSource = createQueuedRandomSource(6, 0, 0);
    const engine = createEngine(
      createProjectData({
        lineActions: updateVariable(
          rollInteger("score", 1, 10),
          { variableId: "score", op: "increment", value: 2 },
          rollWeather,
        ),
        extraLines: [{ id: "line2", actions: {} }],
      }),
      randomSource,
      { handleLineActions: true },
    );

    expect(selectVariables(engine)).toMatchObject({
      score: 9,
      weather: "sunny",
    });
    expect(randomSource.calls).toBe(3);
    expect(selectTimeline(engine)[0]).toMatchObject({
      randomOutcomeVersion: 1,
      randomOutcomes: [
        {
          path: "updateVariable.operations.0",
          ordinal: 0,
          type: "integer",
          result: { type: "integer", value: 7 },
        },
        {
          path: "updateVariable.operations.2",
          ordinal: 0,
          type: "weighted",
          result: { type: "weighted", outcomeIndex: 0 },
        },
      ],
    });

    engine.handleAction("saveSlot", { slotId: 1, savedAt: 100 });
    engine.handleActions({
      updateVariable: {
        id: "mutate",
        operations: [
          { variableId: "score", op: "set", value: 0 },
          { variableId: "weather", op: "set", value: "changed" },
        ],
      },
    });
    engine.handleAction("loadSlot", { slotId: 1 });
    expect(selectVariables(engine)).toMatchObject({
      score: 9,
      weather: "sunny",
    });

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });

    expect(selectVariables(engine)).toMatchObject({
      score: 9,
      weather: "sunny",
    });
    expect(randomSource.calls).toBe(3);
  });

  it("rolls again after rolling back past the line", () => {
    const randomSource = createQueuedRandomSource(1, 8);
    const engine = createEngine(
      createProjectData({
        extraLines: [
          {
            id: "line2",
            actions: updateVariable(rollInteger("score", 1, 10)),
          },
        ],
      }),
      randomSource,
      { handleLineActions: true },
    );

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    expect(selectVariables(engine).score).toBe(2);

    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });
    expect(selectVariables(engine).score).toBe(0);
    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});

    expect(selectVariables(engine).score).toBe(9);
    expect(randomSource.calls).toBe(2);
  });

  it("records an interaction roll as the value it set", () => {
    const randomSource = createQueuedRandomSource(6);
    const engine = createEngine(
      createProjectData({ extraLines: [{ id: "line2", actions: {} }] }),
      randomSource,
      { handleLineActions: true },
    );

    engine.handleActions(updateVariable(rollInteger("score", 1, 10)));

    expect(selectVariables(engine).score).toBe(7);
    expect(selectTimeline(engine)[0].randomOutcomes).toBeUndefined();
    expect(selectTimeline(engine)[0].executedActions).toEqual([
      {
        type: "updateVariable",
        payload: {
          id: "roll",
          operations: [{ variableId: "score", op: "set", value: 7 }],
        },
      },
    ]);

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });

    expect(selectVariables(engine).score).toBe(7);
    expect(randomSource.calls).toBe(1);
  });

  it("rolls into a device variable without recording the roll", () => {
    const engine = createEngine(
      createProjectData({
        lineActions: updateVariable(rollInteger("deviceScore", 1, 10)),
      }),
      createQueuedRandomSource(6),
      { handleLineActions: true },
    );

    expect(engine.selectSystemState().global.variables.deviceScore).toBe(7);
    expect(selectTimeline(engine)[0].randomOutcomes).toBeUndefined();
  });

  it("records a nested roll under its structural path", () => {
    const projectData = createProjectData({
      lineActions: {
        conditional: {
          branches: [{ actions: updateVariable(rollInteger("score", 1, 10)) }],
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

    const expectedOutcome = {
      path: "conditional.branches.0.actions.updateVariable.operations.0",
      ordinal: 0,
      type: "integer",
      result: { type: "integer", value: 6 },
    };
    const state = engine.selectSystemState();
    expect(state.contexts[0].rollback.timeline[0].randomOutcomes).toEqual([
      expectedOutcome,
    ]);
    expect(
      state.global.saveSlots["1"].state.contexts[0].rollback.timeline[0]
        .randomOutcomes,
    ).toEqual([expectedOutcome]);
  });

  it("drops recorded rolls that a project update no longer matches", () => {
    const replacements = [
      // The roll is outside the new range.
      updateVariable(rollInteger("score", 1, 5)),
      // The operation is no longer a roll.
      updateVariable({ variableId: "score", op: "set", value: 1 }),
      // The roll now targets a variable of another type.
      updateVariable(rollWeather),
      // The action is gone.
      {},
    ];

    replacements.forEach((lineActions) => {
      const randomSource = createQueuedRandomSource(6);
      const engine = createEngine(
        createProjectData({
          lineActions: updateVariable(rollInteger("score", 1, 10)),
          extraLines: [{ id: "line2", actions: {} }],
        }),
        randomSource,
        { handleLineActions: true },
      );
      engine.handleAction("saveSlot", { slotId: 1, savedAt: 100 });

      engine.handleAction("updateProjectData", {
        projectData: createProjectData({
          lineActions,
          extraLines: [{ id: "line2", actions: {} }],
        }),
      });

      const state = engine.selectSystemState();
      expect(state.contexts[0].rollback.timeline[0].randomOutcomes).toEqual([]);
      expect(
        state.global.saveSlots["1"].state.contexts[0].rollback.timeline[0]
          .randomOutcomes,
      ).toEqual([]);
      expect(randomSource.calls).toBe(1);
    });
  });

  it("leaves a roll with no record out when the line is replayed", () => {
    const randomSource = createQueuedRandomSource(6);
    const engine = createEngine(
      createProjectData({
        lineActions: updateVariable(rollInteger("score", 1, 10)),
        extraLines: [{ id: "line2", actions: {} }],
      }),
      randomSource,
      { handleLineActions: true },
    );

    engine.handleAction("updateProjectData", {
      projectData: createProjectData({
        lineActions: updateVariable(rollInteger("score", 1, 5), {
          variableId: "score",
          op: "increment",
          value: 2,
        }),
        extraLines: [{ id: "line2", actions: {} }],
      }),
    });
    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });

    expect(selectVariables(engine).score).toBe(2);
    expect(randomSource.calls).toBe(1);
  });

  it("keeps a recorded weighted value index that still exists", () => {
    const randomSource = createQueuedRandomSource(MAX_WORD, MAX_WORD);
    const engine = createEngine(
      createProjectData({
        lineActions: updateVariable(rollWeather),
        extraLines: [{ id: "line2", actions: {} }],
      }),
      randomSource,
      { handleLineActions: true },
    );
    expect(selectVariables(engine).weather).toBe("rain");

    const renamed = structuredClone(rollWeather);
    renamed.distribution.values[2].value = "storm";
    engine.handleAction("updateProjectData", {
      projectData: createProjectData({
        lineActions: updateVariable(renamed),
        extraLines: [{ id: "line2", actions: {} }],
      }),
    });
    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });

    expect(selectVariables(engine).weather).toBe("storm");
    expect(randomSource.calls).toBe(2);
  });

  it("maps every word of a range to its own integer", () => {
    const rolled = [0, 1, 2, 3, 4, 5].map((word) => {
      const engine = createEngine(
        createProjectData(),
        createQueuedRandomSource(word),
      );
      engine.handleActions(updateVariable(rollInteger("score", 1, 6)));
      return selectVariables(engine).score;
    });

    expect(rolled).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("selects weighted values in proportion to their weights", () => {
    const counts = { sunny: 0, snow: 0, rain: 0 };
    for (let step = 0; step < 16; step += 1) {
      const engine = createEngine(
        createProjectData(),
        createQueuedRandomSource(step * 0x1000_0000, 0),
      );
      engine.handleActions(updateVariable(rollWeather));
      counts[selectVariables(engine).weather] += 1;
    }

    expect(counts).toEqual({ sunny: 12, snow: 0, rain: 4 });
  });

  it("lets a conditional of the same batch read the roll", () => {
    const actions = {
      conditional: {
        branches: [
          {
            when: { gte: [{ var: "variables.score" }, 15] },
            actions: {
              updateVariable: {
                id: "high",
                operations: [
                  { variableId: "weather", op: "set", value: "high" },
                ],
              },
            },
          },
          {
            actions: {
              updateVariable: {
                id: "low",
                operations: [
                  { variableId: "weather", op: "set", value: "low" },
                ],
              },
            },
          },
        ],
      },
      ...updateVariable(rollInteger("score", 1, 20)),
    };
    const randomSource = createQueuedRandomSource(16, 3);
    const engine = createEngine(
      createProjectData({
        lineActions: actions,
        extraLines: [
          { id: "line2", actions: {} },
          { id: "line3", actions: {} },
        ],
      }),
      randomSource,
      { handleLineActions: true },
    );

    // The conditional continues to line2 by itself.
    expect(selectVariables(engine)).toMatchObject({
      score: 17,
      weather: "high",
    });
    expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
      "line2",
    );

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line2",
    });

    expect(selectVariables(engine)).toMatchObject({
      score: 17,
      weather: "high",
    });
    expect(randomSource.calls).toBe(1);
  });

  it("records a roll inside a weighted random outcome", () => {
    const randomSource = createQueuedRandomSource(0, 0, 6);
    const engine = createEngine(
      createProjectData({
        lineActions: {
          random: {
            distribution: {
              type: "weighted",
              outcomes: [
                {
                  weight: 1,
                  actions: updateVariable(rollInteger("score", 1, 10)),
                },
                { weight: 1, actions: {} },
              ],
            },
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

    expect(selectVariables(engine).score).toBe(7);
    expect(selectTimeline(engine)[0].randomOutcomes).toEqual([
      {
        path: "random",
        ordinal: 0,
        type: "weighted",
        result: { type: "weighted", outcomeIndex: 0 },
      },
      {
        path: "random.distribution.outcomes.0.actions.updateVariable.operations.0",
        ordinal: 0,
        type: "integer",
        result: { type: "integer", value: 7 },
      },
    ]);

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line2",
    });

    expect(selectVariables(engine).score).toBe(7);
    expect(randomSource.calls).toBe(3);
  });

  it("records entering the same line again as its own roll", () => {
    const randomSource = createQueuedRandomSource(1, 8);
    const engine = createEngine(
      createProjectData({
        lineActions: updateVariable(rollInteger("score", 1, 10)),
      }),
      randomSource,
      { handleLineActions: true },
    );

    engine.handleAction("jumpToLine", { lineId: "line1" });

    const occurrences = selectTimeline(engine).filter(
      ({ randomOutcomeVersion }) => randomOutcomeVersion === 1,
    );
    expect(
      occurrences.map(({ randomOutcomes }) => randomOutcomes[0].result.value),
    ).toEqual([2, 9]);
    expect(selectVariables(engine).score).toBe(9);
  });

  it("renders templates of the other operations of the action", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(6),
    );

    engine.handleActions(
      updateVariable(rollInteger("score", 1, 10), {
        variableId: "bonus",
        op: "set",
        value: "${variables.score}",
      }),
    );

    // The template is rendered before the action runs, so it reads the score
    // from before the roll.
    expect(selectVariables(engine)).toMatchObject({ score: 7, bonus: 0 });
  });

  it("refuses an operation that a template turns into a roll", () => {
    const projectData = createProjectData();
    projectData.resources.variables.operationName = {
      type: "string",
      scope: "context",
      default: "random",
    };
    const randomSource = createQueuedRandomSource(0);
    const engine = createEngine(projectData, randomSource);

    expect(() =>
      engine.handleActions(
        updateVariable({
          ...rollInteger("score", 1, 10),
          op: "${variables.operationName}",
        }),
      ),
    ).toThrow("does not support templates");
    expect(randomSource.calls).toBe(0);
  });

  it("drops a recorded roll when an older save is loaded into a changed project", () => {
    const original = createEngine(
      createProjectData({
        lineActions: updateVariable(rollInteger("score", 1, 10)),
        extraLines: [{ id: "line2", actions: {} }],
      }),
      createQueuedRandomSource(6),
      { handleLineActions: true },
    );
    original.handleAction("saveSlot", { slotId: 1, savedAt: 100 });
    const saveSlots = original.selectSystemState().global.saveSlots;

    const randomSource = createQueuedRandomSource();
    const engine = createEngine(
      createProjectData({
        lineActions: updateVariable(rollInteger("score", 1, 5)),
        extraLines: [{ id: "line2", actions: {} }],
      }),
      randomSource,
      { global: { saveSlots: structuredClone(saveSlots) } },
    );

    expect(() => engine.handleAction("loadSlot", { slotId: 1 })).not.toThrow();
    expect(selectTimeline(engine)[0].randomOutcomes).toEqual([]);
    expect(randomSource.calls).toBe(0);
  });

  it("never rerolls a save that has no recorded rolls", () => {
    const original = createEngine(
      createProjectData({
        lineActions: updateVariable(rollInteger("score", 1, 10), {
          variableId: "bonus",
          op: "increment",
          value: 5,
        }),
        extraLines: [{ id: "line2", actions: {} }],
      }),
      createQueuedRandomSource(6),
      { handleLineActions: true },
    );
    original.handleAction("saveSlot", { slotId: 1, savedAt: 100 });
    const saveSlots = structuredClone(
      original.selectSystemState().global.saveSlots,
    );
    saveSlots["1"].state.contexts[0].rollback.timeline.forEach((checkpoint) => {
      delete checkpoint.randomOutcomeVersion;
      delete checkpoint.randomOutcomes;
    });

    const randomSource = createQueuedRandomSource();
    const engine = createEngine(
      createProjectData({
        lineActions: updateVariable(rollInteger("score", 1, 10), {
          variableId: "bonus",
          op: "increment",
          value: 5,
        }),
        extraLines: [{ id: "line2", actions: {} }],
      }),
      randomSource,
      { global: { saveSlots } },
    );

    engine.handleAction("loadSlot", { slotId: 1 });
    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });

    // The roll is left out and the other operation still runs.
    expect(selectVariables(engine)).toMatchObject({ score: 0, bonus: 7 });
    expect(randomSource.calls).toBe(0);
  });

  it("replays generated rolls identically across save, load and rollback", () => {
    // A small linear congruential generator makes the cases reproducible.
    let seed = 0x1234_5678;
    const nextWord = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };

    for (let round = 0; round < 150; round += 1) {
      const min = (nextWord() % 2001) - 1000;
      const max = min + (nextWord() % 1000);
      const weights = [1, 2, 3, 4].map(() => nextWord() % 5);
      weights[nextWord() % 4] += 1;
      const rollText = {
        variableId: "weather",
        op: "random",
        distribution: {
          type: "weighted",
          values: weights.map((weight, index) => ({
            weight,
            value: `value${index}`,
          })),
        },
      };
      let calls = 0;
      const randomSource = {
        nextUint32() {
          calls += 1;
          return nextWord();
        },
      };
      const engine = createEngine(
        createProjectData({
          lineActions: updateVariable(
            rollInteger("score", min, max),
            rollText,
            rollInteger("bonus", min, max),
          ),
          extraLines: [{ id: "line2", actions: {} }],
        }),
        randomSource,
        { handleLineActions: true },
      );

      const rolled = { ...selectVariables(engine) };
      const drawn = calls;
      expect(rolled.score).toBeGreaterThanOrEqual(min);
      expect(rolled.score).toBeLessThanOrEqual(max);
      expect(rolled.bonus).toBeGreaterThanOrEqual(min);
      expect(rolled.bonus).toBeLessThanOrEqual(max);
      const valueIndex = Number(rolled.weather.slice("value".length));
      expect(weights[valueIndex]).toBeGreaterThan(0);

      engine.handleAction("saveSlot", { slotId: 1, savedAt: 100 });
      engine.handleAction("markLineCompleted", {});
      engine.handleAction("nextLine", {});
      engine.handleAction("rollbackToLine", {
        sectionId: "section1",
        lineId: "line1",
      });
      expect(selectVariables(engine)).toEqual(rolled);

      engine.handleActions({
        updateVariable: {
          id: "mutate",
          operations: [{ variableId: "score", op: "set", value: 5000 }],
        },
      });
      engine.handleAction("loadSlot", { slotId: 1 });
      expect(selectVariables(engine)).toEqual(rolled);
      expect(calls).toBe(drawn);
    }
  });
});
