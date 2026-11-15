import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import {
  createValidator,
  projectDataSchemaId,
  systemActionsSchemaId,
} from "./helpers/createSchemaValidator.js";
import {
  createEngineIntegrationHarness,
  findRenderElement,
} from "./integration/helpers/createEngineIntegrationHarness.js";

const validateSystemActions = createValidator(systemActionsSchemaId);
const validateProjectData = createValidator(projectDataSchemaId);

const createProjectData = ({ initialSectionId = "title", sections }) => ({
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
      score: {
        type: "number",
        scope: "context",
        default: 0,
      },
      volume: {
        type: "number",
        scope: "device",
        default: 80,
      },
    },
    transforms: {},
    sectionTransitions: {},
    animations: {},
    fonts: {},
    colors: {},
    textStyles: {},
    controls: {},
  },
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

const createEngine = (projectData) => {
  let engine;
  const effectNames = [];
  engine = createRouteEngine({
    handlePendingEffects: (effects) => {
      effects.forEach((effect) => {
        effectNames.push(effect.name);
        if (effect.name === "handleLineActions") {
          engine.handleLineActions();
        }
      });
    },
  });
  engine.init({
    initialState: {
      projectData,
    },
  });
  return { engine, effectNames };
};

const line = (id, actions = {}) => ({ id, actions });

const setVariable = (variableId, value) => ({
  updateVariable: {
    id: `set${variableId}`,
    operations: [{ variableId, op: "set", value }],
  },
});

const advance = (engine) => {
  engine.handleAction("markLineCompleted", {});
  engine.handleAction("nextLine", {});
};

const getContext = (engine) => engine.selectSystemState().contexts.at(-1);

const RESET_ACTIONS = {
  resetStoryAtSection: (payload) => ({ resetStoryAtSection: payload }),
  "sectionTransition with resetStory": (payload) => ({
    sectionTransition: { ...payload, resetStory: true },
  }),
};

// Runs the same journey once per reset spelling and returns both engines.
const runWithEachResetAction = (run) =>
  Object.values(RESET_ACTIONS).map((createResetActions) => {
    const result = createEngine(run.projectData(createResetActions));
    run.play?.(result.engine, createResetActions, result);
    return result;
  });

// Authored project data spells the reset differently per engine, so compare
// everything the journey produced instead.
const selectStoryState = (engine) => {
  const { projectData: _projectData, ...storyState } =
    engine.selectSystemState();
  return storyState;
};

const expectSameOutcome = ([legacy, current]) => {
  expect(selectStoryState(current.engine)).toEqual(
    selectStoryState(legacy.engine),
  );
  // Render ids carry a per-engine random prefix.
  const { id: _currentId, ...currentRender } =
    current.engine.selectRenderState();
  const { id: _legacyId, ...legacyRender } = legacy.engine.selectRenderState();
  expect(currentRender).toEqual(legacyRender);
  if (legacy.effectNames !== undefined) {
    expect(current.effectNames).toEqual(legacy.effectNames);
  }
};

