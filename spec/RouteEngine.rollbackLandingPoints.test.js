import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import {
  selectCanRollback,
  selectLineIdByOffset,
} from "../src/stores/system.store.js";

const createResources = () => ({
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
  controls: {},
});

const createProjectData = ({ initialSectionId = "main", sections }) => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: createResources(),
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId,
        sections,
      },
    },
  },
});

const createEngineFromInitialState = (initialState, observeEffects) => {
  let engine;
  const handlePendingEffects = (effects) => {
    observeEffects?.(effects);
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
    initialState,
  });

  return engine;
};

const createEngine = (projectData) =>
  createEngineFromInitialState({
    projectData,
  });

const createSavedTimelineSlot = ({
  slotId = 1,
  readPointer,
  timeline,
  currentIndex = timeline.length - 1,
  returnabilityVersion,
}) => ({
  formatVersion: 1,
  slotId,
  savedAt: 1700000000000,
  image: null,
  state: {
    contexts: [
      {
        pointers: {
          read: readPointer,
        },
        variables: {},
        rollback: {
          currentIndex,
          isRestoring: false,
          replayStartIndex: 0,
          ...(returnabilityVersion === undefined
            ? {}
            : { returnabilityVersion }),
          timeline,
        },
      },
    ],
  },
});

const createEngineWithSavedTimeline = ({
  projectData,
  readPointer,
  timeline,
  currentIndex = timeline.length - 1,
}) => {
  const engine = createEngineFromInitialState({
    projectData,
    global: {
      saveSlots: {
        1: createSavedTimelineSlot({
          readPointer,
          timeline,
          currentIndex,
        }),
      },
    },
  });

  engine.handleAction("loadSlot", { slotId: 1 });
  return engine;
};

const getContext = (engine) => engine.selectSystemState().contexts.at(-1);

const getPointer = (engine) => getContext(engine).pointers.read;

const getTimeline = (engine) => getContext(engine).rollback.timeline;

const advance = (engine) => {
  engine.handleAction("markLineCompleted", {});
  engine.handleAction("nextLine", {});
};

const getCheckpoint = (engine, sectionId, lineId, occurrence = 0) =>
  getTimeline(engine).filter(
    (checkpoint) =>
      checkpoint.sectionId === sectionId && checkpoint.lineId === lineId,
  )[occurrence];

const updateScore = (id, op, value) => ({
  updateVariable: {
    id,
    operations: [
      {
        variableId: "score",
        op,
        value,
      },
    ],
  },
});

const createConditionalBranches = (outcome, actions = {}) => {
  if (outcome === "matched") {
    return [{ when: true, actions }];
  }
  if (outcome === "default") {
    return [{ when: false, actions: {} }, { actions }];
  }
  return [{ when: false, actions: {} }];
};

const conditionalLine = (id, outcome, actions = {}) => ({
  id,
  actions: {
    conditional: {
      branches: createConditionalBranches(outcome, actions),
    },
  },
});

const settledLine = (id, actions = {}) => ({
  id,
  actions,
});

