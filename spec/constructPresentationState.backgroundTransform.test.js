import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";
import { constructRenderState } from "../src/stores/constructRenderState.js";

const createResources = () => ({
  images: {
    bg: {
      fileId: "bg.png",
      width: 1920,
      height: 1080,
    },
  },
  videos: {},
  layouts: {},
  animations: {},
  transforms: {
    preset: {
      x: 100,
      y: 200,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  characters: {},
  controls: {},
  colors: {},
  fonts: {},
  sectionTransitions: {},
  sounds: {},
  sprites: {},
  spritesheets: {},
  textStyles: {},
  variables: {},
});

const findBackgroundSprite = (elements = []) => {
  const pending = [...elements];
  while (pending.length > 0) {
    const element = pending.shift();
    if (element?.id === "bg-cg-background-sprite") {
      return element;
    }
    pending.push(...(element?.children ?? []));
  }
  return undefined;
};

describe("constructPresentationState background transforms", () => {
  it("does not inherit previous inline background transform when transformId is selected", () => {
    const presentationState = constructPresentationState([
      {
        background: {
          resourceId: "bg",
          x: 900,
          y: 800,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1.2,
          scaleY: 1.2,
          rotation: 0,
        },
      },
      {
        background: {
          resourceId: "bg",
          transformId: "preset",
        },
      },
    ]);

    expect(presentationState.background).toEqual({
      resourceId: "bg",
      transformId: "preset",
    });

    const renderState = constructRenderState({
      presentationState,
      resources: createResources(),
      screen: {
        width: 1920,
        height: 1080,
      },
    });

    expect(findBackgroundSprite(renderState.elements)).toMatchObject({
      x: 100,
      y: 200,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("keeps explicit inline overrides supplied with a transformId", () => {
    const presentationState = constructPresentationState([
      {
        background: {
          resourceId: "bg",
          x: 900,
          y: 800,
        },
      },
      {
        background: {
          resourceId: "bg",
          transformId: "preset",
          x: 300,
        },
      },
    ]);

    expect(presentationState.background).toEqual({
      resourceId: "bg",
      transformId: "preset",
      x: 300,
    });

    const renderState = constructRenderState({
      presentationState,
      resources: createResources(),
      screen: {
        width: 1920,
        height: 1080,
      },
    });

    expect(findBackgroundSprite(renderState.elements)).toMatchObject({
      x: 300,
      y: 200,
    });
  });
});
