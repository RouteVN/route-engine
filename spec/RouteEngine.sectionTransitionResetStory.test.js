import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

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
    run.play?.(result.engine, createResetActions);
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
  expect(current.effectNames).toEqual(legacy.effectNames);
};

describe("RouteEngine sectionTransition resetStory", () => {
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

  it.each([{ resetStory: false }, {}])(
    "keeps story state when resetStory is %j",
    (options) => {
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
    },
  );

  it("rejects a resetting transition beside another navigation action", () => {
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
        sectionTransition: { sectionId: "game", resetStory: true },
        jumpToLine: { lineId: "menu" },
      }),
    ).toThrow("action batch cannot contain multiple navigation actions");
    expect(engine.selectSystemState()).toEqual(before);
  });
});
