import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

// Audio effects play relative to the authored mix. Volume keyframes are a
// percentage of the authored volume, pan keyframes an offset from the authored
// pan, and playback-rate keyframes a multiple of the authored rate. An effect
// that ends at 100, 0, and 1 settles exactly on the authored mix; any other
// final value persists as a modulation of it.
//
// These cases run through the real line, render, and effect paths and check
// the rendered sound nodes and the keyframes sent to Route Graphics with
// authored values other than the defaults. Every expected value is computed
// here from the authored numbers, not from engine helpers.

const audioEffects = {
  fadeIn: {
    type: "update",
    tween: {
      volume: { keyframes: [{ startValue: 0, value: 100, duration: 1000 }] },
    },
  },
  fadeOut: {
    type: "update",
    tween: {
      volume: { keyframes: [{ startValue: 100, value: 0, duration: 1000 }] },
    },
  },
  crossfade: {
    type: "transition",
    prev: { volume: { keyframes: [{ value: 0, duration: 500 }] } },
    next: {
      volume: { initialValue: 0, keyframes: [{ value: 100, duration: 500 }] },
    },
  },
  duck: {
    type: "update",
    tween: { volume: { keyframes: [{ value: 30, duration: 500 }] } },
  },
  dip: {
    type: "update",
    tween: {
      volume: {
        keyframes: [
          { value: -20, relative: true, duration: 200 },
          { value: 100, duration: 300 },
        ],
      },
    },
  },
  panSweep: {
    type: "update",
    tween: {
      pan: { keyframes: [{ startValue: -1, value: 0, duration: 500 }] },
    },
  },
  slowStart: {
    type: "update",
    tween: {
      playbackRate: {
        keyframes: [{ startValue: 0.5, value: 1, duration: 500 }],
      },
    },
  },
  wideSlow: {
    type: "update",
    tween: {
      pan: { keyframes: [{ value: 0.5, duration: 500 }] },
      playbackRate: { keyframes: [{ value: 0.5, duration: 500 }] },
    },
  },
};

const createProjectData = (lines, extraEffects = {}) => ({
  screen: { width: 640, height: 360 },
  resources: {
    sounds: {
      theme: { fileId: "theme.ogg" },
      other: { fileId: "other.ogg" },
      click: { fileId: "click.ogg" },
      tuned: {
        fileId: "tuned.ogg",
        volume: 40,
        pan: -0.25,
        playbackRate: 1.25,
      },
    },
    voices: {
      scene: { greeting: { fileId: "greeting.ogg", volume: 60 } },
    },
    audioEffects: { ...structuredClone(audioEffects), ...extraEffects },
  },
  story: {
    initialSceneId: "scene",
    scenes: {
      scene: {
        initialSectionId: "section",
        sections: {
          section: {
            lines: lines.map((actions, index) => ({
              id: `line-${index}`,
              actions,
            })),
          },
        },
      },
    },
  },
});

const createEngine = (lines, { global, extraEffects } = {}) => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects(effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    },
  });
  engine.init({
    initialState: {
      projectData: createProjectData(lines, extraEffects),
      global,
    },
  });
  engine.commitRenderState(engine.selectRenderState());
  return engine;
};

const nextLine = (engine) => {
  engine.handleAction("markLineCompleted", {});
  engine.handleAction("nextLine", {});
  const renderState = engine.selectRenderState();
  engine.commitRenderState(renderState);
  return renderState;
};

const findChannel = (renderState, id) =>
  renderState.audio.find((channel) => channel.id === id);
const bgmSounds = (renderState) =>
  findChannel(renderState, "channel:bgm").children;
const bgmSound = (renderState) => bgmSounds(renderState)[0];
const effectFor = (renderState, targetId) =>
  renderState.audioEffects?.find((effect) => effect.targetId === targetId);

// Line actions with one BGM sound, `main`, playing the `theme` resource.
const bgm = (volume, sound = {}, extra = {}) => ({
  bgm: {
    volume,
    sounds: [{ id: "main", resourceId: "theme", ...sound }],
    ...extra,
  },
});

const CHANNEL_VOLUMES = [0, 1, 37.5, 75, 100];
const SOUND_VOLUMES = [0, 40, 100];
const VOLUME_PAIRS = CHANNEL_VOLUMES.flatMap((channel) =>
  SOUND_VOLUMES.map((sound) => [channel, sound]),
);

