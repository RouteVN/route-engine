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

const transitionResource = {
  type: "transition",
  prev: { fade: { duration: 600 } },
  next: { fade: { duration: 900 } },
};

const updateResource = {
  type: "update",
  tween: {
    volume: { keyframes: [{ value: "target", duration: 100 }] },
    pan: { keyframes: [{ value: "target", duration: 100 }] },
    playbackRate: { keyframes: [{ value: "target", duration: 100 }] },
  },
};

const resolveWith = ({
  selection = { resourceId: "smooth" },
  resources = { audioEffects: { smooth: updateResource } },
  previousChannel = oldChannel,
  nextChannel = newChannel,
} = {}) =>
  resolveAudioEffect({
    occurrence: { ...occurrence, selection },
    resources,
    previousChannel,
    nextChannel,
  });

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

  it("compiles entry-only and exit-only transitions", () => {
    const resources = { audioEffects: { crossfade: transitionResource } };
    const selection = { resourceId: "crossfade" };

    expect(
      resolveWith({
        selection,
        resources,
        previousChannel: null,
        nextChannel: newChannel,
      }),
    ).toMatchObject({
      targetId: "bgm:main",
      properties: {
        volume: {
          enter: {
            initialValue: 0,
            keyframes: [expect.objectContaining({ value: 60, duration: 900 })],
          },
        },
      },
    });
    expect(
      resolveWith({
        selection,
        resources,
        previousChannel: oldChannel,
        nextChannel: null,
      }),
    ).toMatchObject({
      targetId: "bgm:main",
      properties: {
        volume: {
          exit: {
            keyframes: [expect.objectContaining({ value: 0, duration: 600 })],
          },
        },
      },
    });
  });

  it("uses canonical defaults when an updated target omits sound properties", () => {
    const previousChannel = {
      ...oldChannel,
      children: [
        {
          ...oldChannel.children[0],
          volume: 40,
          pan: 0.5,
          playbackRate: 0.75,
        },
      ],
    };
    const nextSound = { ...previousChannel.children[0] };
    delete nextSound.volume;
    delete nextSound.pan;
    delete nextSound.playbackRate;

    const effect = resolveWith({
      previousChannel,
      nextChannel: { ...previousChannel, children: [nextSound] },
    });

    expect(effect.properties).toEqual({
      volume: {
        update: {
          keyframes: [
            { value: 100, delay: 0, duration: 100, easing: "linear" },
          ],
        },
      },
      pan: {
        update: {
          keyframes: [{ value: 0, delay: 0, duration: 100, easing: "linear" }],
        },
      },
      playbackRate: {
        update: {
          keyframes: [{ value: 1, delay: 0, duration: 100, easing: "linear" }],
        },
      },
    });
  });

  it("returns null for absent selections, absent sounds, unchanged graphs, and inapplicable fades", () => {
    expect(
      resolveAudioEffect({
        occurrence: { ...occurrence, selection: null },
        resources: {},
        previousChannel: oldChannel,
        nextChannel: newChannel,
      }),
    ).toBeNull();
    expect(
      resolveWith({ previousChannel: null, nextChannel: null }),
    ).toBeNull();
    expect(
      resolveWith({ previousChannel: oldChannel, nextChannel: oldChannel }),
    ).toBeNull();
    expect(
      resolveWith({
        selection: { resourceId: "crossfade" },
        resources: {
          audioEffects: {
            crossfade: {
              type: "transition",
              prev: { fade: { duration: 100 } },
            },
          },
        },
        previousChannel: null,
        nextChannel: newChannel,
      }),
    ).toBeNull();
  });

  it.each([
    ["src", "other.ogg"],
    ["startAt", 1],
    ["endAt", 10],
    ["startDelayMs", 100],
  ])("treats a changed %s as a source-identity change", (field, value) => {
    const nextChannel = {
      ...oldChannel,
      children: [{ ...oldChannel.children[0], [field]: value, volume: 30 }],
    };

    expect(() => resolveWith({ nextChannel })).toThrow(
      "changes source identity",
    );
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects an invalid playback speed (%s)",
    (speed) => {
      expect(() =>
        resolveWith({
          selection: { resourceId: "smooth", playback: { speed } },
          nextChannel: {
            ...oldChannel,
            children: [{ ...oldChannel.children[0], volume: 30 }],
          },
        }),
      ).toThrow("must be a finite number greater than 0");
    },
  );

  it("rejects unknown resources, unstable ids, unsupported types, and unmatched updates", () => {
    expect(() => resolveWith({ selection: { resourceId: "missing" } })).toThrow(
      'Unknown audio effect resource "missing"',
    );

    expect(() =>
      resolveWith({
        nextChannel: {
          ...oldChannel,
          children: [
            { ...oldChannel.children[0], id: "bgm:secondary", volume: 30 },
          ],
        },
      }),
    ).toThrow("require a stable BGM sound id");

    expect(() =>
      resolveWith({
        selection: { resourceId: "unsupported" },
        resources: { audioEffects: { unsupported: { type: "sequence" } } },
      }),
    ).toThrow('Unsupported audio effect type "sequence"');

    expect(() =>
      resolveWith({
        resources: {
          audioEffects: {
            smooth: {
              type: "update",
              tween: {
                volume: {
                  keyframes: [{ value: "target", duration: 100 }],
                },
              },
            },
          },
        },
        nextChannel: {
          ...oldChannel,
          children: [{ ...oldChannel.children[0], pan: 0.5 }],
        },
      }),
    ).toThrow("does not animate a BGM sound property changed by this action");
  });

  it("does not mutate the occurrence, resources, or channel graphs", () => {
    const localOccurrence = {
      ...occurrence,
      selection: { resourceId: "smooth", playback: { speed: 2 } },
    };
    const resources = {
      audioEffects: { smooth: structuredClone(updateResource) },
    };
    const previousChannel = structuredClone(oldChannel);
    const nextChannel = {
      ...structuredClone(oldChannel),
      children: [{ ...oldChannel.children[0], volume: 30 }],
    };
    const snapshots = structuredClone({
      localOccurrence,
      resources,
      previousChannel,
      nextChannel,
    });

    resolveAudioEffect({
      occurrence: localOccurrence,
      resources,
      previousChannel,
      nextChannel,
    });

    expect({
      localOccurrence,
      resources,
      previousChannel,
      nextChannel,
    }).toEqual(snapshots);
  });
});
