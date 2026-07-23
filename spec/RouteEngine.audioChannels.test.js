import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = () => ({
  screen: { width: 1920, height: 1080 },
  resources: {
    sounds: {
      theme: { fileId: "theme.mp3" },
      ambience: { fileId: "ambience.mp3" },
      click: { fileId: "click.wav" },
      rain: { fileId: "rain.ogg" },
    },
    voices: {
      scene1: {
        alice: {
          fileId: "voices/alice.ogg",
          loop: true,
          volume: 60,
          muted: true,
          pan: 0.25,
          startDelayMs: 125,
          playbackRate: 0.9,
          startAt: 1,
          endAt: 4,
        },
        narrator: { fileId: "voices/narrator.ogg" },
      },
    },
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            lines: [
              {
                id: "line1",
                actions: {
                  bgm: {
                    volume: 80,
                    pan: -0.25,
                    sounds: [
                      {
                        id: "theme",
                        resourceId: "theme",
                        volume: 50,
                        muted: false,
                        pan: -0.4,
                        playbackRate: 1.25,
                        startAt: 2,
                        endAt: 12,
                      },
                      {
                        id: "ambience",
                        resourceId: "ambience",
                      },
                    ],
                  },
                  voice: {
                    volume: 50,
                    sounds: [
                      { id: "alice", resourceId: "alice", endAt: null },
                      {
                        id: "narrator",
                        resourceId: "narrator",
                        startDelayMs: 250,
                      },
                    ],
                  },
                  sfx: {
                    channels: [
                      {
                        id: "ui",
                        volume: 75,
                        sounds: [{ id: "click", resourceId: "click" }],
                      },
                      {
                        id: "environment",
                        pan: 0.5,
                        sounds: [
                          { id: "rain", resourceId: "rain", loop: true },
                        ],
                      },
                    ],
                  },
                },
              },
              { id: "line2", actions: {} },
            ],
          },
        },
      },
    },
  },
});

const createEngine = () => {
  let engine;
  const handlePendingEffects = (pendingEffects) => {
    pendingEffects.forEach((effect) => {
      if (effect.name === "handleLineActions") {
        engine.handleLineActions();
      }
    });
  };

  engine = createRouteEngine({ handlePendingEffects });
  return engine;
};

