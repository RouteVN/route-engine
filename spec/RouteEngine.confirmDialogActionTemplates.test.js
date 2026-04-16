import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = (variables = {}) => {
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
      variables,
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

  it("resolves top-level showConfirmDialog templates while leaving nested deferred batches untouched", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createProjectData({
          confirmLayoutId: {
            type: "string",
            scope: "device",
            default: "confirm-layout",
          },
          deferredVariableId: {
            type: "string",
            scope: "device",
            default: "deferred-marker",
          },
          cancelSectionId: {
            type: "string",
            scope: "context",
            default: "section-cancel",
          },
        }),
      },
    });

    expect(() => {
      engine.handleActions(
        {
          showConfirmDialog: {
            resourceId: "${variables.confirmLayoutId}",
            confirmActions: {
              updateVariable: {
                id: "confirm-action",
                operations: [
                  {
                    variableId: "${variables.deferredVariableId}",
                    op: "set",
                    value: "_event.value",
                  },
                ],
              },
            },
            cancelActions: {
              sectionTransition: {
                sectionId: "${variables.cancelSectionId}",
              },
            },
          },
        },
        {
          _event: {
            id: "open-dialog-button",
            value: 42,
          },
          variables: {
            confirmLayoutId: "wrong-layout",
            deferredVariableId: "wrong-deferred-marker",
            cancelSectionId: "wrong-section-cancel",
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
              variableId: "${variables.deferredVariableId}",
              op: "set",
              value: "_event.value",
            },
          ],
        },
        hideConfirmDialog: {},
      },
      cancelActions: {
        sectionTransition: {
          sectionId: "${variables.cancelSectionId}",
        },
        hideConfirmDialog: {},
      },
    });
  });
});
