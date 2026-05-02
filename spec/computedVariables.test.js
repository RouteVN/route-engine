import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import { resolveComputedVariables } from "../src/index.js";
import { createSystemStore } from "../src/stores/system.store.js";

const createProjectData = (variables = {}, lineActions = {}) => ({
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
    variables,
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
            ],
          },
        },
      },
    },
  },
});

describe("computed variables", () => {
  it("projects computed values without storing them in system state", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        hp: {
          type: "number",
          scope: "context",
          default: 80,
        },
        maxHp: {
          type: "number",
          scope: "context",
          default: 100,
        },
        hpPercent: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              round: [
                {
                  mul: [
                    {
                      div: [
                        { var: "variables.hp" },
                        { var: "variables.maxHp" },
                      ],
                    },
                    100,
                  ],
                },
              ],
            },
          },
        },
      }),
    });

    expect(store.selectAllVariables()).toMatchObject({
      hp: 80,
      maxHp: 100,
      hpPercent: 80,
    });
    expect(store.selectSystemState().contexts[0].variables).toEqual({
      hp: 80,
      maxHp: 100,
    });
  });

  it("evaluates conditional branches with explicit defaults", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        hp: {
          type: "number",
          scope: "context",
          default: 20,
        },
        maxHp: {
          type: "number",
          scope: "context",
          default: 100,
        },
        hpState: {
          type: "string",
          scope: "context",
          computed: {
            branches: [
              {
                when: {
                  lte: [{ var: "variables.hp" }, 0],
                },
                expr: "down",
              },
              {
                when: {
                  lte: [{ var: "variables.hp" }, 25],
                },
                expr: "critical",
              },
            ],
            default: {
              expr: "healthy",
            },
          },
        },
      }),
    });

    expect(store.selectAllVariables().hpState).toBe("critical");
  });

  it("uses the conditional-action grammar for branch conditions", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        locked: {
          type: "boolean",
          scope: "context",
          default: false,
        },
        accessState: {
          type: "string",
          scope: "context",
          computed: {
            branches: [
              {
                when: {
                  not: {
                    var: "variables.locked",
                  },
                },
                expr: "open",
              },
            ],
            default: {
              expr: "locked",
            },
          },
        },
      }),
    });

    expect(store.selectAllVariables().accessState).toBe("open");
  });

  it("supports literal object results with value", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        hp: {
          type: "number",
          scope: "context",
          default: 80,
        },
        hpBadge: {
          type: "object",
          scope: "context",
          computed: {
            branches: [
              {
                when: {
                  lte: [{ var: "variables.hp" }, 25],
                },
                value: {
                  text: "Critical",
                  colorId: "red",
                },
              },
            ],
            default: {
              value: {
                text: "OK",
                colorId: "green",
              },
            },
          },
        },
      }),
    });

    expect(store.selectAllVariables().hpBadge).toEqual({
      text: "OK",
      colorId: "green",
    });
  });

  it("lets computed variables depend on other computed variables", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        hp: {
          type: "number",
          scope: "context",
          default: 50,
        },
        doubledHp: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              mul: [{ var: "variables.hp" }, 2],
            },
          },
        },
        doubledHpMirror: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              var: "variables.doubledHp",
            },
          },
        },
      }),
    });

    expect(store.selectAllVariables()).toMatchObject({
      doubledHp: 100,
      doubledHpMirror: 100,
    });
  });

  it("rejects writes to computed variables", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        hpPercent: {
          type: "number",
          scope: "context",
          computed: {
            expr: 80,
          },
        },
      }),
    });

    expect(() => {
      store.updateVariable({
        id: "setComputed",
        operations: [
          {
            variableId: "hpPercent",
            op: "set",
            value: 90,
          },
        ],
      });
    }).toThrow("Cannot update computed variable: hpPercent");
  });

  it("exposes computed variables to action templates and conditional actions", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createProjectData({
          hp: {
            type: "number",
            scope: "context",
            default: 20,
          },
          score: {
            type: "number",
            scope: "context",
            default: 0,
          },
          scoreTarget: {
            type: "string",
            scope: "context",
            computed: {
              expr: "score",
            },
          },
          isCritical: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: {
                lte: [{ var: "variables.hp" }, 25],
              },
            },
          },
        }),
      },
    });

    engine.handleActions({
      updateVariable: {
        id: "setScoreFromComputedTarget",
        operations: [
          {
            variableId: "${variables.scoreTarget}",
            op: "set",
            value: 3,
          },
        ],
      },
      conditional: {
        branches: [
          {
            when: {
              eq: [{ var: "variables.isCritical" }, true],
            },
            actions: {
              updateVariable: {
                id: "criticalScore",
                operations: [
                  {
                    variableId: "score",
                    op: "increment",
                    value: 4,
                  },
                ],
              },
            },
          },
        ],
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(7);
  });

  it("rejects computed variable cycles", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        a: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              add: [{ var: "variables.b" }, 1],
            },
          },
        },
        b: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              add: [{ var: "variables.a" }, 1],
            },
          },
        },
      }),
    });

    expect(() => store.selectAllVariables()).toThrow(
      "Computed variable cycle detected: a -> b -> a",
    );
  });

  it("filters hydrated global values for computed variables", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        hpPercent: {
          type: "number",
          scope: "account",
          computed: {
            expr: 80,
          },
        },
      }),
      global: {
        variables: {
          hpPercent: 20,
        },
      },
    });

    expect(store.selectSystemState().global.variables).toEqual({});
    expect(store.selectAllVariables().hpPercent).toBe(80);
  });

  it("exposes the computed variable resolver as a public helper", () => {
    const projectData = createProjectData({
      hp: {
        type: "number",
        scope: "context",
        default: 80,
      },
      maxHp: {
        type: "number",
        scope: "context",
        default: 100,
      },
      hpPercent: {
        type: "number",
        scope: "context",
        computed: {
          expr: {
            round: [
              {
                mul: [
                  {
                    div: [{ var: "variables.hp" }, { var: "variables.maxHp" }],
                  },
                  100,
                ],
              },
            ],
          },
        },
      },
      audioState: {
        type: "string",
        scope: "context",
        computed: {
          branches: [
            {
              when: {
                eq: [{ var: "runtime.muteAll" }, true],
              },
              expr: "muted",
            },
          ],
          default: {
            expr: "audible",
          },
        },
      },
    });

    expect(
      resolveComputedVariables({
        projectData,
        variables: {
          hp: 40,
          maxHp: 100,
        },
        runtime: {
          muteAll: true,
        },
      }),
    ).toMatchObject({
      hp: 40,
      maxHp: 100,
      hpPercent: 40,
      audioState: "muted",
    });
  });
});
