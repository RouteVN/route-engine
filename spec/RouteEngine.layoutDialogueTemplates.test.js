import { describe, expect, it } from "vitest";
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

const createProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {
      advDialogue: {
        mode: "adv",
        elements: [
          {
            id: "dialogue-text",
            type: "text",
            content: "${dialogue.content[0].text}",
          },
        ],
      },
      conditionalLayout: {
        elements: [
          {
            "$if dialogue": [
              {
                id: "dialogue-present",
                type: "text",
                content: "${dialogue.content[0].text}",
              },
            ],
          },
          {
            id: "always-present",
            type: "text",
            content: "No active dialogue",
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
            initialLineId: "line1",
            lines: [
              {
                id: "line1",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "advDialogue",
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
                  layout: {
                    resourceId: "conditionalLayout",
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

describe("RouteEngine layout dialogue templates", () => {
  it("does not expose persisted ADV dialogue shells on the next non-dialogue line", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createProjectData(),
      },
    });

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({
      nextLine: {},
    });

    const renderState = engine.selectRenderState();

    expect(engine.selectSystemState().contexts.at(-1).pointers.read.lineId).toBe(
      "line2",
    );
    expect(findElementById(renderState.elements, "dialogue-present")).toBeNull();
    expect(findElementById(renderState.elements, "always-present")).toMatchObject(
      {
        content: "No active dialogue",
      },
    );
  });
});
