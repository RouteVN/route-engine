import { describe, expect, it } from "vitest";
import {
  constructRenderState,
  getAnimationInstanceDurationMs,
  getPersistentAnimationContinuationKey,
} from "../src/stores/constructRenderState.js";

const createResources = ({
  type = "update",
  complete,
  duration = 1000,
} = {}) => ({
  images: {
    marker: {
      fileId: "marker.png",
      width: 100,
      height: 100,
    },
  },
  transforms: {
    markerStart: {
      x: 100,
      y: 100,
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
  },
  animations: {
    drift:
      type === "update"
        ? {
            type,
            ...(complete === undefined ? {} : { complete }),
            tween: {
              x: {
                initialValue: 100,
                keyframes: [{ duration, value: 300 }],
              },
            },
          }
        : {
            type,
            ...(complete === undefined ? {} : { complete }),
            next: {
              tween: {
                alpha: {
                  initialValue: 0,
                  keyframes: [{ duration, value: 1 }],
                },
              },
            },
          },
  },
});

const constructVisualRenderState = ({
  playback,
  resources = createResources(),
  isLineCompleted = false,
} = {}) =>
  constructRenderState({
    presentationState: {
      visual: {
        items: [
          {
            id: "marker",
            resourceId: "marker",
            transformId: "markerStart",
            animations: {
              resourceId: "drift",
              playback,
            },
          },
        ],
      },
    },
    resources,
    isLineCompleted,
  });

describe("constructRenderState animation playback loop", () => {
  it("passes action-level loop and speed through update animation instances", () => {
    const resources = createResources();
    const renderState = constructVisualRenderState({
      playback: {
        loop: true,
        speed: 2,
      },
      resources,
    });

    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "marker-animation-update",
        type: "update",
        targetId: "visual-marker",
        playback: {
          loop: true,
          speed: 2,
        },
      }),
    ]);
    expect(resources.animations.drift).not.toHaveProperty("playback");
  });

  it("keeps a selected loop in completed-line renders", () => {
    const renderState = constructVisualRenderState({
      playback: {
        loop: true,
      },
      isLineCompleted: true,
    });

    expect(renderState.animations).toEqual([
      expect.objectContaining({
        playback: {
          loop: true,
        },
      }),
    ]);
  });

  it("treats loops as non-expiring and includes loop in continuation identity", () => {
    const baseAnimation = {
      id: "marker-animation-update",
      targetId: "visual-marker",
      type: "update",
      playback: {
        continuity: "persistent",
        loop: true,
      },
      tween: {
        x: {
          keyframes: [{ duration: 1000, value: 300 }],
        },
      },
    };

    expect(getAnimationInstanceDurationMs(baseAnimation)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(getPersistentAnimationContinuationKey(baseAnimation)).not.toBe(
      getPersistentAnimationContinuationKey({
        ...baseAnimation,
        playback: {
          continuity: "persistent",
        },
      }),
    );
  });

  it("normalizes loop false away", () => {
    const renderState = constructVisualRenderState({
      playback: {
        loop: false,
        speed: 1,
      },
    });

    expect(renderState.animations[0]).not.toHaveProperty("playback");
  });

  it("rejects non-boolean loop values", () => {
    expect(() =>
      constructVisualRenderState({
        playback: {
          loop: "forever",
        },
      }),
    ).toThrow(
      "[visual.items[marker].animations.playback] playback.loop must be a boolean.",
    );
  });

  it("rejects looping transition resources", () => {
    expect(() =>
      constructVisualRenderState({
        playback: {
          loop: true,
        },
        resources: createResources({ type: "transition" }),
      }),
    ).toThrow(
      '[visual.items[marker].animations.playback] playback.loop is only supported for type "update".',
    );
  });

  it("rejects looping resources with completion payloads", () => {
    expect(() =>
      constructVisualRenderState({
        playback: {
          loop: true,
        },
        resources: createResources({
          complete: {
            payload: {
              action: "unreachable",
            },
          },
        }),
      }),
    ).toThrow(
      "[visual.items[marker].animations.playback] animation.complete is not allowed when playback.loop is true because a loop never completes.",
    );
  });

  it("rejects loops without a positive finite authored duration", () => {
    expect(() =>
      constructVisualRenderState({
        playback: {
          loop: true,
        },
        resources: createResources({ duration: 0 }),
      }),
    ).toThrow(
      "[visual.items[marker].animations.playback] playback.loop requires an animation with a finite duration greater than 0.",
    );
  });

  it("emits an animation authored on the second duplicate character occurrence", () => {
    const characterItems = [
      {
        id: "twin",
        transformId: "left",
        sprites: [{ id: "body", resourceId: "body" }],
      },
      {
        id: "twin",
        transformId: "right",
        sprites: [{ id: "body", resourceId: "body" }],
        animations: {
          resourceId: "drift",
        },
      },
    ];
    const renderState = constructRenderState({
      presentationState: {
        character: {
          items: characterItems,
        },
      },
      currentLineActions: {
        character: {
          items: characterItems,
        },
      },
      resources: {
        images: {
          body: {
            fileId: "body.png",
            width: 100,
            height: 200,
          },
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
          drift: {
            type: "update",
            tween: {
              x: {
                initialValue: 1600,
                keyframes: [{ duration: 1000, value: 1400 }],
              },
            },
          },
        },
      },
      isLineCompleted: false,
    });

    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "character-container-twin-1-body-animation-update",
        targetId: "character-container-twin-1-body",
      }),
    ]);
  });
});
