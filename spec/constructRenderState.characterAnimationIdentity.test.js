import { describe, expect, it } from "vitest";
import { constructRenderState } from "../src/stores/constructRenderState.js";

const createCharacterItems = ({ ids, animated }) =>
  ids.map((id, index) => {
    const item = {
      id,
      transformId: index === 0 ? "left" : "right",
      sprites: [{ id: "body", resourceId: "body" }],
    };

    if (animated) {
      item.animations = { resourceId: "fade" };
    }

    return item;
  });

const createResources = () => ({
  images: {
    body: { fileId: "body.png", width: 100, height: 200 },
  },
  transforms: {
    left: {
      x: 300,
      y: 900,
      anchorX: 0.5,
      anchorY: 1,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    right: {
      x: 1600,
      y: 900,
      anchorX: 0.5,
      anchorY: 1,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
  },
  animations: {
    fade: {
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
});

const constructCharacterRenderState = ({
  characterItems,
  previousCharacterItems,
}) => {
  const params = {
    presentationState: {
      character: { items: characterItems },
    },
    currentLineActions: {
      character: { items: characterItems },
    },
    resources: createResources(),
    isLineCompleted: false,
  };

  if (previousCharacterItems) {
    params.previousPresentationState = {
      character: { items: previousCharacterItems },
    };
  }

  return constructRenderState(params);
};

describe("constructRenderState character animation identity", () => {
  it("namespaces simultaneous character animations by their resolved targets", () => {
    const characterItems = createCharacterItems({
      ids: ["character-one", "character-two"],
      animated: true,
    });
    const renderState = constructCharacterRenderState({ characterItems });

    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "character-container-character-one-animation-in",
        targetId: "character-container-character-one",
      }),
      expect.objectContaining({
        id: "character-container-character-two-animation-in",
        targetId: "character-container-character-two",
      }),
    ]);
  });

  it("includes occurrence order in animation ids for duplicate characters", () => {
    const characterItems = createCharacterItems({
      ids: ["twin", "twin"],
      animated: true,
    });
    const renderState = constructCharacterRenderState({ characterItems });

    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "character-container-twin-0-body-animation-in",
        targetId: "character-container-twin-0-body",
      }),
      expect.objectContaining({
        id: "character-container-twin-1-body-animation-in",
        targetId: "character-container-twin-1-body",
      }),
    ]);
    expect(new Set(renderState.animations.map(({ id }) => id)).size).toBe(2);
  });

  it("matches duplicate characters to the same previous occurrence", () => {
    const previousCharacterItems = createCharacterItems({
      ids: ["twin", "twin"],
      animated: false,
    });
    const characterItems = createCharacterItems({
      ids: ["twin", "twin"],
      animated: true,
    });
    const renderState = constructCharacterRenderState({
      characterItems,
      previousCharacterItems,
    });

    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "character-container-twin-0-body-animation-transition",
        targetId: "character-container-twin-0-body",
      }),
      expect.objectContaining({
        id: "character-container-twin-1-body-animation-transition",
        targetId: "character-container-twin-1-body",
      }),
    ]);
  });
});
