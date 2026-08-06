import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";
import { constructRenderState } from "../src/stores/constructRenderState.js";
import { normalizePersistentPresentationState } from "../src/util.js";

const createResources = () => ({
  images: {
    badge: {
      fileId: "badge.png",
      width: 64,
      height: 64,
    },
  },
  transforms: {
    center: {
      x: 400,
      y: 240,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  colors: {
    panel: { hex: "#222222" },
    text: { hex: "#FFFFFF" },
  },
  fonts: {
    default: { fileId: "Arial" },
  },
  textStyles: {
    title: {
      fontId: "default",
      colorId: "text",
      fontSize: 32,
      fontWeight: "700",
      fontStyle: "normal",
      lineHeight: 1.2,
    },
  },
  layouts: {},
  videos: {},
  spritesheets: {},
  particles: {},
  animations: {},
  characters: {},
});

const findVisual = (renderState, id) =>
  renderState.elements
    .find((element) => element.id === "story")
    .children.find((element) => element.id === `visual-${id}`);

describe("inline visual layouts", () => {
  it("renders templated text, referenced images, and input payloads with an inline transform", () => {
    const presentationState = constructPresentationState([
      {
        visual: {
          items: [
            {
              id: "status",
              layout: {
                elements: [
                  {
                    id: "panel",
                    type: "rect",
                    width: 360,
                    height: 180,
                    colorId: "panel",
                    click: {
                      payload: {
                        actions: {
                          updateVariable: {
                            id: "incrementScore",
                            operations: [
                              {
                                variableId: "score",
                                op: "increment",
                                value: 1,
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                  {
                    id: "badge",
                    type: "sprite",
                    imageId: "badge",
                    x: 56,
                    y: 90,
                    anchorX: 0.5,
                    anchorY: 0.5,
                  },
                  {
                    id: "title",
                    type: "text",
                    content: "${variables.label}: ${variables.score}",
                    textStyleId: "title",
                    x: 210,
                    y: 90,
                    anchorX: 0.5,
                    anchorY: 0.5,
                  },
                ],
              },
              transform: {
                x: 120,
                y: 80,
                anchorX: 0,
                anchorY: 0,
                scaleX: 1.25,
                scaleY: 1.25,
                rotation: -2,
              },
              layer: 70,
              opacity: 0.85,
            },
          ],
        },
      },
    ]);

    const renderState = constructRenderState({
      presentationState,
      resources: createResources(),
      variables: { label: "SCORE", score: 2 },
    });
    const visual = findVisual(renderState, "status");

    expect(visual).toMatchObject({
      type: "container",
      x: 120,
      y: 80,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1.25,
      scaleY: 1.25,
      rotation: -2,
      alpha: 0.85,
    });
    expect(visual.children.find(({ id }) => id === "panel")).toMatchObject({
      fill: "#222222",
      click: {
        payload: {
          actions: {
            updateVariable: {
              id: "incrementScore",
            },
          },
        },
      },
    });
    expect(visual.children.find(({ id }) => id === "badge")).toMatchObject({
      type: "sprite",
      src: "badge.png",
      width: 64,
      height: 64,
    });
    expect(visual.children.find(({ id }) => id === "title")).toMatchObject({
      type: "text",
      content: "SCORE: 2",
      textStyle: {
        fontFamily: "Arial",
        fill: "#FFFFFF",
        fontSize: 32,
      },
    });
  });

  it("replaces inline layout content by id while preserving visual state", () => {
    const presentationState = constructPresentationState([
      {
        visual: {
          items: [
            {
              id: "title",
              layout: {
                elements: [
                  {
                    id: "text",
                    type: "text",
                    content: "Chapter 1",
                    textStyleId: "title",
                  },
                ],
              },
              transform: {
                x: 100,
                y: 120,
                anchorX: 0.5,
                anchorY: 0.5,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
              },
              layer: 70,
              opacity: 0.8,
            },
          ],
        },
      },
      {
        visual: {
          items: [
            {
              id: "title",
              layout: {
                elements: [
                  {
                    id: "text",
                    type: "text",
                    content: "Chapter 2",
                    textStyleId: "title",
                  },
                ],
              },
              transform: {
                y: 180,
              },
            },
          ],
        },
      },
    ]);

    expect(presentationState.visual.items[0]).toMatchObject({
      id: "title",
      layout: {
        elements: [{ content: "Chapter 2" }],
      },
      transform: {
        x: 100,
        y: 180,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
      layer: 70,
      opacity: 0.8,
    });
  });

  it("supports inline transforms for existing resource-backed visuals", () => {
    const presentationState = constructPresentationState([
      {
        visual: {
          items: [
            {
              id: "badge",
              resourceId: "badge",
              transform: {
                x: 320,
                y: 180,
                anchorX: 0.5,
                anchorY: 0.5,
                scaleX: 2,
                scaleY: 2,
                rotation: 12,
              },
            },
          ],
        },
      },
    ]);

    const visual = findVisual(
      constructRenderState({
        presentationState,
        resources: createResources(),
      }),
      "badge",
    );

    expect(visual).toMatchObject({
      type: "sprite",
      src: "badge.png",
      x: 320,
      y: 180,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 2,
      scaleY: 2,
      rotation: 12,
    });
  });

  it("replaces persisted top-level overrides with an authored inline transform", () => {
    const presentationState = constructPresentationState([
      {
        visual: {
          items: [
            {
              id: "badge",
              resourceId: "badge",
              transformId: "center",
              x: 100,
              y: 120,
            },
          ],
        },
      },
      {
        visual: {
          items: [
            {
              id: "badge",
              transform: {
                x: 300,
                y: 180,
                anchorX: 0.5,
                anchorY: 0.5,
                scaleX: 1.5,
                scaleY: 1.5,
                rotation: 8,
              },
            },
          ],
        },
      },
    ]);

    const item = presentationState.visual.items[0];
    expect(item).not.toHaveProperty("transformId");
    expect(item).not.toHaveProperty("x");
    expect(item).not.toHaveProperty("y");
    expect(item.transform).toMatchObject({ x: 300, y: 180 });

    expect(
      findVisual(
        constructRenderState({
          presentationState,
          resources: createResources(),
        }),
        "badge",
      ),
    ).toMatchObject({
      x: 300,
      y: 180,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 8,
    });
  });

  it("preserves an inline layout for an animation-only exit on the next line", () => {
    const resources = createResources();
    resources.animations.fadeOut = {
      type: "transition",
      prev: {
        tween: {
          alpha: {
            initialValue: 1,
            keyframes: [{ duration: 300, value: 0 }],
          },
        },
      },
    };

    const previousPresentationState = normalizePersistentPresentationState(
      constructPresentationState([
        {
          visual: {
            items: [
              {
                id: "title",
                layout: {
                  elements: [
                    {
                      id: "title-text",
                      type: "text",
                      content: "Chapter 1",
                      textStyleId: "title",
                    },
                  ],
                },
                transform: {
                  x: 400,
                  y: 120,
                  anchorX: 0.5,
                  anchorY: 0.5,
                },
              },
            ],
          },
        },
      ]),
    );

    expect(previousPresentationState.visual.items[0]).toMatchObject({
      id: "title",
      layout: {
        elements: [{ id: "title-text", content: "Chapter 1" }],
      },
      transform: {
        x: 400,
        y: 120,
      },
    });

    const presentationState = constructPresentationState([
      previousPresentationState,
      {
        visual: {
          items: [
            {
              id: "title",
              animations: { resourceId: "fadeOut" },
            },
          ],
        },
      },
    ]);
    const renderState = constructRenderState({
      presentationState,
      previousPresentationState,
      resources,
    });

    expect(findVisual(renderState, "title")).toBeUndefined();
    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "title-animation-out",
        type: "transition",
        targetId: "visual-title",
      }),
    ]);
  });

  it("rejects ambiguous subjects and transform sources", () => {
    expect(() =>
      constructPresentationState([
        {
          visual: {
            items: [
              {
                id: "ambiguous-subject",
                resourceId: "badge",
                layout: { elements: [] },
              },
            ],
          },
        },
      ]),
    ).toThrow(
      'Visual item "ambiguous-subject" must define only one of resourceId, text, or layout',
    );

    expect(() =>
      constructPresentationState([
        {
          visual: {
            items: [
              {
                id: "ambiguous-transform",
                layout: { elements: [] },
                transformId: "center",
                transform: { x: 0 },
              },
            ],
          },
        },
      ]),
    ).toThrow(
      'Visual item "ambiguous-transform" cannot define both transformId and transform',
    );
  });

  it("requires a transform source for a renderable inline layout", () => {
    expect(() =>
      constructRenderState({
        presentationState: {
          visual: {
            items: [
              {
                id: "missing-transform",
                layout: { elements: [] },
              },
            ],
          },
        },
        resources: createResources(),
      }),
    ).toThrow(
      'Visual item "missing-transform" requires transformId or transform',
    );
  });
});
