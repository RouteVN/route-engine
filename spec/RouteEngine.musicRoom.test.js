import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const ABSENT_MUSIC_ROOM = Symbol("absent-music-room");

const createMusicRoom = ({ pageSize = 2, tracks } = {}) => ({
  pageSize,
  tracks: tracks ?? [
    {
      id: "opening",
      soundId: "openingSound",
      title: "Opening",
      artist: "Composer",
      album: "OST",
      description: "Opening theme",
      coverImageId: "openingCover",
    },
    {
      id: "locked",
      soundId: "lockedSound",
      title: "Locked",
    },
    {
      id: "ending",
      soundId: "endingSound",
      title: "Ending",
    },
  ],
});

const createProjectData = ({
  musicRoom = createMusicRoom(),
  lineActions = {},
} = {}) => {
  const resources = {
    images: {
      openingCover: {
        fileId: "opening.png",
        width: 512,
        height: 512,
      },
    },
    sounds: {
      openingSound: {
        fileId: "opening.ogg",
        volume: 70,
        muted: true,
        pan: -0.25,
        playbackRate: 1.25,
        startAt: 2,
        endAt: 182,
        loop: true,
        startDelayMs: 900,
      },
      lockedSound: { fileId: "locked.ogg" },
      endingSound: { fileId: "ending.ogg" },
      bgm: { fileId: "bgm.ogg" },
    },
  };
  if (musicRoom !== ABSENT_MUSIC_ROOM) {
    resources.musicRoom = musicRoom;
  }

  return {
    screen: { width: 1920, height: 1080 },
    resources,
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
                  actions: lineActions,
                },
              ],
            },
          },
        },
      },
    },
  };
};

const createEngine = ({
  projectData = createProjectData(),
  viewedSoundIds = [],
  runtime,
} = {}) => {
  let engine;
  const effects = [];
  const handlePendingEffects = (pendingEffects) => {
    effects.push(...structuredClone(pendingEffects));
    if (pendingEffects.some((effect) => effect.name === "handleLineActions")) {
      engine.handleLineActions();
    }
  };
  engine = createRouteEngine({ handlePendingEffects });
  engine.init({
    initialState: {
      projectData,
      global: {
        accountViewedRegistry: {
          sections: [],
          resources: viewedSoundIds.map((resourceId) => ({ resourceId })),
        },
        ...(runtime ? { runtime } : {}),
      },
    },
  });
  effects.length = 0;
  return { effects, engine };
};

const getAudioNode = (engine, id) =>
  engine.selectRenderState().audio.find((node) => node.id === id);

