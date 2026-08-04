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
  { handleLineActions = false } = {},
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
  engine.init({ initialState: { projectData } });
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
          modifier: "${variables.bonus}",
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

  it("keeps weighted values literal after direct binding resolution", () => {
    const engine = createEngine(
      createProjectData(),
      createQueuedRandomSource(0, 0),
    );

    engine.handleActions({
      random: {
        distribution: {
          type: "weighted",
          outcomes: [
            { value: "${variables.score}", weight: "${variables.bonus}" },
          ],
        },
        actions: setVariable("literal", "selected", "_random.value"),
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.selected).toBe(
      "${variables.score}",
    );
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
});
