import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import createEffectsHandler from "../src/createEffectsHandler.js";

const createTicker = () => ({
  add: vi.fn(),
  remove: vi.fn(),
});

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

const createRenderingEngine = (projectData, onRender) => {
  let engine;
  const routeGraphics = {
    render: vi.fn((renderState) => onRender?.(renderState, engine)),
  };
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics,
    ticker: createTicker(),
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
  it.each(["before", "after"])(
    "defers source effects when a sibling mutation is %s the conditional",
    (mutationPosition) => {
      const conditionalAction = {
        conditional: {
          branches: [
            {
              when: false,
              actions: setScoreAction("unreachable", 1),
            },
          ],
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
    },
  );

  it("fallback-renders an automatically entered empty line exactly once", () => {
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
                    branches: [
                      {
                        when: false,
                        actions: {},
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
  });

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

  it("iteratively processes unmatched lines without re-entering the effect handler", () => {
    const lineCount = 100;
    const lines = Array.from({ length: lineCount }, (_, index) => ({
      id: `line${index + 1}`,
      actions:
        index === lineCount - 1
          ? {}
          : {
              conditional: {
                branches: [
                  {
                    when: false,
                    actions: {},
                  },
                ],
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
});
