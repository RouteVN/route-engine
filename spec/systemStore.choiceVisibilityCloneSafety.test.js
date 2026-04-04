import { describe, expect, it } from "vitest";
import { selectIsChoiceVisible } from "../src/stores/system.store.js";

describe("selectIsChoiceVisible clone safety", () => {
  it("does not rebuild presentation state for choice visibility checks", () => {
    const state = {
      global: {},
      projectData: {
        story: {
          scenes: {
            scene1: {
              sections: {
                section1: {
                  lines: [
                    {
                      id: "line1",
                      actions: {
                        background: {
                          resourceId: "bg-main",
                          view: globalThis,
                        },
                      },
                    },
                    {
                      id: "line2",
                      actions: {
                        choice: {
                          resourceId: "choice-layout",
                          items: [],
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      contexts: [
        {
          currentPointerMode: "read",
          pointers: {
            read: {
              sectionId: "section1",
              lineId: "line2",
            },
          },
        },
      ],
    };

    expect(() => selectIsChoiceVisible({ state })).not.toThrow();
    expect(selectIsChoiceVisible({ state })).toBe(true);
  });
});
