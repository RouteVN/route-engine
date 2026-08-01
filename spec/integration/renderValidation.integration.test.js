import { describe, expect, it } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
  findRenderElement,
} from "./helpers/createEngineIntegrationHarness.js";

describe("engine render and package validation integration regressions", () => {
  it.fails(
    "uses the first spritesheet animation when a visual omits its name",
    () => {
      const projectData = createIntegrationProject({
        resources: {
          spritesheets: {
            fighter: {
              fileId: "fighter.png",
              width: 64,
              height: 64,
              jsonData: { frames: {}, meta: {} },
              animations: {
                idle: { frames: [0, 1], animationSpeed: 0.5, loop: true },
              },
            },
          },
          transforms: {
            center: { x: 640, y: 360 },
          },
        },
        sections: {
          main: {
            lines: [
              {
                id: "line1",
                actions: {
                  visual: {
                    items: [
                      {
                        id: "fighter",
                        resourceId: "fighter",
                        transformId: "center",
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      });

      const harness = createEngineIntegrationHarness({ projectData });
      const fighter = findRenderElement(
        harness.renderStates.at(-1).elements,
        "visual-fighter",
      );

      expect(fighter).toMatchObject({
        type: "spritesheet-animation",
        playback: { frames: [0, 1] },
      });
    },
  );

  it.fails("renders one visual when a resource ID is ambiguous", () => {
    const projectData = createIntegrationProject({
      resources: {
        images: {
          shared: { fileId: "shared.png", width: 64, height: 64 },
        },
        layouts: {
          shared: { elements: [{ id: "layout-child", type: "container" }] },
        },
        transforms: {
          center: { x: 640, y: 360 },
        },
      },
      sections: {
        main: {
          lines: [
            {
              id: "line1",
              actions: {
                visual: {
                  items: [
                    {
                      id: "shared",
                      resourceId: "shared",
                      transformId: "center",
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });

    const harness = createEngineIntegrationHarness({ projectData });
    const story = harness.renderStates
      .at(-1)
      .elements.find((element) => element.id === "story");
    const matchingVisuals = story.children.filter(
      (element) => element.id === "visual-shared",
    );

    expect(matchingVisuals).toHaveLength(1);
  });

  it.fails(
    "rejects non-finite L10n resource numbers during initialization",
    () => {
      const projectData = createIntegrationProject({
        sections: { main: { lines: [{ id: "line1", actions: {} }] } },
      });
      const l10nData = {
        packages: {
          translated: {
            language: "Translated",
            files: [],
            patches: [
              {
                type: "resource.transform",
                operation: "add",
                resourceId: "invalidTransform",
                payload: { x: Number.POSITIVE_INFINITY, y: 0 },
              },
            ],
          },
        },
      };

      expect(() =>
        createEngineIntegrationHarness({
          projectData,
          l10nData,
          global: { runtime: { localizationPackageId: "translated" } },
        }),
      ).toThrow(/finite|number/);
    },
  );
});
