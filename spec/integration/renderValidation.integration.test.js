import { describe, expect } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
  findRenderElement,
} from "./helpers/createEngineIntegrationHarness.js";
import { itKnownDefect } from "./helpers/knownDefect.js";

describe("engine render and package validation integration regressions", () => {
  itKnownDefect(
    "uses the first spritesheet animation when a visual omits its name",
    ({ expectFailure }) => {
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

      expectFailure({
        observed: () => expect(fighter).toBeUndefined(),
        desired: () =>
          expect(fighter).toMatchObject({
            type: "spritesheet-animation",
            playback: { frames: [0, 1] },
          }),
      });
    },
  );

  itKnownDefect(
    "renders one visual when a resource ID is ambiguous",
    ({ expectFailure }) => {
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

      expectFailure({
        observed: () => expect(matchingVisuals).toHaveLength(2),
        desired: () => expect(matchingVisuals).toHaveLength(1),
      });
    },
  );

  itKnownDefect(
    "rejects non-finite L10n resource numbers during initialization",
    ({ expectFailure }) => {
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

      let initializationError;
      try {
        createEngineIntegrationHarness({
          projectData,
          l10nData,
          global: { runtime: { localizationPackageId: "translated" } },
        });
      } catch (error) {
        initializationError = error;
      }
      expectFailure({
        observed: () => expect(initializationError).toBeUndefined(),
        desired: () =>
          expect(initializationError?.message ?? "").toMatch(/finite|number/),
      });
    },
  );
});