describe("RouteEngine rollback landing points", () => {
  it.each(["matched", "default", "unmatched"])(
    "skips a %s line-entry conditional in one Back action",
    (outcome) => {
      const engine = createEngine(
        createProjectData({
          sections: {
            main: {
              lines: [
                settledLine("before"),
                conditionalLine("router", outcome),
                settledLine("after"),
              ],
            },
          },
        }),
      );

      advance(engine);

      expect(getPointer(engine)).toEqual({
        sectionId: "main",
        lineId: "after",
      });
      expect(getCheckpoint(engine, "main", "router")?.returnable).toBe(false);

      engine.handleAction("rollbackByOffset", {});

      expect(getPointer(engine)).toEqual({
        sectionId: "main",
        lineId: "before",
      });
    },
  );

  it("keeps rollbackToLine exact when explicitly targeting a transient checkpoint", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          main: {
            lines: [
              settledLine("before"),
              conditionalLine("router", "matched"),
              settledLine("after"),
            ],
          },
        },
      }),
    );

    advance(engine);
    expect(getCheckpoint(engine, "main", "router")?.returnable).toBe(false);

    engine.handleAction("rollbackToLine", {
      sectionId: "main",
      lineId: "router",
    });

    expect(getPointer(engine)).toEqual({
      sectionId: "main",
      lineId: "router",
    });

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "main",
      lineId: "before",
    });
  });

  it("skips a successful line-entry section transition across sections", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          source: {
            lines: [
              settledLine("before"),
              settledLine("router", {
                sectionTransition: {
                  sectionId: "destination",
                },
              }),
            ],
          },
          destination: {
            lines: [settledLine("after")],
          },
        },
        initialSectionId: "source",
      }),
    );

    advance(engine);

    expect(getPointer(engine)).toEqual({
      sectionId: "destination",
      lineId: "after",
    });
    expect(getCheckpoint(engine, "source", "router")?.returnable).toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "source",
      lineId: "before",
    });
  });

  it("skips consecutive conditional and section-transition entries", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          source: {
            lines: [
              settledLine("before"),
              conditionalLine("conditionalRouter", "matched"),
              settledLine("sectionRouter", {
                sectionTransition: {
                  sectionId: "destination",
                },
              }),
            ],
          },
          destination: {
            lines: [
              conditionalLine("destinationRouter", "default"),
              settledLine("after"),
            ],
          },
        },
        initialSectionId: "source",
      }),
    );

    advance(engine);

    expect(getPointer(engine)).toEqual({
      sectionId: "destination",
      lineId: "after",
    });
    expect(
      getTimeline(engine)
        .slice(1, -1)
        .map(({ sectionId, lineId, returnable }) => ({
          sectionId,
          lineId,
          returnable,
        })),
    ).toEqual([
      {
        sectionId: "source",
        lineId: "conditionalRouter",
        returnable: false,
      },
      {
        sectionId: "source",
        lineId: "sectionRouter",
        returnable: false,
      },
      {
        sectionId: "destination",
        lineId: "destinationRouter",
        returnable: false,
      },
    ]);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "source",
      lineId: "before",
    });
  });

  it("skips every unsettled checkpoint created by a multi-route line batch", () => {
    const engine = createEngine(
      createProjectData({
        initialSectionId: "source",
        sections: {
          source: {
            lines: [
              settledLine("before"),
              settledLine("router", {
                conditional: {
                  branches: [
                    {
                      when: true,
                      actions: {
                        sectionTransition: {
                          sectionId: "destination1",
                        },
                      },
                    },
                  ],
                },
                sectionTransition: {
                  sectionId: "destination2",
                },
              }),
            ],
          },
          destination1: {
            lines: [settledLine("neverSettled")],
          },
          destination2: {
            lines: [
              settledLine("savedDestination", {
                saveSlot: {
                  slotId: 1,
                  savedAt: 1700000000000,
                },
              }),
            ],
          },
        },
      }),
    );

    advance(engine);

    expect(getPointer(engine)).toEqual({
      sectionId: "destination2",
      lineId: "savedDestination",
    });
    expect(getCheckpoint(engine, "source", "router")?.returnable).toBe(false);
    expect(
      getCheckpoint(engine, "destination1", "neverSettled")?.returnable,
    ).toBe(false);

    const savedRollback =
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .rollback;
    expect(savedRollback.returnabilityVersion).toBe(1);
    expect(
      savedRollback.timeline.find(({ lineId }) => lineId === "router")
        ?.returnable,
    ).toBe(false);
    expect(
      savedRollback.timeline.find(({ lineId }) => lineId === "neverSettled")
        ?.returnable,
    ).toBe(false);

    engine.handleAction("loadSlot", { slotId: 1 });
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "source",
      lineId: "before",
    });
  });

  it("keeps only the settled interaction source returnable in a multi-route batch", () => {
    const engine = createEngine(
      createProjectData({
        initialSectionId: "source",
        sections: {
          source: {
            lines: [settledLine("before"), settledLine("interactionSource")],
          },
          destination1: {
            lines: [settledLine("neverSettled")],
          },
          destination2: {
            lines: [settledLine("finalDestination")],
          },
        },
      }),
    );

    advance(engine);
    engine.handleActions({
      conditional: {
        branches: [
          {
            when: true,
            actions: {
              sectionTransition: {
                sectionId: "destination1",
              },
            },
          },
        ],
      },
      sectionTransition: {
        sectionId: "destination2",
      },
    });

    expect(
      getCheckpoint(engine, "source", "interactionSource")?.returnable,
    ).not.toBe(false);
    expect(
      getCheckpoint(engine, "destination1", "neverSettled")?.returnable,
    ).toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "source",
      lineId: "interactionSource",
    });

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "source",
      lineId: "before",
    });
  });

  it("preserves a settled first-line occurrence when same-pointer re-entry routes away", () => {
    const engine = createEngine(
      createProjectData({
        initialSectionId: "source",
        sections: {
          source: {
            lines: [
              settledLine("router", {
                choice: {
                  resourceId: "choiceLayout",
                },
                conditional: {
                  branches: [
                    {
                      when: {
                        eq: [{ var: "variables.score" }, 1],
                      },
                      actions: {
                        sectionTransition: {
                          sectionId: "destination",
                        },
                      },
                    },
                  ],
                },
              }),
            ],
          },
          destination: {
            lines: [settledLine("after")],
          },
        },
      }),
    );

    expect(getPointer(engine)).toMatchObject({
      sectionId: "source",
      lineId: "router",
    });
    expect(getTimeline(engine)).toHaveLength(1);

    engine.handleActions(
      {
        ...updateScore("chooseRoute", "set", 1),
        sectionTransition: {
          sectionId: "source",
        },
      },
      undefined,
      { bypassChoice: true },
    );

    expect(getPointer(engine)).toMatchObject({
      sectionId: "destination",
      lineId: "after",
    });
    expect(getTimeline(engine)).toHaveLength(3);
    expect(getCheckpoint(engine, "source", "router", 0)?.returnable).not.toBe(
      false,
    );
    expect(getCheckpoint(engine, "source", "router", 1)?.returnable).toBe(
      false,
    );

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "source",
      lineId: "router",
    });
  });

  it("preserves a settled occurrence across checkpoint-less interaction re-entry", () => {
    const engine = createEngine(
      createProjectData({
        initialSectionId: "beforeSection",
        sections: {
          beforeSection: {
            lines: [settledLine("before")],
          },
          source: {
            lines: [settledLine("settledSource"), settledLine("temporary")],
          },
          destination: {
            lines: [settledLine("after")],
          },
        },
      }),
    );

    engine.handleAction("sectionTransition", {
      sectionId: "source",
    });
    expect(getPointer(engine).lineId).toBe("settledSource");

    engine.handleActions({
      jumpToLine: {
        lineId: "temporary",
      },
      sectionTransition: {
        sectionId: "source",
      },
      conditional: {
        branches: [
          {
            when: true,
            actions: {
              sectionTransition: {
                sectionId: "destination",
              },
            },
          },
        ],
      },
    });

    expect(getPointer(engine)).toEqual({
      sectionId: "destination",
      lineId: "after",
    });
    expect(getTimeline(engine)).toHaveLength(4);
    expect(
      getCheckpoint(engine, "source", "settledSource", 0)?.returnable,
    ).not.toBe(false);
    expect(
      getCheckpoint(engine, "source", "settledSource", 1)?.returnable,
    ).toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "source",
      lineId: "settledSource",
    });
  });

  it("creates fresh eligibility when a transient checkpoint is re-entered", () => {
    const engine = createEngine(
      createProjectData({
        initialSectionId: "loop",
        sections: {
          loop: {
            lines: [
              settledLine("loopAnchor"),
              settledLine("router", {
                conditional: {
                  branches: [
                    {
                      when: {
                        eq: [{ var: "variables.score" }, 0],
                      },
                      actions: {
                        jumpToLine: {
                          lineId: "loopAnchor",
                        },
                      },
                    },
                  ],
                },
              }),
            ],
          },
          destination: {
            lines: [settledLine("after")],
          },
        },
      }),
    );

    advance(engine);

    expect(getPointer(engine).lineId).toBe("loopAnchor");
    expect(getCheckpoint(engine, "loop", "router", 0)?.returnable).toBe(false);

    engine.handleActions(updateScore("settleRouter", "set", 1));
    advance(engine);

    expect(getPointer(engine).lineId).toBe("router");
    expect(getCheckpoint(engine, "loop", "router", 0)?.returnable).toBe(false);
    expect(getCheckpoint(engine, "loop", "router", 1)?.returnable).not.toBe(
      false,
    );

    engine.handleAction("sectionTransition", {
      sectionId: "destination",
    });
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "loop",
      lineId: "router",
    });
    expect(getContext(engine).variables.score).toBe(1);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "loop",
      lineId: "loopAnchor",
    });
    expect(getContext(engine).variables.score).toBe(0);
  });

  it("skips a conditional source that jumps without appending its destination", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          main: {
            lines: [
              settledLine("before"),
              settledLine("jumpRouter", {
                conditional: {
                  branches: [
                    {
                      when: true,
                      actions: {
                        jumpToLine: {
                          lineId: "jumpDestination",
                        },
                      },
                    },
                  ],
                },
              }),
              settledLine("unreached"),
              settledLine("jumpDestination"),
              settledLine("after"),
            ],
          },
        },
      }),
    );

    advance(engine);

    expect(getPointer(engine).lineId).toBe("jumpDestination");
    expect(getCheckpoint(engine, "main", "jumpRouter")?.returnable).toBe(false);
    expect(getCheckpoint(engine, "main", "jumpDestination")).toBeUndefined();

    advance(engine);
    expect(getPointer(engine).lineId).toBe("after");
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine).lineId).toBe("before");
  });

  it("keeps an interaction-triggered conditional source returnable", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          source: {
            lines: [settledLine("choiceSource")],
          },
          destination: {
            lines: [settledLine("afterChoice")],
          },
        },
        initialSectionId: "source",
      }),
    );

    engine.handleAction("conditional", {
      branches: [
        {
          when: true,
          actions: {
            sectionTransition: {
              sectionId: "destination",
            },
          },
        },
      ],
    });

    expect(
      getCheckpoint(engine, "source", "choiceSource")?.returnable,
    ).not.toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "source",
      lineId: "choiceSource",
    });
  });

  it("keeps an interaction-triggered section-transition source returnable", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          source: {
            lines: [settledLine("clickSource")],
          },
          destination: {
            lines: [settledLine("afterClick")],
          },
        },
        initialSectionId: "source",
      }),
    );

    engine.handleAction("sectionTransition", {
      sectionId: "destination",
    });

    expect(getCheckpoint(engine, "source", "clickSource")?.returnable).not.toBe(
      false,
    );

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "source",
      lineId: "clickSource",
    });
  });

  it("keeps a line returnable when its authored section transition fails", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const engine = createEngine(
        createProjectData({
          sections: {
            main: {
              lines: [
                settledLine("before"),
                settledLine("failedRouter", {
                  sectionTransition: {
                    sectionId: "missing",
                  },
                }),
                settledLine("after"),
              ],
            },
          },
        }),
      );

      advance(engine);
      expect(getPointer(engine).lineId).toBe("failedRouter");
      advance(engine);

      expect(
        getCheckpoint(engine, "main", "failedRouter")?.returnable,
      ).not.toBe(false);

      engine.handleAction("rollbackByOffset", {});

      expect(getPointer(engine)).toEqual({
        sectionId: "main",
        lineId: "failedRouter",
      });
      expect(warn).toHaveBeenCalledWith("Section not found: missing");
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps an end-of-section conditional returnable when it cannot continue", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          main: {
            lines: [
              settledLine("before"),
              conditionalLine("endRouter", "unmatched"),
            ],
          },
          destination: {
            lines: [settledLine("after")],
          },
        },
      }),
    );

    advance(engine);

    expect(getPointer(engine)).toEqual({
      sectionId: "main",
      lineId: "endRouter",
    });
    expect(getCheckpoint(engine, "main", "endRouter")?.returnable).not.toBe(
      false,
    );

    engine.handleAction("sectionTransition", {
      sectionId: "destination",
    });
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "main",
      lineId: "endRouter",
    });
  });

  it.each([
    { offset: -1, lineId: "middle" },
    { offset: -2, lineId: "before" },
  ])("counts only landing points for offset $offset", ({ offset, lineId }) => {
    const engine = createEngine(
      createProjectData({
        sections: {
          main: {
            lines: [
              settledLine("before"),
              conditionalLine("router1", "matched"),
              settledLine("middle"),
              conditionalLine("router2", "default"),
              settledLine("after"),
            ],
          },
        },
      }),
    );

    advance(engine);
    advance(engine);

    expect(getPointer(engine).lineId).toBe("after");

    engine.handleAction("rollbackByOffset", { offset });

    expect(getPointer(engine)).toEqual({
      sectionId: "main",
      lineId,
    });
  });

  it("disables rollback when all earlier entries are transient", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          main: {
            lines: [
              conditionalLine("initialRouter", "matched"),
              settledLine("onlyLandingPoint"),
            ],
          },
        },
      }),
    );

    const stateBeforeBack = engine.selectSystemState();
    expect(getPointer(engine).lineId).toBe("onlyLandingPoint");
    expect(getTimeline(engine)[0].returnable).toBe(false);
    expect(selectCanRollback({ state: stateBeforeBack })).toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine).lineId).toBe("onlyLandingPoint");
  });

  it("includes transient mutations when restoring a later landing point", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          main: {
            lines: [
              settledLine("before", updateScore("setOne", "set", 1)),
              conditionalLine(
                "router",
                "matched",
                updateScore("addTen", "increment", 10),
              ),
              settledLine(
                "middle",
                updateScore("addHundred", "increment", 100),
              ),
              settledLine("after"),
            ],
          },
        },
      }),
    );

    advance(engine);
    expect(getContext(engine).variables.score).toBe(111);
    advance(engine);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine).lineId).toBe("middle");
    expect(getContext(engine).variables.score).toBe(111);
  });

  it("excludes transient mutations when Back skips to an earlier landing point", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          main: {
            lines: [
              settledLine("before", updateScore("setOne", "set", 1)),
              conditionalLine(
                "router",
                "matched",
                updateScore("addTen", "increment", 10),
              ),
              settledLine("after"),
            ],
          },
        },
      }),
    );

    advance(engine);
    expect(getContext(engine).variables.score).toBe(11);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine).lineId).toBe("before");
    expect(getContext(engine).variables.score).toBe(1);
  });

  it("does not cross a resetStoryAtSection rollback boundary", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          source: {
            lines: [settledLine("before"), settledLine("sourceCurrent")],
          },
          resetTarget: {
            lines: [settledLine("newStart")],
          },
        },
        initialSectionId: "source",
      }),
    );

    advance(engine);
    engine.handleAction("resetStoryAtSection", {
      sectionId: "resetTarget",
    });

    const stateAfterReset = engine.selectSystemState();
    expect(getTimeline(engine)).toHaveLength(1);
    expect(selectCanRollback({ state: stateAfterReset })).toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "resetTarget",
      lineId: "newStart",
    });
  });

  it("refreshes a same-pointer reset root before a sibling route", () => {
    const engine = createEngine(
      createProjectData({
        initialSectionId: "source",
        sections: {
          source: {
            lines: [settledLine("before")],
          },
          main: {
            lines: [
              settledLine("router", {
                resetStoryAtSection: {
                  sectionId: "main",
                },
                sectionTransition: {
                  sectionId: "destination",
                },
              }),
            ],
          },
          destination: {
            lines: [settledLine("after")],
          },
        },
      }),
    );

    engine.handleAction("sectionTransition", {
      sectionId: "main",
    });

    expect(getPointer(engine)).toMatchObject({
      sectionId: "destination",
      lineId: "after",
    });
    expect(getTimeline(engine)).toEqual([
      expect.objectContaining({
        sectionId: "main",
        lineId: "router",
        returnable: false,
      }),
      expect.objectContaining({
        sectionId: "destination",
        lineId: "after",
      }),
    ]);
    expect(selectCanRollback({ state: engine.selectSystemState() })).toBe(
      false,
    );

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "destination",
      lineId: "after",
    });
  });

  it("finalizes a saved occurrence before a same-pointer reset replaces it", () => {
    const engine = createEngine(
      createProjectData({
        initialSectionId: "source",
        sections: {
          source: {
            lines: [settledLine("before")],
          },
          destination: {
            lines: [settledLine("router")],
          },
          final: {
            lines: [settledLine("after")],
          },
        },
      }),
    );

    engine.handleActions({
      sectionTransition: {
        sectionId: "destination",
      },
      saveSlot: {
        slotId: 1,
        savedAt: 1700000000000,
      },
      resetStoryAtSection: {
        sectionId: "destination",
      },
    });

    expect(getTimeline(engine)).toHaveLength(1);
    expect(getCheckpoint(engine, "destination", "router")?.returnable).not.toBe(
      false,
    );
    const savedRollback =
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .rollback;
    expect(
      savedRollback.timeline.find(({ lineId }) => lineId === "router")
        ?.returnable,
    ).toBe(false);

    engine.handleAction("loadSlot", { slotId: 1 });
    engine.handleAction("sectionTransition", { sectionId: "final" });
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "source",
      lineId: "before",
    });
  });

  it("tracks eligibility per repeated line occurrence", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          repeated: {
            lines: [
              settledLine("shared", {
                conditional: {
                  branches: [
                    {
                      when: {
                        eq: [{ var: "variables.score" }, 0],
                      },
                      actions: {
                        sectionTransition: {
                          sectionId: "middle",
                        },
                      },
                    },
                  ],
                },
              }),
            ],
          },
          middle: {
            lines: [settledLine("middleLine")],
          },
          destination: {
            lines: [settledLine("after")],
          },
        },
        initialSectionId: "repeated",
      }),
    );

    expect(getPointer(engine)).toEqual({
      sectionId: "middle",
      lineId: "middleLine",
    });

    engine.handleActions({
      ...updateScore("chooseReturn", "set", 1),
      sectionTransition: {
        sectionId: "repeated",
      },
    });

    expect(getPointer(engine)).toEqual({
      sectionId: "repeated",
      lineId: "shared",
    });
    expect(getCheckpoint(engine, "repeated", "shared", 0)?.returnable).toBe(
      false,
    );
    expect(getCheckpoint(engine, "repeated", "shared", 1)?.returnable).not.toBe(
      false,
    );

    engine.handleAction("sectionTransition", {
      sectionId: "destination",
    });
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "repeated",
      lineId: "shared",
    });

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "middle",
      lineId: "middleLine",
    });
  });

  it("derives a legacy line-entry conditional as transient on load", () => {
    const projectData = createProjectData({
      initialSectionId: "bootstrap",
      sections: {
        bootstrap: {
          lines: [settledLine("boot")],
        },
        main: {
          lines: [
            settledLine("before"),
            conditionalLine("router", "matched"),
            settledLine("after"),
          ],
        },
      },
    });
    const engine = createEngineWithSavedTimeline({
      projectData,
      readPointer: {
        sectionId: "main",
        lineId: "after",
      },
      timeline: [
        { sectionId: "main", lineId: "before" },
        { sectionId: "main", lineId: "router" },
        { sectionId: "main", lineId: "after" },
      ],
    });

    expect(getCheckpoint(engine, "main", "router")?.returnable).toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "main",
      lineId: "before",
    });
  });

  it("derives a legacy line-entry section transition as transient on load", () => {
    const projectData = createProjectData({
      initialSectionId: "bootstrap",
      sections: {
        bootstrap: {
          lines: [settledLine("boot")],
        },
        source: {
          lines: [
            settledLine("before"),
            settledLine("router", {
              sectionTransition: {
                sectionId: "destination",
              },
            }),
          ],
        },
        destination: {
          lines: [settledLine("after")],
        },
      },
    });
    const engine = createEngineWithSavedTimeline({
      projectData,
      readPointer: {
        sectionId: "destination",
        lineId: "after",
      },
      timeline: [
        { sectionId: "source", lineId: "before" },
        { sectionId: "source", lineId: "router" },
        { sectionId: "destination", lineId: "after" },
      ],
    });

    expect(getCheckpoint(engine, "source", "router")?.returnable).toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "source",
      lineId: "before",
    });
  });

  it.each([
    { name: "boolean false", when: false },
    { name: "literal false", when: { literal: false } },
  ])(
    "keeps a legacy interaction checkpoint eligible past a $name route",
    ({ when }) => {
      const projectData = createProjectData({
        initialSectionId: "bootstrap",
        sections: {
          bootstrap: {
            lines: [settledLine("boot")],
          },
          source: {
            lines: [
              settledLine("before"),
              settledLine("interaction", {
                choice: {
                  resourceId: "choiceLayout",
                },
                conditional: {
                  branches: [
                    {
                      when,
                      actions: {
                        sectionTransition: {
                          sectionId: "destination",
                        },
                      },
                    },
                  ],
                },
              }),
            ],
          },
          destination: {
            lines: [settledLine("after")],
          },
        },
      });
      const engine = createEngineWithSavedTimeline({
        projectData,
        readPointer: {
          sectionId: "destination",
          lineId: "after",
        },
        timeline: [
          { sectionId: "source", lineId: "before" },
          { sectionId: "source", lineId: "interaction" },
          { sectionId: "destination", lineId: "after" },
        ],
      });

      expect(
        getCheckpoint(engine, "source", "interaction")?.returnable,
      ).not.toBe(false);

      engine.handleAction("rollbackByOffset", {});

      expect(getPointer(engine)).toMatchObject({
        sectionId: "source",
        lineId: "interaction",
      });
    },
  );

  it("ignores legacy conditional branches after a definite match", () => {
    const projectData = createProjectData({
      initialSectionId: "bootstrap",
      sections: {
        bootstrap: {
          lines: [settledLine("boot")],
        },
        source: {
          lines: [
            settledLine("before"),
            settledLine("interaction", {
              choice: {
                resourceId: "choiceLayout",
              },
              conditional: {
                branches: [
                  {
                    when: true,
                    actions: {},
                  },
                  {
                    actions: {
                      sectionTransition: {
                        sectionId: "destination",
                      },
                    },
                  },
                ],
              },
            }),
          ],
        },
        destination: {
          lines: [settledLine("after")],
        },
      },
    });
    const engine = createEngineWithSavedTimeline({
      projectData,
      readPointer: {
        sectionId: "destination",
        lineId: "after",
      },
      timeline: [
        { sectionId: "source", lineId: "before" },
        { sectionId: "source", lineId: "interaction" },
        { sectionId: "destination", lineId: "after" },
      ],
    });

    expect(getCheckpoint(engine, "source", "interaction")?.returnable).not.toBe(
      false,
    );

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "source",
      lineId: "interaction",
    });
  });

  it("derives implicit continuation past a statically untaken legacy route", () => {
    const projectData = createProjectData({
      initialSectionId: "bootstrap",
      sections: {
        bootstrap: {
          lines: [settledLine("boot")],
        },
        main: {
          lines: [
            settledLine("before"),
            settledLine("router", {
              conditional: {
                branches: [
                  {
                    when: false,
                    actions: {
                      sectionTransition: {
                        sectionId: "unused",
                      },
                    },
                  },
                ],
              },
            }),
            settledLine("after"),
          ],
        },
        unused: {
          lines: [settledLine("unusedLine")],
        },
      },
    });
    const engine = createEngineWithSavedTimeline({
      projectData,
      readPointer: {
        sectionId: "main",
        lineId: "after",
      },
      timeline: [
        { sectionId: "main", lineId: "before" },
        { sectionId: "main", lineId: "router" },
        { sectionId: "main", lineId: "after" },
      ],
    });

    expect(getCheckpoint(engine, "main", "router")?.returnable).toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "main",
      lineId: "before",
    });
  });

  it("respects explicit legacy eligibility instead of re-deriving it", () => {
    const projectData = createProjectData({
      initialSectionId: "bootstrap",
      sections: {
        bootstrap: {
          lines: [settledLine("boot")],
        },
        main: {
          lines: [
            settledLine("before"),
            conditionalLine("authoredRouter", "matched"),
            settledLine("explicitlySkipped"),
            settledLine("after"),
          ],
        },
      },
    });
    const explicitlyReturnable = createEngineWithSavedTimeline({
      projectData,
      readPointer: {
        sectionId: "main",
        lineId: "explicitlySkipped",
      },
      timeline: [
        { sectionId: "main", lineId: "before" },
        { sectionId: "main", lineId: "authoredRouter", returnable: true },
        { sectionId: "main", lineId: "explicitlySkipped" },
      ],
    });

    expect(
      getCheckpoint(explicitlyReturnable, "main", "authoredRouter")?.returnable,
    ).toBe(true);

    explicitlyReturnable.handleAction("rollbackByOffset", {});

    expect(getPointer(explicitlyReturnable).lineId).toBe("authoredRouter");

    const explicitlyTransient = createEngineWithSavedTimeline({
      projectData,
      readPointer: {
        sectionId: "main",
        lineId: "after",
      },
      timeline: [
        { sectionId: "main", lineId: "before" },
        {
          sectionId: "main",
          lineId: "explicitlySkipped",
          returnable: false,
        },
        { sectionId: "main", lineId: "after" },
      ],
    });

    explicitlyTransient.handleAction("rollbackByOffset", {});

    expect(getPointer(explicitlyTransient).lineId).toBe("before");
  });

  it("does not mark a same-index loaded checkpoint when line entry replaces the timeline", () => {
    const projectData = createProjectData({
      sections: {
        main: {
          lines: [
            settledLine("before"),
            settledLine("loader", {
              loadSlot: {
                slotId: 1,
              },
            }),
          ],
        },
        destination: {
          lines: [settledLine("loadedCurrent")],
        },
      },
    });
    const engine = createEngineFromInitialState({
      projectData,
      global: {
        saveSlots: {
          1: createSavedTimelineSlot({
            readPointer: {
              sectionId: "destination",
              lineId: "loadedCurrent",
            },
            returnabilityVersion: 1,
            timeline: [
              { sectionId: "main", lineId: "before" },
              { sectionId: "main", lineId: "loader" },
              { sectionId: "destination", lineId: "loadedCurrent" },
            ],
          }),
        },
      },
    });

    advance(engine);

    expect(getPointer(engine)).toEqual({
      sceneId: "scene1",
      sectionId: "destination",
      lineId: "loadedCurrent",
    });
    expect(getTimeline(engine)[1]).toMatchObject({
      sectionId: "main",
      lineId: "loader",
    });
    expect(getTimeline(engine)[1].returnable).not.toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toEqual({
      sectionId: "main",
      lineId: "loader",
    });
  });

  it("finalizes a saved occurrence before a same-pointer load replaces it", () => {
    const projectData = createProjectData({
      initialSectionId: "source",
      sections: {
        source: {
          lines: [settledLine("before")],
        },
        destination: {
          lines: [settledLine("router")],
        },
        final: {
          lines: [settledLine("after")],
        },
      },
    });
    const engine = createEngineFromInitialState({
      projectData,
      global: {
        saveSlots: {
          2: createSavedTimelineSlot({
            slotId: 2,
            readPointer: {
              sectionId: "destination",
              lineId: "router",
            },
            returnabilityVersion: 1,
            timeline: [
              { sectionId: "source", lineId: "before" },
              { sectionId: "destination", lineId: "router" },
            ],
          }),
        },
      },
    });

    engine.handleActions({
      sectionTransition: {
        sectionId: "destination",
      },
      saveSlot: {
        slotId: 1,
        savedAt: 1700000000000,
      },
      loadSlot: {
        slotId: 2,
      },
    });

    expect(getCheckpoint(engine, "destination", "router")?.returnable).not.toBe(
      false,
    );
    const savedRollback =
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .rollback;
    expect(
      savedRollback.timeline.find(({ lineId }) => lineId === "router")
        ?.returnable,
    ).toBe(false);

    engine.handleAction("loadSlot", { slotId: 1 });
    engine.handleAction("sectionTransition", { sectionId: "final" });
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "source",
      lineId: "before",
    });
  });

  it("uses the save returnability version to preserve a settled conditional", () => {
    const engine = createEngine(
      createProjectData({
        initialSectionId: "source",
        sections: {
          source: {
            lines: [
              settledLine("settledConditional", {
                conditional: {
                  branches: [
                    {
                      when: false,
                      actions: {
                        sectionTransition: {
                          sectionId: "destination",
                        },
                      },
                    },
                  ],
                },
              }),
            ],
          },
          destination: {
            lines: [settledLine("after")],
          },
        },
      }),
    );

    expect(getPointer(engine).lineId).toBe("settledConditional");
    expect(
      getCheckpoint(engine, "source", "settledConditional")?.returnable,
    ).not.toBe(false);

    engine.handleAction("sectionTransition", {
      sectionId: "destination",
    });
    engine.handleAction("saveSlot", {
      slotId: 1,
      savedAt: 1700000000000,
    });

    const savedRollback =
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .rollback;
    expect(savedRollback.returnabilityVersion).toBe(1);
    expect(
      savedRollback.timeline.find(
        ({ lineId }) => lineId === "settledConditional",
      )?.returnable,
    ).toBeUndefined();

    engine.handleAction("loadSlot", { slotId: 1 });
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "source",
      lineId: "settledConditional",
    });
  });

  it.each([
    {
      name: "section transition",
      routerActions: {
        sectionTransition: {
          sectionId: "destination",
        },
      },
    },
    {
      name: "conditional section transition",
      routerActions: {
        conditional: {
          branches: [
            {
              when: true,
              actions: {
                sectionTransition: {
                  sectionId: "destination",
                },
              },
            },
          ],
        },
      },
    },
  ])(
    "finalizes a $name source before a destination line-authored save",
    ({ routerActions }) => {
      const engine = createEngine(
        createProjectData({
          initialSectionId: "source",
          sections: {
            source: {
              lines: [
                settledLine("before"),
                settledLine("router", routerActions),
              ],
            },
            destination: {
              lines: [
                settledLine("savedDestination", {
                  saveSlot: {
                    slotId: 1,
                    savedAt: 1700000000000,
                  },
                }),
              ],
            },
          },
        }),
      );

      advance(engine);

      const savedRollback =
        engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
          .rollback;
      expect(savedRollback.returnabilityVersion).toBe(1);
      expect(
        savedRollback.timeline.find(({ lineId }) => lineId === "router")
          ?.returnable,
      ).toBe(false);

      engine.handleAction("loadSlot", { slotId: 1 });
      engine.handleAction("rollbackByOffset", {});

      expect(getPointer(engine)).toMatchObject({
        sectionId: "source",
        lineId: "before",
      });
    },
  );

  it("finalizes a transition source before a later sibling save action", () => {
    const engine = createEngine(
      createProjectData({
        initialSectionId: "source",
        sections: {
          source: {
            lines: [
              settledLine("before"),
              settledLine("router", {
                sectionTransition: {
                  sectionId: "destination",
                },
                saveSlot: {
                  slotId: 1,
                  savedAt: 1700000000000,
                },
              }),
            ],
          },
          destination: {
            lines: [settledLine("savedDestination")],
          },
        },
      }),
    );

    advance(engine);

    const savedRollback =
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .rollback;
    expect(savedRollback.returnabilityVersion).toBe(1);
    expect(
      savedRollback.timeline.find(({ lineId }) => lineId === "router")
        ?.returnable,
    ).toBe(false);

    engine.handleAction("loadSlot", { slotId: 1 });
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "source",
      lineId: "before",
    });
  });

  it("carries a routed save into destination line-entry classification", () => {
    const persistedSaveSlots = [];
    const projectData = createProjectData({
      initialSectionId: "source",
      sections: {
        source: {
          lines: [
            settledLine("before"),
            settledLine("sourceRouter", {
              sectionTransition: {
                sectionId: "destination",
              },
              saveSlot: {
                slotId: 1,
                savedAt: 1700000000000,
              },
            }),
          ],
        },
        destination: {
          lines: [
            conditionalLine("destinationRouter", "matched"),
            settledLine("after"),
          ],
        },
      },
    });
    const engine = createEngineFromInitialState({ projectData }, (effects) => {
      effects.forEach((effect) => {
        if (effect.name === "saveSlots") {
          persistedSaveSlots.push(structuredClone(effect.payload.saveSlots));
        }
      });
    });

    advance(engine);

    expect(getPointer(engine)).toMatchObject({
      sectionId: "destination",
      lineId: "after",
    });
    const savedRollback =
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .rollback;
    expect(savedRollback.returnabilityVersion).toBe(1);
    expect(
      savedRollback.timeline.find(
        ({ lineId }) => lineId === "destinationRouter",
      )?.returnable,
    ).toBe(false);
    const persistedRollback =
      persistedSaveSlots.at(-1)["1"].state.contexts[0].rollback;
    expect(
      persistedRollback.timeline.find(
        ({ lineId }) => lineId === "destinationRouter",
      )?.returnable,
    ).toBe(false);

    engine.handleAction("loadSlot", { slotId: 1 });
    engine.handleAction("nextLine", {});
    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine)).toMatchObject({
      sectionId: "source",
      lineId: "before",
    });
  });

  it("restores a routed-save handoff when destination line actions fail", () => {
    const replacementSections = {
      source: {
        lines: [settledLine("sourceRouter")],
      },
      destination: {
        lines: [settledLine("destinationRouter")],
      },
      final: {
        lines: [settledLine("after")],
      },
    };
    const validReplacement = createProjectData({
      initialSectionId: "source",
      sections: replacementSections,
    });
    const invalidReplacement = structuredClone(validReplacement);
    invalidReplacement.resources.variables = {
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
    };
    const projectData = createProjectData({
      initialSectionId: "source",
      sections: {
        source: {
          lines: [
            settledLine("sourceRouter", {
              sectionTransition: {
                sectionId: "destination",
              },
              saveSlot: {
                slotId: 1,
                savedAt: 1700000000000,
              },
            }),
          ],
        },
        destination: {
          lines: [
            settledLine("destinationRouter", {
              updateProjectData: "${variables.nextProject}",
              sectionTransition: {
                sectionId: "final",
              },
            }),
          ],
        },
        final: {
          lines: [settledLine("after")],
        },
      },
    });
    projectData.resources.variables.nextProject = {
      type: "object",
      scope: "device",
      default: {
        projectData: invalidReplacement,
      },
    };

    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    engine.init({
      initialState: { projectData },
    });
    engine.handleLineActions();

    expect(getPointer(engine)).toMatchObject({
      sectionId: "destination",
      lineId: "destinationRouter",
    });
    expect(() => engine.handleLineActions()).toThrow(
      "Computed variable cycle detected: a -> b -> a",
    );

    engine.handleAction("updateVariable", {
      id: "repairReplacement",
      operations: [
        {
          variableId: "nextProject",
          op: "set",
          value: {
            projectData: validReplacement,
          },
        },
      ],
    });
    expect(() => engine.handleLineActions()).not.toThrow();

    expect(getPointer(engine)).toMatchObject({
      sectionId: "final",
      lineId: "after",
    });
    expect(
      getCheckpoint(engine, "destination", "destinationRouter")?.returnable,
    ).toBe(false);
    const savedTimeline =
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .rollback.timeline;
    expect(
      savedTimeline.find(({ lineId }) => lineId === "destinationRouter")
        ?.returnable,
    ).toBe(false);
  });

  it.each([
    {
      name: "section transition",
      routingActions: {
        sectionTransition: {
          sectionId: "destination",
        },
      },
    },
    {
      name: "conditional section transition",
      routingActions: {
        conditional: {
          branches: [
            {
              when: true,
              actions: {
                sectionTransition: {
                  sectionId: "destination",
                },
              },
            },
          ],
        },
      },
    },
  ])(
    "updates an earlier sibling save after a later $name finalizes the source",
    ({ routingActions }) => {
      const engine = createEngine(
        createProjectData({
          initialSectionId: "source",
          sections: {
            source: {
              lines: [
                settledLine("before"),
                settledLine("router", {
                  saveSlot: {
                    slotId: 1,
                    savedAt: 1700000000000,
                  },
                  ...routingActions,
                }),
              ],
            },
            destination: {
              lines: [settledLine("after")],
            },
          },
        }),
      );

      advance(engine);

      const savedRollback =
        engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
          .rollback;
      expect(savedRollback.returnabilityVersion).toBe(1);
      expect(
        savedRollback.timeline.find(({ lineId }) => lineId === "router")
          ?.returnable,
      ).toBe(false);

      engine.handleAction("loadSlot", { slotId: 1 });
      engine.handleAction("rollbackByOffset", {});

      expect(getPointer(engine)).toMatchObject({
        sectionId: "source",
        lineId: "before",
      });
    },
  );

  it("persists and restores transient eligibility through save/load", () => {
    const engine = createEngine(
      createProjectData({
        sections: {
          main: {
            lines: [
              settledLine("before"),
              conditionalLine("router", "matched"),
              settledLine("after"),
              settledLine("later"),
            ],
          },
        },
      }),
    );

    advance(engine);
    engine.handleAction("saveSlot", {
      slotId: 1,
      savedAt: 1700000000000,
    });

    const savedTimeline =
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .rollback.timeline;
    expect(
      savedTimeline.find(({ lineId }) => lineId === "router")?.returnable,
    ).toBe(false);

    advance(engine);
    expect(getPointer(engine).lineId).toBe("later");
    engine.handleAction("loadSlot", { slotId: 1 });

    expect(getPointer(engine).lineId).toBe("after");
    expect(getCheckpoint(engine, "main", "router")?.returnable).toBe(false);

    engine.handleAction("rollbackByOffset", {});

    expect(getPointer(engine).lineId).toBe("before");
  });
});

