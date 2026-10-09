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
  keyframes,
  tween,
  mask,
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
            ...(mask === undefined ? {} : { mask }),
            tween: tween ?? {
              x: {
                initialValue: 100,
                keyframes: keyframes ?? [{ duration, value: 300 }],
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

const getRenderedVisualItemIds = (renderState) =>
  (renderState.elements ?? [])
    .find((element) => element.id === "story")
    ?.children.map((child) => child.id) ?? [];

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

  it.each([
    {
      name: "single zero-duration keyframe",
      keyframes: [{ duration: 0, value: 300 }],
    },
    {
      name: "multiple zero-duration keyframes",
      keyframes: [
        { duration: 0, value: 150 },
        { duration: 0, value: 300 },
      ],
    },
    {
      name: "zero totals across tween properties",
      tween: {
        x: {
          initialValue: 100,
          keyframes: [{ duration: 0, value: 200 }],
        },
        y: {
          initialValue: 100,
          keyframes: [{ duration: 0, value: 250 }],
        },
      },
    },
  ])(
    "skips a zero-duration looping update animation: $name",
    ({ keyframes, tween }) => {
      const renderState = constructVisualRenderState({
        playback: {
          continuity: "persistent",
          loop: true,
        },
        resources: createResources({ keyframes, tween }),
      });

      expect(renderState.animations).toEqual([]);
      expect(getRenderedVisualItemIds(renderState)).toEqual(["visual-marker"]);
    },
  );

  it.each([
    {
      name: "negative duration",
      keyframes: [{ duration: -500, value: 300 }],
      malformed: "tween.x.keyframes[0].duration is -500",
    },
    {
      name: "NaN duration",
      keyframes: [{ duration: Number.NaN, value: 300 }],
      malformed: "tween.x.keyframes[0].duration is NaN",
    },
    {
      name: "Infinity duration",
      keyframes: [{ duration: Number.POSITIVE_INFINITY, value: 300 }],
      malformed: "tween.x.keyframes[0].duration is Infinity",
    },
    {
      name: "-Infinity duration",
      keyframes: [{ duration: Number.NEGATIVE_INFINITY, value: 300 }],
      malformed: "tween.x.keyframes[0].duration is -Infinity",
    },
    {
      name: "missing duration",
      keyframes: [{ value: 300 }],
      malformed: "tween.x.keyframes[0].duration is undefined",
    },
    {
      name: "negative duration mixed with a positive one",
      keyframes: [
        { duration: -500, value: 150 },
        { duration: 1000, value: 300 },
      ],
      malformed: "tween.x.keyframes[0].duration is -500",
    },
    {
      name: "malformed duration on a later tween property",
      tween: {
        x: {
          initialValue: 100,
          keyframes: [{ duration: 1000, value: 300 }],
        },
        y: {
          initialValue: 100,
          keyframes: [{ duration: Number.NaN, value: 250 }],
        },
      },
      malformed: "tween.y.keyframes[0].duration is NaN",
    },
    {
      name: "malformed mask progress duration",
      mask: {
        kind: "single",
        texture: "marker-mask.png",
        progress: {
          keyframes: [{ duration: -1, value: 1 }],
        },
      },
      malformed: "mask.progress.keyframes[0].duration is -1",
    },
  ])(
    "rejects a looping update animation with a malformed keyframe duration: $name",
    ({ keyframes, tween, mask, malformed }) => {
      expect(() =>
        constructVisualRenderState({
          playback: {
            loop: true,
          },
          resources: createResources({ keyframes, tween, mask }),
        }),
      ).toThrow(
        `[visual.items[marker].animations.playback] playback.loop requires every keyframe duration to be a finite number of at least 0, but ${malformed}.`,
      );
    },
  );

  it.each([
    {
      name: "single positive duration",
      keyframes: [{ duration: 1000, value: 300 }],
    },
    {
      name: "zero-duration keyframe followed by a positive one",
      keyframes: [
        { duration: 0, value: 150 },
        { duration: 500, value: 300 },
      ],
    },
    {
      name: "positive property alongside a zero property",
      tween: {
        x: {
          initialValue: 100,
          keyframes: [{ duration: 0, value: 200 }],
        },
        y: {
          initialValue: 100,
          keyframes: [{ duration: 400, value: 250 }],
        },
      },
    },
  ])(
    "emits a looping update animation with a positive authored duration: $name",
    ({ keyframes, tween }) => {
      const renderState = constructVisualRenderState({
        playback: {
          loop: true,
        },
        resources: createResources({ keyframes, tween }),
      });

      expect(renderState.animations).toEqual([
        expect.objectContaining({
          id: "marker-animation-update",
          playback: {
            loop: true,
          },
        }),
      ]);
    },
  );

  it.each([
    { name: "negative", duration: -500 },
    { name: "NaN", duration: Number.NaN },
    { name: "Infinity", duration: Number.POSITIVE_INFINITY },
  ])(
    "keeps a non-looping update animation with a $name duration untouched",
    ({ duration }) => {
      const renderState = constructVisualRenderState({
        resources: createResources({ duration }),
      });

      expect(renderState.animations).toEqual([
        expect.objectContaining({
          id: "marker-animation-update",
          type: "update",
        }),
      ]);
      expect(renderState.animations[0]).not.toHaveProperty("playback");
    },
  );

  it("rejects a zero-duration looping transition resource", () => {
    expect(() =>
      constructVisualRenderState({
        playback: {
          loop: true,
        },
        resources: createResources({ type: "transition", duration: 0 }),
      }),
    ).toThrow(
      '[visual.items[marker].animations.playback] playback.loop is only supported for type "update".',
    );
  });

  it("rejects a zero-duration looping resource with a completion payload", () => {
    expect(() =>
      constructVisualRenderState({
        playback: {
          loop: true,
        },
        resources: createResources({
          duration: 0,
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
