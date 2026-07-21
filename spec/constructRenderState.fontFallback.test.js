import { fontStringFromTextStyle } from "pixi.js";
import { describe, expect, it } from "vitest";
import { constructRenderState } from "../src/stores/constructRenderState.js";

const findTextElement = (renderState) =>
  renderState.elements
    .find((element) => element.id === "story")
    .children.find((element) => element.id === "layout-font-fallback")
    .children.find((element) => element.id === "fallback-text");

describe("constructRenderState font fallbacks", () => {
  it("emits a frozen render state that Pixi can parse without mutating it", () => {
    const renderState = constructRenderState({
      presentationState: {
        layout: {
          resourceId: "font-fallback",
        },
      },
      resources: {
        layouts: {
          "font-fallback": {
            elements: [
              {
                id: "fallback-text",
                type: "text",
                content: "Hello",
                textStyleId: "body",
              },
            ],
          },
        },
        textStyles: {
          body: {
            fontId: ["fontLatin", "fontCjk"],
            colorId: "fg",
            fontSize: 24,
            fontWeight: "400",
            fontStyle: "normal",
            lineHeight: 1.2,
          },
        },
        fonts: {
          fontLatin: { fileId: "Inter Regular" },
          fontCjk: { fileId: "Noto Sans SC" },
        },
        colors: {
          fg: { hex: "#FFFFFF" },
        },
      },
    });

    const textStyle = findTextElement(renderState).textStyle;

    expect(Object.isFrozen(textStyle)).toBe(true);
    expect(textStyle.fontFamily).toBe("Inter Regular, Noto Sans SC");
    expect(() =>
      fontStringFromTextStyle({ fontVariant: "normal", ...textStyle }),
    ).not.toThrow();
    expect(
      fontStringFromTextStyle({ fontVariant: "normal", ...textStyle }),
    ).toContain('"Inter Regular","Noto Sans SC"');
  });
});
