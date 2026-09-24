import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

describe("RouteEngine save/load pagination", () => {
  it("uses the active layout paginationSize when selecting rendered slots", () => {
    const engine = createRouteEngine({ handlePendingEffects: () => {} });

    engine.init({
      initialState: {
        global: {},
        projectData: {
          screen: { width: 800, height: 600 },
          resources: {
            layouts: {
              saveGrid: {
                paginationSize: 4,
                elements: [
                  {
                    "$for slot in saveSlots": [
                      {
                        id: "save-slot-${slot.slotId}",
                        type: "text",
                        content: "${slot.slotId}",
                      },
                    ],
                  },
                ],
              },
            },
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
        },
      },
    });

    engine.handleAction("setSaveLoadPagination", { value: 2 });
    engine.handleAction("pushOverlay", {
      resourceId: "saveGrid",
      resourceType: "layout",
    });

    const overlay = engine
      .selectRenderState()
      .elements.find((element) => element.id === "overlayStack-0");
    const slots = overlay.children.filter((element) =>
      element.id?.startsWith("save-slot-"),
    );

    expect(slots.map(({ content }) => content)).toEqual([5, 6, 7, 8]);
  });
});
