import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import createEffectsHandler from "../src/createEffectsHandler.js";

const createTicker = () => {
  const callbacks = new Set();
  return {
    add: vi.fn((callback) => callbacks.add(callback)),
    remove: vi.fn((callback) => callbacks.delete(callback)),
    tick(deltaMS) {
      [...callbacks].forEach((callback) => callback({ deltaMS }));
    },
    has(callback) {
      return callbacks.has(callback);
    },
  };
};

const createNoopPersistence = () => ({
  saveSlots: vi.fn().mockResolvedValue(undefined),
  saveGlobalDeviceVariables: vi.fn().mockResolvedValue(undefined),
  saveGlobalAccountVariables: vi.fn().mockResolvedValue(undefined),
  saveGlobalRuntime: vi.fn().mockResolvedValue(undefined),
  applyScopedDataUpdates: vi.fn().mockResolvedValue(undefined),
});

const findElementById = (elements, id) => {
  for (const element of elements || []) {
    if (element?.id === id) {
      return element;
    }

    const nested = findElementById(element?.children, id);
    if (nested) {
      return nested;
    }
  }

  return null;
};

const createResources = () => ({
  layouts: {
    destinationDialogue: {
      mode: "adv",
      elements: [
        {
          id: "destination-dialogue-text",
          type: "text",
          content: "${dialogue.content[0].text}",
          textStyleId: "body",
        },
      ],
    },
  },
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
  fonts: {
    bodyFont: {
      fileId: "Arial",
    },
  },
  colors: {
    bodyColor: {
      hex: "#FFFFFF",
    },
  },
  textStyles: {
    body: {
      fontId: "bodyFont",
      colorId: "bodyColor",
      fontSize: 24,
      fontWeight: "400",
      fontStyle: "normal",
      lineHeight: 1.2,
    },
  },
});