describe("BGM channel effects that end at the identities keep the authored mix", () => {
  it.each(VOLUME_PAIRS)(
    "fades the first BGM in to channel %s and sound %s",
    (channelVolume, soundVolume) => {
      const engine = createEngine([
        bgm(
          channelVolume,
          { volume: soundVolume },
          { audioEffects: { resourceId: "fadeIn" } },
        ),
      ]);
      const renderState = engine.selectRenderState();
      const expected = (channelVolume * soundVolume) / 100;

      expect(bgmSound(renderState).volume).toBeCloseTo(expected, 10);
      const track = effectFor(renderState, "bgm:main").properties.volume.enter;
      expect(track.keyframes).toHaveLength(1);
      expect(track.keyframes[0].startValue).toBe(0);
      expect(track.keyframes[0].value).toBe(bgmSound(renderState).volume);
      expect(engine.selectPresentationState().bgm).not.toHaveProperty(
        "audioEffectMix",
      );
    },
  );

  it.each(CHANNEL_VOLUMES)(
    "crossfades to a new source at channel volume %s",
    (channelVolume) => {
      const engine = createEngine([
        bgm(50),
        {
          bgm: {
            volume: channelVolume,
            audioEffects: { resourceId: "crossfade" },
            sounds: [{ id: "main", resourceId: "other" }],
          },
        },
      ]);
      const renderState = nextLine(engine);
      const { volume } = effectFor(renderState, "bgm:main").properties;

      expect(bgmSound(renderState)).toMatchObject({
        src: "other.ogg",
        volume: channelVolume,
      });
      expect(volume.exit.keyframes.at(-1).value).toBe(0);
      expect(volume.enter.initialValue).toBe(0);
      expect(volume.enter.keyframes.at(-1).value).toBe(channelVolume);
    },
  );

  it("keeps the authored volume when a transition meets music that keeps playing", () => {
    const engine = createEngine([
      bgm(50),
      bgm(75, {}, { audioEffects: { resourceId: "crossfade" } }),
    ]);
    const renderState = nextLine(engine);

    expect(renderState.audioEffects).toBeUndefined();
    expect(bgmSound(renderState).volume).toBe(75);
  });

  it("updates retained music to its new authored volume", () => {
    const engine = createEngine([
      bgm(50),
      bgm(75, {}, { audioEffects: { resourceId: "fadeIn" } }),
    ]);
    const renderState = nextLine(engine);

    expect(bgmSound(renderState).volume).toBe(75);
    expect(
      effectFor(renderState, "bgm:main").properties.volume.update.keyframes,
    ).toEqual([expect.objectContaining({ startValue: 0, value: 75 })]);
  });

  it("plays no update when retained music keeps its authored volume", () => {
    const engine = createEngine([
      bgm(75),
      bgm(75, {}, { audioEffects: { resourceId: "fadeIn" } }),
    ]);
    const renderState = nextLine(engine);

    expect(renderState.audioEffects).toBeUndefined();
    expect(bgmSound(renderState).volume).toBe(75);
  });

  it("fades stopping music out from the volume it is playing at", () => {
    const engine = createEngine([
      bgm(75, { volume: 80 }),
      { bgm: { sounds: [], audioEffects: { resourceId: "fadeOut" } } },
    ]);
    const renderState = nextLine(engine);

    expect(renderState.audio).toEqual([]);
    expect(
      effectFor(renderState, "bgm:main").properties.volume.exit.keyframes,
    ).toEqual([expect.objectContaining({ startValue: 60, value: 0 })]);
  });

  it("scales relative volume keyframes by the authored mix", () => {
    const engine = createEngine([
      bgm(50),
      bgm(50, { volume: 80 }, { audioEffects: { resourceId: "dip" } }),
    ]);
    const renderState = nextLine(engine);
    const { keyframes } = effectFor(renderState, "bgm:main").properties.volume
      .update;

    // -20 points of a channel at 50 and a sound at 80 is -8 rendered points.
    expect(keyframes[0]).toMatchObject({ value: -8, relative: true });
    expect(keyframes[1].value).toBe(40);
    expect(bgmSound(renderState).volume).toBe(40);
  });
});