describe("RouteEngine music room projection and navigation", () => {
  it("returns null when absent and keeps valid actions as effect-free no-ops", () => {
    const { effects, engine } = createEngine({
      projectData: createProjectData({ musicRoom: ABSENT_MUSIC_ROOM }),
    });

    expect(engine.selectMusicRoom()).toBeNull();
    engine.handleActions({
      playMusicRoomTrack: { trackId: "opening" },
      playMusicRoom: {},
      pauseMusicRoom: {},
      stopMusicRoom: {},
      seekMusicRoom: { positionMs: 0 },
      playPreviousMusicRoomTrack: {},
      playNextMusicRoomTrack: {},
      clearMusicRoomSelection: {},
      moveToMusicRoomPage: { pageIndex: 0 },
      moveToNextMusicRoomPage: {},
      moveToPreviousMusicRoomPage: {},
    });

    expect(engine.selectMusicRoom()).toBeNull();
    expect(effects).toEqual([]);
  });

  it("projects locks, nullable metadata, and zero-based pagination", () => {
    const { engine } = createEngine({
      viewedSoundIds: ["openingSound", "endingSound"],
    });

    expect(engine.selectMusicRoom()).toEqual({
      pageTracks: [
        {
          trackId: "opening",
          soundId: "openingSound",
          title: "Opening",
          artist: "Composer",
          album: "OST",
          description: "Opening theme",
          coverImageId: "openingCover",
          locked: false,
        },
        {
          trackId: "locked",
          soundId: "lockedSound",
          title: "Locked",
          artist: null,
          album: null,
          description: null,
          coverImageId: null,
          locked: true,
        },
      ],
      selection: null,
      playback: null,
      pagination: {
        pageIndex: 0,
        pageCount: 2,
        canMoveToPreviousPage: false,
        canMoveToNextPage: true,
      },
    });

    engine.handleAction("moveToNextMusicRoomPage", {});
    expect(
      engine.selectMusicRoom().pageTracks.map((track) => track.trackId),
    ).toEqual(["ending"]);
    expect(engine.selectMusicRoom().pagination).toEqual({
      pageIndex: 1,
      pageCount: 2,
      canMoveToPreviousPage: true,
      canMoveToNextPage: false,
    });
  });

  it("skips locked tracks across pages, never wraps, and keeps playback while browsing", () => {
    const { effects, engine } = createEngine({
      viewedSoundIds: ["openingSound", "endingSound"],
    });

    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    effects.length = 0;
    engine.handleAction("playNextMusicRoomTrack", {});
    expect(engine.selectMusicRoom().selection.trackId).toBe("ending");
    expect(engine.selectMusicRoom().pagination.pageIndex).toBe(1);
    expect(effects).toEqual([{ name: "render" }]);

    effects.length = 0;
    engine.handleAction("playNextMusicRoomTrack", {});
    expect(engine.selectMusicRoom().selection.trackId).toBe("ending");
    expect(effects).toEqual([]);

    engine.handleAction("moveToPreviousMusicRoomPage", {});
    expect(engine.selectMusicRoom().selection.trackId).toBe("ending");
    expect(engine.selectMusicRoom().playback.status).toBe("playing");
    expect(engine.selectMusicRoom().pagination.pageIndex).toBe(0);

    engine.handleAction("playPreviousMusicRoomTrack", {});
    expect(engine.selectMusicRoom().selection.trackId).toBe("opening");
  });
});

