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

describe("RouteEngine action templating", () => {
  it("resolves ${variables.*} bindings from merged engine variables", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        global: {
          variables: {
            targetId: "score",
          },
        },
        projectData: createMinimalProjectData(),
      },
    });

    engine.handleActions(
      {
        updateVariable: {
          id: "setScore",
          operations: [
            {
              variableId: "${variables.targetId}",
              op: "set",
              value: "_event.value",
            },
          ],
        },
      },
      {
        _event: {
          value: 7,
        },
      },
    );

    expect(engine.selectSystemState().contexts[0].variables.score).toBe(7);
  });
});