describe("BGM effect final values other than the identities persist on top of the authored mix", () => {
  it("ducks to 30% of the authored volume and keeps it until the next BGM action", () => {
    const engine = createEngine([
      bgm(80),
      bgm(80, {}, { audioEffects: { resourceId: "duck" } }),
      {},
      bgm(80),
    ]);

    const ducked = nextLine(engine);
    expect(bgmSound(ducked).volume).toBe(24);
    expect(
      effectFor(ducked, "bgm:main").properties.volume.update.keyframes.at(-1)
        .value,
    ).toBe(24);
    expect(engine.selectPresentationState().bgm).toMatchObject({
      volume: 80,
      audioEffectMix: { volume: 30 },
    });

    // A line without a BGM action starts no new effect; the duck's own
    // occurrence continues so Route Graphics can finish it.
    const kept = nextLine(engine);
    expect(kept.audioEffects).toEqual(ducked.audioEffects);
    expect(bgmSound(kept).volume).toBe(24);

    const restored = nextLine(engine);
    expect(restored.audioEffects).toBeUndefined();
    expect(bgmSound(restored).volume).toBe(80);
    expect(engine.selectPresentationState().bgm).not.toHaveProperty(
      "audioEffectMix",
    );
  });

  it("applies the final channel mix to every sound", () => {
    const sounds = [
      { id: "main", resourceId: "theme" },
      { id: "ambience", resourceId: "other", volume: 40 },
    ];
    const engine = createEngine([
      { bgm: { volume: 50, sounds } },
      { bgm: { volume: 50, sounds, audioEffects: { resourceId: "duck" } } },
    ]);
    const renderState = nextLine(engine);

    expect(bgmSounds(renderState).map(({ volume }) => volume)).toEqual([15, 6]);
    expect(
      ["bgm:main", "bgm:ambience"].map(
        (id) =>
          effectFor(renderState, id).properties.volume.update.keyframes.at(-1)
            .value,
      ),
    ).toEqual([15, 6]);
  });

  it("fades stopping music out from the volume a previous effect left it at", () => {
    const engine = createEngine([
      bgm(80),
      bgm(80, {}, { audioEffects: { resourceId: "duck" } }),
      { bgm: { sounds: [], audioEffects: { resourceId: "fadeOut" } } },
    ]);
    nextLine(engine);
    const renderState = nextLine(engine);

    expect(
      effectFor(renderState, "bgm:main").properties.volume.exit.keyframes,
    ).toEqual([expect.objectContaining({ startValue: 24, value: 0 })]);
  });

  it("persists a pan offset and a playback-rate multiple", () => {
    const engine = createEngine([
      {
        bgm: {
          pan: 0.25,
          audioEffects: { resourceId: "wideSlow" },
          sounds: [{ id: "main", resourceId: "tuned" }],
        },
      },
    ]);
    const sound = bgmSound(engine.selectRenderState());

    // Channel pan 0.25, effect offset 0.5, resource pan -0.25.
    expect(sound.pan).toBe(0.5);
    // Resource rate 1.25 at half speed.
    expect(sound.playbackRate).toBe(0.625);
    expect(engine.selectPresentationState().bgm.audioEffectMix).toEqual({
      pan: 0.5,
      playbackRate: 0.5,
    });
  });
});

describe("BGM pan and playback-rate effects keep the authored mix", () => {
  it("sweeps pan in from the left to the authored channel and sound pan", () => {
    const engine = createEngine([
      {
        bgm: {
          pan: -0.25,
          audioEffects: { resourceId: "panSweep" },
          sounds: [{ id: "main", resourceId: "theme", pan: 0.5 }],
        },
      },
    ]);
    const renderState = engine.selectRenderState();

    expect(bgmSound(renderState).pan).toBe(0.25);
    expect(
      effectFor(renderState, "bgm:main").properties.pan.enter.keyframes,
    ).toEqual([expect.objectContaining({ startValue: -0.75, value: 0.25 })]);
  });

  it("clamps a pan offset after composing it with the authored pan", () => {
    const engine = createEngine([
      {
        bgm: {
          pan: 0.75,
          audioEffects: { resourceId: "panSweep" },
          sounds: [{ id: "main", resourceId: "theme", pan: 0.5 }],
        },
      },
    ]);
    const renderState = engine.selectRenderState();

    // The authored pans add up past the right edge; the sweep starts at
    // 0.75 + 0.5 - 1 = 0.25 and ends clamped at 1.
    expect(bgmSound(renderState).pan).toBe(1);
    expect(
      effectFor(renderState, "bgm:main").properties.pan.enter.keyframes,
    ).toEqual([expect.objectContaining({ startValue: 0.25, value: 1 })]);
  });

  it("speeds playback up to the authored playback rate", () => {
    const engine = createEngine([
      {
        bgm: {
          audioEffects: { resourceId: "slowStart" },
          sounds: [{ id: "main", resourceId: "tuned" }],
        },
      },
    ]);
    const renderState = engine.selectRenderState();

    expect(bgmSound(renderState).playbackRate).toBe(1.25);
    expect(
      effectFor(renderState, "bgm:main").properties.playbackRate.enter
        .keyframes,
    ).toEqual([expect.objectContaining({ startValue: 0.625, value: 1.25 })]);
  });
});