describe("rollback landing-point selectors", () => {
  const createSelectorState = (currentIndex, timeline) => ({
    contexts: [
      {
        rollback: {
          currentIndex,
          timeline,
        },
      },
    ],
  });

  it("skips sparse ineligible checkpoints and counts eligible offsets", () => {
    const state = createSelectorState(5, [
      { sectionId: "one", lineId: "a" },
      { sectionId: "one", lineId: "router1", returnable: false },
      { sectionId: "two", lineId: "router2", returnable: false },
      { sectionId: "two", lineId: "b" },
      { sectionId: "two", lineId: "router3", returnable: false },
      { sectionId: "two", lineId: "c" },
    ]);

    expect(selectLineIdByOffset({ state }, { offset: -1 })).toEqual({
      sectionId: "two",
      lineId: "b",
    });
    expect(selectLineIdByOffset({ state }, { offset: -2 })).toEqual({
      sectionId: "one",
      lineId: "a",
    });
    expect(selectLineIdByOffset({ state }, { offset: -3 })).toBeNull();
  });

  it("treats missing and explicit true eligibility as returnable", () => {
    const state = createSelectorState(3, [
      { sectionId: "main", lineId: "legacy" },
      { sectionId: "main", lineId: "router", returnable: false },
      { sectionId: "main", lineId: "explicit", returnable: true },
      { sectionId: "main", lineId: "current" },
    ]);

    expect(selectLineIdByOffset({ state }, { offset: -1 })?.lineId).toBe(
      "explicit",
    );
    expect(selectLineIdByOffset({ state }, { offset: -2 })?.lineId).toBe(
      "legacy",
    );
  });

  it("retains raw positive traversal through transient checkpoints", () => {
    const state = createSelectorState(0, [
      { sectionId: "main", lineId: "current" },
      { sectionId: "main", lineId: "router", returnable: false },
      { sectionId: "main", lineId: "later" },
    ]);

    expect(selectLineIdByOffset({ state }, { offset: 1 })).toEqual({
      sectionId: "main",
      lineId: "router",
    });
    expect(selectLineIdByOffset({ state }, { offset: 2 })).toEqual({
      sectionId: "main",
      lineId: "later",
    });
  });

  it("reports rollback unavailable when no earlier landing point exists", () => {
    const state = createSelectorState(2, [
      { sectionId: "main", lineId: "router1", returnable: false },
      { sectionId: "main", lineId: "router2", returnable: false },
      { sectionId: "main", lineId: "current" },
    ]);

    expect(selectCanRollback({ state })).toBe(false);
  });
});
