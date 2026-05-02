import { describe, expect, it } from "vitest";
import { createSystemStore } from "../src/stores/system.store.js";

const createProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    voices: {
      scene1: {
        sharedLine: {
          fileId: "voices/scene1/sharedLine.ogg",
        },
      },
      scene2: {
        sharedLine: {
          fileId: "voices/scene2/sharedLine.ogg",
        },
      },
    },
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        name: "Scene 1",
        initialSectionId: "section1",
        sections: {
          section1: {
            name: "Section 1",
            lines: [
              {
                id: "line1",
                actions: {
                  voice: {
                    resourceId: "sharedLine",
                  },
                },
              },
            ],
          },
        },
      },
      scene2: {
        name: "Scene 2",
        initialSectionId: "section2",
        sections: {
          section2: {
            name: "Section 2",
            lines: [
              {
                id: "line1",
                actions: {
                  voice: {
                    resourceId: "sharedLine",
                    volume: 70,
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

describe("RouteEngine voice rendering", () => {
  it("resolves voice resources from the active scene", () => {
    const store = createSystemStore({
      global: {
        runtime: {
          soundVolume: 35,
        },
      },
      projectData: createProjectData(),
    });

    expect(store.selectRenderState().audio).toEqual([
      {
        id: "voice-scene1-sharedLine",
        type: "sound",
        src: "voices/scene1/sharedLine.ogg",
        volume: 35,
        loop: false,
        startDelayMs: null,
      },
    ]);

    store.sectionTransition({ sectionId: "section2" });

    expect(store.selectRenderState().audio).toEqual([
      {
        id: "voice-scene2-sharedLine",
        type: "sound",
        src: "voices/scene2/sharedLine.ogg",
        volume: 70,
        loop: false,
        startDelayMs: null,
      },
    ]);
  });
});