describe("sound boundary effects play relative to each sound's declared mix", () => {
  const boundary = {
    beginEffect: { resourceId: "fadeIn" },
    endEffect: { resourceId: "fadeOut" },
  };

  it.each(VOLUME_PAIRS)(
    "fades a BGM sound in and out at channel %s and sound %s",
    (channelVolume, soundVolume) => {
      const engine = createEngine([
        bgm(channelVolume, { volume: soundVolume, ...boundary }),
      ]);
      const sound = bgmSound(engine.selectRenderState());

      expect(sound.volume).toBeCloseTo((channelVolume * soundVolume) / 100, 10);
      expect(sound.beginEffect.volume.keyframes).toEqual([
        expect.objectContaining({ startValue: 0, value: sound.volume }),
      ]);
      expect(sound.endEffect.volume.keyframes).toEqual([
        expect.objectContaining({ startValue: sound.volume, value: 0 }),
      ]);
    },
  );

  it("fades a BGM sound in to the volume a channel effect leaves it at", () => {
    const engine = createEngine([
      bgm(80, boundary, { audioEffects: { resourceId: "duck" } }),
    ]);
    const sound = bgmSound(engine.selectRenderState());

    expect(sound.volume).toBe(24);
    expect(sound.beginEffect.volume.keyframes.at(-1).value).toBe(24);
    expect(sound.endEffect.volume.keyframes[0].startValue).toBe(24);
  });

  it.each(SOUND_VOLUMES)(
    "fades an SFX sound at volume %s in and out without the channel volume",
    (soundVolume) => {
      const engine = createEngine([
        {
          sfx: {
            channels: [
              {
                id: "ui",
                volume: 50,
                sounds: [
                  {
                    id: "click",
                    resourceId: "click",
                    volume: soundVolume,
                    ...boundary,
                  },
                ],
              },
            ],
          },
        },
      ]);
      const channel = findChannel(engine.selectRenderState(), "channel:sfx:ui");
      const [sound] = channel.children;

      // The SFX channel volume is applied by the channel node, not the sound.
      expect(channel.volume).toBe(25);
      expect(sound.volume).toBe(soundVolume);
      expect(sound.beginEffect.volume.keyframes).toEqual([
        expect.objectContaining({ startValue: 0, value: soundVolume }),
      ]);
      expect(sound.endEffect.volume.keyframes).toEqual([
        expect.objectContaining({ startValue: soundVolume, value: 0 }),
      ]);
    },
  );

  it("fades a voice sound in to its resource volume", () => {
    const engine = createEngine([
      {
        voice: {
          sounds: [
            {
              id: "greeting",
              resourceId: "greeting",
              beginEffect: { resourceId: "fadeIn" },
            },
          ],
        },
      },
    ]);
    const [sound] = findChannel(
      engine.selectRenderState(),
      "channel:voice",
    ).children;

    expect(sound.volume).toBe(60);
    expect(sound.beginEffect.volume.keyframes).toEqual([
      expect.objectContaining({ startValue: 0, value: 60 }),
    ]);
  });

  it("offsets boundary pan and scales boundary playback rate from the declared sound", () => {
    const engine = createEngine([
      {
        sfx: {
          channels: [
            {
              id: "ui",
              sounds: [
                {
                  id: "click",
                  resourceId: "tuned",
                  beginEffect: { resourceId: "panSweep" },
                  endEffect: { resourceId: "slowStart" },
                },
              ],
            },
          ],
        },
      },
    ]);
    const [sound] = findChannel(
      engine.selectRenderState(),
      "channel:sfx:ui",
    ).children;

    expect(sound).toMatchObject({ pan: -0.25, playbackRate: 1.25 });
    expect(sound.beginEffect.pan.keyframes).toEqual([
      expect.objectContaining({ startValue: -1, value: -0.25 }),
    ]);
    expect(sound.endEffect.playbackRate.keyframes).toEqual([
      expect.objectContaining({ startValue: 0.625, value: 1.25 }),
    ]);
  });

  it("scales relative boundary keyframes by the declared volume", () => {
    const engine = createEngine([
      bgm(50, { beginEffect: { resourceId: "dip" } }),
    ]);
    const sound = bgmSound(engine.selectRenderState());

    expect(sound.beginEffect.volume.keyframes[0]).toMatchObject({
      value: -10,
      relative: true,
    });
    expect(sound.beginEffect.volume.keyframes[1].value).toBe(50);
  });
});

