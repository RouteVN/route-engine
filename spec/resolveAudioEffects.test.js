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

  it("rejects topology and invalid final endpoints", () => {
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

  it("plays no transition on a sound that keeps its source", () => {
    const resources = {
      audioEffects: {
        crossfade: {
          type: "transition",
          next: { volume: { keyframes: [{ value: 20, duration: 100 }] } },
        },
      },
    };
    const nextChannel = {
      ...oldChannel,
      children: [{ ...oldChannel.children[0], volume: 20, pan: 0.5 }],
    };

    expect(
      resolveAudioEffect({
        occurrence,
        resources,
        previousChannel: oldChannel,
        nextChannel,
      }),
    ).toBeNull();
    expect(
      resolveAudioEffects({
        occurrence,
        resources,
        previousChannel: oldChannel,
        nextChannel,
      }),
    ).toEqual([]);
  });

  it("plays no transition when every BGM sound keeps its source", () => {
    const ambience = {
      ...oldChannel.children[0],
      id: "bgm:ambience",
      src: "ambience.ogg",
      volume: 40,
    };
    const effects = resolveAudioEffects({
      occurrence,
      resources: { audioEffects: { crossfade: transitionResource } },
      previousChannel: {
        ...oldChannel,
        children: [oldChannel.children[0], ambience],
      },
      nextChannel: {
        ...oldChannel,
        children: [oldChannel.children[0], { ...ambience, volume: 10 }],
      },
    });

    expect(effects).toEqual([]);
  });

  it.each([
    [{ resourceId: "missing" }, 'Unknown audio effect resource "missing"'],
    [{ resourceId: "unsupported" }, 'Unsupported audio effect type "sequence"'],
    [
      { resourceId: "crossfade", playback: { speed: 0 } },
      "must be a finite number greater than 0",
    ],
  ])(
    "still rejects an invalid selection %j on a sound that keeps its source",
    (selection, error) => {
      expect(() =>
        resolveAudioEffects({
          occurrence: { ...occurrence, selection },
          resources: {
            audioEffects: {
              crossfade: transitionResource,
              unsupported: { type: "sequence" },
            },
          },
          previousChannel: oldChannel,
          nextChannel: {
            ...oldChannel,
            children: [{ ...oldChannel.children[0], volume: 60 }],
          },
        }),
      ).toThrow(error);
    },
  );

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
  ])(
    "plays an update as the incoming track when %s changes",
    (field, value) => {
      const nextChannel = {
        ...oldChannel,
        children: [{ ...oldChannel.children[0], [field]: value, volume: 30 }],
      };

      const effect = resolveWith({ nextChannel });

      expect(effect).toMatchObject({
        targetId: "bgm:main",
        properties: {
          volume: {
            enter: {
              keyframes: [
                expect.objectContaining({ value: 50, duration: 50 }),
                expect.objectContaining({ value: 30, duration: 100 }),
              ],
            },
          },
        },
      });
      expect(Object.keys(effect.properties.volume)).toEqual(["enter"]);
    },
  );

  it("plays an update as the incoming track when music starts", () => {
    const effect = resolveWith({
      selection: { resourceId: "fadeIn", playback: { speed: 2 } },
      resources: {
        audioEffects: {
          fadeIn: {
            type: "update",
            tween: {
              volume: {
                initialValue: 0,
                keyframes: [{ value: 30, duration: 800, easing: "easeIn" }],
              },
            },
          },
        },
      },
      previousChannel: null,
    });

    expect(effect).toEqual({
      id: "audio-effect:engine:g1:l2:audio1",
      type: "audio-transition",
      targetId: "bgm:main",
      properties: {
        volume: {
          enter: {
            initialValue: 0,
            keyframes: [
              { value: 30, delay: 0, duration: 400, easing: "easeIn" },
            ],
          },
        },
      },
    });
  });

  it("requires an update played on incoming music to end at its mix", () => {
    expect(() =>
      resolveWith({
        previousChannel: null,
        nextChannel: {
          ...oldChannel,
          children: [{ ...oldChannel.children[0], volume: 40 }],
        },
      }),
    ).toThrow("must match the persistent BGM volume value");
  });

  it("plays an update as the outgoing track when music stops", () => {
    const effect = resolveWith({ nextChannel: null });

    expect(effect.properties).toEqual({
      volume: {
        exit: {
          keyframes: [
            { value: 50, delay: 0, duration: 50, easing: "linear" },
            { value: 30, delay: 0, duration: 100, easing: "linear" },
          ],
        },
      },
    });
  });

  it("validates an update played on music that stops", () => {
    expect(() =>
      resolveWith({
        selection: { resourceId: "smooth", playback: { speed: 0 } },
        nextChannel: null,
      }),
    ).toThrow("must be a finite number greater than 0");
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

  it("records final update values as an effect mix without replacing the authored mix", () => {
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
      ...snapshot,
      audioEffectMix: { volume: 50, pan: -0.5, playbackRate: 0.75 },
    });
    expect(bgm).toEqual(snapshot);
  });

  it("records the incoming transition's final values as an effect mix", () => {
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
      volume: 25,
      pan: 0.75,
      audioEffects: { resourceId: "crossfade" },
      audioEffectMix: { volume: 50, pan: -0.5, playbackRate: 0.75 },
      sounds: [{ id: "main", resourceId: "next", playbackRate: 2 }],
    });
  });

  describe("applyAudioEffectEndpoints keeps the authored mix", () => {
    const fadeResources = (tween) => ({
      audioEffects: { fade: { type: "update", tween } },
    });
    const creatorBgm = {
      volume: 75,
      audioEffects: { resourceId: "fade" },
      sounds: [{ id: "main", resourceId: "old", volume: 100 }],
    };

    it("records nothing when every final value is its identity", () => {
      const resolved = applyAudioEffectEndpoints({
        bgm: creatorBgm,
        resources: fadeResources({
          volume: {
            keyframes: [{ startValue: 0, value: 100, duration: 1000 }],
          },
          pan: { keyframes: [{ startValue: -1, value: 0, duration: 1000 }] },
          playbackRate: {
            keyframes: [{ startValue: 0.5, value: 1, duration: 1000 }],
          },
        }),
      });

      expect(resolved).toEqual(creatorBgm);
      expect(resolved).not.toHaveProperty("audioEffectMix");
      expect(resolved).not.toBe(creatorBgm);
    });

    it("records only the final values that differ from their identity", () => {
      expect(
        applyAudioEffectEndpoints({
          bgm: creatorBgm,
          resources: fadeResources({
            volume: { keyframes: [{ value: 30, duration: 100 }] },
            pan: { keyframes: [{ value: 0, duration: 100 }] },
          }),
        }).audioEffectMix,
      ).toEqual({ volume: 30 });
    });

    it("re-derives the effect mix instead of trusting a stale one", () => {
      const stale = { ...creatorBgm, audioEffectMix: { volume: 5, pan: 1 } };

      expect(
        applyAudioEffectEndpoints({
          bgm: stale,
          resources: fadeResources({
            volume: { keyframes: [{ value: 100, duration: 100 }] },
          }),
        }),
      ).not.toHaveProperty("audioEffectMix");
      expect(
        applyAudioEffectEndpoints({
          bgm: { ...stale, audioEffects: undefined },
          resources: {},
        }),
      ).not.toHaveProperty("audioEffectMix");
    });

    it("records the effect mix for legacy single-sound BGM", () => {
      expect(
        applyAudioEffectEndpoints({
          bgm: {
            resourceId: "old",
            volume: 80,
            audioEffects: { resourceId: "fade" },
          },
          resources: fadeResources({
            volume: { keyframes: [{ value: 50, duration: 100 }] },
          }),
        }),
      ).toEqual({
        resourceId: "old",
        volume: 80,
        audioEffects: { resourceId: "fade" },
        audioEffectMix: { volume: 50 },
      });
    });

    it.each([
      ["an unknown resource", { resourceId: "missing" }, {}],
      [
        "a relative final keyframe",
        { resourceId: "fade" },
        fadeResources({
          volume: { keyframes: [{ value: -10, relative: true, duration: 1 }] },
        }),
      ],
      [
        "a resource of another type",
        { resourceId: "fade" },
        { audioEffects: { fade: { type: "sequence" } } },
      ],
    ])("records nothing for %s", (_, audioEffects, resources) => {
      expect(
        applyAudioEffectEndpoints({
          bgm: { ...creatorBgm, audioEffects },
          resources,
        }),
      ).not.toHaveProperty("audioEffectMix");
    });

    it("records nothing for BGM without sounds", () => {
      expect(
        applyAudioEffectEndpoints({
          bgm: { ...creatorBgm, sounds: [] },
          resources: fadeResources({
            volume: { keyframes: [{ value: 30, duration: 100 }] },
          }),
        }),
      ).not.toHaveProperty("audioEffectMix");
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

  it("plays an update as the incoming track of a replacement BGM sound", () => {
    const effects = resolveAudioEffects({
      occurrence: { ...occurrence, selection: { resourceId: "smooth" } },
      resources: { audioEffects: { smooth: updateResource } },
      previousChannel: oldChannel,
      nextChannel: {
        ...oldChannel,
        children: [
          {
            ...oldChannel.children[0],
            id: "bgm:other",
            src: "other.ogg",
            volume: 30,
          },
        ],
      },
    });

    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      targetId: "bgm:other",
      properties: {
        volume: {
          enter: {
            keyframes: [
              expect.objectContaining({ value: 50 }),
              expect.objectContaining({ value: 30 }),
            ],
          },
        },
      },
    });
    expect(effects[0].properties.volume).not.toHaveProperty("exit");
  });

  it("updates retained BGM sounds and enters new ones with one update preset", () => {
    const nextChannel = {
      ...oldChannel,
      children: [
        { ...oldChannel.children[0], volume: 30 },
        {
          ...oldChannel.children[0],
          id: "bgm:ambience",
          src: "ambience.ogg",
          volume: 30,
        },
      ],
    };

    const effects = resolveAudioEffects({
      occurrence: { ...occurrence, selection: { resourceId: "smooth" } },
      resources: { audioEffects: { smooth: updateResource } },
      previousChannel: oldChannel,
      nextChannel,
    });

    expect(effects.map((effect) => effect.targetId)).toEqual([
      "bgm:main",
      "bgm:ambience",
    ]);
    expect(Object.keys(effects[0].properties.volume)).toEqual(["update"]);
    expect(Object.keys(effects[1].properties.volume)).toEqual(["enter"]);
    expect(new Set(effects.map((effect) => effect.id)).size).toBe(2);
  });

  it("plays an update as the outgoing track of every stopped BGM sound", () => {
    const previousChannel = {
      ...oldChannel,
      children: [
        oldChannel.children[0],
        { ...oldChannel.children[0], id: "bgm:ambience", src: "a.ogg" },
      ],
    };

    const effects = resolveAudioEffects({
      occurrence: { ...occurrence, selection: { resourceId: "smooth" } },
      resources: { audioEffects: { smooth: updateResource } },
      previousChannel,
      nextChannel: { ...oldChannel, children: [] },
    });

    expect(effects.map((effect) => effect.targetId)).toEqual([
      "bgm:main",
      "bgm:ambience",
    ]);
    effects.forEach((effect) => {
      expect(Object.keys(effect.properties.volume)).toEqual(["exit"]);
    });
  });

  it("prefers current BGM sounds over removed ones for an update preset", () => {
    const previousChannel = {
      ...oldChannel,
      children: [
        oldChannel.children[0],
        { ...oldChannel.children[0], id: "bgm:removed", src: "removed.ogg" },
      ],
    };
    const nextChannel = {
      ...oldChannel,
      children: [
        { ...oldChannel.children[0], volume: 30 },
        {
          ...oldChannel.children[0],
          id: "bgm:added",
          src: "added.ogg",
          volume: 30,
        },
      ],
    };

    const effects = resolveAudioEffects({
      occurrence: { ...occurrence, selection: { resourceId: "smooth" } },
      resources: { audioEffects: { smooth: updateResource } },
      previousChannel,
      nextChannel,
    });

    expect(
      effects.map((effect) => [
        effect.id,
        effect.targetId,
        Object.keys(effect.properties.volume),
      ]),
    ).toEqual([
      ["audio-effect:engine:g1:l2:audio1", "bgm:main", ["update"]],
      ["audio-effect:engine:g1:l2:audio1:1", "bgm:added", ["enter"]],
    ]);
  });

  it("normalizes channel updates per sound without flattening the local mix", () => {
    // The channel is authored at volume 80 and pan 0.25. The effect ends at
    // 30% and -0.5, so the channel settles at volume 24 and pan -0.25, and
    // each sound keeps its local volume and pan on top of that.
    const previousChannel = {
      ...oldChannel,
      children: [
        { ...oldChannel.children[0], volume: 60, pan: 0.35 },
        {
          ...oldChannel.children[0],
          id: "bgm:ambience",
          src: "ambience.ogg",
          volume: 32,
          pan: 0.05,
        },
      ],
    };
    const nextChannel = {
      ...oldChannel,
      children: [
        { ...oldChannel.children[0], volume: 18, pan: -0.15 },
        {
          ...oldChannel.children[0],
          id: "bgm:ambience",
          src: "ambience.ogg",
          volume: 9.6,
          pan: -0.45,
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
    const authoredBgm = {
      volume: 80,
      pan: 0.25,
      sounds: [
        { id: "main", resourceId: "main", volume: 75, pan: 0.1 },
        {
          id: "ambience",
          resourceId: "ambience",
          volume: 40,
          pan: -0.2,
        },
      ],
    };
    const nextBgm = applyAudioEffectEndpoints({
      bgm: { ...authoredBgm, audioEffects: { resourceId: "mixed" } },
      resources,
    });
    expect(nextBgm.audioEffectMix).toEqual({ volume: 30, pan: -0.5 });

    const effects = resolveAudioEffects({
      occurrence: {
        ...occurrence,
        selection: { resourceId: "mixed" },
      },
      resources,
      nextResources: resources,
      previousBgm: authoredBgm,
      nextBgm,
      previousChannel,
      nextChannel,
    });

    expect(effects).toHaveLength(2);
    // Main: 80 * 50% = 40 and 80 * 30% = 24 on the channel, at 75% locally.
    expect(effects[0].properties.volume.update.keyframes).toEqual([
      expect.objectContaining({ value: 30 }),
      expect.objectContaining({ value: 18 }),
    ]);
    // Ambience: the same channel values at 40% locally.
    expect(effects[1].properties.volume.update.keyframes).toEqual([
      expect.objectContaining({ value: 16 }),
      expect.objectContaining({ value: 9.6 }),
    ]);
    // The 80% initial value is 64 on the channel.
    expect(
      effects.map((effect) => effect.properties.volume.update.initialValue),
    ).toEqual([48, 25.6]);
    // The -0.25 initial offset moves the channel pan from 0.25 to 0.
    expect(
      effects.map((effect) => effect.properties.pan.update.initialValue),
    ).toEqual([0.1, -0.2]);
    expect(
      effects.map(
        (effect) => effect.properties.pan.update.keyframes.at(-1).value,
      ),
    ).toEqual([-0.15, -0.45]);
  });

  it("offsets channel pan keyframes from the authored channel pan", () => {
    const resources = {
      sounds: { old: { fileId: "old.ogg" } },
      audioEffects: {
        swing: {
          type: "update",
          tween: {
            pan: {
              keyframes: [
                { startValue: 0.5, value: -0.5, duration: 100 },
                { value: 0, duration: 100 },
              ],
            },
          },
        },
      },
    };
    const nextBgm = applyAudioEffectEndpoints({
      bgm: {
        pan: -0.25,
        audioEffects: { resourceId: "swing" },
        sounds: [{ id: "main", resourceId: "old" }],
      },
      resources,
    });
    expect(nextBgm).not.toHaveProperty("audioEffectMix");

    const [effect] = resolveAudioEffects({
      occurrence: { ...occurrence, selection: { resourceId: "swing" } },
      resources,
      previousBgm: { pan: 0.5, sounds: [{ id: "main", resourceId: "old" }] },
      nextBgm,
      previousChannel: {
        ...oldChannel,
        children: [{ ...oldChannel.children[0], pan: 0.5 }],
      },
      nextChannel: {
        ...oldChannel,
        children: [{ ...oldChannel.children[0], pan: -0.25 }],
      },
    });

    expect(effect.properties.pan.update.keyframes).toEqual([
      {
        startValue: 0.25,
        value: -0.75,
        delay: 0,
        duration: 100,
        easing: "linear",
      },
      { value: -0.25, delay: 0, duration: 100, easing: "linear" },
    ]);
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

    // The effect ends at a 0.4 offset from the authored channel pan of 0.
    const nextBgm = applyAudioEffectEndpoints({
      bgm: {
        audioEffects: { resourceId: "panCurve" },
        sounds: [{ id: "main", resourceId: "old", pan: 0.5 }],
      },
      resources,
    });
    expect(nextBgm.audioEffectMix).toEqual({ pan: 0.4 });

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
      nextBgm,
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

  describe("relative pan in an update played as an incoming track", () => {
    const panResources = {
      sounds: { old: { fileId: "old.ogg" }, next: { fileId: "new.ogg" } },
      audioEffects: {
        panSweep: {
          type: "update",
          tween: {
            pan: {
              keyframes: [
                { value: 0.2, relative: true, duration: 100 },
                { value: 0.5, duration: 200 },
              ],
            },
          },
        },
      },
    };
    // The channel is authored at pan 0.25 and the sweep ends 0.5 to the
    // right of it, at 0.75.
    const nextBgm = applyAudioEffectEndpoints({
      bgm: {
        pan: 0.25,
        audioEffects: { resourceId: "panSweep" },
        sounds: [{ id: "main", resourceId: "next" }],
      },
      resources: panResources,
    });
    const resolvePan = ({ previousBgm, previousChannel }) =>
      resolveAudioEffects({
        occurrence: { ...occurrence, selection: { resourceId: "panSweep" } },
        resources: panResources,
        previousBgm,
        nextBgm,
        previousChannel,
        nextChannel: {
          ...oldChannel,
          children: [{ ...oldChannel.children[0], src: "new.ogg", pan: 0.75 }],
        },
      })[0].properties.pan.enter.keyframes.map((keyframe) => keyframe.value);

    it("continues from the channel pan before a source change", () => {
      expect(
        resolvePan({
          previousBgm: {
            pan: -0.4,
            sounds: [{ id: "main", resourceId: "old" }],
          },
          previousChannel: {
            ...oldChannel,
            children: [{ ...oldChannel.children[0], pan: -0.4 }],
          },
        }),
      ).toEqual([-0.2, 0.75]);
    });

    it("continues from the outgoing channel's effect mix", () => {
      expect(
        resolvePan({
          previousBgm: {
            pan: -0.4,
            audioEffectMix: { pan: 0.2 },
            sounds: [{ id: "main", resourceId: "old" }],
          },
          previousChannel: {
            ...oldChannel,
            children: [{ ...oldChannel.children[0], pan: -0.2 }],
          },
        }),
      ).toEqual([0, 0.75]);
    });

    it("starts from the new channel's authored pan when music starts", () => {
      expect(
        resolvePan({ previousBgm: undefined, previousChannel: null }),
      ).toEqual([0.45, 0.75]);
    });
  });

  it("plays a playback-rate update as the incoming track of new music", () => {
    const effect = resolveWith({
      selection: { resourceId: "speedUp" },
      resources: {
        audioEffects: {
          speedUp: {
            type: "update",
            tween: {
              playbackRate: {
                initialValue: 1,
                keyframes: [{ value: 1.5, duration: 300 }],
              },
            },
          },
        },
      },
      previousChannel: null,
      nextChannel: {
        ...oldChannel,
        children: [{ ...oldChannel.children[0], playbackRate: 1.5 }],
      },
    });

    expect(effect.properties).toEqual({
      playbackRate: {
        enter: {
          initialValue: 1,
          keyframes: [
            { value: 1.5, delay: 0, duration: 300, easing: "linear" },
          ],
        },
      },
    });
  });

  it("records one channel effect mix for a multi-sound BGM channel", () => {
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

    expect(applyAudioEffectEndpoints({ bgm, resources })).toEqual({
      ...bgm,
      audioEffectMix: { volume: 30, pan: -0.5, playbackRate: 0.75 },
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
