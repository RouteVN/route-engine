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

const createProjectData = ({
  initialLineId,
  firstLineDialogue,
  secondLineDialogue,
}) => {
  return {
    screen: {
      width: 1920,
      height: 1080,
    },
    resources: {
      layouts: {
        adv: {
          id: "adv",
          name: "ADV",
          layoutType: "dialogue",
          elements: [
            {
              id: "adv-root",
              type: "text",
              content: "${dialogue.content[0].text}",
            },
          ],
        },
        nvl: {
          id: "nvl",
          name: "NVL",
          layoutType: "nvl",
          elements: [
            {
              id: "nvl-root",
              type: "container",
              children: [
                {
                  id: "nvl-item-${i}",
                  type: "text",
                  $each: "line, i in dialogue.lines",
                  content: "${line.content[0].text}",
                },
              ],
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
              initialLineId,
              lines: [
                {
                  id: "line1",
                  actions: {
                    dialogue: firstLineDialogue,
                  },
                },
                {
                  id: "line2",
                  actions: {
                    dialogue: secondLineDialogue,
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

const createNameVariableProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: {
    layouts: {
      adv: {
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
                      resourceId: "adv",
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

describe("RouteEngine updateProjectData", () => {
  it("treats projectData as opaque when processing action templates", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "nvl",
        ui: {
          resourceId: "nvl",
        },
        content: [{ text: "First" }],
      },
      secondLineDialogue: {
        content: [{ text: "Second" }],
      },
    });

    const nextProjectData = createProjectData({
      initialLineId: "line2",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "First" }],
      },
      secondLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Second" }],
      },
    });

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });

    expect(() => {
      engine.handleActions({
        updateProjectData: {
          projectData: nextProjectData,
        },
        jumpToLine: {
          sectionId: "section1",
          lineId: "line2",
        },
      });
    }).not.toThrow();

    expect(engine.selectSystemState().projectData).toEqual(nextProjectData);
    expect(engine.selectRenderState().elements).toEqual([
      {
        id: "story",
        type: "container",
        x: 0,
        y: 0,
        children: [
          {
            id: "adv-root",
            type: "text",
            content: "Second",
          },
        ],
      },
    ]);
  });

  it("hydrates newly introduced defaults used by character nameVariableId", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    const initialProjectData = createProjectData({
      initialLineId: "line1",
      firstLineDialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "Initial" }],
      },
      secondLineDialogue: {
        content: [{ text: "Unused" }],
      },
    });
    const nextProjectData = createNameVariableProjectData();

    engine.init({
      initialState: {
        projectData: initialProjectData,
      },
    });

    engine.handleActions({
      updateProjectData: {
        projectData: nextProjectData,
      },
    });

    expect(engine.selectSystemState().contexts[0].variables.playerName).toBe(
      "Guest",
    );
    expect(
      findElementById(engine.selectRenderState().elements, "speaker"),
    ).toMatchObject({
      content: "Guest",
    });
  });
});