describe("RouteEngine audio channels", () => {
  it("renders multi-sound BGM and Voice channels plus arbitrary SFX channels", () => {
    const engine = createEngine();
    engine.init({
      initialState: {
        global: {
          runtime: {
            musicVolume: 50,
            soundVolume: 40,
          },
        },
        projectData: createProjectData(),
      },
    });

    expect(engine.selectRenderState().audio).toEqual([
      {
        id: "channel:bgm",
        type: "audio-channel",
        volume: 40,
        muted: false,
        pan: -0.25,
        children: [
          {
            id: "bgm:theme",
            type: "sound",
            src: "theme.mp3",
            loop: true,
            volume: 50,
            muted: false,
            pan: -0.4,
            startDelayMs: 0,
            playbackRate: 1.25,
            startAt: 2,
            endAt: 12,
          },
          {
            id: "bgm:ambience",
            type: "sound",
            src: "ambience.mp3",
            loop: true,
            volume: 100,
            startDelayMs: 0,
          },
        ],
      },
      {
        id: "channel:sfx:ui",
        type: "audio-channel",
        volume: 30,
        muted: false,
        pan: 0,
        children: [
          {
            id: "sfx:ui:click",
            type: "sound",
            src: "click.wav",
            loop: false,
            volume: 100,
            startDelayMs: 0,
          },
        ],
      },
      {
        id: "channel:sfx:environment",
        type: "audio-channel",
        volume: 40,
        muted: false,
        pan: 0.5,
        children: [
          {
            id: "sfx:environment:rain",
            type: "sound",
            src: "rain.ogg",
            loop: true,
            volume: 100,
            startDelayMs: 0,
          },
        ],
      },
      {
        id: "channel:voice",
        type: "audio-channel",
        volume: 20,
        muted: false,
        pan: 0,
        children: [
          {
            id: "voice:scene1:alice",
            type: "sound",
            src: "voices/alice.ogg",
            loop: true,
            volume: 60,
            muted: true,
            pan: 0.25,
            startDelayMs: 125,
            playbackRate: 0.9,
            startAt: 1,
            endAt: null,
          },
          {
            id: "voice:scene1:narrator",
            type: "sound",
            src: "voices/narrator.ogg",
            loop: false,
            volume: 100,
            startDelayMs: 250,
          },
        ],
      },
    ]);

    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});

    expect(engine.selectRenderState().audio).toEqual([
      expect.objectContaining({
        id: "channel:bgm",
        children: expect.arrayContaining([
          expect.objectContaining({ id: "bgm:theme" }),
          expect.objectContaining({ id: "bgm:ambience" }),
        ]),
      }),
    ]);
  });

  it("renders a looping BGM channel as one scheduled sequence", () => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    actions.bgm = {
      loop: true,
      interruption: "loopEnd",
      volume: 80,
      sounds: [
        { id: "theme", resourceId: "theme" },
        {
          id: "ambience",
          resourceId: "ambience",
          startDelayMs: 12_000,
        },
      ],
    };
    delete actions.voice;
    delete actions.sfx;

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    expect(engine.selectRenderState().audio).toEqual([
      {
        id: "channel:bgm",
        type: "audio-channel",
        volume: 40,
        muted: false,
        pan: 0,
        loop: true,
        interruption: "loopEnd",
        children: [
          {
            id: "bgm:theme",
            type: "sound",
            src: "theme.mp3",
            loop: false,
            volume: 100,
            startDelayMs: 0,
          },
          {
            id: "bgm:ambience",
            type: "sound",
            src: "ambience.mp3",
            loop: false,
            volume: 100,
            startDelayMs: 12_000,
          },
        ],
      },
    ]);
  });

  it("rejects a looping sound inside a looping BGM channel", () => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    actions.bgm = {
      loop: true,
      sounds: [{ id: "theme", resourceId: "theme", loop: true }],
    };
    delete actions.voice;
    delete actions.sfx;

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    expect(() => engine.selectRenderState()).toThrow(
      'BGM sound "theme" cannot loop inside a looping BGM channel.',
    );
  });

  it("loops a complete canonical Voice schedule", () => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    delete actions.bgm;
    delete actions.sfx;
    actions.voice = {
      loop: true,
      sounds: [
        { id: "alice", resourceId: "alice" },
        {
          id: "narrator",
          resourceId: "narrator",
          startDelayMs: 250,
        },
      ],
    };

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    const [voiceChannel] = engine.selectRenderState().audio;
    expect(voiceChannel).toMatchObject({
      id: "channel:voice",
      type: "audio-channel",
      loop: true,
    });
    expect(voiceChannel.children.map((sound) => sound.loop)).toEqual([
      false,
      false,
    ]);
  });

  it("rejects a looping sound inside a looping Voice channel", () => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    delete actions.bgm;
    delete actions.sfx;
    actions.voice = {
      loop: true,
      sounds: [{ id: "alice", resourceId: "alice", loop: true }],
    };

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    expect(() => engine.selectRenderState()).toThrow(
      'Voice sound "alice" cannot loop inside a looping Voice channel.',
    );
  });

  it("loops a complete canonical SFX channel schedule", () => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    delete actions.bgm;
    delete actions.voice;
    projectData.resources.sounds.rain.loop = true;
    actions.sfx = {
      channels: [
        {
          id: "environment",
          loop: true,
          sounds: [
            { id: "click", resourceId: "click" },
            { id: "rain", resourceId: "rain", startDelayMs: 250 },
          ],
        },
      ],
    };

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    expect(engine.selectRenderState().audio).toEqual([
      {
        id: "channel:sfx:environment",
        type: "audio-channel",
        volume: 50,
        muted: false,
        pan: 0,
        loop: true,
        children: [
          {
            id: "sfx:environment:click",
            type: "sound",
            src: "click.wav",
            loop: false,
            volume: 100,
            startDelayMs: 0,
          },
          {
            id: "sfx:environment:rain",
            type: "sound",
            src: "rain.ogg",
            loop: false,
            volume: 100,
            startDelayMs: 250,
          },
        ],
      },
    ]);
  });

  it("rejects a looping sound inside a looping SFX channel", () => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    delete actions.bgm;
    delete actions.voice;
    actions.sfx = {
      channels: [
        {
          id: "environment",
          loop: true,
          sounds: [{ id: "rain", resourceId: "rain", loop: true }],
        },
      ],
    };

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    expect(() => engine.selectRenderState()).toThrow(
      'SFX sound "rain" cannot loop inside looping SFX channel "environment".',
    );
  });

  it("preserves resource sound loops when channel looping is false", () => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    projectData.resources.sounds.theme.loop = true;
    projectData.resources.sounds.rain.loop = true;
    actions.bgm = {
      loop: false,
      sounds: [{ id: "theme", resourceId: "theme" }],
    };
    actions.voice = {
      loop: false,
      sounds: [{ id: "alice", resourceId: "alice" }],
    };
    actions.sfx = {
      channels: [
        {
          id: "environment",
          loop: false,
          sounds: [{ id: "rain", resourceId: "rain" }],
        },
      ],
    };

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    expect(engine.selectRenderState().audio).toEqual([
      expect.objectContaining({
        id: "channel:bgm",
        loop: false,
        children: [expect.objectContaining({ loop: true })],
      }),
      expect.objectContaining({
        id: "channel:sfx:environment",
        loop: false,
        children: [expect.objectContaining({ loop: true })],
      }),
      expect.objectContaining({
        id: "channel:voice",
        loop: false,
        children: [expect.objectContaining({ loop: true })],
      }),
    ]);
  });

  it("escapes authored ID components when composing SFX render IDs", () => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    delete actions.bgm;
    delete actions.voice;
    actions.sfx = {
      channels: [
        {
          id: "a:b",
          sounds: [{ id: "c", resourceId: "click" }],
        },
        {
          id: "a",
          sounds: [{ id: "b:c", resourceId: "rain" }],
        },
      ],
    };

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    const audio = engine.selectRenderState().audio;
    expect(audio.map(({ id }) => id)).toEqual([
      "channel:sfx:a%3Ab",
      "channel:sfx:a",
    ]);
    expect(
      audio.flatMap(({ children }) => children.map(({ id }) => id)),
    ).toEqual(["sfx:a%3Ab:c", "sfx:a:b%3Ac"]);
  });

  it.each([
    {
      name: "BGM sound IDs",
      configure(actions) {
        actions.bgm.sounds = [
          { id: "duplicate", resourceId: "theme" },
          { id: "duplicate", resourceId: "ambience" },
        ];
      },
      error: 'Duplicate BGM sound id "duplicate".',
    },
    {
      name: "Voice sound IDs",
      configure(actions) {
        delete actions.bgm;
        actions.voice.sounds = [
          { id: "duplicate", resourceId: "alice" },
          { id: "duplicate", resourceId: "narrator" },
        ];
      },
      error: 'Duplicate Voice sound id "duplicate".',
    },
    {
      name: "SFX channel IDs",
      configure(actions) {
        delete actions.bgm;
        delete actions.voice;
        actions.sfx.channels = [
          {
            id: "duplicate",
            sounds: [{ id: "click", resourceId: "click" }],
          },
          {
            id: "duplicate",
            sounds: [{ id: "rain", resourceId: "rain" }],
          },
        ];
      },
      error: 'Duplicate SFX channel id "duplicate".',
    },
    {
      name: "SFX sound IDs within a channel",
      configure(actions) {
        delete actions.bgm;
        delete actions.voice;
        actions.sfx.channels = [
          {
            id: "effects",
            sounds: [
              { id: "duplicate", resourceId: "click" },
              { id: "duplicate", resourceId: "rain" },
            ],
          },
        ];
      },
      error: 'Duplicate SFX sound id "duplicate" in SFX channel "effects".',
    },
  ])("rejects duplicate canonical $name", ({ configure, error }) => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    configure(actions);

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    expect(() => engine.selectRenderState()).toThrow(error);
  });

  it("rejects an invalid playback range after resolving resource defaults and action overrides", () => {
    const projectData = createProjectData();
    const actions =
      projectData.story.scenes.scene1.sections.section1.lines[0].actions;
    delete actions.voice;
    delete actions.sfx;
    projectData.resources.sounds.theme.startAt = 10;
    actions.bgm.sounds = [{ id: "theme", resourceId: "theme", endAt: 5 }];

    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    expect(() => engine.selectRenderState()).toThrow(
      'Sound "bgm:theme" endAt (5) must be greater than or equal to startAt (10).',
    );
  });
});
