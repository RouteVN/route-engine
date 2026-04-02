import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createMinimalProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {},
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    characters: {},
    variables: {},
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
            lines: [{ id: "line1", actions: {} }],
          },
        },
      },
    },
  },
});

const createRollbackChoiceProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {},
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    characters: {},
    variables: {
      score: {
        type: "number",
        scope: "context",
        default: 0,
      },
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
        initialSectionId: "source",
        sections: {
          source: {
            lines: [{ id: "line1", actions: {} }],
          },
          result: {
            lines: [
              {
                id: "line1",
                actions: {
                  dialogue: {
                    content: [{ text: "Result" }],
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
});

const createRouteEngineWithInlineEffects = () => {
  let engine;
  const handlePendingEffects = (pendingEffects) => {
    pendingEffects.forEach((effect) => {
      if (effect.name === "handleLineActions") {
        engine.handleLineActions();
      }
    });
  };

  engine = createRouteEngine({ handlePendingEffects });
  return engine;
};

describe("RouteEngine selectSystemState", () => {
  it("returns a cloned system-state snapshot", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        global: {
          nextLineConfig: {
            manual: { enabled: true, requireLineCompleted: false },
            auto: { enabled: false },
          },
        },
        projectData: createMinimalProjectData(),
      },
    });

    const firstSnapshot = engine.selectSystemState();
    firstSnapshot.global.nextLineConfig.manual.enabled = false;

    const secondSnapshot = engine.selectSystemState();

    expect(secondSnapshot.global.nextLineConfig.manual.enabled).toBe(true);
  });

  it("does not expose the old one-off engine selectors", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    expect(engine.selectCurrentPointer).toBeUndefined();
    expect(engine.selectCurrentLine).toBeUndefined();
    expect(engine.selectNextLineConfig).toBeUndefined();
  });

  it("records a mixed interaction batch on the checkpoint where the batch started", () => {
    const engine = createRouteEngineWithInlineEffects();

    engine.init({
      initialState: {
        global: {
          variables: {},
        },
        projectData: createRollbackChoiceProjectData(),
      },
    });

    engine.handleActions({
      sectionTransition: {
        sectionId: "result",
      },
      updateVariable: {
        id: "chooseA15",
        operations: [
          {
            variableId: "score",
            op: "set",
            value: 15,
          },
        ],
      },
    });

    let state = engine.selectSystemState();
    expect(state.contexts[0].variables.score).toBe(15);
    expect(state.contexts[0].pointers.read).toEqual({
      sectionId: "result",
      lineId: "line1",
    });

    engine.handleAction("rollbackByOffset", { offset: -1 });

    state = engine.selectSystemState();
    expect(state.contexts[0].variables.score).toBe(15);
    expect(state.contexts[0].pointers.read).toEqual({
      sectionId: "source",
      lineId: "line1",
    });
    expect(state.contexts[0].rollback.timeline[0].executedActions).toEqual([
      {
        type: "updateVariable",
        payload: {
          id: "chooseA15",
          operations: [
            {
              variableId: "score",
              op: "set",
              value: 15,
            },
          ],
        },
      },
    ]);
  });

  it("restores the pending-effect queue when effect handling throws before the batch is processed", () => {
    const engine = createRouteEngine({
      handlePendingEffects: (pendingEffects) => {
        if (pendingEffects.some((effect) => effect.name === "customEffect")) {
          throw new Error('Unhandled pending effect "customEffect".');
        }
      },
    });

    engine.init({
      initialState: {
        projectData: createMinimalProjectData(),
      },
    });

    expect(() =>
      engine.handleAction("appendPendingEffect", { name: "customEffect" }),
    ).toThrow('Unhandled pending effect "customEffect".');

    expect(engine.selectSystemState().global.pendingEffects).toEqual([
      { name: "customEffect" },
    ]);
  });
});
