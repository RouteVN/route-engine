import { describe, expect, it } from "vitest";
import { constructRenderState } from "../src/stores/constructRenderState.js";

const collectElements = (elements = []) =>
  elements.flatMap((element) => [
    element,
    ...collectElements(element.children ?? []),
  ]);

describe("constructRenderState layout instances", () => {
  it("gives each rendered instance unique stable element ids", () => {
    const resources = {
      layouts: {
        shared: {
          elements: [
            {
              id: "shared-label",
              type: "text",
              content: "Shared layout",
            },
          ],
        },
      },
    };
    const render = () =>
      constructRenderState({
        presentationState: {
          layout: { resourceId: "shared" },
        },
        resources,
        screen: { width: 800, height: 600 },
        overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
      });
    const getSharedElementIds = (renderState) =>
      collectElements(renderState.elements)
        .filter((element) => element.content === "Shared layout")
        .map((element) => element.id);

    const firstIds = getSharedElementIds(render());

    expect(firstIds).toHaveLength(2);
    expect(new Set(firstIds).size).toBe(2);
    expect(getSharedElementIds(render())).toEqual(firstIds);
    expect(resources.layouts.shared.elements[0].id).toBe("shared-label");
  });

  it("separates ids when a layout is used as background and dialogue UI", () => {
    const renderState = constructRenderState({
      presentationState: {
        background: { resourceId: "shared" },
        dialogue: {
          ui: { resourceId: "shared" },
          content: [{ text: "Hello" }],
        },
      },
      resources: {
        layouts: {
          shared: {
            elements: [
              {
                id: "shared-label",
                type: "text",
                content: "Shared layout",
              },
            ],
          },
        },
      },
      screen: { width: 800, height: 600 },
    });
    const ids = collectElements(renderState.elements)
      .filter((element) => element.content === "Shared layout")
      .map((element) => element.id);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
