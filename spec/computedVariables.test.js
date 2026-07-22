import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import { resolveComputedVariables } from "../src/index.js";
import { createSystemStore } from "../src/stores/system.store.js";
import { selectVariablesWithComputedValues } from "../src/util.js";

const createProjectData = (variables = {}, lineActions = {}) => ({
  screen: {
    width: 1920,
    height: 1080,
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

const createVariablePath = (variableId) =>
  `variables[${JSON.stringify(variableId)}]`;

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

  it("rejects string expression branch conditions", () => {
    expect(() =>
      createSystemStore({
        projectData: createProjectData({
          trust: {
            type: "number",
            scope: "context",
            default: 80,
          },
          trustState: {
            type: "string",
            scope: "context",
            computed: {
              branches: [
                {
                  when: "variables.trust >= 70",
                  expr: "trusted",
                },
              ],
              default: {
                expr: "guarded",
              },
            },
          },
        }),
      }),
    ).toThrow(
      "String condition expressions are not supported; use semantic JSON conditions",
    );
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

  it("resolves logical, arithmetic, and reverse-authored dependency chains", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        doubleSum: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              mul: [{ var: "variables.sum" }, 2],
            },
          },
        },
        sum: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              add: [{ var: "variables.x" }, { var: "variables.y" }],
            },
          },
        },
        bothTrue: {
          type: "boolean",
          scope: "context",
          computed: {
            expr: {
              and: [
                { eq: [{ var: "variables.a" }, true] },
                { eq: [{ var: "variables.b" }, true] },
              ],
            },
          },
        },
        a: {
          type: "boolean",
          scope: "context",
          default: true,
        },
        b: {
          type: "boolean",
          scope: "context",
          default: true,
        },
        x: {
          type: "number",
          scope: "context",
          default: 2,
        },
        y: {
          type: "number",
          scope: "context",
          default: 3,
        },
      }),
    });

    expect(store.selectAllVariables()).toMatchObject({
      bothTrue: true,
      sum: 5,
      doubleSum: 10,
    });
  });

  it("uses strict, non-coercive computed expression comparisons", () => {
    const sharedObject = { value: 1 };

    expect(
      resolveComputedVariables({
        variables: {
          sharedObject,
        },
        variableConfigs: {
          sharedObject: {
            type: "object",
            scope: "context",
            default: {},
          },
          sameTypeEquality: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: { eq: [1, 1] },
            },
          },
          crossTypeEquality: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: { eq: [1, "1"] },
            },
          },
          crossTypeInequality: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: { neq: [1, "1"] },
            },
          },
          missingIsNotNull: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: { eq: [{ var: "runtime.missing" }, null] },
            },
          },
          sameObjectIdentity: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: {
                eq: [
                  { var: "variables.sharedObject" },
                  { var: "variables.sharedObject" },
                ],
              },
            },
          },
          equivalentObjectsAreNotEqual: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: {
                eq: [{ literal: { value: 1 } }, { literal: { value: 1 } }],
              },
            },
          },
          mixedOrderingDoesNotMatch: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: { gt: ["2", 1] },
            },
          },
          stringOrdering: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: { lt: ["alpha", "beta"] },
            },
          },
          stringIncludesDoesNotCoerce: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: { includes: ["10", 1] },
            },
          },
        },
      }),
    ).toMatchObject({
      sameTypeEquality: true,
      crossTypeEquality: false,
      crossTypeInequality: true,
      missingIsNotNull: false,
      sameObjectIdentity: true,
      equivalentObjectsAreNotEqual: false,
      mixedOrderingDoesNotMatch: false,
      stringOrdering: true,
      stringIncludesDoesNotCoerce: false,
    });
  });

  it("uses strict comparisons when selecting computed branches", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        value: {
          type: "number",
          scope: "context",
          default: 1,
        },
        result: {
          type: "string",
          scope: "context",
          computed: {
            branches: [
              {
                when: { gt: [{ var: "variables.value" }, "0"] },
                expr: "coerced ordering",
              },
              {
                when: { eq: [{ var: "variables.value" }, "1"] },
                expr: "coerced equality",
              },
              {
                when: { eq: [{ var: "variables.value" }, 1] },
                expr: "strict match",
              },
            ],
            default: {
              expr: "no match",
            },
          },
        },
      }),
    });

    expect(store.selectAllVariables().result).toBe("strict match");
  });

  it("resolves very deep computed dependency chains without recursion", () => {
    const chainLength = 5000;
    const variableConfigs = Object.fromEntries(
      Array.from({ length: chainLength }, (_unused, index) => [
        `value${index}`,
        {
          type: "number",
          scope: "context",
          computed: {
            expr:
              index === chainLength - 1
                ? 1
                : {
                    add: [{ var: `variables.value${index + 1}` }, 1],
                  },
          },
        },
      ]),
    );

    const resolved = resolveComputedVariables({ variableConfigs });

    expect(resolved.value0).toBe(chainLength);
    expect(resolved[`value${chainLength - 1}`]).toBe(1);
  });

  it("keeps lazy selection isolated from unrelated and inactive values", () => {
    const variables = selectVariablesWithComputedValues({
      eager: false,
      variableConfigs: {
        bad: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              var: "runtime.missing",
            },
          },
        },
        good: {
          type: "number",
          scope: "context",
          computed: {
            branches: [
              {
                when: true,
                expr: 1,
              },
            ],
            default: {
              expr: {
                var: "variables.bad",
              },
            },
          },
        },
      },
    });

    expect(variables.good).toBe(1);
  });

  it("resolves nested values and quoted variable ids", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        profile: {
          type: "object",
          scope: "context",
          default: {
            stats: {
              scores: [2, 3],
            },
          },
        },
        "dotted.value": {
          type: "number",
          scope: "context",
          default: 4,
        },
        nestedSum: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              add: [
                { var: "variables.profile.stats.scores[0]" },
                { var: "variables.profile.stats.scores[1]" },
              ],
            },
          },
        },
        dottedMirror: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              var: 'variables["dotted.value"]',
            },
          },
        },
      }),
    });

    expect(store.selectAllVariables()).toMatchObject({
      nestedSum: 5,
      dottedMirror: 4,
    });
  });

  it("uses one strict path grammar for expressions and branch conditions", () => {
    const specialVariableIds = [
      "dotted.flag",
      'quoted"flag',
      "slashed\\flag",
      "bracketed[flag]",
    ];
    const variables = Object.fromEntries([
      ...specialVariableIds.map((variableId) => [
        variableId,
        {
          type: "boolean",
          scope: "context",
          default: true,
        },
      ]),
      [
        "allSpecialFlags",
        {
          type: "boolean",
          scope: "context",
          computed: {
            branches: [
              {
                when: {
                  all: specialVariableIds.map((variableId) => ({
                    var: createVariablePath(variableId),
                  })),
                },
                expr: true,
              },
            ],
            default: {
              expr: false,
            },
          },
        },
      ],
    ]);
    const store = createSystemStore({
      projectData: createProjectData(variables),
    });

    expect(store.selectAllVariables().allSpecialFlags).toBe(true);
  });

  it("decodes complete JSON escapes in quoted variable paths", () => {
    const escapedSlashPath = String.raw`variables["path\/segment"]`;
    const escapedUnicodePath = String.raw`variables["caf\u00e9"]`;
    const escapedSurrogatePairPath = String.raw`variables["rocket\uD83D\uDE80"]`;
    const store = createSystemStore({
      projectData: createProjectData({
        "path/segment": {
          type: "number",
          scope: "context",
          default: 1,
        },
        café: {
          type: "number",
          scope: "context",
          default: 2,
        },
        "rocket🚀": {
          type: "number",
          scope: "context",
          default: 3,
        },
        escapedSum: {
          type: "number",
          scope: "context",
          computed: {
            expr: {
              add: [
                { var: escapedSlashPath },
                {
                  add: [
                    { var: escapedUnicodePath },
                    { var: escapedSurrogatePairPath },
                  ],
                },
              ],
            },
          },
        },
        escapedCondition: {
          type: "boolean",
          scope: "context",
          computed: {
            branches: [
              {
                when: {
                  all: [
                    { eq: [{ var: escapedSlashPath }, 1] },
                    { eq: [{ var: escapedUnicodePath }, 2] },
                    { eq: [{ var: escapedSurrogatePairPath }, 3] },
                  ],
                },
                expr: true,
              },
            ],
            default: {
              expr: false,
            },
          },
        },
      }),
    });

    expect(store.selectAllVariables()).toMatchObject({
      escapedSum: 6,
      escapedCondition: true,
    });
  });

  it("does not reinterpret escaped condition paths at runtime", () => {
    const storedVariableId = 'a"b';
    const computedVariableId = 'a\\"b';
    const variables = Object.fromEntries([
      [
        storedVariableId,
        {
          type: "boolean",
          scope: "context",
          default: true,
        },
      ],
      [
        "result",
        {
          type: "boolean",
          scope: "context",
          computed: {
            branches: [
              {
                when: {
                  var: createVariablePath(storedVariableId),
                },
                expr: true,
              },
            ],
            default: {
              expr: false,
            },
          },
        },
      ],
      [
        computedVariableId,
        {
          type: "boolean",
          scope: "context",
          computed: {
            expr: {
              var: "variables.result",
            },
          },
        },
      ],
    ]);
    const store = createSystemStore({
      projectData: createProjectData(variables),
    });

    expect(store.selectAllVariables()).toMatchObject({
      result: true,
      [computedVariableId]: true,
    });
  });

  it("rejects the reserved __proto__ variable id", () => {
    const variables = Object.fromEntries([
      [
        "__proto__",
        {
          type: "number",
          scope: "context",
          computed: {
            expr: 7,
          },
        },
      ],
    ]);

    expect(() =>
      createSystemStore({
        projectData: createProjectData(variables),
      }),
    ).toThrow('Variable id "__proto__" is reserved');
  });

  it("rejects empty variable ids during semantic validation", () => {
    const variables = Object.fromEntries([
      [
        "",
        {
          type: "number",
          scope: "context",
          computed: {
            expr: 7,
          },
        },
      ],
    ]);

    expect(() =>
      createSystemStore({
        projectData: createProjectData(variables),
      }),
    ).toThrow("Variable ids must not be empty");
  });

  it("does not traverse inherited properties in variable paths", () => {
    expect(() =>
      resolveComputedVariables({
        variables: {
          payload: {},
        },
        variableConfigs: {
          payload: {
            type: "object",
            scope: "context",
            default: {},
          },
          leakedName: {
            type: "string",
            scope: "context",
            computed: {
              expr: {
                var: "variables.payload.constructor.name",
              },
            },
          },
        },
      }),
    ).toThrow(
      'Computed variable "leakedName" expected type string, got undefined',
    );
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
    expect(() =>
      createSystemStore({
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
      }),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
  });

  it("rejects cycles hidden in inactive branch results", () => {
    expect(() =>
      createSystemStore({
        projectData: createProjectData({
          a: {
            type: "number",
            scope: "context",
            computed: {
              branches: [
                {
                  when: false,
                  expr: { var: "variables.b" },
                },
              ],
              default: {
                expr: 0,
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
      }),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
  });

  it("rejects cycles hidden in later conditions", () => {
    expect(() =>
      createSystemStore({
        projectData: createProjectData({
          a: {
            type: "number",
            scope: "context",
            computed: {
              branches: [
                {
                  when: true,
                  expr: 0,
                },
                {
                  when: {
                    eq: [{ var: "variables.b" }, 0],
                  },
                  expr: 1,
                },
              ],
              default: {
                expr: 2,
              },
            },
          },
          b: {
            type: "number",
            scope: "context",
            computed: {
              expr: { var: "variables.a" },
            },
          },
        }),
      }),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
  });

  it("rejects cycles referenced through quoted variable ids", () => {
    const specialVariableId = 'a"b';
    const variables = Object.fromEntries([
      [
        "result",
        {
          type: "boolean",
          scope: "context",
          computed: {
            branches: [
              {
                when: {
                  var: createVariablePath(specialVariableId),
                },
                expr: true,
              },
            ],
            default: {
              expr: false,
            },
          },
        },
      ],
      [
        specialVariableId,
        {
          type: "boolean",
          scope: "context",
          computed: {
            expr: {
              var: "variables.result",
            },
          },
        },
      ],
    ]);

    expect(() =>
      createSystemStore({
        projectData: createProjectData(variables),
      }),
    ).toThrow("Computed variable cycle detected");
  });

  it("rejects cycles hidden in inactive defaults", () => {
    expect(() =>
      createSystemStore({
        projectData: createProjectData({
          a: {
            type: "number",
            scope: "context",
            computed: {
              branches: [
                {
                  when: true,
                  expr: 0,
                },
              ],
              default: {
                expr: { var: "variables.b" },
              },
            },
          },
          b: {
            type: "number",
            scope: "context",
            computed: {
              expr: { var: "variables.a" },
            },
          },
        }),
      }),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
  });

  it("rejects cycles hidden by logical short circuiting", () => {
    expect(() =>
      createSystemStore({
        projectData: createProjectData({
          a: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: {
                and: [false, { var: "variables.b" }],
              },
            },
          },
          b: {
            type: "boolean",
            scope: "context",
            computed: {
              expr: {
                not: [{ var: "variables.a" }],
              },
            },
          },
        }),
      }),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
  });

  it("rejects self cycles", () => {
    expect(() =>
      createSystemStore({
        projectData: createProjectData({
          a: {
            type: "number",
            scope: "context",
            computed: {
              expr: { var: "variables.a" },
            },
          },
        }),
      }),
    ).toThrow("Computed variable cycle detected: a -> a");
  });

  it("rejects missing, namespace-root, unsupported, and malformed references", () => {
    const invalidReferences = [
      ["variables.missing", 'references unknown variable "missing"'],
      ["variables", "must reference a concrete variables member"],
      ["settings.value", "must reference variables.* or runtime.*"],
      ["variables..missing", "has invalid path"],
      ['variables["a""b"]', "has invalid path"],
      ["variables[01]", "has invalid path"],
      ['variables["unterminated]', "has invalid path"],
      ['variables["bad\\x"]', "has invalid path"],
      ['variables["bad\\u123"]', "has invalid path"],
      ['variables["bad\\u12G4"]', "has invalid path"],
      ['variables["bad\nkey"]', "has invalid path"],
    ];

    invalidReferences.forEach(([referencePath, expectedError]) => {
      expect(() =>
        createSystemStore({
          projectData: createProjectData({
            result: {
              type: "boolean",
              scope: "context",
              computed: {
                expr: {
                  not: [{ var: referencePath }],
                },
              },
            },
          }),
        }),
      ).toThrow(expectedError);
    });
  });

  it("validates expressions and result types in inactive branches", () => {
    expect(() =>
      createSystemStore({
        projectData: createProjectData({
          result: {
            type: "number",
            scope: "context",
            computed: {
              branches: [
                {
                  when: false,
                  expr: {
                    unknown: [1],
                  },
                },
              ],
              default: {
                expr: 0,
              },
            },
          },
        }),
      }),
    ).toThrow("Unknown computed expression operator: unknown");

    expect(() =>
      createSystemStore({
        projectData: createProjectData({
          result: {
            type: "number",
            scope: "context",
            computed: {
              branches: [
                {
                  when: false,
                  expr: "wrong type",
                },
              ],
              default: {
                expr: 0,
              },
            },
          },
        }),
      }),
    ).toThrow("expected type number, got string");
  });

  it("rejects non-finite literal expressions in inactive branches", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        original: {
          type: "number",
          scope: "context",
          default: 1,
        },
      }),
    });
    const previousState = store.selectSystemState();

    [Infinity, -Infinity, Number.NaN].forEach((nonFiniteValue) => {
      expect(() =>
        store.updateProjectData({
          projectData: createProjectData({
            flag: {
              type: "boolean",
              scope: "context",
              default: false,
            },
            result: {
              type: "number",
              scope: "context",
              computed: {
                branches: [
                  {
                    when: { var: "variables.flag" },
                    expr: { literal: nonFiniteValue },
                  },
                ],
                default: {
                  expr: 0,
                },
              },
            },
          }),
        }),
      ).toThrow("must use finite numeric literals");
      expect(store.selectSystemState()).toEqual(previousState);
    });
  });

  it("rejects function calls and pre-parsed AST shapes in computed conditions", () => {
    const invalidConditions = [
      [{ call: "now" }, "function calls are not supported"],
      [{ type: 1, path: "variables.flag" }, "Unknown condition JSON operator"],
    ];

    invalidConditions.forEach(([when, expectedError]) => {
      expect(() =>
        createSystemStore({
          projectData: createProjectData({
            flag: {
              type: "boolean",
              scope: "context",
              default: true,
            },
            result: {
              type: "boolean",
              scope: "context",
              computed: {
                branches: [
                  {
                    when,
                    expr: true,
                  },
                ],
                default: {
                  expr: false,
                },
              },
            },
          }),
        }),
      ).toThrow(expectedError);
    });
  });

  it("keeps literal payloads opaque to dependency validation", () => {
    expect(
      resolveComputedVariables({
        variableConfigs: {
          valueLiteral: {
            type: "object",
            scope: "context",
            computed: {
              value: {
                var: "variables.missing",
              },
            },
          },
          expressionLiteral: {
            type: "object",
            scope: "context",
            computed: {
              expr: {
                literal: {
                  var: "variables.missing",
                },
              },
            },
          },
        },
      }),
    ).toMatchObject({
      valueLiteral: {
        var: "variables.missing",
      },
      expressionLiteral: {
        var: "variables.missing",
      },
    });
  });

  it("rejects invalid project replacements without changing current state", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        score: {
          type: "number",
          scope: "context",
          default: 3,
        },
      }),
    });
    const previousState = store.selectSystemState();

    expect(() =>
      store.updateProjectData({
        projectData: createProjectData({
          a: {
            type: "number",
            scope: "context",
            computed: {
              expr: { var: "variables.b" },
            },
          },
          b: {
            type: "number",
            scope: "context",
            computed: {
              expr: { var: "variables.a" },
            },
          },
        }),
      }),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
    expect(store.selectSystemState()).toEqual(previousState);
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

  it("preflights dormant dependency cycles in the public helper", () => {
    expect(() =>
      resolveComputedVariables({
        variableConfigs: {
          a: {
            type: "number",
            scope: "context",
            computed: {
              branches: [
                {
                  when: false,
                  expr: { var: "variables.b" },
                },
              ],
              default: {
                expr: 0,
              },
            },
          },
          b: {
            type: "number",
            scope: "context",
            computed: {
              expr: { var: "variables.a" },
            },
          },
        },
      }),
    ).toThrow("Computed variable cycle detected: a -> b -> a");
  });
});
