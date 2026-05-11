import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = () => {
  const copiedSfx = {
    id: "copied-sfx-id",
    resourceId: "click",
    volume: 100,
  };

  return {
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: "#000000",
    },
    resources: {
      sounds: {
        click: {
          fileId: "click.wav",
        },
      },
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
                    sfx: {
                      items: [copiedSfx],
                    },
                  },
                },
                {
                  id: "line2",
                  actions: {
                    sfx: {
                      items: [copiedSfx],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
  };
};

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

describe("RouteEngine SFX rendering", () => {
  it("uses index and resource scoped SFX render ids without line pointer data", () => {
    const engine = createRouteEngineWithInlineEffects();

    engine.init({
      initialState: {
        global: {
          runtime: {
            soundVolume: 100,
          },
        },
        projectData: createProjectData(),
      },
    });

    const firstLineAudio = engine.selectRenderState().audio;
    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    const secondLineAudio = engine.selectRenderState().audio;

    expect(firstLineAudio).toEqual([
      expect.objectContaining({
        id: "sfx:0:click",
        src: "click.wav",
      }),
    ]);
    expect(secondLineAudio).toEqual([
      expect.objectContaining({
        id: "sfx:0:click",
        src: "click.wav",
      }),
    ]);
  });
});
