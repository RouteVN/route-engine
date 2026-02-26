import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createMinimalProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  l10n: {
    packages: {
      en: {},
    },
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
    tweens: {},
    fonts: {},
    colors: {},
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

describe("RouteEngine selectRenderState id", () => {
  it("returns unique render ids for every selectRenderState call", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        global: {
          currentLocalizationPackageId: "en",
        },
        projectData: createMinimalProjectData(),
      },
    });

    const firstRenderState = engine.selectRenderState();
    const secondRenderState = engine.selectRenderState();

    expect(typeof firstRenderState.id).toBe("string");
    expect(firstRenderState.id.length).toBeGreaterThan(0);
    expect(typeof secondRenderState.id).toBe("string");
    expect(secondRenderState.id.length).toBeGreaterThan(0);
    expect(secondRenderState.id).not.toBe(firstRenderState.id);
  });
});