describe("RouteEngine sectionTransition resetStory", () => {
  it.each([false, true])(
    "matches whole-screen effects and render with destination screen authored: %s",
    (withDestinationScreen) => {
      const screen = { animations: { resourceId: "resetFade" } };
      const engines = runWithEachResetAction({
        projectData: () => {
          const projectData = createProjectData({
            sections: {
              title: { lines: [line("menu")] },
              game: {
                lines: [
                  line("start", {
                    background: { resourceId: "destination" },
                    ...(withDestinationScreen
                      ? { screen: { animations: { resourceId: "lineFade" } } }
                      : {}),
                  }),
                  line("next"),
                ],
              },
            },
          });
          projectData.resources.images.destination = {
            fileId: "destination.png",
            width: 1920,
            height: 1080,
          };
          projectData.resources.animations = {
            resetFade: {
              type: "transition",
              prev: {
                tween: {
                  alpha: {
                    initialValue: 1,
                    keyframes: [{ duration: 300, value: 0 }],
                  },
                },
              },
              next: {
                tween: {
                  alpha: {
                    initialValue: 0,
                    keyframes: [{ duration: 300, value: 1 }],
                  },
                },
              },
            },
            lineFade: {
              type: "transition",
              next: {
                tween: {
                  alpha: {
                    initialValue: 0.5,
                    keyframes: [{ duration: 900, value: 1 }],
                  },
                },
              },
            },
          };
          return projectData;
        },
        play: (engine, createResetActions, { effectNames }) => {
          engine.commitRenderState(engine.selectRenderState());
          effectNames.length = 0;
          engine.handleActions(
            createResetActions({ sectionId: "game", screen }),
          );
        },
      });

      expectSameOutcome(engines);
      for (const { engine, effectNames } of engines) {
        expect(getContext(engine).pointers.read).toEqual({
          sectionId: "game",
          lineId: "start",
        });
        expect(
          engine.selectSystemState().global.pendingScreenTransition,
        ).toEqual(screen);
        expect(engine.selectRenderState().animations).toEqual([
          {
            id: "screen-animation-transition",
            type: "transition",
            targetId: "story",
            prev: engine.selectSystemState().projectData.resources.animations
              .resetFade.prev,
            next: engine.selectSystemState().projectData.resources.animations
              .resetFade.next,
          },
        ]);
        expect(effectNames).toEqual([
          "clearAutoNextTimer",
          "clearSkipNextTimer",
          "clearNextLineConfigTimer",
          "handleLineActions",
        ]);
        advance(engine);
        expect(engine.selectSystemState().global).not.toHaveProperty(
          "pendingScreenTransition",
        );
        expect(engine.selectRenderState().animations ?? []).toEqual([]);
      }
      expectSameOutcome(engines);
    },
  );

  it.each(["missing", "empty"])(
    "leaves all state and effects untouched for a reset to the %s section",
    (sectionId) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const engines = runWithEachResetAction({
          projectData: () =>
            createProjectData({
              sections: {
                title: { lines: [line("intro"), line("menu")] },
                empty: { lines: [] },
              },
            }),
          play: (engine, createResetActions, { effectNames }) => {
            advance(engine);
            engine.handleActions(setVariable("score", 9));
            engine.handleAction("startAutoMode", {});
            const before = structuredClone(engine.selectSystemState());
            const { id: _beforeId, ...renderBefore } =
              engine.selectRenderState();
            const effectsBefore = [...effectNames];
            engine.handleActions(
              createResetActions({
                sectionId,
                screen: { animations: { resourceId: "resetFade" } },
              }),
            );
            expect(engine.selectSystemState()).toEqual(before);
            const { id: _afterId, ...renderAfter } = engine.selectRenderState();
            expect(renderAfter).toEqual(renderBefore);
            expect(effectNames).toEqual(effectsBefore);
          },
        });
        expectSameOutcome(engines);
        expect(warn).toHaveBeenCalledTimes(2);
      } finally {
        warn.mockRestore();
      }
    },
  );

  it.each([
    ["startAutoMode", "autoMode"],
    ["startSkipMode", "skipMode"],
  ])(
    "stops %s and clears transient interaction state",
    (startMode, modeFlag) => {
      const engines = runWithEachResetAction({
        projectData: () => {
          const projectData = createProjectData({
            sections: {
              title: { lines: [line("menu")] },
              game: { lines: [line("start")] },
            },
          });
          projectData.resources.layouts = {
            overlay: { elements: [] },
            confirmation: { elements: [] },
          };
          return projectData;
        },
        play: (engine, createResetActions, { effectNames }) => {
          engine.handleAction(startMode, {});
          engine.handleAction("hideDialogueUI", {});
          engine.handleAction("pushOverlay", {
            resourceId: "overlay",
            resourceType: "layout",
          });
          engine.handleAction("showConfirmDialog", {
            resourceId: "confirmation",
            confirmActions: { hideConfirmDialog: {} },
            cancelActions: { hideConfirmDialog: {} },
          });
          expect(engine.selectSystemState().global).toMatchObject({
            [modeFlag]: true,
            dialogueUIHidden: true,
            overlayStack: [{ resourceId: "overlay", resourceType: "layout" }],
            confirmDialog: { resourceId: "confirmation" },
          });
          effectNames.length = 0;
          engine.handleActions(createResetActions({ sectionId: "game" }));
        },
      });
      expectSameOutcome(engines);
      for (const { engine, effectNames } of engines) {
        expect(engine.selectSystemState().global).toMatchObject({
          autoMode: false,
          skipMode: false,
          dialogueUIHidden: false,
          overlayStack: [],
          confirmDialog: null,
          nextLineConfig: {
            manual: { enabled: true, requireLineCompleted: false },
            auto: { enabled: false },
            applyMode: "persistent",
          },
        });
        expect(effectNames).toEqual(
          expect.arrayContaining([
            "clearAutoNextTimer",
            "clearSkipNextTimer",
            "clearNextLineConfigTimer",
          ]),
        );
      }
    },
  );

  it("saves and loads the post-reset story identically under both spellings", () => {
    const engines = runWithEachResetAction({
      projectData: () =>
        createProjectData({
          sections: {
            title: { lines: [line("intro"), line("menu")] },
            game: { lines: [line("start"), line("next")] },
          },
        }),
      play: (engine, createResetActions) => {
        advance(engine);
        engine.handleActions(setVariable("score", 9));
        engine.handleActions(createResetActions({ sectionId: "game" }));
        engine.handleActions(setVariable("score", 4));
        const postResetContext = structuredClone(getContext(engine));
        // Save/load normalizes read pointers to include the owning scene.
        postResetContext.pointers.read.sceneId = "scene1";
        engine.handleAction("saveSlot", { slotId: 1, savedAt: 1700000000000 });
        advance(engine);
        engine.handleActions(setVariable("score", 12));
        engine.handleAction("sectionTransition", { sectionId: "title" });
        engine.handleAction("loadSlot", { slotId: 1 });
        expect(getContext(engine)).toEqual(postResetContext);
        expect(getContext(engine).variables.score).toBe(4);
        expect(getContext(engine).pointers.read).toEqual({
          sceneId: "scene1",
          sectionId: "game",
          lineId: "start",
        });
        expect(getContext(engine).rollback.timeline).toHaveLength(1);
        engine.handleAction("rollbackByOffset", {});
        expect(getContext(engine).pointers.read).toEqual({
          sceneId: "scene1",
          sectionId: "game",
          lineId: "start",
        });
      },
    });
    expectSameOutcome(engines);
  });

  it.each(["true", 1])(
    "rejects non-boolean resetStory %j in action and authored project schemas",
    (resetStory) => {
      const actions = { sectionTransition: { sectionId: "game", resetStory } };
      expect(validateSystemActions(actions)).toBe(false);
      expect(validateSystemActions.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: "/sectionTransition/resetStory",
            keyword: "type",
          }),
        ]),
      );
      expect(
        validateProjectData(
          createProjectData({
            sections: {
              title: { lines: [line("menu", actions)] },
              game: { lines: [line("start")] },
            },
          }),
        ),
      ).toBe(false);
      expect(validateProjectData.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath:
              "/story/scenes/scene1/sections/title/lines/0/actions/sectionTransition/resetStory",
            keyword: "type",
          }),
        ]),
      );
    },
  );

  it("resets through a rendered choice click identically under both spellings", async () => {
    const results = [];
    try {
      for (const createResetActions of Object.values(RESET_ACTIONS)) {
        const projectData = createProjectData({
          sections: {
            title: {
              lines: [
                line("menu", {
                  choice: {
                    resourceId: "choices",
                    items: [{ id: "start", content: "Start" }],
                  },
                }),
              ],
            },
            game: { lines: [line("start")] },
          },
        });
        projectData.resources.layouts.choices = {
          elements: [
            {
              id: "start-button",
              type: "rect",
              width: 300,
              height: 80,
              click: {
                payload: { actions: createResetActions({ sectionId: "game" }) },
              },
            },
          ],
        };
        const harness = createEngineIntegrationHarness({ projectData });
        results.push(harness);
        harness.completeLatestRender();
        harness.engine.handleActions(setVariable("score", 9));
        const button = findRenderElement(
          harness.renderStates.at(-1).elements,
          "start-button",
          { layoutRootId: "choice-container" },
        );
        expect(button?.click?.payload).toBeDefined();
        await harness.eventHandler("click", button.click.payload);
        harness.completeLatestRender();
        expect(harness.getPointer()).toEqual({
          sectionId: "game",
          lineId: "start",
        });
        expect(getContext(harness.engine).variables.score).toBe(0);
        expect(getContext(harness.engine).rollback.timeline).toHaveLength(1);
      }
      expectSameOutcome(results);
    } finally {
      results.forEach(({ engine }) => engine.dispose());
    }
  });
  it("resets story-local state like resetStoryAtSection", () => {
    const engines = runWithEachResetAction({
      projectData: () =>
        createProjectData({
          sections: {
            title: { lines: [line("intro"), line("menu")] },
            game: { lines: [line("start"), line("next")] },
          },
        }),
      play: (engine, createResetActions) => {
        advance(engine);
        engine.handleActions(setVariable("score", 9));
        engine.handleActions(setVariable("volume", 15));
        engine.handleAction("startAutoMode", {});
        engine.handleActions(createResetActions({ sectionId: "game" }));
      },
    });

    expectSameOutcome(engines);

    const { engine } = engines[1];
    const context = getContext(engine);
    expect(context.pointers.read).toEqual({
      sectionId: "game",
      lineId: "start",
    });
    expect(context.variables.score).toBe(0);
    expect(engine.selectSystemState().global.variables.volume).toBe(15);
    expect(engine.selectSystemState().global.autoMode).toBe(false);
    expect(context.rollback.timeline).toHaveLength(1);

    engine.handleAction("rollbackByOffset", {});
    expect(getContext(engine).pointers.read).toEqual({
      sectionId: "game",
      lineId: "start",
    });
  });

  it("matches resetStoryAtSection when the destination line routes away", () => {
    const engines = runWithEachResetAction({
      projectData: () =>
        createProjectData({
          sections: {
            title: { lines: [line("menu")] },
            router: {
              lines: [
                line("route", { sectionTransition: { sectionId: "game" } }),
              ],
            },
            game: { lines: [line("start"), line("next")] },
          },
        }),
      play: (engine, createResetActions) => {
        engine.handleActions(createResetActions({ sectionId: "router" }));
        advance(engine);
        engine.handleAction("rollbackByOffset", {});
      },
    });

    expectSameOutcome(engines);
    expect(getContext(engines[1].engine).pointers.read).toEqual({
      sectionId: "game",
      lineId: "start",
    });
  });

  it("matches resetStoryAtSection when resetting onto the current line", () => {
    const engines = runWithEachResetAction({
      projectData: () =>
        createProjectData({
          sections: {
            title: { lines: [line("menu"), line("after")] },
          },
        }),
      play: (engine, createResetActions) => {
        engine.handleActions(setVariable("score", 4));
        engine.handleActions(createResetActions({ sectionId: "title" }));
        advance(engine);
      },
    });

    expectSameOutcome(engines);
    expect(getContext(engines[1].engine).variables.score).toBe(0);
  });

  it("matches resetStoryAtSection when a line resets onto itself and routes away", () => {
    const engines = runWithEachResetAction({
      projectData: (createResetActions) =>
        createProjectData({
          sections: {
            title: { lines: [line("menu")] },
            router: {
              lines: [
                line("route", {
                  conditional: {
                    branches: [
                      {
                        when: { eq: [{ var: "variables.volume" }, 80] },
                        actions: {
                          ...setVariable("volume", 15),
                          ...createResetActions({ sectionId: "router" }),
                        },
                      },
                      {
                        actions: {
                          sectionTransition: { sectionId: "game" },
                        },
                      },
                    ],
                  },
                }),
              ],
            },
            game: { lines: [line("start")] },
          },
        }),
      play: (engine) => {
        engine.handleActions({ sectionTransition: { sectionId: "router" } });
      },
    });

    expectSameOutcome(engines);

    const { engine } = engines[1];
    expect(getContext(engine).pointers.read).toEqual({
      sectionId: "game",
      lineId: "start",
    });
    expect(getContext(engine).rollback.timeline).toEqual([
      expect.objectContaining({
        sectionId: "router",
        lineId: "route",
        returnable: false,
      }),
      expect.objectContaining({ sectionId: "game", lineId: "start" }),
    ]);

    engine.handleAction("rollbackByOffset", {});
    expect(getContext(engine).pointers.read).toEqual({
      sectionId: "game",
      lineId: "start",
    });
  });

  it("marks a save taken on a line that then resets onto itself", () => {
    const engines = runWithEachResetAction({
      projectData: (createResetActions) =>
        createProjectData({
          sections: {
            title: { lines: [line("menu")] },
            router: {
              lines: [
                line("route", {
                  conditional: {
                    branches: [
                      {
                        when: { eq: [{ var: "variables.volume" }, 80] },
                        actions: {
                          ...setVariable("volume", 15),
                          saveSlot: { slotId: 1, savedAt: 1700000000000 },
                          ...createResetActions({ sectionId: "router" }),
                        },
                      },
                    ],
                  },
                }),
              ],
            },
          },
        }),
      play: (engine) => {
        engine.handleActions({ sectionTransition: { sectionId: "router" } });
      },
    });

    expectSameOutcome(engines);

    const { engine } = engines[1];
    expect(getContext(engine).pointers.read).toEqual({
      sectionId: "router",
      lineId: "route",
    });
    expect(getContext(engine).rollback.timeline).toHaveLength(1);
    const savedTimeline =
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .rollback.timeline;
    expect(savedTimeline.at(-1)).toMatchObject({
      sectionId: "router",
      lineId: "route",
      returnable: false,
    });
  });

  it("matches resetStoryAtSection when authored on a line", () => {
    const engines = runWithEachResetAction({
      projectData: (createResetActions) =>
        createProjectData({
          initialSectionId: "game",
          sections: {
            game: {
              lines: [
                line("start", setVariable("score", 7)),
                line("end", createResetActions({ sectionId: "title" })),
              ],
            },
            title: { lines: [line("menu")] },
          },
        }),
      play: (engine) => {
        advance(engine);
      },
    });

    expectSameOutcome(engines);
    const current = engines[1];
    expect(getContext(current.engine).pointers.read).toEqual({
      sectionId: "title",
      lineId: "menu",
    });
    expect(getContext(current.engine).variables.score).toBe(0);
    expect(getContext(current.engine).rollback.timeline).toHaveLength(1);
  });

  it.each([
    { resetStory: false },
    {},
    { resetStory: "true" },
    { resetStory: 1 },
  ])("keeps story state when resetStory is %j", (options) => {
    const { engine } = createEngine(
      createProjectData({
        sections: {
          title: { lines: [line("intro"), line("menu")] },
          game: { lines: [line("start")] },
        },
      }),
    );

    advance(engine);
    engine.handleActions(setVariable("score", 9));
    engine.handleActions({
      sectionTransition: { sectionId: "game", ...options },
    });

    const context = getContext(engine);
    expect(context.pointers.read).toEqual({
      sectionId: "game",
      lineId: "start",
    });
    expect(context.variables.score).toBe(9);
    expect(context.rollback.timeline).toHaveLength(3);
  });

  it.each(Object.entries(RESET_ACTIONS))(
    "rejects %s beside another navigation action",
    (_name, createResetActions) => {
      const { engine } = createEngine(
        createProjectData({
          sections: {
            title: { lines: [line("menu")] },
            game: { lines: [line("start")] },
          },
        }),
      );
      const before = engine.selectSystemState();

      expect(() =>
        engine.handleActions({
          ...createResetActions({ sectionId: "game" }),
          jumpToLine: { lineId: "menu" },
        }),
      ).toThrow("action batch cannot contain multiple navigation actions");
      expect(engine.selectSystemState()).toEqual(before);
    },
  );
});
