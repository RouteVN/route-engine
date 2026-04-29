import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = ({
  trust = 0,
  score = 0,
  lineActions = {},
  extraLines = [],
} = {}) => ({
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
      trust: {
        type: "number",
        scope: "context",
        default: trust,
      },
      score: {
        type: "number",
        scope: "context",
        default: score,
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
        initialSectionId: "section1",
        sections: {
          section1: {
            lines: [
              {
                id: "line1",
                actions: lineActions,
              },
              ...extraLines,
            ],
          },
        },
      },
    },
  },
});

const createEngine = (projectData) => {
  const engine = createRouteEngine({
    handlePendingEffects: () => {},
  });

  engine.init({
    initialState: {
      projectData,
    },
  });

  return engine;
};

const setScoreAction = (id, value) => ({
  updateVariable: {
    id,
    operations: [
      {
        variableId: "score",
        op: "set",
        value,
      },
    ],
  },
});

describe("RouteEngine conditional actions", () => {
  it("executes only the first matching branch", () => {
    const engine = createEngine(createProjectData({ trust: 80 }));

    engine.handleActions({
      conditional: {
        branches: [
          {
            when: {
              gte: [{ var: "variables.trust" }, 70],
            },
            actions: setScoreAction("trusted", 1),
          },
          {
            when: true,
            actions: setScoreAction("fallback", 2),
          },
        ],
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(1);
  });

  it("supports semantic JSON conditions with any and in operators", () => {
    const engine = createEngine(createProjectData({ trust: 80 }));

    engine.handleActions({
      conditional: {
        branches: [
          {
            when: {
              any: [
                {
                  in: [{ var: "variables.trust" }, { literal: [10, 20, 80] }],
                },
                {
                  lt: [{ var: "variables.trust" }, 0],
                },
              ],
            },
            actions: setScoreAction("matchedAny", 6),
          },
        ],
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(6);
  });

  it("executes the else branch when no condition matches", () => {
    const engine = createEngine(createProjectData({ trust: 30 }));

    engine.handleActions({
      conditional: {
        branches: [
          {
            when: {
              gte: [{ var: "variables.trust" }, 70],
            },
            actions: setScoreAction("trusted", 1),
          },
          {
            actions: setScoreAction("elseBranch", 3),
          },
        ],
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(3);
  });

  it("does nothing when no branch matches and no else branch exists", () => {
    const engine = createEngine(createProjectData({ trust: 30, score: 5 }));

    engine.handleActions({
      conditional: {
        branches: [
          {
            when: {
              gte: [{ var: "variables.trust" }, 70],
            },
            actions: setScoreAction("trusted", 1),
          },
        ],
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(5);
  });

  it("evaluates string expression conditions", () => {
    const engine = createEngine(createProjectData({ trust: 75 }));

    engine.handleActions({
      conditional: {
        branches: [
          {
            when: "variables.trust >= 70",
            actions: setScoreAction("trusted", 4),
          },
        ],
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(4);
  });

  it("executes nested conditional actions inside the selected branch", () => {
    const engine = createEngine(createProjectData({ trust: 75 }));

    engine.handleActions({
      conditional: {
        branches: [
          {
            when: {
              gte: [{ var: "variables.trust" }, 70],
            },
            actions: {
              conditional: {
                branches: [
                  {
                    when: {
                      lt: [{ var: "variables.trust" }, 80],
                    },
                    actions: setScoreAction("nested", 8),
                  },
                  {
                    actions: setScoreAction("nestedElse", 2),
                  },
                ],
              },
            },
          },
        ],
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(8);
  });

  it("processes authored line conditional actions when a line is entered", () => {
    let engine;
    const handlePendingEffects = (effects) => {
      effects.forEach((effect) => {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions();
        }
      });
    };

    engine = createRouteEngine({
      handlePendingEffects,
    });
    engine.init({
      initialState: {
        projectData: createProjectData({
          trust: 90,
          lineActions: {
            conditional: {
              branches: [
                {
                  when: {
                    gte: [{ var: "variables.trust" }, 70],
                  },
                  actions: {
                    jumpToLine: {
                      lineId: "trustedRoute",
                    },
                  },
                },
                {
                  actions: {
                    jumpToLine: {
                      lineId: "fallbackRoute",
                    },
                  },
                },
              ],
            },
          },
          extraLines: [
            {
              id: "trustedRoute",
              actions: {},
            },
            {
              id: "fallbackRoute",
              actions: {},
            },
          ],
        }),
      },
    });

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("trustedRoute");
  });

  it("only renders event bindings in the selected branch", () => {
    const engine = createEngine(createProjectData());

    expect(() =>
      engine.handleActions(
        {
          conditional: {
            branches: [
              {
                when: {
                  eq: [{ var: "_event.kind" }, "missing"],
                },
                actions: setScoreAction("unselected", "_event.missing"),
              },
              {
                when: {
                  eq: [{ var: "_event.kind" }, "score"],
                },
                actions: setScoreAction("selected", "_event.value"),
              },
            ],
          },
        },
        {
          _event: {
            kind: "score",
            value: 9,
          },
        },
      ),
    ).not.toThrow();

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(9);
  });

  it("rejects an else branch before the final branch", () => {
    const engine = createEngine(createProjectData());

    expect(() =>
      engine.handleActions({
        conditional: {
          branches: [
            {
              actions: setScoreAction("earlyElse", 1),
            },
            {
              when: true,
              actions: setScoreAction("later", 2),
            },
          ],
        },
      }),
    ).toThrow("conditional else branch must be the last branch");
  });

  it("rejects malformed conditional payloads", () => {
    const engine = createEngine(createProjectData());

    expect(() =>
      engine.handleActions({
        conditional: {},
      }),
    ).toThrow("conditional action requires branches array");

    expect(() =>
      engine.handleActions({
        conditional: {
          branches: [],
        },
      }),
    ).toThrow("conditional action requires at least one branch");

    expect(() =>
      engine.handleActions({
        conditional: {
          branches: [
            {
              when: true,
            },
          ],
        },
      }),
    ).toThrow("conditional branch at index 0 requires actions object");
  });

  it("propagates Jempl condition validation errors", () => {
    const engine = createEngine(createProjectData());

    expect(() =>
      engine.handleActions({
        conditional: {
          branches: [
            {
              when: {
                gt: [{ var: "variables.trust" }, 70],
                lt: [{ var: "variables.trust" }, 90],
              },
              actions: setScoreAction("invalid", 1),
            },
          ],
        },
      }),
    ).toThrow("Condition JSON at '$when' must contain exactly one operator");
  });

  it("preserves choice interaction source for nested nextLine actions", () => {
    const engine = createEngine(
      createProjectData({
        lineActions: {
          choice: {
            resourceId: "choiceLayout",
            items: [
              {
                id: "continue",
                content: "Continue",
              },
            ],
          },
        },
        extraLines: [
          {
            id: "line2",
            actions: {},
          },
        ],
      }),
    );

    engine.handleAction("markLineCompleted", {});
    engine.handleActions(
      {
        conditional: {
          branches: [
            {
              actions: {
                nextLine: {},
              },
            },
          ],
        },
      },
      undefined,
      {
        interactionSource: "choice",
      },
    );

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
  });
});
