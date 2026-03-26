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

describe("RouteEngine selectSystemState", () => {
  it("returns a cloned system-state snapshot", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        global: {
          nextLineConfig: {
            manual: { enabled: true, requireComplete: false },
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
});