describe("runtime volume preferences stay on the channel node", () => {
  it("leaves sound volumes and effect keyframes unchanged", () => {
    const engine = createEngine([
      {
        ...bgm(75, { beginEffect: { resourceId: "fadeIn" } }),
        sfx: {
          channels: [
            {
              id: "ui",
              volume: 50,
              sounds: [
                {
                  id: "click",
                  resourceId: "click",
                  volume: 40,
                  beginEffect: { resourceId: "fadeIn" },
                },
              ],
            },
          ],
        },
      },
    ]);
    const before = engine.selectRenderState();

    engine.handleAction("setMusicVolume", { value: 20 });
    engine.handleAction("setSoundVolume", { value: 30 });
    const after = engine.selectRenderState();

    expect(findChannel(after, "channel:bgm").volume).toBe(20);
    expect(findChannel(after, "channel:sfx:ui").volume).toBe(15);
    expect(findChannel(after, "channel:bgm").children).toEqual(
      findChannel(before, "channel:bgm").children,
    );
    expect(findChannel(after, "channel:sfx:ui").children).toEqual(
      findChannel(before, "channel:sfx:ui").children,
    );
  });
});

describe("a persisted effect mix survives save, load, rollback, and skipping", () => {
  const lines = [
    bgm(80),
    bgm(80, {}, { audioEffects: { resourceId: "duck" } }),
    { bgm: { volume: 50, sounds: [{ id: "main", resourceId: "other" }] } },
  ];

  it("restores the ducked volume when a save on that line is loaded", () => {
    const engine = createEngine(lines);
    nextLine(engine);
    engine.handleAction("saveSlot", { slotId: "ducked", savedAt: 1 });
    expect(bgmSound(nextLine(engine)).volume).toBe(50);

    engine.handleAction("loadSlot", { slotId: "ducked" });
    const loaded = engine.selectRenderState();

    expect(bgmSound(loaded)).toMatchObject({ src: "theme.ogg", volume: 24 });
  });

  it("restores the ducked volume on rollback", () => {
    const engine = createEngine(lines);
    nextLine(engine);
    nextLine(engine);

    engine.handleAction("rollbackToLine", {
      sectionId: "section",
      lineId: "line-1",
    });

    expect(bgmSound(engine.selectRenderState())).toMatchObject({
      src: "theme.ogg",
      volume: 24,
    });
  });

  it("settles on the ducked volume when transitions are skipped", () => {
    const engine = createEngine(lines, {
      global: { runtime: { skipTransitionsAndAnimations: true } },
    });
    const renderState = nextLine(engine);

    expect(renderState.audioEffects).toBeUndefined();
    expect(bgmSound(renderState).volume).toBe(24);
  });
});

describe("legacy single-sound BGM", () => {
  // The legacy form has no channel layer; its volume is the sound volume.
  it("fades in to the authored volume", () => {
    const engine = createEngine([
      {
        bgm: {
          resourceId: "theme",
          volume: 60,
          audioEffects: { resourceId: "fadeIn" },
        },
      },
    ]);
    const renderState = engine.selectRenderState();

    expect(bgmSound(renderState).volume).toBe(60);
    expect(
      effectFor(renderState, "bgm:theme").properties.volume.enter.keyframes,
    ).toEqual([expect.objectContaining({ startValue: 0, value: 60 })]);
  });

  it("ducks to a share of the authored volume", () => {
    const engine = createEngine([
      { bgm: { resourceId: "theme", volume: 60 } },
      {
        bgm: {
          resourceId: "theme",
          volume: 60,
          audioEffects: { resourceId: "duck" },
        },
      },
    ]);
    const renderState = nextLine(engine);

    expect(bgmSound(renderState).volume).toBe(18);
    expect(
      effectFor(renderState, "bgm:theme").properties.volume.update.keyframes,
    ).toEqual([expect.objectContaining({ value: 18 })]);
  });
});

