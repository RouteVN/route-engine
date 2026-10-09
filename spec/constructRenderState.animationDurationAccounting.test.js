import { describe, expect, it } from "vitest";
import {
  constructRenderState,
  getAnimationInstanceDurationMs,
} from "../src/stores/constructRenderState.js";

describe("animation instance duration accounting", () => {
  it("counts the auto track delay plus duration", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "update",
        tween: { alpha: { auto: { duration: 200, delay: 25 } } },
      }),
    ).toBe(225);
  });

  it("counts a zero-delay auto track as its duration alone", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "update",
        tween: { alpha: { auto: { duration: 10000 } } },
      }),
    ).toBe(10000);
  });

  it("counts an auto delay even when the tween itself takes zero time", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "update",
        tween: { alpha: { auto: { duration: 0, delay: 200 } } },
      }),
    ).toBe(200);
    expect(
      getAnimationInstanceDurationMs({
        type: "update",
        tween: { alpha: { auto: { duration: 0, delay: 0 } } },
      }),
    ).toBe(0);
  });

  it("counts every keyframe delay as part of the track lifetime", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "update",
        tween: {
          alpha: {
            keyframes: [
              { startValue: 0, value: 0.4, delay: 25, duration: 200 },
              { value: 0.7, delay: 50, duration: 300 },
              { value: 1, duration: 100 },
            ],
          },
        },
      }),
    ).toBe(675);
  });

  it("uses the longest property track when tween properties run in parallel", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "update",
        tween: {
          x: { keyframes: [{ value: 20, duration: 500 }] },
          y: {
            keyframes: [
              { value: 10, delay: 100, duration: 700 },
              { value: 0, duration: 300 },
            ],
          },
          alpha: { auto: { duration: 400, delay: 50 } },
        },
      }),
    ).toBe(1100);
  });

  it("counts mask object progress", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "transition",
        mask: {
          kind: "single",
          texture: "iris",
          progress: { keyframes: [{ value: 1, duration: 200 }] },
        },
      }),
    ).toBe(200);
  });

  it("uses the longest progress track when a mask array runs in parallel", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "transition",
        mask: [
          {
            kind: "single",
            texture: "iris",
            progress: {
              keyframes: [
                { value: 1, delay: 25, duration: 200 },
                { value: 1, duration: 100 },
              ],
            },
          },
          {
            kind: "single",
            texture: "wipe",
            progress: { keyframes: [{ value: 1, duration: 500 }] },
          },
        ],
      }),
    ).toBe(500);
  });

  it("uses the longest surface across prev, next, tween, and mask", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "transition",
        prev: {
          tween: {
            alpha: { keyframes: [{ value: 0, duration: 400 }] },
          },
        },
        next: {
          tween: {
            alpha: {
              keyframes: [{ value: 1, delay: 100, duration: 900 }],
            },
          },
        },
        mask: [
          {
            kind: "single",
            texture: "iris",
            progress: { keyframes: [{ value: 1, duration: 1200 }] },
          },
        ],
      }),
    ).toBe(1200);
  });

  it("divides the authored duration by the playback speed", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "update",
        playback: { speed: 2 },
        tween: {
          alpha: { auto: { duration: 1000, delay: 100 } },
        },
      }),
    ).toBe(550);
  });

  it("treats looping instances as non-expiring regardless of timing shape", () => {
    expect(
      getAnimationInstanceDurationMs({
        type: "update",
        playback: { loop: true },
        tween: { alpha: { auto: { duration: 1000 } } },
      }),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it("accepts a looping update animation authored with an auto track", () => {
    // Route Graphics repeats the resolved auto clip, so the authored duration
    // must stay positive for playback.loop to remain playable.
    const renderState = constructRenderState({
      presentationState: {
        visual: {
          items: [
            {
              id: "marker",
              resourceId: "marker",
              transformId: "markerStart",
              animations: {
                resourceId: "drift",
                playback: { loop: true },
              },
            },
          ],
        },
      },
      resources: {
        images: {
          marker: { fileId: "marker.png", width: 100, height: 100 },
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
          drift: {
            type: "update",
            tween: { x: { auto: { duration: 1000, delay: 100 } } },
          },
        },
      },
      isLineCompleted: false,
    });

    expect(renderState.animations).toEqual([
      expect.objectContaining({
        id: "marker-animation-update",
        playback: { loop: true },
      }),
    ]);
  });
});
