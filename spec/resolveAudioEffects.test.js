import { describe, expect, it } from "vitest";
import {
  applyAudioEffectEndpoints,
  resolveAudioEffect,
  resolveAudioEffects,
  resolveSoundBoundaryEffect,
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
  prev: { volume: { keyframes: [{ value: 0, duration: 600 }] } },
  next: {
    volume: {
      initialValue: 0,
      keyframes: [{ value: 60, duration: 900 }],
    },
  },
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
              volume: {
                initialValue: 60,
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
              volume: {
                initialValue: 15,
                keyframes: [
                  { value: 15, duration: 500, easing: "easeInSine" },
                  { value: 60, duration: 1500, easing: "easeOutSine" },
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
            initialValue: 60,
            keyframes: [
              {
                value: 50,
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
            initialValue: 15,
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

  it("compiles volume, pan, and playback-rate transition properties", () => {
    const effect = resolveAudioEffect({
      occurrence,
      resources: {
        audioEffects: {
          crossfade: {
            type: "transition",
            prev: {
              volume: { keyframes: [{ value: 0, duration: 200 }] },
              pan: { keyframes: [{ value: -1, duration: 300 }] },
              playbackRate: { keyframes: [{ value: 0.5, duration: 400 }] },
            },
            next: {
              volume: {
                initialValue: 0,
                keyframes: [{ value: 60, duration: 500 }],
              },
              pan: {
                initialValue: -1,
                keyframes: [{ value: 0.25, duration: 600 }],
              },
              playbackRate: {
                initialValue: 0.5,
                keyframes: [{ value: 1, duration: 700 }],
              },
            },
          },
        },
      },
      previousChannel: oldChannel,
      nextChannel: newChannel,
    });

    expect(effect.properties).toEqual({
      volume: {
        exit: {
          keyframes: [{ value: 0, delay: 0, duration: 100, easing: "linear" }],
        },
        enter: {
          initialValue: 0,
          keyframes: [{ value: 60, delay: 0, duration: 250, easing: "linear" }],
        },
      },
      pan: {
        exit: {
          keyframes: [{ value: -1, delay: 0, duration: 150, easing: "linear" }],
        },
        enter: {
          initialValue: -1,
          keyframes: [
            { value: 0.25, delay: 0, duration: 300, easing: "linear" },
          ],
        },
      },
      playbackRate: {
        exit: {
          keyframes: [
            { value: 0.5, delay: 0, duration: 200, easing: "linear" },
          ],
        },
        enter: {
          initialValue: 0.5,
          keyframes: [{ value: 1, delay: 0, duration: 350, easing: "linear" }],
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
                initialValue: 80,
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
                initialValue: -0.5,
                keyframes: [{ value: 0.5, duration: 200 }],
              },
              playbackRate: {
                initialValue: 1.25,
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
          initialValue: 80,
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
          initialValue: -0.5,
          keyframes: [
            { value: 0.5, delay: 0, duration: 400, easing: "linear" },
          ],
        },
      },
      playbackRate: {
        update: {
          initialValue: 1.25,
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
              next: {
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
              next: {
                volume: { keyframes: [{ value: 60, duration: 100 }] },
              },
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

  it("compiles an editable outgoing transition volume endpoint", () => {
    expect(
      resolveWith({
        selection: { resourceId: "crossfade" },
        resources: {
          audioEffects: {
            crossfade: {
              type: "transition",
              prev: {
                volume: { keyframes: [{ value: 35, duration: 100 }] },
              },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: newChannel,
      }).properties.volume.exit.keyframes,
    ).toEqual([
      {
        value: 35,
        delay: 0,
        duration: 100,
        easing: "linear",
      },
    ]);
  });

  it("requires an incoming transition property to match persistent state", () => {
    expect(() =>
      resolveWith({
        selection: { resourceId: "crossfade" },
        resources: {
          audioEffects: {
            crossfade: {
              type: "transition",
              next: {
                volume: { keyframes: [{ value: 65, duration: 100 }] },
              },
            },
          },
        },
        previousChannel: oldChannel,
        nextChannel: newChannel,
      }),
    ).toThrow("must match the persistent BGM volume value");
  });

  it("compiles relative transition property keyframes", () => {
    const effect = resolveWith({
      selection: { resourceId: "crossfade" },
      resources: {
        audioEffects: {
          crossfade: {
            type: "transition",
            next: {
              volume: {
                keyframes: [
                  { value: -10, duration: 100, relative: true },
                  { value: 60, duration: 100 },
                ],
              },
            },
          },
        },
      },
      previousChannel: oldChannel,
      nextChannel: newChannel,
    });

    expect(effect.properties.volume.enter.keyframes[0]).toMatchObject({
      value: -10,
      relative: true,
    });
  });

  it("ignores sound boundary metadata when classifying a top-level transition", () => {
    const effect = resolveWith({
      selection: { resourceId: "crossfade" },
      resources: { audioEffects: { crossfade: transitionResource } },
      previousChannel: {
        ...oldChannel,
        children: [
          {
            ...oldChannel.children[0],
            endEffect: { volume: { keyframes: [{ value: 0 }] } },
          },
        ],
      },
      nextChannel: {
        ...oldChannel,
        children: [
          {
            ...oldChannel.children[0],
            beginEffect: { volume: { keyframes: [{ value: 100 }] } },
          },
        ],
      },
    });

    expect(effect).toBeNull();
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
              prev: {
                volume: { keyframes: [{ value: 0, duration: 100 }] },
              },
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

    expect(applyAudioEffectEndpoints({ bgm, resources })).toEqual({
      volume: 50,
      pan: -0.5,
      audioEffects: { resourceId: "smooth" },
      sounds: [
        {
          id: "main",
          resourceId: "old",
          volume: 40,
          pan: 0.25,
          playbackRate: 0.75,
        },
      ],
    });
    expect(bgm).toEqual(snapshot);
  });

  it("writes incoming transition endpoints into the persistent BGM mix", () => {
    const bgm = {
      volume: 25,
      pan: 0.75,
      audioEffects: { resourceId: "crossfade" },
      sounds: [{ id: "main", resourceId: "next", playbackRate: 2 }],
    };
    const resources = {
      audioEffects: {
        crossfade: {
          type: "transition",
          prev: { volume: { keyframes: [{ value: 0, duration: 100 }] } },
          next: {
            volume: { keyframes: [{ value: 50, duration: 100 }] },
            pan: { keyframes: [{ value: -0.5, duration: 100 }] },
            playbackRate: { keyframes: [{ value: 0.75, duration: 100 }] },
          },
        },
      },
    };

    expect(applyAudioEffectEndpoints({ bgm, resources })).toEqual({
      volume: 50,
      pan: -0.5,
      audioEffects: { resourceId: "crossfade" },
      sounds: [{ id: "main", resourceId: "next", playbackRate: 0.75 }],
    });
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

  it("keeps per-sound boundary presets out of top-level audioEffects", () => {
    expect(
      resolveAudioEffects({
        occurrence: { ...occurrence, selection: null },
        resources: { audioEffects: { smooth: updateResource } },
        previousChannel: null,
        nextChannel: newChannel,
      }),
    ).toEqual([]);
  });

  it("fans a transition preset out across every replaced BGM sound", () => {
    const previousChannel = {
      ...oldChannel,
      children: [
        oldChannel.children[0],
        {
          ...oldChannel.children[0],
          id: "bgm:ambience",
          src: "ambience-old.ogg",
          volume: 40,
        },
      ],
    };
    const nextChannel = {
      ...newChannel,
      children: [
        newChannel.children[0],
        {
          ...newChannel.children[0],
          id: "bgm:ambience",
          src: "ambience-new.ogg",
          volume: 25,
        },
      ],
    };

    const resources = {
      sounds: {
        main: { fileId: "new.ogg", volume: 60 },
        ambience: { fileId: "ambience-new.ogg", volume: 25 },
      },
      audioEffects: {
        crossfade: {
          ...transitionResource,
          next: {
            volume: {
              initialValue: 0,
              keyframes: [{ value: 100, duration: 900 }],
            },
          },
        },
      },
    };
    const effects = resolveAudioEffects({
      occurrence,
      resources,
      nextBgm: {
        volume: 100,
        sounds: [
          { id: "main", resourceId: "main" },
          { id: "ambience", resourceId: "ambience" },
        ],
      },
      previousChannel,
      nextChannel,
    });

    expect(effects).toHaveLength(2);
    expect(effects.map((effect) => effect.targetId)).toEqual([
      "bgm:main",
      "bgm:ambience",
    ]);
    expect(new Set(effects.map((effect) => effect.id)).size).toBe(2);
    expect(effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          properties: {
            volume: {
              exit: expect.any(Object),
              enter: expect.any(Object),
            },
          },
        }),
      ]),
    );
  });

  it("fans an update preset out across every retained BGM sound", () => {
    const previousChannel = {
      ...oldChannel,
      children: [
        oldChannel.children[0],
        {
          ...oldChannel.children[0],
          id: "bgm:ambience",
          src: "ambience.ogg",
          volume: 60,
        },
      ],
    };
    const nextChannel = {
      ...previousChannel,
      children: previousChannel.children.map((sound) => ({
        ...sound,
        volume: 30,
      })),
    };

    const effects = resolveAudioEffects({
      occurrence: {
        ...occurrence,
        selection: { resourceId: "smooth" },
      },
      resources: { audioEffects: { smooth: updateResource } },
      previousChannel,
      nextChannel,
    });

    expect(effects).toHaveLength(2);
    expect(effects.map((effect) => effect.targetId)).toEqual([
      "bgm:main",
      "bgm:ambience",
    ]);
    effects.forEach((effect) => {
      expect(effect.properties.volume.update.keyframes.at(-1).value).toBe(30);
    });
  });

  it("normalizes channel updates per sound without flattening the local mix", () => {
    const previousChannel = {
      ...oldChannel,
      children: [
        { ...oldChannel.children[0], volume: 60, pan: 0.1 },
        {
          ...oldChannel.children[0],
          id: "bgm:ambience",
          src: "ambience.ogg",
          volume: 32,
          pan: -0.2,
        },
      ],
    };
    const nextChannel = {
      ...oldChannel,
      children: [
        { ...oldChannel.children[0], volume: 22.5, pan: -0.4 },
        {
          ...oldChannel.children[0],
          id: "bgm:ambience",
          src: "ambience.ogg",
          volume: 12,
          pan: -0.7,
        },
      ],
    };
    const resources = {
      sounds: {
        main: { fileId: "old.ogg" },
        ambience: { fileId: "ambience.ogg" },
      },
      audioEffects: {
        mixed: {
          type: "update",
          tween: {
            volume: {
              initialValue: 80,
              keyframes: [
                { value: 50, duration: 50 },
                { value: 30, duration: 100 },
              ],
            },
            pan: {
              initialValue: -0.25,
              keyframes: [{ value: -0.5, duration: 100 }],
            },
          },
        },
      },
    };
    const effects = resolveAudioEffects({
      occurrence: {
        ...occurrence,
        selection: { resourceId: "mixed" },
      },
      resources,
      nextResources: resources,
      nextBgm: {
        volume: 30,
        pan: -0.5,
        sounds: [
          { id: "main", resourceId: "main", volume: 75, pan: 0.1 },
          {
            id: "ambience",
            resourceId: "ambience",
            volume: 40,
            pan: -0.2,
          },
        ],
      },
      previousChannel,
      nextChannel,
    });

    expect(effects).toHaveLength(2);
    expect(effects[0].properties.volume.update.keyframes).toEqual([
      expect.objectContaining({ value: 37.5 }),
      expect.objectContaining({ value: 22.5 }),
    ]);
    expect(effects[1].properties.volume.update.keyframes).toEqual([
      expect.objectContaining({ value: 20 }),
      expect.objectContaining({ value: 12 }),
    ]);
    expect(
      effects.map((effect) => effect.properties.volume.update.initialValue),
    ).toEqual([60, 32]);
    expect(
      effects.map((effect) => effect.properties.pan.update.initialValue),
    ).toEqual([-0.15, -0.45]);
    expect(
      effects.map(
        (effect) => effect.properties.pan.update.keyframes.at(-1).value,
      ),
    ).toEqual([-0.4, -0.7]);
  });

  it("resolves relative channel pan before composing a clamped local pan", () => {
    const previousChannel = {
      ...oldChannel,
      children: [{ ...oldChannel.children[0], pan: 1 }],
    };
    const nextChannel = {
      ...oldChannel,
      children: [{ ...oldChannel.children[0], pan: 0.9 }],
    };
    const resources = {
      sounds: { old: { fileId: "old.ogg" } },
      audioEffects: {
        panCurve: {
          type: "update",
          tween: {
            pan: {
              initialValue: 0.2,
              keyframes: [
                { value: -0.2, relative: true, duration: 100 },
                { value: 0.4, duration: 200 },
              ],
            },
          },
        },
      },
    };

    const [effect] = resolveAudioEffects({
      occurrence: {
        ...occurrence,
        selection: { resourceId: "panCurve" },
      },
      resources,
      nextResources: resources,
      previousBgm: {
        pan: 0.9,
        sounds: [{ id: "main", resourceId: "old", pan: 0.5 }],
      },
      nextBgm: {
        pan: 0.4,
        sounds: [{ id: "main", resourceId: "old", pan: 0.5 }],
      },
      previousChannel,
      nextChannel,
    });

    expect(effect.properties.pan.update).toEqual({
      initialValue: 0.7,
      keyframes: [
        {
          value: 0.5,
          delay: 0,
          duration: 100,
          easing: "linear",
        },
        {
          value: 0.9,
          delay: 0,
          duration: 200,
          easing: "linear",
        },
      ],
    });
  });

  it("writes update endpoints across a multi-sound BGM channel", () => {
    const bgm = {
      volume: 80,
      pan: 0.25,
      audioEffects: { resourceId: "smooth" },
      sounds: [
        { id: "main", resourceId: "old", volume: 75, pan: 0.1 },
        { id: "ambience", resourceId: "next", volume: 40, pan: -0.2 },
      ],
    };
    const resources = {
      audioEffects: {
        smooth: {
          type: "update",
          tween: {
            volume: { keyframes: [{ value: 30, duration: 100 }] },
            pan: { keyframes: [{ value: -0.5, duration: 100 }] },
            playbackRate: { keyframes: [{ value: 0.75, duration: 100 }] },
          },
        },
      },
    };

    expect(applyAudioEffectEndpoints({ bgm, resources })).toMatchObject({
      volume: 30,
      pan: -0.5,
      sounds: [
        { volume: 75, pan: 0.1, playbackRate: 0.75 },
        { volume: 40, pan: -0.2, playbackRate: 0.75 },
      ],
    });
  });
});

describe("resolveSoundBoundaryEffect", () => {
  it("compiles update properties and playback speed", () => {
    expect(
      resolveSoundBoundaryEffect({
        selection: { resourceId: "smooth", playback: { speed: 2 } },
        selectionPath: 'bgm.sounds["main"].beginEffect',
        resources: {
          audioEffects: {
            smooth: {
              type: "update",
              tween: {
                volume: {
                  initialValue: 25,
                  keyframes: [
                    { startValue: 0, value: 50, duration: 200 },
                    { value: 100, delay: 40, duration: 400 },
                  ],
                },
                pan: {
                  initialValue: -0.25,
                  keyframes: [{ value: 0.5, duration: 100 }],
                },
                playbackRate: {
                  initialValue: 1.5,
                  keyframes: [{ value: 1.25, duration: 300 }],
                },
              },
            },
          },
        },
      }),
    ).toEqual({
      volume: {
        initialValue: 25,
        keyframes: [
          {
            startValue: 0,
            value: 50,
            delay: 0,
            duration: 100,
            easing: "linear",
          },
          {
            value: 100,
            delay: 20,
            duration: 200,
            easing: "linear",
          },
        ],
      },
      pan: {
        initialValue: -0.25,
        keyframes: [{ value: 0.5, delay: 0, duration: 50, easing: "linear" }],
      },
      playbackRate: {
        initialValue: 1.5,
        keyframes: [{ value: 1.25, delay: 0, duration: 150, easing: "linear" }],
      },
    });
  });

  it("returns undefined without a selection", () => {
    expect(
      resolveSoundBoundaryEffect({
        selection: undefined,
        selectionPath: 'bgm.sounds["main"].endEffect',
        resources: {},
      }),
    ).toBeUndefined();
  });

  it("rejects missing, transition, invalid endpoint, and invalid speed inputs", () => {
    const selectionPath = 'bgm.sounds["main"].beginEffect';
    expect(() =>
      resolveSoundBoundaryEffect({
        selection: { resourceId: "missing" },
        selectionPath,
        resources: {},
      }),
    ).toThrow('Unknown audio effect resource "missing"');

    expect(() =>
      resolveSoundBoundaryEffect({
        selection: { resourceId: "crossfade" },
        selectionPath,
        resources: { audioEffects: { crossfade: transitionResource } },
      }),
    ).toThrow('require an audio effect resource with type "update"');

    expect(() =>
      resolveSoundBoundaryEffect({
        selection: { resourceId: "bad" },
        selectionPath,
        resources: {
          audioEffects: {
            bad: {
              type: "update",
              tween: {
                volume: {
                  keyframes: [{ value: 10, duration: 100, relative: true }],
                },
              },
            },
          },
        },
      }),
    ).toThrow("final keyframe must use an absolute finite numeric value");

    expect(() =>
      resolveSoundBoundaryEffect({
        selection: { resourceId: "smooth", playback: { speed: 0 } },
        selectionPath,
        resources: { audioEffects: { smooth: updateResource } },
      }),
    ).toThrow("must be a finite number greater than 0");
  });
});
