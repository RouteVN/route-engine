import { describe, expect, it } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
  findRenderElement,
} from "./helpers/createEngineIntegrationHarness.js";
import { readEngineCheckpoint } from "../../vt/static/engineRobustnessProbe.js";

describe("layout occurrence observations", () => {
  it("scopes authored IDs to one exact owner while default observations retain physical IDs", () => {
    const authoredId = "name--100%";
    const harness = createEngineIntegrationHarness({
      projectData: createIntegrationProject({
        resources: {
          layouts: {
            shared: {
              elements: [{ id: authoredId, type: "text", content: "Shared" }],
            },
          },
        },
        sections: {
          main: {
            lines: [
              {
                id: "entry",
                actions: {
                  layout: { resourceId: "shared" },
                  pushOverlay: { resourceId: "shared", resourceType: "layout" },
                },
              },
            ],
          },
        },
      }),
    });
    const renderState = harness.renderStates.at(-1);
    const main = findRenderElement(renderState.elements, authoredId, {
      layoutRootId: "layout-shared",
    });
    const overlay = findRenderElement(renderState.elements, authoredId, {
      layoutRootId: "overlayStack-0",
    });
    expect(main.id).toBe("@layout/layout-shared--name%2D%2D100%25");
    expect(overlay.id).toBe("@layout/overlayStack-0--name%2D%2D100%25");
    expect(findRenderElement(renderState.elements, authoredId)).toBeUndefined();
    expect(
      findRenderElement(renderState.elements, authoredId, {
        layoutRootId: "overlayStack-1",
      }),
    ).toBeUndefined();
    expect(
      readEngineCheckpoint(harness.engine, { renderState }).textById,
    ).toEqual({ [main.id]: "Shared", [overlay.id]: "Shared" });
    expect(
      readEngineCheckpoint(harness.engine, {
        renderState,
        layoutRootId: "overlayStack-0",
      }).textById,
    ).toEqual({ [authoredId]: "Shared" });
    expect(
      readEngineCheckpoint(harness.engine, {
        renderState,
        layoutRootId: "overlayStack-1",
      }).textById,
    ).toEqual({});
    harness.engine.dispose();
  });

  it("rejects ambiguous physical lookups rather than selecting an arbitrary instance", () => {
    const elements = [
      { id: "@layout/layout-shared--name" },
      { id: "@layout/layout-shared--name" },
    ];
    expect(() =>
      findRenderElement(elements, "name", { layoutRootId: "layout-shared" }),
    ).toThrow(/Ambiguous render element/);
    expect(
      findRenderElement([{ id: "name" }], "name", {
        layoutRootId: "layout-shared",
      }),
    ).toBeUndefined();
  });
});
