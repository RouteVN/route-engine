import { describe, expect, it } from "vitest";
import { resolveAudioEffect } from "../src/resolveAudioEffects.js";

const oldChannel = {
  id: "channel:bgm",
  type: "audio-channel",
  volume: 50,
  muted: false,
  pan: 0,
  children: [
    {
      id: "bgm:main",
      type: "sound",
      src: "old.ogg",
      loop: true,
      volume: 80,
      pan: -0.25,
      playbackRate: 1,
      startDelayMs: 0,
    },
  ],
};
const newChannel = {
  ...oldChannel,
  children: [
    { ...oldChannel.children[0], src: "new.ogg", volume: 60, pan: 0.25 },
  ],
};
const occurrence = {
  occurrenceId: "engine:g1:l2:audio1",
  actionPath: "story.scene.line.actions.bgm",
  selection: { resourceId: "crossfade", playback: { speed: 2 } },
};

describe("resolveAudioEffect", () => {
  it("compiles one transition resource into one canonical handoff effect", () => {
    const effect = resolveAudioEffect({
      occurrence,
      resources: {
        audioEffects: {
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

    expect(effect).toEqual({
      id: "audio-effect:engine:g1:l2:audio1",
      type: "audio-transition",
      targetId: "bgm:main",
      properties: {
        volume: {
          exit: {
            keyframes: [
              {
                value: 0,
                delay: 50,
                duration: 500,
                easing: "easeInSine",
              },
            ],
          },
          enter: {
            initialValue: 0,
            keyframes: [
              {
                value: 60,
                delay: 0,
                duration: 1000,
                easing: "linear",
              },
            ],
          },
        },
      },
    });
  });

  it("compiles retained properties, target endpoints, speed, and startValue", () => {
    const retained = {
      ...oldChannel,
      children: [
        {
          ...oldChannel.children[0],
          volume: 30,
          pan: 0.5,
          playbackRate: 0.75,
        },
      ],
    };
    const effect = resolveAudioEffect({
      occurrence: {
        ...occurrence,
        selection: { resourceId: "smooth", playback: { speed: 0.5 } },
      },
      resources: {
        audioEffects: {
          smooth: {
            type: "update",
            tween: {
              volume: {
                keyframes: [
                  { value: 50, duration: 100 },
                  {
                    startValue: 45,
                    value: "target",
                    delay: 50,
                    duration: 400,
                  },
                ],
              },
              pan: {
                keyframes: [{ value: "target", duration: 200 }],
              },
              playbackRate: {
                keyframes: [{ value: "target", duration: 300 }],
              },
            },
          },
        },
      },
      previousChannel: oldChannel,
      nextChannel: retained,
    });

    expect(effect.properties).toEqual({
      volume: {
        update: {
          keyframes: [
            { value: 50, delay: 0, duration: 200, easing: "linear" },
            {
              startValue: 45,
              value: 30,
              delay: 100,
              duration: 800,
              easing: "linear",
            },
          ],
        },
      },
      pan: {
        update: {
          keyframes: [
            { value: 0.5, delay: 0, duration: 400, easing: "linear" },
          ],
        },
      },
      playbackRate: {
        update: {
          keyframes: [
            { value: 0.75, delay: 0, duration: 600, easing: "linear" },
          ],
        },
      },
    });
  });

  it("rejects topology, resource type, and target endpoint mismatches", () => {
    expect(() =>
      resolveAudioEffect({
        occurrence,
        resources: {
          audioEffects: {
            crossfade: {
              type: "transition",
              next: { fade: { duration: 100 } },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: {
          ...oldChannel,
          children: [{ ...oldChannel.children[0], volume: 20 }],
        },
      }),
    ).toThrow('has type "transition"');

    expect(() =>
      resolveAudioEffect({
        occurrence: { ...occurrence, selection: { resourceId: "bad" } },
        resources: {
          audioEffects: {
            bad: {
              type: "update",
              tween: {
                volume: { keyframes: [{ value: 20, duration: 100 }] },
              },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: {
          ...oldChannel,
          children: [{ ...oldChannel.children[0], volume: 20 }],
        },
      }),
    ).toThrow('final keyframe must use the absolute value "target"');

    expect(() =>
      resolveAudioEffect({
        occurrence,
        resources: {
          audioEffects: {
            crossfade: {
              type: "transition",
              next: { fade: { duration: 100 } },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: {
          ...newChannel,
          children: [
            newChannel.children[0],
            { ...newChannel.children[0], id: "bgm:ambience" },
          ],
        },
      }),
    ).toThrow("require exactly one BGM sound");
  });
});
