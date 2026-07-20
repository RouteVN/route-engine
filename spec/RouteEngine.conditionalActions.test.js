import { describe, expect, it, vi } from "vitest";
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

const createEngineWithLineActions = (projectData) => {
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

const setTrustAction = (id, value) => ({
  updateVariable: {
    id,
    operations: [
      {
        variableId: "trust",
        op: "set",
        value,
      },
    ],
  },
});

describe("RouteEngine conditional actions", () => {
  it("executes only the first matching branch and continues", () => {
    const engine = createEngine(
      createProjectData({
        trust: 80,
        extraLines: [
          {
            id: "line2",
            actions: {},
          },
        ],
      }),
    );

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
            actions: setScoreAction("fallback", 2),
          },
        ],
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(1);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
  });

  it("evaluates each conditional against state mutated by earlier actions in the same batch", () => {
    const engine = createEngine(createProjectData({ trust: 20 }));

    engine.handleActions({
      ...setTrustAction("raiseTrust", 80),
      conditional: {
        branches: [
          {
            when: {
              gte: [{ var: "variables.trust" }, 70],
            },
            actions: setScoreAction("trusted", 7),
          },
          {
            actions: setScoreAction("fallback", 1),
          },
        ],
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.trust).toBe(80);
    expect(engine.selectSystemState().contexts[0].variables.score).toBe(7);
  });

  it("dispatches conditional actions through the single-action API", () => {
    const engine = createEngine(
      createProjectData({
        trust: 80,
        extraLines: [
          {
            id: "line2",
            actions: {},
          },
        ],
      }),
    );

    const result = engine.handleAction("conditional", {
      branches: [
        {
          when: {
            gte: [{ var: "variables.trust" }, 70],
          },
          actions: setScoreAction("singleConditional", 5),
        },
        {
          actions: setScoreAction("fallback", 1),
        },
      ],
    });

    expect(result).toBeUndefined();
    expect(engine.selectSystemState().contexts[0].variables.score).toBe(5);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
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

  it("executes the default branch and continues when no condition matches", () => {
    const engine = createEngine(
      createProjectData({
        trust: 30,
        extraLines: [
          {
            id: "line2",
            actions: {},
          },
        ],
      }),
    );

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
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
  });

  it("continues to the next line when no branch matches and no default exists", () => {
    const engine = createEngine(
      createProjectData({
        trust: 30,
        score: 5,
        extraLines: [
          {
            id: "line2",
            actions: {},
          },
        ],
      }),
    );

    const result = engine.handleAction("conditional", {
      branches: [
        {
          when: {
            gte: [{ var: "variables.trust" }, 70],
          },
          actions: setScoreAction("trusted", 1),
        },
      ],
    });

    expect(result).toBeUndefined();
    expect(engine.selectSystemState().contexts[0].variables.score).toBe(5);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
  });

  it.each([
    ["sectionTransition", { sectionId: "target" }, "targetLine1"],
    ["resetStoryAtSection", { sectionId: "target" }, "targetLine1"],
    ["jumpToLine", { lineId: "line2" }, "line2"],
  ])(
    "does not add another advance after a matched branch uses %s",
    (actionType, payload, expectedLineId) => {
      const projectData = createProjectData({
        extraLines: [
          {
            id: "line2",
            actions: {},
          },
          {
            id: "line3",
            actions: {},
          },
        ],
      });
      projectData.story.scenes.scene1.sections.target = {
        lines: [
          {
            id: "targetLine1",
            actions: {},
          },
          {
            id: "targetLine2",
            actions: {},
          },
        ],
      };
      const engine = createEngine(projectData);

      engine.handleAction("conditional", {
        branches: [
          {
            when: true,
            actions: {
              [actionType]: payload,
            },
          },
        ],
      });

      expect(
        engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe(expectedLineId);
    },
  );

  it.each(["sectionTransition", "resetStoryAtSection"])(
    "suppresses continuation when a matched branch attempts an invalid %s",
    (actionType) => {
      const engine = createEngine(
        createProjectData({
          extraLines: [
            {
              id: "line2",
              actions: {},
            },
          ],
        }),
      );
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        engine.handleAction("conditional", {
          branches: [
            {
              when: true,
              actions: {
                [actionType]: {
                  sectionId: "missing",
                },
              },
            },
          ],
        });
      } finally {
        warn.mockRestore();
      }

      expect(
        engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe("line1");
    },
  );

  it.each([
    ["unfinished", false],
    ["completed", true],
  ])(
    "advances exactly once when a matched branch calls nextLine on a %s line",
    (_lineState, markCompleted) => {
      const engine = createEngine(
        createProjectData({
          extraLines: [
            {
              id: "line2",
              actions: {},
            },
            {
              id: "line3",
              actions: {},
            },
          ],
        }),
      );
      if (markCompleted) {
        engine.handleAction("markLineCompleted", {});
      }

      engine.handleAction("conditional", {
        branches: [
          {
            when: true,
            actions: {
              nextLine: {},
            },
          },
        ],
      });

      expect(
        engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe("line2");
    },
  );

  it("rejects string expression conditions", () => {
    const engine = createEngine(createProjectData({ trust: 75 }));

    expect(() =>
      engine.handleActions({
        conditional: {
          branches: [
            {
              when: "variables.trust >= 70",
              actions: setScoreAction("trusted", 4),
            },
          ],
        },
      }),
    ).toThrow(
      "String condition expressions are not supported; use semantic JSON conditions",
    );
  });

  it("coalesces nested conditional continuation into one advance", () => {
    const engine = createEngine(
      createProjectData({
        trust: 75,
        extraLines: [
          {
            id: "line2",
            actions: {},
          },
          {
            id: "line3",
            actions: {},
          },
        ],
      }),
    );

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
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
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

  it("automatically enters and processes the next line for an unmatched authored conditional", () => {
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
          trust: 30,
          lineActions: {
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
          },
          extraLines: [
            {
              id: "line2",
              actions: setScoreAction("destinationReached", 9),
            },
          ],
        }),
      },
    });

    const state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line2");
    expect(state.contexts.at(-1).variables.score).toBe(9);
    expect(state.global.isLineCompleted).toBe(false);
  });

  it("finishes each source batch before processing chained conditional continuation", () => {
    const engine = createEngineWithLineActions(
      createProjectData({
        lineActions: {
          conditional: {
            branches: [
              {
                when: false,
                actions: setScoreAction("unreachable", 1),
              },
            ],
          },
          ...setScoreAction("sourceAfterConditional", 7),
        },
        extraLines: [
          {
            id: "line2",
            actions: {
              conditional: {
                branches: [
                  {
                    when: {
                      eq: [{ var: "variables.score" }, 7],
                    },
                    actions: setTrustAction("observedUpdatedScore", 80),
                  },
                  {
                    actions: setTrustAction("observedStaleScore", 20),
                  },
                ],
              },
            },
          },
          {
            id: "line3",
            actions: {},
          },
        ],
      }),
    );

    let state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line3");
    expect(state.contexts.at(-1).variables.score).toBe(7);
    expect(state.contexts.at(-1).variables.trust).toBe(80);

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line2",
    });

    state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line2");
    expect(state.contexts.at(-1).variables.score).toBe(7);
    expect(state.contexts.at(-1).variables.trust).toBe(80);
  });

  it("lets later explicit control flow override the deferred automatic continuation", () => {
    const engine = createEngine(
      createProjectData({
        extraLines: [
          {
            id: "line2",
            actions: {},
          },
          {
            id: "line3",
            actions: {},
          },
          {
            id: "line4",
            actions: {},
          },
        ],
      }),
    );

    engine.handleActions({
      conditional: {
        branches: [
          {
            when: false,
            actions: setScoreAction("unreachable", 1),
          },
        ],
      },
      jumpToLine: {
        lineId: "line3",
      },
    });

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line3");
  });

  it.each([
    ["different pointer", { lineId: "line2" }, "line2"],
    ["same logical pointer", { lineId: "line1" }, "line1"],
  ])(
    "does not continue a later conditional after an earlier jump to a %s",
    (_navigationType, jumpPayload, expectedLineId) => {
      const engine = createEngine(
        createProjectData({
          extraLines: [
            {
              id: "line2",
              actions: {},
            },
            {
              id: "line3",
              actions: {},
            },
          ],
        }),
      );

      engine.handleActions({
        jumpToLine: jumpPayload,
        conditional: {
          branches: [
            {
              when: true,
              actions: setScoreAction("afterJump", 7),
            },
          ],
        },
      });

      expect(
        engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe(expectedLineId);
    },
  );

  it("does not continue a nested conditional after its outer branch navigates", () => {
    const engine = createEngine(
      createProjectData({
        extraLines: [
          {
            id: "line2",
            actions: {},
          },
          {
            id: "line3",
            actions: {},
          },
        ],
      }),
    );

    engine.handleAction("conditional", {
      branches: [
        {
          when: true,
          actions: {
            jumpToLine: {
              lineId: "line2",
            },
            conditional: {
              branches: [
                {
                  when: true,
                  actions: setScoreAction("nestedAfterJump", 9),
                },
              ],
            },
          },
        },
      ],
    });

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(engine.selectSystemState().contexts.at(-1).variables.score).toBe(9);
  });

  it.each([
    [
      "matched",
      [
        {
          when: true,
          actions: setScoreAction("matched", 1),
        },
      ],
    ],
    [
      "default",
      [
        {
          when: false,
          actions: setScoreAction("unreachable", 1),
        },
        {
          actions: setScoreAction("default", 2),
        },
      ],
    ],
    [
      "unmatched",
      [
        {
          when: false,
          actions: setScoreAction("unreachable", 1),
        },
      ],
    ],
  ])(
    "cancels %s conditional continuation after later same-pointer navigation",
    (_outcome, branches) => {
      for (const controlFlowAction of [
        { jumpToLine: { lineId: "line1" } },
        { resetStoryAtSection: { sectionId: "section1" } },
      ]) {
        const engine = createEngine(
          createProjectData({
            extraLines: [
              {
                id: "line2",
                actions: {},
              },
            ],
          }),
        );

        engine.handleActions({
          conditional: {
            branches,
          },
          ...controlFlowAction,
        });

        expect(
          engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
        ).toBe("line1");
      }
    },
  );

  it("replays selected authored line conditional branches during rollback restoration", () => {
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
                  actions: setScoreAction("trustedLineReplay", 7),
                },
                {
                  actions: setScoreAction("fallbackLineReplay", 1),
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
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(7);
    expect(engine.selectSystemState().contexts.at(-1).pointers.read).toEqual({
      sectionId: "section1",
      lineId: "line2",
    });

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    expect(engine.selectSystemState().contexts.at(-1).pointers.read).toEqual({
      sectionId: "section1",
      lineId: "line2",
    });

    engine.handleAction("rollbackToLine", {
      sectionId: "section1",
      lineId: "line1",
    });

    const state = engine.selectSystemState();
    expect(state.contexts[0].pointers.read).toEqual({
      sectionId: "section1",
      lineId: "line1",
    });
    expect(state.contexts[0].variables.score).toBe(7);
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
          {
            id: "line3",
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
        bypassChoice: true,
      },
    );

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
  });

  it.each([
    [
      "matched",
      [{ when: true, actions: setScoreAction("matchedChoice", 3) }],
      3,
    ],
    [
      "default",
      [
        { when: false, actions: setScoreAction("unreachableChoice", 1) },
        { actions: setScoreAction("defaultChoice", 4) },
      ],
      4,
    ],
    [
      "unmatched",
      [
        {
          when: false,
          actions: setScoreAction("unreachableChoice", 1),
        },
      ],
      0,
    ],
  ])(
    "automatically continues a %s conditional from an authorized choice interaction",
    (_outcome, branches, expectedScore) => {
      const handledEffectNames = [];
      const engine = createRouteEngine({
        handlePendingEffects: (effects) => {
          handledEffectNames.push(...effects.map((effect) => effect.name));
        },
      });
      engine.init({
        initialState: {
          global: {
            runtime: {
              skipUnseenText: true,
            },
          },
          projectData: createProjectData({
            lineActions: {},
            extraLines: [
              {
                id: "choiceLine",
                actions: {
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
              },
              {
                id: "line2",
                actions: {},
              },
            ],
          }),
        },
      });
      engine.handleAction("startSkipMode", {});
      engine.handleAction("nextLineFromSystem", {});
      expect(
        engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe("choiceLine");
      handledEffectNames.length = 0;

      engine.handleActions(
        {
          conditional: {
            branches,
          },
        },
        undefined,
        {
          bypassChoice: true,
        },
      );

      expect(
        engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe("line2");
      expect(engine.selectSystemState().contexts.at(-1).variables.score).toBe(
        expectedScore,
      );
      expect(engine.selectSystemState().global.skipMode).toBe(true);
      expect(handledEffectNames).toContain("startSkipNextTimer");
    },
  );

  it("advances a conditional while keeping the dialogue UI hidden", () => {
    const engine = createEngine(
      createProjectData({
        extraLines: [
          { id: "line2", actions: {} },
          { id: "line3", actions: {} },
        ],
      }),
    );

    engine.handleAction("conditional", {
      branches: [
        {
          when: true,
          actions: {
            hideDialogueUI: {},
            ...setScoreAction("hiddenDialogueBranch", 5),
          },
        },
      ],
    });

    const state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line2");
    expect(state.contexts.at(-1).variables.score).toBe(5);
    expect(state.global.dialogueUIHidden).toBe(true);
  });

  it.each([
    [
      "matched",
      [{ when: true, actions: setScoreAction("matchedUnseenChoice", 3) }],
      3,
    ],
    [
      "default",
      [
        {
          when: false,
          actions: setScoreAction("unreachableUnseenChoice", 1),
        },
        { actions: setScoreAction("defaultUnseenChoice", 4) },
      ],
      4,
    ],
    [
      "unmatched",
      [
        {
          when: false,
          actions: setScoreAction("unreachableUnseenChoice", 1),
        },
      ],
      0,
    ],
  ])(
    "enters an unseen destination once and stops skip after an authorized %s choice conditional",
    (_outcome, branches, expectedScore) => {
      const handledEffectNames = [];
      const engine = createRouteEngine({
        handlePendingEffects: (effects) => {
          handledEffectNames.push(...effects.map((effect) => effect.name));
        },
      });
      engine.init({
        initialState: {
          global: {
            runtime: {
              skipUnseenText: true,
            },
          },
          projectData: createProjectData({
            lineActions: {},
            extraLines: [
              {
                id: "choiceLine",
                actions: {
                  choice: {
                    resourceId: "choiceLayout",
                    items: [{ id: "continue", content: "Continue" }],
                  },
                },
              },
              { id: "line2", actions: {} },
              { id: "line3", actions: {} },
            ],
          }),
        },
      });
      engine.handleAction("startSkipMode", {});
      engine.handleAction("nextLineFromSystem", {});
      expect(
        engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe("choiceLine");
      engine.handleAction("setSkipUnseenText", { value: false });
      handledEffectNames.length = 0;

      engine.handleActions(
        {
          conditional: {
            branches,
          },
        },
        undefined,
        { bypassChoice: true },
      );

      const state = engine.selectSystemState();
      expect(state.contexts.at(-1).pointers.read.lineId).toBe("line2");
      expect(state.contexts.at(-1).variables.score).toBe(expectedScore);
      expect(state.global.skipMode).toBe(false);
      expect(handledEffectNames).toContain("clearSkipNextTimer");
      expect(handledEffectNames).not.toContain("startSkipNextTimer");
    },
  );

  it("does not let conditional continuation bypass an unauthorized choice", () => {
    const engine = createEngine(
      createProjectData({
        lineActions: {
          choice: {
            resourceId: "choiceLayout",
            items: [{ id: "continue", content: "Continue" }],
          },
        },
        extraLines: [{ id: "line2", actions: {} }],
      }),
    );

    engine.handleAction("conditional", {
      branches: [
        {
          when: true,
          actions: setScoreAction("unauthorizedChoiceBranch", 6),
        },
      ],
    });

    const state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line1");
    expect(state.contexts.at(-1).variables.score).toBe(6);
  });

  it("does not carry source choice authorization into a destination choice conditional", () => {
    const engine = createEngineWithLineActions(
      createProjectData({
        lineActions: {
          choice: {
            resourceId: "sourceChoiceLayout",
            items: [{ id: "continue", content: "Continue" }],
          },
        },
        extraLines: [
          {
            id: "line2",
            actions: {
              choice: {
                resourceId: "destinationChoiceLayout",
                items: [{ id: "stay", content: "Stay" }],
              },
              conditional: {
                branches: [{ when: true, actions: {} }],
              },
            },
          },
          { id: "line3", actions: {} },
        ],
      }),
    );

    engine.handleActions(
      {
        conditional: {
          branches: [{ when: true, actions: {} }],
        },
      },
      undefined,
      { bypassChoice: true },
    );

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(engine.selectIsChoiceVisible()).toBe(true);
  });
});
