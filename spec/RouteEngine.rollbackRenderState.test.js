import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import createEffectsHandler from "../src/createEffectsHandler.js";

const createTicker = () => ({
  add: vi.fn(),
  remove: vi.fn(),
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
      overlayPanel: {
        elements: [
          {
            id: "panel-text",
            type: "text",
            content: "Overlay panel",
            textStyleId: "body",
          },
        ],
        transitions: [
          {
            id: "panel-fade-in",
            type: "update",
            tween: {
              alpha: {
                initialValue: 0,
                keyframes: [{ duration: 300, value: 1 }],
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
                  pushOverlay: {
                    resourceId: "overlayPanel",
                    resourceType: "layout",
                  },
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "revealDialogue",
                    },
                    content: [
                      {
                        text: "Line 1 should stay fully settled after rollback.",
                      },
                    ],
                  },
                },
              },
              {
                id: "line2",
                actions: {
                  clearOverlays: {},
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "revealDialogue",
                    },
                    content: [
                      {
                        text: "Line 2 exists so line 1 can be restored by rollback.",
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

describe("RouteEngine rollback render state", () => {
  it("restores rollbacked lines directly in their settled end state without transient overlays", () => {
    const routeGraphics = {
      render: vi.fn(),
    };

    let engine;
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
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

    engine.handleActions({
      nextLine: {},
    });
    engine.handleActions({
      nextLine: {},
    });
    engine.handleAction("rollbackByOffset", { offset: -1 });

    const rollbackRender = routeGraphics.render.mock.calls.at(-1)?.[0];

    expect(engine.selectSystemState().contexts.at(-1).pointers.read.lineId).toBe(
      "line1",
    );
    expect(findElementById(rollbackRender.elements, "dialogue-text")).toMatchObject(
      {
        type: "text-revealing",
        revealEffect: "none",
      },
    );
    expect(findElementById(rollbackRender.elements, "panel-text")).toBeNull();
    expect(rollbackRender.animations).toEqual([]);
  });

  it("keeps overlay transitions when pushed after line completion", () => {
    const routeGraphics = {
      render: vi.fn(),
    };

    let engine;
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
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

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("clearOverlays", {});
    engine.handleAction("pushOverlay", {
      resourceId: "overlayPanel",
      resourceType: "layout",
    });

    const overlayRender = routeGraphics.render.mock.calls.at(-1)?.[0];

    expect(engine.selectSystemState().global.isLineCompleted).toBe(true);
    expect(findElementById(overlayRender.elements, "panel-text")).toMatchObject({
      type: "text",
      content: "Overlay panel",
    });
    expect(overlayRender.animations).toEqual([
      expect.objectContaining({
        id: "panel-fade-in",
        targetId: "overlayStack-0",
      }),
    ]);
  });
});