describe("RouteEngine music room playback", () => {
  it("renders strict player commands, owns BGM focus, and applies runtime mixing", () => {
    const { effects, engine } = createEngine({
      viewedSoundIds: ["openingSound"],
      runtime: { musicVolume: 50, muteAll: false },
      projectData: createProjectData({
        lineActions: {
          bgm: { resourceId: "bgm" },
        },
      }),
    });

    expect(getAudioNode(engine, "channel:bgm").playback).toEqual({
      commandId: 0,
      operation: "resume",
    });

    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    expect(effects).toEqual([{ name: "render" }]);
    expect(engine.selectMusicRoom().selection).toEqual({
      trackId: "opening",
      soundId: "openingSound",
      title: "Opening",
      artist: "Composer",
      album: "OST",
      description: "Opening theme",
      coverImageId: "openingCover",
      canPlayPreviousTrack: false,
      canPlayNextTrack: false,
    });
    expect(engine.selectMusicRoom().playback).toEqual({
      status: "playing",
      readiness: "loading",
      positionMs: 0,
      durationMs: null,
      positionText: "0:00",
      durationText: null,
      canPlay: false,
      canPause: true,
      canSeek: false,
    });

    const bgm = getAudioNode(engine, "channel:bgm");
    expect(bgm.playback).toEqual({ commandId: 1, operation: "pause" });
    const channel = getAudioNode(engine, "channel:music-room");
    expect(channel).toEqual({
      id: "channel:music-room",
      type: "audio-channel",
      volume: 50,
      muted: false,
      pan: 0,
      children: [
        {
          id: "music-room:player",
          type: "sound",
          src: "opening.ogg",
          loop: false,
          volume: 70,
          muted: true,
          pan: -0.25,
          playbackRate: 1.25,
          startAt: 2,
          endAt: 182,
          startDelayMs: 0,
          playback: {
            commandId: 2,
            operation: "play",
            positionMs: 0,
          },
        },
      ],
    });

    effects.length = 0;
    engine.handleAction("setMusicVolume", { value: 20 });
    engine.handleAction("setMuteAll", { value: true });
    const mixedChannel = getAudioNode(engine, "channel:music-room");
    expect(mixedChannel.volume).toBe(20);
    expect(mixedChannel.muted).toBe(true);
    expect(mixedChannel.children[0].playback.commandId).toBe(2);
    expect(getAudioNode(engine, "channel:bgm").playback.commandId).toBe(1);
  });

  it("uses renderer timing for ready, progress, pause, resume, seek, stop, and completion", () => {
    const { effects, engine } = createEngine({
      viewedSoundIds: ["openingSound"],
    });
    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    effects.length = 0;

    engine.handleInternalAction("musicRoomSoundReady", {
      id: "music-room:player",
      commandId: 2,
      positionMs: 0,
      durationMs: 3_723_900,
    });
    expect(engine.selectMusicRoom().playback).toMatchObject({
      readiness: "ready",
      positionText: "0:00",
      durationText: "1:02:03",
      canSeek: true,
    });
    expect(effects).toEqual([{ name: "render" }]);

    effects.length = 0;
    engine.handleInternalAction("musicRoomSoundProgress", {
      id: "music-room:player",
      commandId: 2,
      positionMs: 83_999,
      durationMs: 3_723_900,
    });
    expect(engine.selectMusicRoom().playback.positionText).toBe("1:23");

    effects.length = 0;
    engine.handleAction("pauseMusicRoom", {});
    expect(engine.selectMusicRoom().playback).toMatchObject({
      status: "paused",
      canPlay: true,
      canPause: false,
    });
    expect(
      getAudioNode(engine, "channel:music-room").children[0].playback,
    ).toEqual({
      commandId: 3,
      operation: "pause",
    });

    engine.handleInternalAction("musicRoomSoundProgress", {
      id: "music-room:player",
      commandId: 3,
      positionMs: 84_250,
      durationMs: 3_723_900,
    });
    expect(engine.selectMusicRoom().playback.positionMs).toBe(84_250);

    engine.handleAction("playMusicRoom", {});
    expect(
      getAudioNode(engine, "channel:music-room").children[0].playback,
    ).toEqual({
      commandId: 4,
      operation: "resume",
    });

    engine.handleAction("seekMusicRoom", { positionMs: 100_000 });
    expect(
      getAudioNode(engine, "channel:music-room").children[0].playback,
    ).toEqual({
      commandId: 5,
      operation: "seek",
      positionMs: 100_000,
    });
    engine.handleAction("seekMusicRoom", { positionMs: 100_000 });
    expect(
      getAudioNode(engine, "channel:music-room").children[0].playback.commandId,
    ).toBe(6);

    engine.handleAction("seekMusicRoom", { positionMs: 3_723_900 });
    expect(engine.selectMusicRoom().playback.status).toBe("ended");
    engine.handleAction("seekMusicRoom", { positionMs: 1_000 });
    expect(engine.selectMusicRoom().playback.status).toBe("stopped");
    engine.handleAction("playMusicRoom", {});
    expect(
      getAudioNode(engine, "channel:music-room").children[0].playback,
    ).toEqual({
      commandId: 9,
      operation: "play",
      positionMs: 1_000,
    });

    engine.handleInternalAction("musicRoomSoundComplete", {
      id: "music-room:player",
      commandId: 9,
      positionMs: 3_723_900,
      durationMs: 3_723_900,
    });
    expect(engine.selectMusicRoom().playback.status).toBe("ended");

    engine.handleAction("stopMusicRoom", {});
    expect(engine.selectMusicRoom().playback).toMatchObject({
      status: "stopped",
      positionMs: 0,
      readiness: "ready",
    });
    expect(
      getAudioNode(engine, "channel:music-room").children[0].playback,
    ).toEqual({
      commandId: 10,
      operation: "stop",
    });
  });

  it("keeps decode work and BGM focus through pause/stop, then releases both on clear", () => {
    const { effects, engine } = createEngine({
      viewedSoundIds: ["openingSound"],
      projectData: createProjectData({
        lineActions: { bgm: { resourceId: "bgm" } },
      }),
    });
    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    engine.handleAction("pauseMusicRoom", {});
    engine.handleAction("stopMusicRoom", {});

    expect(engine.selectMusicRoom().playback).toMatchObject({
      readiness: "loading",
      status: "stopped",
      positionMs: 0,
    });
    expect(getAudioNode(engine, "channel:bgm").playback.operation).toBe(
      "pause",
    );
    expect(getAudioNode(engine, "channel:music-room")).toBeDefined();

    const stopCommandId = getAudioNode(engine, "channel:music-room").children[0]
      .playback.commandId;
    engine.handleInternalAction("musicRoomSoundReady", {
      id: "music-room:player",
      commandId: stopCommandId,
      positionMs: 0,
      durationMs: 180_000,
    });
    expect(engine.selectMusicRoom().playback.readiness).toBe("ready");

    effects.length = 0;
    engine.handleAction("clearMusicRoomSelection", {});
    expect(engine.selectMusicRoom().selection).toBeNull();
    expect(engine.selectMusicRoom().playback).toBeNull();
    expect(getAudioNode(engine, "channel:music-room")).toBeUndefined();
    expect(getAudioNode(engine, "channel:bgm").playback).toEqual({
      commandId: stopCommandId + 1,
      operation: "resume",
    });
    expect(effects).toEqual([{ name: "render" }]);

    effects.length = 0;
    engine.handleAction("clearMusicRoomSelection", {});
    expect(effects).toEqual([]);
  });

  it.each(["playMusicRoom", "playMusicRoomTrack"])(
    "keeps decoded readiness when retrying playback failures with %s",
    (retryAction) => {
      const { engine } = createEngine({
        viewedSoundIds: ["openingSound"],
      });
      engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
      engine.handleInternalAction("musicRoomSoundReady", {
        id: "music-room:player",
        commandId: 2,
        positionMs: 0,
        durationMs: 10_000,
      });
      engine.handleInternalAction("musicRoomSoundProgress", {
        id: "music-room:player",
        commandId: 2,
        positionMs: 2_500,
        durationMs: 10_000,
      });
      engine.handleInternalAction("musicRoomSoundError", {
        id: "music-room:player",
        commandId: 2,
        errorCode: "playback-failed",
      });

      expect(engine.selectMusicRoom().playback).toMatchObject({
        status: "stopped",
        readiness: "error",
        positionMs: 0,
        durationMs: 10_000,
      });

      engine.handleAction(
        retryAction,
        retryAction === "playMusicRoomTrack" ? { trackId: "opening" } : {},
      );
      expect(engine.selectMusicRoom().playback).toMatchObject({
        status: "playing",
        readiness: "ready",
        positionMs: 0,
        durationMs: 10_000,
      });
      const retryCommand = getAudioNode(engine, "channel:music-room")
        .children[0].playback;
      expect(retryCommand).toEqual({
        commandId: 3,
        operation: "play",
        positionMs: 0,
      });

      // Route Graphics retains the decoded generation and does not emit
      // another soundReady event before progress or completion.
      engine.handleInternalAction("musicRoomSoundProgress", {
        id: "music-room:player",
        commandId: retryCommand.commandId,
        positionMs: 750,
        durationMs: 10_000,
      });
      expect(engine.selectMusicRoom().playback).toMatchObject({
        status: "playing",
        readiness: "ready",
        positionMs: 750,
      });
      engine.handleInternalAction("musicRoomSoundComplete", {
        id: "music-room:player",
        commandId: retryCommand.commandId,
        positionMs: 10_000,
        durationMs: 10_000,
      });
      expect(engine.selectMusicRoom().playback.status).toBe("ended");
    },
  );

  it.each(["playing", "paused"])(
    "restores %s transport after a renderer-rejected seek",
    (transportStatus) => {
      const { effects, engine } = createEngine({
        viewedSoundIds: ["openingSound"],
      });
      engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
      engine.handleInternalAction("musicRoomSoundReady", {
        id: "music-room:player",
        commandId: 2,
        positionMs: 0,
        durationMs: 10_000,
      });
      engine.handleInternalAction("musicRoomSoundProgress", {
        id: "music-room:player",
        commandId: 2,
        positionMs: 2_500,
        durationMs: 10_000,
      });

      if (transportStatus === "paused") {
        engine.handleAction("pauseMusicRoom", {});
        engine.handleInternalAction("musicRoomSoundProgress", {
          id: "music-room:player",
          commandId: 3,
          positionMs: 2_500,
          durationMs: 10_000,
        });
      }

      effects.length = 0;
      engine.handleAction("seekMusicRoom", { positionMs: 10_000 });
      const seekCommand = getAudioNode(engine, "channel:music-room").children[0]
        .playback;
      expect(engine.selectMusicRoom().playback).toMatchObject({
        status: "ended",
        readiness: "ready",
        positionMs: 10_000,
      });

      effects.length = 0;
      engine.handleInternalAction("musicRoomSoundError", {
        id: "music-room:player",
        commandId: seekCommand.commandId,
        errorCode: "invalid-position",
      });
      expect(engine.selectMusicRoom().playback).toMatchObject({
        status: transportStatus,
        readiness: "ready",
        positionMs: 2_500,
        durationMs: 10_000,
        canSeek: true,
      });
      expect(
        engine.selectSystemState().global.musicRoomPlayer.seekFallback,
      ).toBeNull();
      expect(effects).toEqual([{ name: "render" }]);

      effects.length = 0;
      engine.handleInternalAction("musicRoomSoundProgress", {
        id: "music-room:player",
        commandId: seekCommand.commandId,
        positionMs: 2_750,
        durationMs: 10_000,
      });
      expect(engine.selectMusicRoom().playback.positionMs).toBe(2_750);
      expect(effects).toEqual([{ name: "render" }]);
    },
  );

  it("ignores stale, malformed, out-of-range, and state-incompatible renderer events", () => {
    const { effects, engine } = createEngine({
      viewedSoundIds: ["openingSound"],
    });
    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    effects.length = 0;
    const before = engine.selectMusicRoom();

    const invalidEvents = [
      ["musicRoomSoundReady", null],
      [
        "musicRoomSoundReady",
        {
          id: "other",
          commandId: 2,
          positionMs: 0,
          durationMs: 10_000,
        },
      ],
      [
        "musicRoomSoundReady",
        {
          id: "music-room:player",
          commandId: 1,
          positionMs: 0,
          durationMs: 10_000,
        },
      ],
      [
        "musicRoomSoundReady",
        {
          id: "music-room:player",
          commandId: 2,
          positionMs: 11_000,
          durationMs: 10_000,
        },
      ],
      [
        "musicRoomSoundError",
        {
          id: "music-room:player",
          commandId: 2,
          errorCode: "browser-message",
        },
      ],
      [
        "musicRoomSoundComplete",
        {
          id: "music-room:player",
          commandId: 2,
          positionMs: 9_999,
          durationMs: 10_000,
        },
      ],
    ];
    invalidEvents.forEach(([action, payload]) => {
      engine.handleInternalAction(action, payload);
    });

    expect(engine.selectMusicRoom()).toEqual(before);
    expect(effects).toEqual([]);

    engine.handleInternalAction("musicRoomSoundError", {
      id: "music-room:player",
      commandId: 2,
      errorCode: "decode-failed",
    });
    expect(engine.selectMusicRoom().playback).toMatchObject({
      status: "stopped",
      readiness: "error",
    });
  });
});

