import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = ({
  initialLineId,
  firstLineDialogue,
  secondLineDialogue,
}) => {
  return {
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: "#000000",
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
});
