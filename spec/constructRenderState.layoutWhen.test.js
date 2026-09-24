import { describe, expect, it } from "vitest";
import { addBackgroundOrCg } from "../src/stores/constructRenderState.js";

const renderBackgroundLayout = (when) =>
  addBackgroundOrCg(
    {
      elements: [{ id: "story", type: "container", children: [] }],
      animations: [],
    },
    {
      presentationState: { background: { resourceId: "layout" } },
      resources: {
        layouts: {
          layout: {
            elements: [
              {
                id: "conditional",
                type: "rect",
                width: 10,
                height: 10,
                $when: when,
              },
            ],
          },
        },
      },
      variables: { flag: false },
    },
  );

describe("layout visibility conditions", () => {
  it("rejects an incomplete condition instead of rendering the element", () => {
    expect(() => renderBackgroundLayout("variables.flag ==")).toThrow(
      /Malformed \$when condition/,
    );
  });

  it("keeps valid conditions and boolean guards working", () => {
    const conditionalLayout = renderBackgroundLayout("variables.flag == false");
    const booleanGuardLayout = renderBackgroundLayout(false);
    const conditionalContainer = conditionalLayout.elements[0].children.find(
      (element) => element.id === "bg-cg-background-container",
    );
    const booleanGuardContainer = booleanGuardLayout.elements[0].children.find(
      (element) => element.id === "bg-cg-background-container",
    );

    expect(conditionalContainer.children).toHaveLength(1);
    expect(booleanGuardContainer.children).toHaveLength(0);
  });
});