describe("creator-authored BGM", () => {
  // The shape the RouteVN creator writes: a channel volume of 75, a sound
  // volume of 100, a channel effect, and per-sound begin and end effects
  // whose fades end at 100.
  const creatorBgm = (resourceId, audioEffect) => ({
    loop: true,
    volume: 75,
    audioEffects: { resourceId: audioEffect, playback: { speed: 1 } },
    sounds: [
      {
        id: resourceId,
        resourceId,
        loop: false,
        volume: 100,
        startDelayMs: 0,
        beginEffect: { resourceId: "fadeIn", playback: { speed: 1 } },
        endEffect: { resourceId: "fadeOut", playback: { speed: 1 } },
      },
    ],
  });

  it("keeps the channel volume of 75 through every effect", () => {
    const engine = createEngine([
      { bgm: creatorBgm("theme", "fadeIn") },
      { bgm: creatorBgm("other", "crossfade") },
    ]);

    const first = engine.selectRenderState();
    const firstSound = bgmSound(first);
    expect(firstSound.volume).toBe(75);
    expect(
      effectFor(first, firstSound.id).properties.volume.enter.keyframes.at(-1)
        .value,
    ).toBe(75);
    expect(firstSound.beginEffect.volume.keyframes.at(-1).value).toBe(75);
    expect(firstSound.endEffect.volume.keyframes[0].startValue).toBe(75);

    const second = nextLine(engine);
    const secondSound = bgmSound(second);
    expect(secondSound).toMatchObject({ src: "other.ogg", volume: 75 });
    expect(
      effectFor(second, secondSound.id).properties.volume.enter.keyframes.at(-1)
        .value,
    ).toBe(75);
    expect(secondSound.beginEffect.volume.keyframes.at(-1).value).toBe(75);
  });
});

// A deterministic sweep over authored mixes and effect endpoints. Route
// Graphics rejects an incoming or update track whose final keyframe differs
// from the sound's declared value, so the compiled endpoint must equal the
// rendered volume exactly, for any combination.
const createRandom = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};
const random = createRandom(0x5eed);
const randomVolume = () =>
  [0, 100][Math.floor(random() * 8)] ?? Math.round(random() * 1000) / 10;
const MIX_CASES = Array.from({ length: 60 }, () => [
  randomVolume(),
  randomVolume(),
  randomVolume(),
  random() < 0.5 ? "retained" : "replaced",
]);

describe("render and effect compilation agree for any authored mix", () => {
  it.each(MIX_CASES)(
    "channel %s, sound %s, effect end %s, %s music",
    (channelVolume, soundVolume, endVolume, lifecycle) => {
      const engine = createEngine(
        [
          bgm(50, { volume: soundVolume }),
          {
            bgm: {
              volume: channelVolume,
              audioEffects: { resourceId: "sweep" },
              sounds: [
                {
                  id: "main",
                  resourceId: lifecycle === "retained" ? "theme" : "other",
                  volume: soundVolume,
                  beginEffect: { resourceId: "sweep" },
                },
              ],
            },
          },
        ],
        {
          extraEffects: {
            sweep: {
              type: "update",
              tween: {
                volume: {
                  keyframes: [
                    { value: 50, duration: 100 },
                    { value: endVolume, duration: 100 },
                  ],
                },
              },
            },
          },
        },
      );

      const renderState = nextLine(engine);
      const sound = bgmSound(renderState);

      expect(sound.volume).toBeCloseTo(
        (channelVolume * endVolume * soundVolume) / 10000,
        10,
      );
      const effect = effectFor(renderState, "bgm:main");
      const track =
        effect?.properties.volume.update ?? effect?.properties.volume.enter;
      if (lifecycle === "replaced") expect(track).toBeDefined();
      if (track) {
        expect(track.keyframes.at(-1).value).toBe(sound.volume);
        expect(track.keyframes[0].value).toBeCloseTo(
          (channelVolume * 50 * soundVolume) / 10000,
          10,
        );
      }
      expect(sound.beginEffect.volume.keyframes.at(-1).value).toBeCloseTo(
        (sound.volume * endVolume) / 100,
        10,
      );
    },
  );
});
