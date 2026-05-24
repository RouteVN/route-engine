import { describe, expect, it } from "vitest";
import {
  constructRenderState,
  getAnimationInstanceDurationMs,
  getPersistentAnimationContinuationKey,
} from "../src/stores/constructRenderState.js";

const createResources = () => ({
  images: {
    bg1: {
      fileId: "bg.png",
      width: 1920,
      height: 1080,
    },
  },
  animations: {
    fadeIn: {
      type: "transition",
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

describe("constructRenderState animation playback speed", () => {
  it("passes action-level playback speed through animation instances", () => {
    const renderState = constructRenderState({
      presentationState: {
        background: {
          resourceId: "bg1",
          animations: {
            resourceId: "fadeIn",
            playback: {
              speed: 2,
            },
          },
        },
      },
      resources: createResources(),
    });

    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "bg-cg-animation-in",
        playback: {
          speed: 2,
        },
      }),
    ]);
  });

  it("uses playback speed when calculating effective animation duration", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "update",
        playback: {
          speed: 2,
        },
        tween: {
          x: {
            keyframes: [{ duration: 1000, value: 100 }],
          },
        },
      }),
    ).toBe(500);

    expect(
      getAnimationInstanceDurationMs({
        type: "transition",
        playback: {
          speed: 0.5,
        },
        next: {
          tween: {
            alpha: {
              keyframes: [{ duration: 1000, value: 1 }],
            },
          },
        },
      }),
    ).toBe(2000);
  });

  it("uses speed in persistent continuation keys but ignores continuity", () => {
    const baseAnimation = {
      id: "bg-cg-animation-transition",
      targetId: "bg-cg-background-sprite",
      type: "transition",
      playback: {
        continuity: "persistent",
        speed: 1,
      },
      next: {
        tween: {
          alpha: {
            keyframes: [{ duration: 1000, value: 1 }],
          },
        },
      },
    };

    expect(getPersistentAnimationContinuationKey(baseAnimation)).toBe(
      getPersistentAnimationContinuationKey({
        ...baseAnimation,
        playback: {
          continuity: "render",
          speed: 1,
        },
      }),
    );

    expect(
      getPersistentAnimationContinuationKey({
        ...baseAnimation,
        playback: {
          continuity: "persistent",
        },
      }),
    ).toBe(
      getPersistentAnimationContinuationKey({
        ...baseAnimation,
        playback: {
          continuity: "persistent",
          speed: 1,
        },
      }),
    );

    expect(getPersistentAnimationContinuationKey(baseAnimation)).not.toBe(
      getPersistentAnimationContinuationKey({
        ...baseAnimation,
        playback: {
          continuity: "persistent",
          speed: 2,
        },
      }),
    );
  });

  it("rejects invalid playback speeds before creating render-state animations", () => {
    expect(() =>
      constructRenderState({
        presentationState: {
          background: {
            resourceId: "bg1",
            animations: {
              resourceId: "fadeIn",
              playback: {
                speed: 0,
              },
            },
          },
        },
        resources: createResources(),
      }),
    ).toThrow(
      "[background.animations.playback] playback.speed must be a finite number greater than 0.",
    );
  });

  it("rejects non-object playback before creating render-state animations", () => {
    expect(() =>
      constructRenderState({
        presentationState: {
          background: {
            resourceId: "bg1",
            animations: {
              resourceId: "fadeIn",
              playback: null,
            },
          },
        },
        resources: createResources(),
      }),
    ).toThrow("[background.animations.playback] playback must be an object.");
  });
});
