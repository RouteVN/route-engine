import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";
import { constructRenderState } from "../src/stores/constructRenderState.js";
import { normalizePersistentPresentationState } from "../src/util.js";

const createResources = () => ({
  images: {
    bg1: {
      fileId: "bg-old.png",
      width: 1920,
      height: 1080,
    },
    bg2: {
      fileId: "bg-new.png",
      width: 1920,
      height: 1080,
    },
  },
  videos: {},
  layouts: {
    bgLayout: {
      elements: [],
    },
  },
  animations: {
    maskTransition: {
      type: "transition",
      prev: {
        tween: {
          alpha: {
            initialValue: 1,
            keyframes: [{ duration: 1000, value: 0 }],
          },
        },
      },
      next: {
        tween: {
          alpha: {
            initialValue: 0,
            keyframes: [{ duration: 1000, value: 1 }],
          },
        },
      },
    },
  },
  transforms: {},
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

const createPresentationPair = (nextBackground) => {
  const previousPresentationState = normalizePersistentPresentationState(
    constructPresentationState([
      {
        background: {
          resourceId: "bg1",
        },
      },
    ]),
  );

  const presentationState = constructPresentationState([
    previousPresentationState,
    {
      background: nextBackground,
    },
  ]);

  return {
    previousPresentationState,
    presentationState,
  };
};

describe("constructRenderState background transition targets", () => {
  it("keeps a stable background target id for same-type background swaps", () => {
    const resources = createResources();
    const { previousPresentationState, presentationState } =
      createPresentationPair({
        resourceId: "bg2",
        animations: {
          resourceId: "maskTransition",
        },
      });

    const renderState = constructRenderState({
      presentationState,
      previousPresentationState,
      resources,
    });

    const story = renderState.elements.find((element) => element.id === "story");
    expect(story.children).toContainEqual(
      expect.objectContaining({
        id: "bg-cg-background-sprite",
        type: "sprite",
        src: "bg-new.png",
      }),
    );
    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "bg-cg-animation-transition",
        type: "transition",
        targetId: "bg-cg-background-sprite",
      }),
    ]);
  });

  it("falls back to separate transition targets when background render kinds change", () => {
    const resources = createResources();
    const { previousPresentationState, presentationState } =
      createPresentationPair({
        resourceId: "bgLayout",
        animations: {
          resourceId: "maskTransition",
        },
      });

    const renderState = constructRenderState({
      presentationState,
      previousPresentationState,
      resources,
    });

    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "bg-cg-animation-out",
        type: "transition",
        targetId: "bg-cg-background-sprite",
      }),
      expect.objectContaining({
        id: "bg-cg-animation-in",
        type: "transition",
        targetId: "bg-cg-background-container",
      }),
    ]);
  });
});
