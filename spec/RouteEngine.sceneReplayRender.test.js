import { describe, expect, it } from "vitest";
import createEffectsHandler from "../src/createEffectsHandler.js";
import createRouteEngine from "../src/RouteEngine.js";

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

const dispatchRouteGraphicsClick = async (engine, element) => {
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics: {
      render: () => {},
    },
    ticker: {
      add: () => {},
      remove: () => {},
    },
  });
  const eventHandler = effectsHandler.createRouteGraphicsEventHandler();
  await eventHandler("click", {
    _event: { id: element.id },
    ...structuredClone(element.click.payload),
  });
};

const createProjectData = (sceneId) => ({
  screen: { width: 1920, height: 1080 },
  resources: {
    images: {
      memory: {
        fileId: "memory.png",
        width: 320,
        height: 180,
      },
    },
    variables: {
      redirect: {
        type: "string",
        scope: "context",
        default: "wrong-target",
      },
    },
    sceneReplay: {
      pageSize: 4,
      replays: [
        {
          sceneId,
          title: "First Meeting",
          thumbnailImageId: "memory",
        },
      ],
    },
    layouts: {
      replayMenu: {
        elements: [
          {
            id: "replay-list",
            type: "container",
            children: [
              {
                "$for replay in sceneReplay.pageReplays": [
                  {
                    id: "start-${replay.sceneId}",
                    type: "container",
                    click: {
                      payload: {
                        actions: {
                          startSceneReplay: {
                            sceneId: "${replay.sceneId}",
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      replayHud: {
        elements: [
          {
            id: "active-replay",
            type: "text",
            content: "${sceneReplay.activeSceneId}",
          },
          {
            id: "exit-replay",
            type: "container",
            click: {
              payload: {
                actions: {
                  exitSceneReplay: {},
                },
              },
            },
          },
        ],
      },
    },
  },
  story: {
    initialSceneId: "main",
    scenes: {
      main: {
        initialSectionId: "caller",
        sections: {
          caller: {
            lines: [
              {
                id: "caller1",
                actions: {
                  layout: { resourceId: "replayMenu" },
                },
              },
            ],
          },
        },
      },
      [sceneId]: {
        initialSectionId: "memory",
        sections: {
          memory: {
            lines: [
              {
                id: "memory1",
                actions: {
                  layout: { resourceId: "replayHud" },
                },
              },
            ],
          },
        },
      },
    },
  },
});

describe("RouteEngine scene replay render API", () => {
  it("renders catalog data and dispatches start/exit through the real click path", async () => {
    const sceneId = "${variables.redirect}";
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    engine.init({
      initialState: {
        projectData: createProjectData(sceneId),
        global: {
          accountReplayRegistry: { sceneIds: [sceneId] },
        },
      },
    });

    const menuState = engine.selectRenderState();
    const startButton = findElementById(menuState.elements, `start-${sceneId}`);
    expect(startButton).toMatchObject({
      click: {
        payload: {
          actions: {
            startSceneReplay: {
              sceneId,
            },
          },
        },
      },
    });

    await dispatchRouteGraphicsClick(engine, startButton);
    expect(engine.selectSceneReplay()).toMatchObject({
      isActive: true,
      activeSceneId: sceneId,
    });

    const replayState = engine.selectRenderState();
    expect(
      findElementById(replayState.elements, "active-replay"),
    ).toMatchObject({
      content: sceneId,
    });

    await dispatchRouteGraphicsClick(
      engine,
      findElementById(replayState.elements, "exit-replay"),
    );
    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(
      engine.selectSystemState().contexts.at(-1).pointers.read,
    ).toMatchObject({
      sectionId: "caller",
      lineId: "caller1",
    });
  });
});