describe("RouteEngine music room validation and atomicity", () => {
  it.each([
    ["a non-object room", null, "resources.musicRoom must be an object"],
    [
      "a fractional page size",
      { pageSize: 1.5, tracks: [] },
      "resources.musicRoom.pageSize must be an integer",
    ],
    [
      "an unknown room property",
      { pageSize: 1, tracks: [], extra: true },
      'resources.musicRoom contains unsupported property "extra"',
    ],
    [
      "duplicate track IDs",
      {
        pageSize: 1,
        tracks: [
          { id: "same", soundId: "openingSound", title: "One" },
          { id: "same", soundId: "endingSound", title: "Two" },
        ],
      },
      'Duplicate music room track id "same"',
    ],
    [
      "an unknown sound",
      {
        pageSize: 1,
        tracks: [{ id: "bad", soundId: "missing", title: "Bad" }],
      },
      'references unknown sound "missing"',
    ],
    [
      "an unknown cover",
      {
        pageSize: 1,
        tracks: [
          {
            id: "bad",
            soundId: "openingSound",
            title: "Bad",
            coverImageId: "missing",
          },
        ],
      },
      'references unknown cover image "missing"',
    ],
  ])("rejects %s during initialization", (_label, musicRoom, message) => {
    expect(() =>
      createEngine({
        projectData: createProjectData({ musicRoom }),
      }),
    ).toThrow(message);
  });

  it("rejects invalid referenced sound transport defaults", () => {
    for (const [field, value, message] of [
      ["playbackRate", 0, "playbackRate"],
      ["startAt", Number.NaN, "startAt"],
      ["endAt", 2, "endAt"],
    ]) {
      const projectData = createProjectData();
      projectData.resources.sounds.openingSound[field] = value;
      if (field === "endAt") {
        projectData.resources.sounds.openingSound.startAt = 2;
      }
      expect(() => createEngine({ projectData })).toThrow(message);
    }
  });

  it.each([
    ["playMusicRoomTrack", null, "payload must be an object"],
    ["playMusicRoomTrack", {}, "requires a non-empty trackId"],
    [
      "playMusicRoomTrack",
      { trackId: "opening", extra: true },
      "unsupported property",
    ],
    ["seekMusicRoom", { positionMs: Number.NaN }, "finite non-negative"],
    ["seekMusicRoom", { positionMs: Infinity }, "finite non-negative"],
    ["moveToMusicRoomPage", { pageIndex: 1.5 }, "non-negative integer"],
    ["pauseMusicRoom", { extra: true }, "unsupported property"],
  ])("rejects malformed %s atomically", (action, payload, message) => {
    const { effects, engine } = createEngine({
      viewedSoundIds: ["openingSound"],
    });
    const before = engine.selectSystemState();
    expect(() => engine.handleAction(action, payload)).toThrow(message);
    expect(engine.selectSystemState()).toEqual(before);
    expect(effects).toEqual([]);
  });

  it("rolls back earlier commands and counter changes when a later batch action fails", () => {
    const { effects, engine } = createEngine({
      viewedSoundIds: ["openingSound"],
    });
    const before = engine.selectSystemState();

    expect(() =>
      engine.handleActions({
        playMusicRoomTrack: { trackId: "opening" },
        seekMusicRoom: { positionMs: Number.NaN },
      }),
    ).toThrow("finite non-negative");

    expect(engine.selectSystemState()).toEqual(before);
    expect(effects).toEqual([]);
  });

  it("preserves template-looking authored track IDs through real action dispatch", () => {
    const trackId = "${variables.redirect}";
    const musicRoom = createMusicRoom({
      tracks: [{ id: trackId, soundId: "openingSound", title: "Literal" }],
    });
    const projectData = createProjectData({ musicRoom });
    projectData.resources.variables = {
      redirect: {
        type: "string",
        scope: "context",
        default: "wrong-track",
      },
    };
    const { engine } = createEngine({
      projectData,
      viewedSoundIds: ["openingSound"],
    });

    engine.handleActions({
      playMusicRoomTrack: { trackId },
    });
    expect(engine.selectMusicRoom().selection.trackId).toBe(trackId);

    engine.handleAction("clearMusicRoomSelection", {});
    engine.handleActions(
      {
        playMusicRoomTrack: "_event.action",
      },
      {
        _event: {
          action: { trackId },
        },
      },
    );
    expect(engine.selectMusicRoom().selection.trackId).toBe(trackId);
  });

  it("rejects an invalid project replacement without changing playback or commands", () => {
    const { effects, engine } = createEngine({
      viewedSoundIds: ["openingSound"],
    });
    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    effects.length = 0;
    const before = engine.selectSystemState();
    const replacement = createProjectData();
    replacement.resources.musicRoom.tracks[0].soundId = "missing";

    expect(() =>
      engine.handleAction("updateProjectData", {
        projectData: replacement,
      }),
    ).toThrow('references unknown sound "missing"');
    expect(engine.selectSystemState()).toEqual(before);
    expect(effects).toEqual([]);
  });
});

