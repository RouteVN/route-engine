import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";
import { constructRenderState } from "../src/stores/constructRenderState.js";

const findElement = (elements, id) => {
  const pending = [...elements];

  while (pending.length > 0) {
    const element = pending.shift();
    if (element?.id === id) {
      return element;
    }
    pending.push(...(element?.children ?? []));
  }

  return undefined;
};

const createResources = () => ({
  animations: {},
  characters: {},
  colors: {},
  controls: {},
  fonts: {},
  images: {
    subject: {
      fileId: "subject.png",
      width: 320,
      height: 180,
    },
  },
  layouts: {},
  sectionTransitions: {},
  sounds: {},
  sprites: {},
  spritesheets: {},
  textStyles: {},
  transforms: {
    flipped: {
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 2,
      scaleY: -3,
      flipX: true,
      flipY: true,
      rotation: 0,
    },
  },
  variables: {},
  videos: {},
});

describe("constructRenderState transform flips", () => {
  it("multiplies resolved shared and inline scales by -1", () => {
    const presentationState = constructPresentationState([
      {
        background: {
          resourceId: "subject",
          transformId: "flipped",
        },
        character: {
          items: [
            {
              id: "lead",
              transformId: "flipped",
              flipX: false,
              sprites: [{ id: "body", resourceId: "subject" }],
            },
          ],
        },
        visual: {
          items: [
            {
              id: "mark",
              resourceId: "subject",
              transform: {
                x: 100,
                y: 100,
                flipX: true,
                flipY: true,
              },
            },
          ],
        },
      },
    ]);

    const renderState = constructRenderState({
      presentationState,
      resources: createResources(),
      screen: { width: 1920, height: 1080 },
    });

    expect(
      findElement(renderState.elements, "bg-cg-background-sprite"),
    ).toMatchObject({ scaleX: -2, scaleY: 3 });
    expect(
      findElement(renderState.elements, "character-container-lead"),
    ).toMatchObject({ scaleX: 2, scaleY: 3 });
    expect(findElement(renderState.elements, "visual-mark")).toMatchObject({
      scaleX: -1,
      scaleY: -1,
    });
  });

  it("persists item flips and allows explicit false to disable them", () => {
    const presentationState = constructPresentationState([
      {
        visual: {
          items: [
            {
              id: "mark",
              resourceId: "subject",
              transformId: "flipped",
              flipX: true,
              flipY: true,
            },
          ],
        },
      },
      {
        visual: {
          items: [{ id: "mark", opacity: 0.5 }],
        },
      },
      {
        visual: {
          items: [{ id: "mark", flipX: false }],
        },
      },
    ]);

    expect(presentationState.visual.items[0]).toMatchObject({
      flipX: false,
      flipY: true,
      opacity: 0.5,
    });

    const renderState = constructRenderState({
      presentationState,
      resources: createResources(),
      screen: { width: 1920, height: 1080 },
    });

    expect(findElement(renderState.elements, "visual-mark")).toMatchObject({
      scaleX: 2,
      scaleY: 3,
      alpha: 0.5,
    });
  });
});
