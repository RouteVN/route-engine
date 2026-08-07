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
        opacity: 0.6,
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
        alpha: 0.6,
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
        opacity: 0.6,
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

  it("prefers layout alpha while preserving legacy opacity compatibility", () => {
    const layoutElements = [
      {
        id: "container",
        type: "container",
        children: [
          {
            id: "legacy-panel",
            type: "rect",
            width: 100,
            height: 100,
            opacity: 0.4,
            hover: {
              opacity: 0.9,
            },
          },
          {
            id: "preferred-panel",
            type: "rect",
            width: 100,
            height: 100,
            alpha: 0.7,
            opacity: 0.2,
          },
        ],
      },
    ];

    expect(resolveLayoutReferences(layoutElements)).toEqual([
      {
        id: "container",
        type: "container",
        children: [
          {
            id: "legacy-panel",
            type: "rect",
            width: 100,
            height: 100,
            alpha: 0.4,
            hover: {
              opacity: 0.9,
            },
          },
          {
            id: "preferred-panel",
            type: "rect",
            width: 100,
            height: 100,
            alpha: 0.7,
          },
        ],
      },
    ]);

    expect(layoutElements[0].children[0]).toHaveProperty("opacity", 0.4);
    expect(layoutElements[0].children[0]).not.toHaveProperty("alpha");
  });

  it("normalizes only layout structure and preserves every interaction payload", () => {
    const layout = {
      elements: [
        {
          id: "root",
          type: "container",
          opacity: 0.8,
          drag: {
            payload: {
              type: "asset",
              opacity: 0.7,
              elements: [
                {
                  id: "payload-element",
                  type: "rect",
                  opacity: 0.6,
                },
              ],
            },
          },
          children: [
            {
              "$if enabled": [
                {
                  id: "conditional-child",
                  type: "rect",
                  opacity: 0.5,
                  scrollUp: {
                    payload: {
                      type: "asset",
                      opacity: 0.4,
                    },
                  },
                },
              ],
            },
            {
              id: "direct-child",
              type: "rect",
              opacity: 0.3,
              scrollDown: {
                type: "asset",
                opacity: 0.2,
                payload: {
                  children: [
                    {
                      id: "payload-child",
                      type: "rect",
                      opacity: 0.1,
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };
    const original = structuredClone(layout);

    const resolved = resolveLayoutReferences(layout);
    const root = resolved.elements[0];
    const conditionalChild = root.children[0]["$if enabled"][0];
    const directChild = root.children[1];

    expect(root).toMatchObject({ alpha: 0.8 });
    expect(conditionalChild).toMatchObject({ alpha: 0.5 });
    expect(directChild).toMatchObject({ alpha: 0.3 });
    expect(root).not.toHaveProperty("opacity");
    expect(conditionalChild).not.toHaveProperty("opacity");
    expect(directChild).not.toHaveProperty("opacity");

    expect(root.drag).toEqual(original.elements[0].drag);
    expect(conditionalChild.scrollUp).toEqual(
      original.elements[0].children[0]["$if enabled"][0].scrollUp,
    );
    expect(directChild.scrollDown).toEqual(
      original.elements[0].children[1].scrollDown,
    );
    expect(layout).toEqual(original);
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
