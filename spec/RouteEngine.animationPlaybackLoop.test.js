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

const createLoopPlayback = (persistent) => {
  const playback = {
    loop: true,
  };
  if (persistent) {
    playback.continuity = "persistent";
  }
  return playback;
};

const createProjectData = ({
  persistent = false,
  nextLineActions = {},
} = {}) => ({
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
                          playback: createLoopPlayback(persistent),
                        },
                      },
                    ],
                  },
                },
              },
              {
                id: "line2",
                actions: nextLineActions,
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

  it("continues a persistent loop on later lines while the visual item id remains", () => {
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
        projectData: createProjectData({ persistent: true }),
      },
    });

    const initialRender = routeGraphics.render.mock.calls.at(-1)?.[0];
    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: initialRender.id,
        aborted: false,
      }),
    ).toBe(true);

    engine.handleActions({
      nextLine: {},
    });

    expect(engine.selectPresentationState().visual.items[0]).toMatchObject({
      id: "marker",
      animations: {
        resourceId: "drift",
        playback: {
          continuity: "persistent",
          loop: true,
        },
      },
    });
    expect(routeGraphics.render.mock.calls.at(-1)?.[0].animations).toEqual([
      expect.objectContaining({
        id: "marker-animation-update",
        targetId: "visual-marker",
        playback: {
          continuity: "persistent",
          loop: true,
        },
      }),
    ]);
  });

  it("stops a persistent loop on an id-only visual removal", () => {
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
        projectData: createProjectData({
          persistent: true,
          nextLineActions: {
            visual: {
              items: [{ id: "marker" }],
            },
          },
        }),
      },
    });

    const initialRender = routeGraphics.render.mock.calls.at(-1)?.[0];
    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: initialRender.id,
        aborted: false,
      }),
    ).toBe(true);

    engine.handleActions({
      nextLine: {},
    });

    expect(engine.selectPresentationState().visual).toBeUndefined();
    expect(routeGraphics.render.mock.calls.at(-1)?.[0].animations).toEqual([]);
  });

  it("does not reattach a persistent animation-only removal to a re-added visual", () => {
    const projectData = createProjectData();
    projectData.story.scenes.scene1.sections.section1.lines = [
      {
        id: "line1",
        actions: {
          visual: {
            items: [
              {
                id: "marker",
                resourceId: "marker",
                transformId: "markerStart",
              },
            ],
          },
        },
      },
      {
        id: "line2",
        actions: {
          visual: {
            items: [
              {
                id: "marker",
                animations: {
                  resourceId: "drift",
                  playback: createLoopPlayback(true),
                },
              },
            ],
          },
        },
      },
      {
        id: "line3",
        actions: {},
      },
      {
        id: "line4",
        actions: {
          visual: {
            items: [
              {
                id: "marker",
                resourceId: "marker",
                transformId: "markerStart",
              },
            ],
          },
        },
      },
    ];

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
        projectData,
      },
    });

    const advanceLine = () => {
      const currentRender = routeGraphics.render.mock.calls.at(-1)?.[0];
      expect(
        effectsHandler.handleRouteGraphicsEvent("renderComplete", {
          id: currentRender.id,
          aborted: false,
        }),
      ).toBe(true);
      engine.handleActions({ nextLine: {} });
    };

    advanceLine();
    expect(routeGraphics.render.mock.calls.at(-1)?.[0].animations).toEqual([
      expect.objectContaining({
        targetId: "visual-marker",
        playback: {
          continuity: "persistent",
          loop: true,
        },
      }),
    ]);

    advanceLine();
    expect(engine.selectPresentationState().visual.items).toEqual([
      {
        id: "marker",
        animations: {},
      },
    ]);
    expect(routeGraphics.render.mock.calls.at(-1)?.[0].animations).toEqual([]);

    advanceLine();
    expect(engine.selectPresentationState().visual.items).toEqual([
      expect.objectContaining({
        id: "marker",
        resourceId: "marker",
      }),
    ]);
    expect(engine.selectPresentationState().visual.items[0]).not.toHaveProperty(
      "animations",
    );
    expect(routeGraphics.render.mock.calls.at(-1)?.[0].animations).toEqual([]);
  });

  it("stops a persistent loop when the visual item id changes", () => {
    const routeGraphics = {
      render: vi.fn(),
    };
    const nextLineActions = {
      visual: {
        items: [
          {
            id: "replacement",
            resourceId: "marker",
            transformId: "markerStart",
          },
        ],
      },
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
        projectData: createProjectData({
          persistent: true,
          nextLineActions,
        }),
      },
    });

    const initialRender = routeGraphics.render.mock.calls.at(-1)?.[0];
    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: initialRender.id,
        aborted: false,
      }),
    ).toBe(true);

    engine.handleActions({
      nextLine: {},
    });

    expect(engine.selectPresentationState().visual.items).toEqual([
      expect.objectContaining({
        id: "replacement",
      }),
    ]);
    expect(routeGraphics.render.mock.calls.at(-1)?.[0].animations).toEqual([]);
  });

  it("omits authored animations when the project default skips animations", () => {
    const routeGraphics = {
      render: vi.fn(),
    };
    const projectData = createProjectData();
    projectData.config = {
      runtimeDefaults: {
        skipTransitionsAndAnimations: true,
      },
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
        projectData,
      },
    });

    expect(engine.selectRuntime().skipTransitionsAndAnimations).toBe(true);
    expect(routeGraphics.render.mock.calls.at(-1)?.[0].animations).toEqual([]);
  });
});
