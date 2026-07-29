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
  },
  resources: {
    layouts: {},
    sounds: {},
    images: {
      marker: {
        fileId: "marker.png",
        width: 100,
        height: 100,
      },
    },
    videos: {},
    sprites: {},
    characters: {},
    variables: {},
    transforms: {
      markerStart: {
        x: 100,
        y: 100,
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
    },
    sectionTransitions: {},
    animations: {
      drift: {
        type: "update",
        tween: {
          x: {
            initialValue: 100,
            keyframes: [{ duration: 1000, value: 300 }],
          },
        },
      },
    },
    fonts: {},
    colors: {},
    textStyles: {},
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
                  visual: {
                    items: [
                      {
                        id: "marker",
                        resourceId: "marker",
                        transformId: "markerStart",
                        animations: {
                          resourceId: "drift",
                          playback: {
                            loop: true,
                          },
                        },
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
      },
    },
  },
});

describe("RouteEngine animation playback loop", () => {
  it("keeps a loop after immediate line completion and omits it on the next line", () => {
    const routeGraphics = {
      render: vi.fn(),
    };

    let engine;
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker: createTicker(),
      persistence: createPersistence(),
    });
    engine = createRouteEngine({
      handlePendingEffects: effectsHandler,
    });

    engine.init({
      initialState: {
        projectData: createProjectData(),
      },
    });

    const initialRender = routeGraphics.render.mock.calls.at(-1)?.[0];
    expect(initialRender.animations).toEqual([
      expect.objectContaining({
        id: "marker-animation-update",
        playback: {
          loop: true,
        },
      }),
    ]);

    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: initialRender.id,
        aborted: false,
      }),
    ).toBe(true);

    const completedRender = routeGraphics.render.mock.calls.at(-1)?.[0];
    expect(engine.selectSystemState().global.isLineCompleted).toBe(true);
    expect(completedRender.animations).toEqual([
      expect.objectContaining({
        id: "marker-animation-update",
        playback: {
          loop: true,
        },
      }),
    ]);

    engine.handleActions({
      nextLine: {},
    });

    const nextLineRender = routeGraphics.render.mock.calls.at(-1)?.[0];
    expect(nextLineRender.animations).toEqual([]);
  });
});
