import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import createEffectsHandler from "../src/createEffectsHandler.js";

const createTicker = () => ({
  add: vi.fn(),
  remove: vi.fn(),
});

const createPersistence = () => ({
  saveSlots: vi.fn().mockResolvedValue(undefined),
  saveGlobalDeviceVariables: vi.fn().mockResolvedValue(undefined),
  saveGlobalAccountVariables: vi.fn().mockResolvedValue(undefined),
  saveGlobalRuntime: vi.fn().mockResolvedValue(undefined),
  applyScopedDataUpdates: vi.fn().mockResolvedValue(undefined),
});

const createProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {
      revealDialogue: {
        mode: "adv",
        elements: [
          {
            id: "dialogue-text",
            type: "text-revealing",
            content: "${dialogue.content}",
            revealEffect: "typewriter",
            displaySpeed: 30,
            textStyleId: "body",
          },
        ],
      },
      staticDialogue: {
        mode: "adv",
        elements: [
          {
            id: "dialogue-text",
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
    variables: {},
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
    controls: {},
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
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "revealDialogue",
                    },
                    content: [
                      {
                        text: "Line 1 should complete first.",
                      },
                    ],
                  },
                },
              },
              {
                id: "line2",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "revealDialogue",
                    },
                    content: [
                      {
                        text: "Line 2 should be the next reveal line after the second click.",
                      },
                    ],
                  },
                },
              },
              {
                id: "line3",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "revealDialogue",
                    },
                    content: [
                      {
                        text: "Line 3 should be reached with one click after line 2 completes naturally.",
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

const createChoiceBlockingProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {
      staticDialogue: {
        mode: "adv",
        elements: [
          {
            id: "dialogue-text",
            type: "text",
            content: "${dialogue.content[0].text}",
            textStyleId: "body",
          },
        ],
      },
      choiceLayout: {
        elements: [
          {
            id: "choice-button",
            type: "button",
            text: "Continue",
            click: {
              payload: {
                actions: {
                  nextLine: {},
                },
              },
            },
          },
        ],
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
    controls: {},
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
                  startAutoMode: {},
                  setNextLineConfig: {
                    manual: {
                      enabled: true,
                    },
                    auto: {
                      enabled: true,
                      trigger: "fromStart",
                      delay: 900,
                    },
                    applyMode: "persistent",
                  },
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "staticDialogue",
                    },
                    content: [
                      {
                        text: "Line 1",
                      },
                    ],
                  },
                },
              },
              {
                id: "line2",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "staticDialogue",
                    },
                    content: [
                      {
                        text: "Make a choice",
                      },
                    ],
                  },
                  choice: {
                    resourceId: "choiceLayout",
                    items: [
                      {
                        id: "choice-a",
                        content: "Continue",
                      },
                    ],
                  },
                },
              },
              {
                id: "line3",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "staticDialogue",
                    },
                    content: [
                      {
                        text: "After choice",
                      },
                    ],
                  },
                },
              },
              {
                id: "line4",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "staticDialogue",
                    },
                    content: [
                      {
                        text: "After line 3",
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

const getRenderState = (routeGraphics, index) =>
  routeGraphics.render.mock.calls[index]?.[0];

const getLastRenderState = (routeGraphics) =>
  routeGraphics.render.mock.calls.at(-1)?.[0];

describe("RouteEngine line completion flow", () => {
  it("completes the current revealing line on first click and advances on second click", () => {
    const routeGraphics = {
      render: vi.fn(),
    };
    let engine;
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      persistence: createPersistence(),
      routeGraphics,
      ticker: createTicker(),
    });
    engine = createRouteEngine({
      handlePendingEffects: effectsHandler,
    });

    engine.init({
      initialState: {
        projectData: createProjectData(),
      },
    });

    const initialRender = getRenderState(routeGraphics, 0);
    expect(
      findElementById(initialRender.elements, "dialogue-text"),
    ).toMatchObject({
      type: "text-revealing",
      revealEffect: "typewriter",
    });

    engine.handleActions({
      nextLine: {},
    });

    const completedRender = getRenderState(routeGraphics, 1);
    expect(
      findElementById(completedRender.elements, "dialogue-text"),
    ).toMatchObject({
      type: "text-revealing",
      revealEffect: "none",
    });

    engine.handleActions({
      nextLine: {},
    });

    const advancedRender = getLastRenderState(routeGraphics);
    expect(routeGraphics.render).toHaveBeenCalledTimes(3);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(
      findElementById(advancedRender.elements, "dialogue-text"),
    ).toMatchObject({
      type: "text-revealing",
      revealEffect: "typewriter",
      content: [
        {
          text: "Line 2 should be the next reveal line after the second click.",
        },
      ],
    });
  });

  it("advances immediately after a natural renderComplete marks the line complete", () => {
    const routeGraphics = {
      render: vi.fn(),
    };
    let engine;
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      persistence: createPersistence(),
      routeGraphics,
      ticker: createTicker(),
    });
    engine = createRouteEngine({
      handlePendingEffects: effectsHandler,
    });

    engine.init({
      initialState: {
        projectData: createProjectData(),
      },
    });

    const initialRender = getRenderState(routeGraphics, 0);

    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: initialRender.id,
        aborted: false,
      }),
    ).toBe(true);

    const completedRender = getRenderState(routeGraphics, 1);
    expect(
      findElementById(completedRender.elements, "dialogue-text"),
    ).toMatchObject({
      type: "text-revealing",
      revealEffect: "none",
    });

    engine.handleActions({
      nextLine: {},
    });

    const advancedRender = getLastRenderState(routeGraphics);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line2");
    expect(
      findElementById(advancedRender.elements, "dialogue-text"),
    ).toMatchObject({
      type: "text-revealing",
      revealEffect: "typewriter",
      content: [
        {
          text: "Line 2 should be the next reveal line after the second click.",
        },
      ],
    });

    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: advancedRender.id,
        aborted: false,
      }),
    ).toBe(true);

    const line2CompletedRender = getLastRenderState(routeGraphics);
    expect(
      findElementById(line2CompletedRender.elements, "dialogue-text"),
    ).toMatchObject({
      type: "text-revealing",
      revealEffect: "none",
    });

    engine.handleActions({
      nextLine: {},
    });

    const line3Render = getLastRenderState(routeGraphics);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
    ).toBe("line3");
    expect(
      findElementById(line3Render.elements, "dialogue-text"),
    ).toMatchObject({
      type: "text-revealing",
      revealEffect: "typewriter",
      content: [
        {
          text: "Line 3 should be reached with one click after line 2 completes naturally.",
        },
      ],
    });
  });

  it("stops active playback on a choice line and only allows choice-tagged nextLine", () => {
    const routeGraphics = {
      render: vi.fn(),
    };
    let engine;
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      persistence: createPersistence(),
      routeGraphics,
      ticker: createTicker(),
    });
    engine = createRouteEngine({
      handlePendingEffects: effectsHandler,
    });

    engine.init({
      initialState: {
        projectData: createChoiceBlockingProjectData(),
      },
    });

    expect(engine.selectSystemState().global.autoMode).toBe(true);
    expect(engine.selectSystemState().global.nextLineConfig.auto).toEqual({
      enabled: true,
      trigger: "fromStart",
      delay: 900,
    });

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({
      nextLine: {},
    });

    let state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line2");
    expect(state.global.autoMode).toBe(false);
    expect(state.global.skipMode).toBe(false);
    expect(state.global.nextLineConfig.auto).toEqual({
      enabled: true,
      trigger: "fromStart",
      delay: 900,
    });

    engine.handleActions({
      nextLine: {},
    });

    state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line2");

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({
      nextLine: {
        _interactionSource: "choice",
      },
    });

    state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line3");
    expect(engine.selectPresentationState().choice).toBeUndefined();

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({
      nextLine: {},
    });

    state = engine.selectSystemState();
    expect(state.contexts.at(-1).pointers.read.lineId).toBe("line4");
  });
});
