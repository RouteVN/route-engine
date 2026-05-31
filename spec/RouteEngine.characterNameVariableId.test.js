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
  },
  resources: {
    layouts: {
      advDialogue: {
        elements: [
          {
            id: "speaker",
            type: "text",
            content: "${dialogue.character.name}",
          },
          {
            id: "body",
            type: "text",
            content: "${dialogue.content[0].text}",
          },
        ],
      },
    },
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    characters: {
      protagonist: {
        name: "Protagonist",
        nameVariableId: "playerName",
      },
    },
    variables: {
      playerName: {
        type: "string",
        scope: "context",
        default: "Guest",
      },
    },
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
                    characterId: "protagonist",
                    content: [
                      {
                        text: "Hello.",
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

const createEngine = () => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects: (effects) => {
      effects.forEach((effect) => {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions();
        }
      });
    },
  });
  return engine;
};

describe("RouteEngine character nameVariableId", () => {
  it("renders resource character names from string variables and updates with variable changes", () => {
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData: createProjectData(),
      },
    });

    expect(
      findElementById(engine.selectRenderState().elements, "speaker"),
    ).toMatchObject({
      content: "Guest",
    });

    engine.handleActions({
      updateVariable: {
        id: "rename",
        operations: [
          {
            variableId: "playerName",
            op: "set",
            value: "Ada",
          },
        ],
      },
    });

    expect(
      findElementById(engine.selectRenderState().elements, "speaker"),
    ).toMatchObject({
      content: "Ada",
    });
  });
});
