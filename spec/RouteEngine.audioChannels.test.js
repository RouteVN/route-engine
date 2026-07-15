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
        alice: { fileId: "voices/alice.ogg" },
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
                      { id: "alice", resourceId: "alice" },
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
            startDelayMs: 0,
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
            loop: false,
            volume: 100,
            startDelayMs: 0,
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
});