const createProjectData = ({ initialSectionId, sections }) => ({
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

const destinationDialogueAction = {
  dialogue: {
    mode: "adv",
    ui: {
      resourceId: "destinationDialogue",
    },
    content: [
      {
        text: "Score ${variables.score}",
      },
    ],
  },
};

const createContinuationBranches = (outcome, actions = {}) => {
  if (outcome === "matched") {
    return [{ when: true, actions }];
  }
  if (outcome === "default") {
    return [{ when: false, actions: {} }, { actions }];
  }
  return [{ when: false, actions: {} }];
};

const createRenderingEngine = (projectData, onRender) => {
  let engine;
  const ticker = createTicker();
  const routeGraphics = {
    render: vi.fn((renderState) => onRender?.(renderState, engine)),
  };
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics,
    ticker,
    persistence: createNoopPersistence(),
  });

  engine = createRouteEngine({
    handlePendingEffects: effectsHandler,
  });
  engine.init({
    initialState: {
      projectData,
    },
  });

  return {
    engine,
    routeGraphics,
    ticker,
  };
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

describe("conditional fallthrough runtime invariants", () => {
  it.each(["matched", "default", "unmatched"])(
    "defers source effects around a %s conditional",
    (outcome) => {
      for (const mutationPosition of ["before", "after"]) {
        const conditionalAction = {
          conditional: {
            branches: createContinuationBranches(outcome),
          },
        };
        const sourceMutation = setScoreAction("sourceMutation", 7);
        const sourceActions =
          mutationPosition === "before"
            ? {
                ...sourceMutation,
                ...conditionalAction,
              }
            : {
                ...conditionalAction,
                ...sourceMutation,
              };
        const renderedStates = [];
        createRenderingEngine(
          createProjectData({
            initialSectionId: "main",
            sections: {
              main: {
                lines: [
                  {
                    id: "line1",
                    actions: sourceActions,
                  },
                  {
                    id: "line2",
                    actions: destinationDialogueAction,
                  },
                ],
              },
            },
          }),
          (renderState, engine) => {
            const state = engine.selectSystemState();
            renderedStates.push({
              lineId: state.contexts.at(-1).pointers.read.lineId,
              score: state.contexts.at(-1).variables.score,
              text: findElementById(
                renderState.elements,
                "destination-dialogue-text",
              )?.content,
            });
          },
        );

        expect(renderedStates).toEqual([
          {
            lineId: "line2",
            score: 7,
            text: "Score 7",
          },
        ]);
      }
    },
  );

  it.each(["matched", "default"])(
    "settles a %s branch mutation before rendering the destination",
    (outcome) => {
      const renderedStates = [];
      createRenderingEngine(
        createProjectData({
          initialSectionId: "main",
          sections: {
            main: {
              lines: [
                {
                  id: "line1",
                  actions: {
                    conditional: {
                      branches: createContinuationBranches(
                        outcome,
                        setScoreAction("selectedBranch", 7),
                      ),
                    },
                  },
                },
                {
                  id: "line2",
                  actions: destinationDialogueAction,
                },
              ],
            },
          },
        }),
        (renderState, engine) => {
          renderedStates.push({
            lineId: engine.selectSystemState().contexts.at(-1).pointers.read
              .lineId,
            score: engine.selectSystemState().contexts.at(-1).variables.score,
            text: findElementById(
              renderState.elements,
              "destination-dialogue-text",
            )?.content,
          });
        },
      );

      expect(renderedStates).toEqual([
        {
          lineId: "line2",
          score: 7,
          text: "Score 7",
        },
      ]);
    },
  );

  it.each([
    ["global auto", { startAutoMode: {} }],
    [
      "from-complete scene auto",
      {
        setNextLineConfig: {
          manual: {
            enabled: true,
            requireLineCompleted: true,
          },
          auto: {
            enabled: true,
            trigger: "fromComplete",
            delay: 100,
          },
          applyMode: "persistent",
        },
      },
    ],
  ])(
    "clears the source %s timer when branch nextLine completes before implicit continuation",
    (_mode, playbackAction) => {
      const { engine, ticker } = createRenderingEngine(
        createProjectData({
          initialSectionId: "main",
          sections: {
            main: {
              lines: [
                {
                  id: "line1",
                  actions: {
                    ...playbackAction,
                    conditional: {
                      branches: [
                        {
                          when: true,
                          actions: {
                            nextLine: {},
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  id: "line2",
                  actions: destinationDialogueAction,
                },
                {
                  id: "line3",
                  actions: {},
                },
              ],
            },
          },
        }),
        undefined,
      );

      expect(
        engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe("line2");
      expect(ticker.add).toHaveBeenCalledTimes(1);
      expect(ticker.remove).toHaveBeenCalledWith(ticker.add.mock.calls[0][0]);
    },
  );

  it("starts exactly one destination from-start scene timer after continuation", () => {
    const { engine, ticker } = createRenderingEngine(
      createProjectData({
        initialSectionId: "main",
        sections: {
          main: {
            lines: [
              {
                id: "line1",
                actions: {
                  setNextLineConfig: {
                    manual: {
                      enabled: true,
                      requireLineCompleted: true,
                    },
                    auto: {
                      enabled: true,
                      trigger: "fromStart",
                      delay: 100,
                    },
                    applyMode: "persistent",
                  },
                  conditional: {
                    branches: [{ when: true, actions: {} }],
                  },
                },
              },
              {
                id: "line2",
                actions: destinationDialogueAction,
              },
              {
                id: "line3",
                actions: {},
              },
            ],
          },
        },
      }),
      undefined,
    );

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(ticker.add).toHaveBeenCalledTimes(2);
    const sourceCallback = ticker.add.mock.calls[0][0];
    const destinationCallback = ticker.add.mock.calls[1][0];
    expect(ticker.remove).toHaveBeenCalledWith(sourceCallback);
    expect(ticker.remove).not.toHaveBeenCalledWith(destinationCallback);
    expect(ticker.has(destinationCallback)).toBe(true);
  });

  it.each([
    ["global auto", { startAutoMode: {} }],
    [
      "from-complete scene auto",
      {
        setNextLineConfig: {
          manual: {
            enabled: true,
            requireLineCompleted: true,
          },
          auto: {
            enabled: true,
            trigger: "fromComplete",
            delay: 100,
          },
          applyMode: "persistent",
        },
      },
    ],
  ])(
    "clears a source %s timer before an explicit conditional route",
    (_mode, playbackAction) => {
      for (const actionType of ["jumpToLine", "sectionTransition"]) {
        const navigationAction =
          actionType === "jumpToLine"
            ? { jumpToLine: { lineId: "line2" } }
            : { sectionTransition: { sectionId: "target" } };
        const expectedLineId =
          actionType === "jumpToLine" ? "line2" : "targetLine1";
        const { engine, ticker } = createRenderingEngine(
          createProjectData({
            initialSectionId: "main",
            sections: {
              main: {
                lines: [
                  {
                    id: "line1",
                    actions: {
                      ...playbackAction,
                      conditional: {
                        branches: [
                          {
                            when: true,
                            actions: {
                              nextLine: {},
                              ...navigationAction,
                            },
                          },
                        ],
                      },
                    },
                  },
                  { id: "line2", actions: destinationDialogueAction },
                  { id: "line3", actions: {} },
                ],
              },
              target: {
                lines: [
                  {
                    id: "targetLine1",
                    actions: destinationDialogueAction,
                  },
                  { id: "targetLine2", actions: {} },
                ],
              },
            },
          }),
          undefined,
        );

        expect(
          engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
        ).toBe(expectedLineId);
        expect(ticker.add).toHaveBeenCalledTimes(1);
        const sourceCallback = ticker.add.mock.calls[0][0];
        expect(ticker.remove).toHaveBeenCalledWith(sourceCallback);
        expect(ticker.has(sourceCallback)).toBe(false);

        ticker.tick(1000);
        expect(
          engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
        ).toBe(expectedLineId);
      }
    },
  );

  it("replaces a persistent from-start timer after an authored nextLine advances", () => {
    const { engine, ticker } = createRenderingEngine(
      createProjectData({
        initialSectionId: "main",
        sections: {
          main: {
            lines: [
              { id: "line1", actions: {} },
              { id: "line2", actions: destinationDialogueAction },
              { id: "line3", actions: {} },
            ],
          },
        },
      }),
      undefined,
    );
    engine.handleAction("setNextLineConfig", {
      manual: {
        enabled: true,
        requireLineCompleted: true,
      },
      auto: {
        enabled: true,
        trigger: "fromStart",
        delay: 100,
      },
      applyMode: "persistent",
    });
    engine.handleAction("markLineCompleted", {});
    const sourceCallback = ticker.add.mock.calls[0][0];

    engine.handleAction("conditional", {
      branches: [{ when: true, actions: { nextLine: {} } }],
    });

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(ticker.add).toHaveBeenCalledTimes(2);
    const destinationCallback = ticker.add.mock.calls[1][0];
    expect(ticker.remove).toHaveBeenCalledWith(sourceCallback);
    expect(ticker.remove).not.toHaveBeenCalledWith(destinationCallback);
    expect(ticker.has(destinationCallback)).toBe(true);
  });

  it("keeps a destination from-start timer queued by entered-line actions", () => {
    const { engine, ticker } = createRenderingEngine(
      createProjectData({
        initialSectionId: "main",
        sections: {
          main: {
            lines: [
              {
                id: "line1",
                actions: {
                  startAutoMode: {},
                  conditional: {
                    branches: [
                      {
                        when: true,
                        actions: {
                          nextLine: {},
                          jumpToLine: { lineId: "line2" },
                        },
                      },
                    ],
                  },
                },
              },
              {
                id: "line2",
                actions: {
                  setNextLineConfig: {
                    manual: {
                      enabled: true,
                      requireLineCompleted: true,
                    },
                    auto: {
                      enabled: true,
                      trigger: "fromStart",
                      delay: 100,
                    },
                    applyMode: "persistent",
                  },
                  ...destinationDialogueAction,
                },
              },
              { id: "line3", actions: {} },
            ],
          },
        },
      }),
      undefined,
    );

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(ticker.add).toHaveBeenCalledTimes(2);
    const sourceCallback = ticker.add.mock.calls[0][0];
    const destinationCallback = ticker.add.mock.calls[1][0];
    expect(ticker.remove).toHaveBeenCalledWith(sourceCallback);
    expect(ticker.has(destinationCallback)).toBe(true);

    ticker.tick(99);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    ticker.tick(1);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line3");
  });

  it("uses the settled destination delay when persistent from-start auto stays enabled", () => {
    const { engine, ticker } = createRenderingEngine(
      createProjectData({
        initialSectionId: "main",
        sections: {
          main: {
            lines: [
              {
                id: "line1",
                actions: {
                  setNextLineConfig: {
                    manual: {
                      enabled: true,
                      requireLineCompleted: true,
                    },
                    auto: {
                      enabled: true,
                      trigger: "fromStart",
                      delay: 50,
                    },
                    applyMode: "persistent",
                  },
                  conditional: {
                    branches: [{ when: true, actions: {} }],
                  },
                },
              },
              {
                id: "line2",
                actions: {
                  setNextLineConfig: {
                    manual: {
                      enabled: true,
                      requireLineCompleted: true,
                    },
                    auto: {
                      enabled: true,
                      trigger: "fromStart",
                      delay: 200,
                    },
                    applyMode: "persistent",
                  },
                  ...destinationDialogueAction,
                },
              },
              { id: "line3", actions: {} },
            ],
          },
        },
      }),
      undefined,
    );

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(ticker.add).toHaveBeenCalledTimes(2);
    const sourceCallback = ticker.add.mock.calls[0][0];
    const destinationCallback = ticker.add.mock.calls[1][0];
    expect(ticker.remove).toHaveBeenCalledWith(sourceCallback);
    expect(ticker.has(destinationCallback)).toBe(true);

    ticker.tick(199);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    ticker.tick(1);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line3");
  });

  it("drains a settled from-start timer after a direct entered-line handler call", () => {
    const handledEffectBatches = [];
    const engine = createRouteEngine({
      handlePendingEffects: (effects) => handledEffectBatches.push(effects),
    });
    engine.init({
      initialState: {
        projectData: createProjectData({
          initialSectionId: "main",
          sections: {
            main: {
              lines: [{ id: "line1" }],
            },
          },
        }),
      },
    });
    engine.handleAction("setNextLineConfig", {
      manual: {
        enabled: true,
        requireLineCompleted: true,
      },
      auto: {
        enabled: true,
        trigger: "fromStart",
        delay: 200,
      },
      applyMode: "persistent",
    });
    handledEffectBatches.length = 0;

    expect(engine.handleLineActions()).toBe(false);

    expect(handledEffectBatches).toEqual([
      [
        {
          name: "nextLineConfigTimer",
          payload: { delay: 200 },
        },
      ],
    ]);
    expect(engine.selectSystemState().global.pendingEffects).toEqual([]);
  });

  it.each(["matched", "default", "unmatched"])(
    "fallback-renders an empty line exactly once after a %s conditional",
    (outcome) => {
      const renderedLineIds = [];
      createRenderingEngine(
        createProjectData({
          initialSectionId: "main",
          sections: {
            main: {
              lines: [
                {
                  id: "line1",
                  actions: {
                    conditional: {
                      branches: createContinuationBranches(outcome),
                    },
                  },
                },
                {
                  id: "line2",
                  actions: {},
                },
              ],
            },
          },
        }),
        (_renderState, engine) => {
          renderedLineIds.push(
            engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
          );
        },
      );

      expect(renderedLineIds).toEqual(["line2"]);
    },
  );

  it("processes reset destination actions before rendering target state", () => {
    const renderedStates = [];
    const { engine } = createRenderingEngine(
      createProjectData({
        initialSectionId: "title",
        sections: {
          title: {
            lines: [
              {
                id: "titleLine",
                actions: {},
              },
            ],
          },
          game: {
            lines: [
              {
                id: "gameLine",
                actions: {
                  ...setScoreAction("initializeGameScore", 7),
                  ...destinationDialogueAction,
                },
              },
            ],
          },
        },
      }),
      (renderState, routeEngine) => {
        const state = routeEngine.selectSystemState();
        renderedStates.push({
          lineId: state.contexts.at(-1).pointers.read.lineId,
          score: state.contexts.at(-1).variables.score,
          text: findElementById(
            renderState.elements,
            "destination-dialogue-text",
          )?.content,
        });
      },
    );

    renderedStates.length = 0;
    engine.handleAction("resetStoryAtSection", {
      sectionId: "game",
    });

    expect(renderedStates).toEqual([
      {
        lineId: "gameLine",
        score: 7,
        text: "Score 7",
      },
    ]);
  });

  it("iteratively processes mixed conditional lines without re-entering the effect handler", () => {
    const lineCount = 100;
    const outcomes = ["matched", "default", "unmatched"];
    const lines = Array.from({ length: lineCount }, (_, index) => ({
      id: `line${index + 1}`,
      actions:
        index === lineCount - 1
          ? {}
          : {
              conditional: {
                branches: createContinuationBranches(
                  outcomes[index % outcomes.length],
                ),
              },
            },
    }));

    let engine;
    let handlerDepth = 0;
    let maxHandlerDepth = 0;
    const handlePendingEffects = (effects) => {
      handlerDepth += 1;
      maxHandlerDepth = Math.max(maxHandlerDepth, handlerDepth);
      try {
        effects.forEach((effect) => {
          if (effect.name === "handleLineActions") {
            engine.handleLineActions();
          }
        });
      } finally {
        handlerDepth -= 1;
      }
    };

    engine = createRouteEngine({
      handlePendingEffects,
    });
    engine.init({
      initialState: {
        projectData: createProjectData({
          initialSectionId: "main",
          sections: {
            main: {
              lines,
            },
          },
        }),
      },
    });

    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe(`line${lineCount}`);
    expect(maxHandlerDepth).toBe(1);
  });

  it("records single conditional branch actions on the source rollback checkpoint", () => {
    const engine = createEngineWithLineActions(
      createProjectData({
        initialSectionId: "source",
        sections: {
          source: {
            lines: [
              {
                id: "sourceLine",
                actions: {},
              },
            ],
          },
          target: {
            lines: [
              {
                id: "targetLine",
                actions: {},
              },
              {
                id: "targetSentinel",
                actions: {},
              },
            ],
          },
        },
      }),
    );

    engine.handleAction("conditional", {
      branches: [
        {
          actions: {
            sectionTransition: {
              sectionId: "target",
            },
            ...setScoreAction("interactionValue", 7),
          },
        },
      ],
    });

    expect(engine.selectSystemState().contexts.at(-1).variables.score).toBe(7);
    expect(engine.selectSystemState().contexts.at(-1).pointers.read).toEqual({
      sectionId: "target",
      lineId: "targetLine",
    });
    engine.handleAction("rollbackToLine", {
      sectionId: "source",
      lineId: "sourceLine",
    });

    const state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read).toEqual({
      sectionId: "source",
      lineId: "sourceLine",
    });
    expect(state.contexts.at(-1).variables.score).toBe(7);
  });

  it.each(["matched", "default"])(
    "records an implicitly continuing %s branch mutation on the source checkpoint",
    (outcome) => {
      const engine = createEngineWithLineActions(
        createProjectData({
          initialSectionId: "main",
          sections: {
            main: {
              lines: [
                {
                  id: "line1",
                  actions: {},
                },
                {
                  id: "line2",
                  actions: {},
                },
              ],
            },
          },
        }),
      );

      engine.handleAction("conditional", {
        branches: createContinuationBranches(
          outcome,
          setScoreAction("interactionValue", 7),
        ),
      });

      expect(
        engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe("line2");
      engine.handleAction("rollbackToLine", {
        sectionId: "main",
        lineId: "line1",
      });

      const state = engine.selectSystemState();
      expect(state.contexts.at(-1).pointers.read).toEqual({
        sectionId: "main",
        lineId: "line1",
      });
      expect(state.contexts.at(-1).variables.score).toBe(7);
    },
  );
});
