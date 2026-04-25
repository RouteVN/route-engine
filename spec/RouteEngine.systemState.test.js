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

const createResetStoryAtSectionProjectData = () => ({
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
        initialSectionId: "title",
        sections: {
          title: {
            lines: [
              {
                id: "titleLine",
                actions: {
                  updateVariable: {
                    id: "seedTitleScore",
                    operations: [
                      {
                        variableId: "score",
                        op: "set",
                        value: 7,
                      },
                    ],
                  },
                },
              },
            ],
          },
          gameStart: {
            lines: [
              {
                id: "gameLine",
                actions: {
                  updateVariable: {
                    id: "seedGameScore",
                    operations: [
                      {
                        variableId: "score",
                        op: "increment",
                        value: 1,
                      },
                    ],
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

const createSaveLoadRollbackOverlayProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {
      saveMenuLayout: {
        elements: [],
      },
    },
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
        initialSectionId: "entry",
        sections: {
          entry: {
            lines: [
              {
                id: "line1",
                actions: {},
              },
            ],
          },
          afterSave: {
            lines: [
              {
                id: "line2",
                actions: {},
              },
            ],
          },
        },
      },
    },
  },
});

const createDialogueUIRollbackProjectData = () => ({
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
            lines: [
              {
                id: "line1",
                actions: {
                  hideDialogueUI: {},
                },
              },
              {
                id: "line2",
                actions: {},
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

  it("resets story-local state and enters the destination section", () => {
    const engine = createRouteEngineWithInlineEffects();

    engine.init({
      initialState: {
        projectData: createResetStoryAtSectionProjectData(),
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(7);

    engine.handleAction("resetStoryAtSection", {
      sectionId: "gameStart",
    });

    const state = engine.selectSystemState();

    expect(state.contexts[0].pointers.read).toEqual({
      sectionId: "gameStart",
      lineId: "gameLine",
    });
    expect(state.contexts[0].variables.score).toBe(1);
    expect(state.global).not.toHaveProperty("viewedRegistry");
    expect(state.contexts[0].rollback).toEqual({
      currentIndex: 0,
      isRestoring: false,
      replayStartIndex: 0,
      timeline: [
        {
          sectionId: "gameStart",
          lineId: "gameLine",
          rollbackPolicy: "free",
        },
      ],
    });
  });

  it("leaves the current story state untouched when resetStoryAtSection targets a missing section", () => {
    const engine = createRouteEngineWithInlineEffects();

    engine.init({
      initialState: {
        projectData: createResetStoryAtSectionProjectData(),
      },
    });

    engine.handleAction("resetStoryAtSection", {
      sectionId: "missing",
    });

    const state = engine.selectSystemState();

    expect(state.contexts[0].pointers.read).toMatchObject({
      sectionId: "title",
      lineId: "titleLine",
    });
    expect(state.contexts[0].variables.score).toBe(7);
    expect(state.contexts[0].rollback.timeline).toEqual([
      {
        sectionId: "title",
        lineId: "titleLine",
        rollbackPolicy: "free",
      },
    ]);
  });

  it("does not reopen transient overlays when rolling back after load", () => {
    const engine = createRouteEngineWithInlineEffects();

    engine.init({
      initialState: {
        projectData: createSaveLoadRollbackOverlayProjectData(),
      },
    });

    engine.handleActions({
      pushOverlay: {
        resourceId: "saveMenuLayout",
        resourceType: "layout",
      },
    });
    engine.handleActions({
      sectionTransition: {
        sectionId: "afterSave",
      },
      saveSlot: {
        slotId: 1,
      },
    });

    let state = engine.selectSystemState();
    expect(state.global.saveSlots["1"].state.contexts[0].rollback.timeline).toEqual(
      [
        {
          sectionId: "entry",
          lineId: "line1",
          rollbackPolicy: "free",
        },
        {
          sectionId: "afterSave",
          lineId: "line2",
          rollbackPolicy: "free",
        },
      ],
    );

    engine.handleAction("loadSlot", { slotId: 1 });

    state = engine.selectSystemState();
    expect(state.contexts[0].pointers.read).toMatchObject({
      sectionId: "afterSave",
      lineId: "line2",
    });
    expect(state.global.overlayStack).toEqual([]);

    engine.handleAction("rollbackByOffset", { offset: -1 });

    state = engine.selectSystemState();
    expect(state.contexts[0].pointers.read).toEqual({
      sectionId: "entry",
      lineId: "line1",
    });
    expect(state.global.overlayStack).toEqual([]);
  });

  it("does not restore dialogue UI visibility changes authored on the rollback target line", () => {
    const engine = createRouteEngineWithInlineEffects();

    engine.init({
      initialState: {
        projectData: createDialogueUIRollbackProjectData(),
      },
    });

    expect(engine.selectSystemState().global.dialogueUIHidden).toBe(true);

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    engine.handleAction("nextLine", {});

    let state = engine.selectSystemState();
    expect(state.contexts[0].pointers.read).toEqual({
      sectionId: "section1",
      lineId: "line2",
    });
    expect(state.global.dialogueUIHidden).toBe(false);

    engine.handleAction("rollbackByOffset", { offset: -1 });

    state = engine.selectSystemState();
    expect(state.contexts[0].pointers.read).toEqual({
      sectionId: "section1",
      lineId: "line1",
    });
    expect(state.global.dialogueUIHidden).toBe(false);
  });
});
