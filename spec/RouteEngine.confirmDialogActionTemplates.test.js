import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = () => {
  return {
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
                  actions: {},
                },
              ],
            },
          },
        },
      },
    },
  };
};

describe("RouteEngine showConfirmDialog deferred action templates", () => {
  it("does not eagerly resolve nested confirm dialog action templates", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createProjectData(),
      },
    });

    expect(() => {
      engine.handleActions(
        {
          showConfirmDialog: {
            resourceId: "confirm-layout",
            confirmActions: {
              updateVariable: {
                id: "confirm-action",
                operations: [
                  {
                    variableId: "volume",
                    op: "set",
                    value: "_event.value",
                  },
                ],
              },
            },
          },
        },
        {
          _event: {
            id: "open-dialog-button",
          },
        },
      );
    }).not.toThrow();

    expect(engine.selectSystemState().global.confirmDialog).toEqual({
      resourceId: "confirm-layout",
      confirmActions: {
        updateVariable: {
          id: "confirm-action",
          operations: [
            {
              variableId: "volume",
              op: "set",
              value: "_event.value",
            },
          ],
        },
        hideConfirmDialog: {},
      },
      cancelActions: {
        hideConfirmDialog: {},
      },
    });
  });
});
