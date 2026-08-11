import { describe, expect, it } from "vitest";
import {
  applyAudioEffectUpdateEndpoints,
  resolveAudioEffect,
} from "../src/resolveAudioEffects.js";

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
    volume: {
      keyframes: [
        { value: 50, duration: 50 },
        { value: 30, duration: 100 },
      ],
    },
  },
};

const resolveWith = ({
  selection = { resourceId: "smooth" },
  resources = { audioEffects: { smooth: updateResource } },
  previousChannel = oldChannel,
  nextChannel = {
    ...oldChannel,
    children: [{ ...oldChannel.children[0], volume: 30 }],
  },
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
              fade: {
                keyframes: [
                  {
                    value: 50,
                    delay: 100,
                    duration: 400,
                    easing: "easeInSine",
                  },
                  { value: 0, duration: 600, easing: "easeOutSine" },
                ],
              },
            },
            next: {
              fade: {
                keyframes: [
                  { value: 25, duration: 500, easing: "easeInSine" },
                  { value: 100, duration: 1500, easing: "easeOutSine" },
                ],
              },
            },
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
                value: 40,
                delay: 50,
                duration: 200,
                easing: "easeInSine",
              },
              {
                value: 0,
                delay: 0,
                duration: 300,
                easing: "easeOutSine",
              },
            ],
          },
          enter: {
            initialValue: 0,
            keyframes: [
              {
                value: 15,
                delay: 0,
                duration: 250,
                easing: "easeInSine",
              },
              {
                value: 60,
                delay: 0,
                duration: 750,
                easing: "easeOutSine",
              },
            ],
          },
        },
      },
    });
  });

  it("compiles retained properties, numeric endpoints, speed, and startValue", () => {
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
                    value: 30,
                    delay: 50,
                    duration: 400,
                  },
                ],
              },
              pan: {
                keyframes: [{ value: 0.5, duration: 200 }],
              },
              playbackRate: {
                keyframes: [{ value: 0.75, duration: 300 }],
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

  it("rejects topology, resource type, and invalid final endpoints", () => {
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
                volume: {
                  keyframes: [{ value: 20, duration: 100, relative: true }],
                },
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
    ).toThrow("final keyframe must use an absolute finite numeric value");

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

  it("compiles an editable outgoing final transition fade value", () => {
    expect(
      resolveWith({
        selection: { resourceId: "crossfade" },
        resources: {
          audioEffects: {
            crossfade: {
              type: "transition",
              prev: {
                fade: { keyframes: [{ value: 35, duration: 100 }] },
              },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: newChannel,
      }).properties.volume.exit.keyframes,
    ).toEqual([
      {
        value: 28,
        delay: 0,
        duration: 100,
        easing: "linear",
      },
    ]);
  });

  it("requires an incoming transition fade to end at full declared volume", () => {
    expect(() =>
      resolveWith({
        selection: { resourceId: "crossfade" },
        resources: {
          audioEffects: {
            crossfade: {
              type: "transition",
              next: {
                fade: { keyframes: [{ value: 65, duration: 100 }] },
              },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: newChannel,
      }),
    ).toThrow("final incoming transition fade value must be 100");
  });

  it("rejects relative transition fade keyframes", () => {
    expect(() =>
      resolveWith({
        selection: { resourceId: "crossfade" },
        resources: {
          audioEffects: {
            crossfade: {
              type: "transition",
              next: {
                fade: {
                  keyframes: [
                    { value: 50, duration: 100, relative: true },
                    { value: 100, duration: 100 },
                  ],
                },
              },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: newChannel,
      }),
    ).toThrow("Transition fade keyframes must use absolute values");
  });

  it("returns null when every update property is unchanged", () => {
    const resource = {
      type: "update",
      tween: {
        volume: {
          keyframes: [
            { value: 20, duration: 100 },
            { value: 80, duration: 100 },
          ],
        },
      },
    };

    const effect = resolveWith({
      resources: { audioEffects: { smooth: resource } },
      previousChannel: oldChannel,
      nextChannel: oldChannel,
    });

    expect(effect).toBeNull();
  });

  it("omits unchanged properties while compiling changed update tracks", () => {
    const effect = resolveWith({
      resources: {
        audioEffects: {
          smooth: {
            type: "update",
            tween: {
              volume: { keyframes: [{ value: 30, duration: 100 }] },
              pan: { keyframes: [{ value: -0.25, duration: 100 }] },
            },
          },
        },
      },
      nextChannel: {
        ...oldChannel,
        children: [{ ...oldChannel.children[0], volume: 30 }],
      },
    });

    expect(effect.properties).toEqual({
      volume: {
        update: {
          keyframes: [{ value: 30, delay: 0, duration: 100, easing: "linear" }],
        },
      },
    });
  });

  it("returns null for absent selections, absent sounds, and inapplicable fades", () => {
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

  it("rejects unknown resources, unstable ids, unsupported types, and endpoint mismatches", () => {
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
                  keyframes: [{ value: 30, duration: 100 }],
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
    ).toThrow("must match the persistent BGM volume value");
  });

  it.each([
    ["volume", 0.007, (0.007 * 100) / 100],
    ["pan", -0, 0],
  ])(
    "accepts a render-normalized %s endpoint",
    (property, authoredValue, renderedValue) => {
      const effect = resolveWith({
        resources: {
          audioEffects: {
            smooth: {
              type: "update",
              tween: {
                [property]: {
                  keyframes: [{ value: authoredValue, duration: 100 }],
                },
              },
            },
          },
        },
        nextChannel: {
          ...oldChannel,
          children: [{ ...oldChannel.children[0], [property]: renderedValue }],
        },
      });

      expect(effect.properties[property].update.keyframes.at(-1).value).toBe(
        renderedValue,
      );
    },
  );

  it("writes final update values into the persistent BGM mix without mutating authoring", () => {
    const bgm = {
      volume: 25,
      pan: 0.75,
      audioEffects: { resourceId: "smooth" },
      sounds: [
        {
          id: "main",
          resourceId: "old",
          volume: 40,
          pan: 0.25,
          playbackRate: 2,
        },
      ],
    };
    const resources = {
      audioEffects: {
        smooth: {
          type: "update",
          tween: {
            volume: { keyframes: [{ value: 50, duration: 100 }] },
            pan: { keyframes: [{ value: -0.5, duration: 100 }] },
            playbackRate: { keyframes: [{ value: 0.75, duration: 100 }] },
          },
        },
      },
    };
    const snapshot = structuredClone(bgm);

    expect(applyAudioEffectUpdateEndpoints({ bgm, resources })).toEqual({
      volume: 50,
      pan: -0.5,
      audioEffects: { resourceId: "smooth" },
      sounds: [
        {
          id: "main",
          resourceId: "old",
          volume: 100,
          pan: 0,
          playbackRate: 0.75,
        },
      ],
    });
    expect(bgm).toEqual(snapshot);
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