describe("RouteEngine music room lifecycle", () => {
  it("does not save the player and does not restore it through rollback", () => {
    const projectData = createProjectData();
    const section = projectData.story.scenes.scene1.sections.section1;
    section.lines.push({ id: "line2", actions: {} });
    const { engine } = createEngine({
      projectData,
      viewedSoundIds: ["openingSound"],
    });

    engine.handleAction("saveSlot", { slotId: 1, savedAt: 1 });
    const saveState = engine.selectSaveSlot({ slotId: 1 }).state;
    expect(saveState).toEqual({
      contexts: expect.any(Array),
    });
    expect(JSON.stringify(saveState)).not.toContain("musicRoomPlayer");

    engine.handleAction("nextLine", {});
    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    const commandIdBeforeRollback =
      engine.selectSystemState().global.musicRoomPlayer.playback.commandId;
    engine.handleAction("rollbackByOffset", { offset: -1 });

    expect(engine.selectMusicRoom().selection.trackId).toBe("opening");
    expect(
      engine.selectSystemState().global.musicRoomPlayer.playback.commandId,
    ).toBe(commandIdBeforeRollback);
  });

  it("clears selection and releases BGM focus on successful load, reset, and replacement", () => {
    const projectData = createProjectData();
    projectData.story.scenes.scene1.sections.section1.lines.push({
      id: "line2",
      actions: {},
    });
    const { engine } = createEngine({
      projectData,
      viewedSoundIds: ["openingSound"],
    });
    engine.handleAction("saveSlot", { slotId: 1, savedAt: 1 });

    const assertReset = (previousCommandId) => {
      const state = engine.selectSystemState().global;
      expect(engine.selectMusicRoom()?.selection ?? null).toBeNull();
      expect(state.musicRoomPlayer.trackId).toBeNull();
      expect(state.musicRoomPlayer.pageIndex).toBe(0);
      expect(state.musicRoomPlayer.bgmPlayback).toEqual({
        commandId: previousCommandId + 1,
        operation: "resume",
      });
      expect(state.audioCommandId).toBe(previousCommandId + 1);
    };

    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    let previousCommandId =
      engine.selectSystemState().global.musicRoomPlayer.playback.commandId;
    engine.handleAction("loadSlot", { slotId: 1 });
    assertReset(previousCommandId);

    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    previousCommandId =
      engine.selectSystemState().global.musicRoomPlayer.playback.commandId;
    engine.handleAction("resetStoryAtSection", { sectionId: "section1" });
    assertReset(previousCommandId);

    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    previousCommandId =
      engine.selectSystemState().global.musicRoomPlayer.playback.commandId;
    engine.handleAction("updateProjectData", {
      projectData: createProjectData(),
    });
    assertReset(previousCommandId);
  });

  it("keeps a changed logical BGM paused until selection is cleared", () => {
    const projectData = createProjectData({
      lineActions: { bgm: { resourceId: "bgm" } },
    });
    projectData.resources.sounds.bgm2 = { fileId: "bgm2.ogg" };
    projectData.story.scenes.scene1.sections.section1.lines.push({
      id: "line2",
      actions: { bgm: { resourceId: "bgm2" } },
    });
    const { engine } = createEngine({
      projectData,
      viewedSoundIds: ["openingSound"],
    });

    engine.handleAction("playMusicRoomTrack", { trackId: "opening" });
    const pauseCommand = getAudioNode(engine, "channel:bgm").playback;
    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    const changedBgm = getAudioNode(engine, "channel:bgm");
    expect(changedBgm.children[0].src).toBe("bgm2.ogg");
    expect(changedBgm.playback).toEqual(pauseCommand);

    engine.handleAction("clearMusicRoomSelection", {});
    expect(getAudioNode(engine, "channel:bgm").playback).toEqual({
      commandId: pauseCommand.commandId + 2,
      operation: "resume",
    });
  });
});
