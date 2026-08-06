import { describe, expect, it } from "vitest";
import { resolveAudioAnimation } from "../src/resolveAudioAnimation.js";

const oldChannel = {
  id: "channel:bgm",
  type: "audio-channel",
  volume: 80,
  muted: false,
  pan: -0.25,
  children: [
    {
      id: "bgm:main",
      type: "sound",
      src: "old.ogg",
      loop: true,
      volume: 70,
      startDelayMs: 0,
    },
  ],
};
const newChannel = {
  ...oldChannel,
  volume: 60,
  pan: 0.25,
  children: [{ ...oldChannel.children[0], src: "new.ogg" }],
};
const occurrence = {
  occurrenceId: "engine:g1:l2:bgm1",
  actionPath: "story.scene.line.actions.bgm",
  selection: { resourceId: "crossfade", playback: { speed: 2 } },
};

describe("resolveAudioAnimation", () => {
  it("compiles one transition resource into coordinated previous and next sides", () => {
    const animation = resolveAudioAnimation({
      occurrence,
      resources: {
        audioAnimations: {
          crossfade: {
            type: "transition",
            prev: {
              fade: { delay: 100, duration: 1000, easing: "easeInSine" },
            },
            next: { fade: { duration: 2000 } },
          },
        },
      },
      previousChannel: oldChannel,
      nextChannel: newChannel,
    });

    expect(animation).toEqual({
      id: "audio-animation:engine:g1:l2:bgm1",
      occurrenceId: "engine:g1:l2:bgm1",
      type: "transition",
      targetId: "channel:bgm",
      prev: {
        channel: oldChannel,
        fade: {
          keyframes: [
            {
              value: 0,
              delay: 50,
              duration: 500,
              easing: "easeInSine",
            },
          ],
        },
      },
      next: {
        channel: newChannel,
        fade: {
          initialValue: 0,
          keyframes: [
            { value: 100, delay: 0, duration: 1000, easing: "linear" },
          ],
        },
      },
    });
  });

  it("keeps a missing authored side immediate while retaining its graph snapshot", () => {
    const animation = resolveAudioAnimation({
      occurrence: { ...occurrence, selection: { resourceId: "fade-out" } },
      resources: {
        audioAnimations: {
          "fade-out": {
            type: "transition",
            prev: { fade: { duration: 300 } },
          },
        },
      },
      previousChannel: oldChannel,
      nextChannel: newChannel,
    });

    expect(animation.prev.fade).toBeDefined();
    expect(animation.next).toEqual({ channel: newChannel });
  });

  it("resolves update targets against authored channel values and scales time", () => {
    const retained = { ...oldChannel, volume: 30, pan: 0.5 };
    const animation = resolveAudioAnimation({
      occurrence: {
        ...occurrence,
        selection: { resourceId: "smooth", playback: { speed: 0.5 } },
      },
      resources: {
        audioAnimations: {
          smooth: {
            type: "update",
            tween: {
              volume: {
                keyframes: [
                  { value: 50, duration: 100 },
                  { value: "target", delay: 50, duration: 400 },
                ],
              },
              pan: {
                keyframes: [{ value: "target", duration: 200 }],
              },
            },
          },
        },
      },
      previousChannel: oldChannel,
      nextChannel: retained,
    });

    expect(animation.tween).toEqual({
      volume: {
        keyframes: [
          { value: 50, delay: 0, duration: 200, easing: "linear" },
          { value: 30, delay: 100, duration: 800, easing: "linear" },
        ],
      },
      pan: {
        keyframes: [{ value: 0.5, delay: 0, duration: 400, easing: "linear" }],
      },
    });
  });

  it("rejects structural type mismatches and a non-target update endpoint", () => {
    expect(() =>
      resolveAudioAnimation({
        occurrence,
        resources: {
          audioAnimations: {
            crossfade: {
              type: "transition",
              next: { fade: { duration: 100 } },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: { ...oldChannel, volume: 20 },
      }),
    ).toThrow('has type "transition"');

    expect(() =>
      resolveAudioAnimation({
        occurrence: { ...occurrence, selection: { resourceId: "bad" } },
        resources: {
          audioAnimations: {
            bad: {
              type: "update",
              tween: {
                volume: { keyframes: [{ value: 20, duration: 100 }] },
              },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: { ...oldChannel, volume: 20 },
      }),
    ).toThrow('final keyframe must use the absolute value "target"');
  });
});
