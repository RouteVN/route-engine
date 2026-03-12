import { describe, expect, it } from "vitest";
import { resolveLayoutReferences } from "../src/index.js";

describe("resolveLayoutReferences public export", () => {
  it("resolves layout resource references through the package entry point", () => {
    const layoutElements = [
      {
        id: "panel",
        type: "rect",
        width: 320,
        height: 120,
        colorId: "panelBg",
      },
      {
        id: "title",
        type: "text",
        content: "Start",
        textStyleId: "menuTitle",
      },
      {
        id: "icon",
        type: "sprite",
        imageId: "iconIdle",
        hoverImageId: "iconHover",
        clickImageId: "iconActive",
      },
    ];

    const resources = {
      colors: {
        panelBg: { hex: "#112233" },
        textPrimary: { hex: "#FFFFFF" },
      },
      fonts: {
        fontMain: { fileId: "Arial" },
      },
      textStyles: {
        menuTitle: {
          fontId: "fontMain",
          colorId: "textPrimary",
          fontSize: 32,
          fontWeight: "700",
          fontStyle: "normal",
          lineHeight: 1.2,
        },
      },
      images: {
        iconIdle: {
          fileId: "icon-idle.png",
          width: 48,
          height: 48,
        },
        iconHover: {
          fileId: "icon-hover.png",
        },
        iconActive: {
          fileId: "icon-active.png",
        },
      },
    };

    const resolved = resolveLayoutReferences(layoutElements, { resources });

    expect(resolved).toEqual([
      {
        id: "panel",
        type: "rect",
        width: 320,
        height: 120,
        fill: "#112233",
      },
      {
        id: "title",
        type: "text",
        content: "Start",
        textStyle: {
          fontFamily: "Arial",
          fontSize: 32,
          fontWeight: "700",
          fontStyle: "normal",
          lineHeight: 1.2,
          fill: "#FFFFFF",
        },
      },
      {
        id: "icon",
        type: "sprite",
        src: "icon-idle.png",
        width: 48,
        height: 48,
        hover: {
          src: "icon-hover.png",
        },
        click: {
          src: "icon-active.png",
        },
      },
    ]);

    expect(layoutElements).toEqual([
      {
        id: "panel",
        type: "rect",
        width: 320,
        height: 120,
        colorId: "panelBg",
      },
      {
        id: "title",
        type: "text",
        content: "Start",
        textStyleId: "menuTitle",
      },
      {
        id: "icon",
        type: "sprite",
        imageId: "iconIdle",
        hoverImageId: "iconHover",
        clickImageId: "iconActive",
      },
    ]);
  });

  it("preserves the engine's strict validation errors", () => {
    expect(() =>
      resolveLayoutReferences(
        [
          {
            id: "bad-panel",
            type: "rect",
            width: 320,
            height: 120,
            fill: "#112233",
          },
        ],
        { resources: {} },
      ),
    ).toThrow(
      'Inline fill is not allowed in rect layout elements at "root[0]". Use colorId instead',
    );
  });
});
