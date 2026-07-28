import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const ABSENT_SCENE_REPLAY = Symbol("absent-scene-replay");

const createReplayEntries = () => [
  {
    id: "firstMeeting",
    title: "First Meeting",
    thumbnailImageId: "firstMeetingThumb",
    startSectionId: "replayStart",
    initialVariables: {
      affection: 10,
      replayObject: { route: "replay" },
    },
  },
  {
    id: "secondMemory",
    title: "Second Memory",
    thumbnailImageId: "secondMemoryThumb",
    startSectionId: "replayStart",
  },
  {
    id: "thirdMemory",
    title: "Third Memory",
    thumbnailImageId: "thirdMemoryThumb",
    startSectionId: "replayStart",
  },
];

const createProjectData = ({
  sceneReplay = { pageSize: 2, replays: createReplayEntries() },
  replayLines,
  layouts = {},
} = {}) => {
  const resources = {
    images: {
      firstMeetingThumb: {
        fileId: "first-meeting.png",
        width: 320,
        height: 180,
      },
      secondMemoryThumb: {
        fileId: "second-memory.png",
        width: 320,
        height: 180,
      },
      thirdMemoryThumb: {
        fileId: "third-memory.png",
        width: 320,
        height: 180,
      },
    },
    layouts,
    variables: {
      affection: { type: "number", scope: "context", default: 1 },
      routeName: { type: "string", scope: "context", default: "normal" },
      readonlyName: {
        type: "string",
        scope: "context",
        default: "fixed",
        readonly: true,
      },
      replayObject: {
        type: "object",
        scope: "context",
        default: { route: "default" },
      },
      accountFlag: {
        type: "boolean",
        scope: "account",
        default: false,
      },
      deviceFlag: {
        type: "boolean",
        scope: "device",
        default: false,
      },
      doubledAffection: {
        type: "number",
        scope: "context",
        computed: {
          expr: {
            mul: [{ var: "variables.affection" }, 2],
          },
        },
      },
    },
  };
  if (sceneReplay !== ABSENT_SCENE_REPLAY) {
    resources.sceneReplay = sceneReplay;
  }

  return {
    screen: { width: 1920, height: 1080 },
    resources,
    story: {
      initialSceneId: "main",
      scenes: {
        main: {
          initialSectionId: "caller",
          sections: {
            caller: {
              lines: [
                { id: "caller1", actions: {} },
                { id: "caller2", actions: {} },
              ],
            },
            replayStart: {
              initialLineId: "replay1",
              lines: replayLines ?? [
                { id: "replay1", actions: {} },
                {
                  id: "replay2",
                  actions: {
                    finishSceneReplay: {},
                  },
                },
              ],
            },
            replayBranch: {
              lines: [
                {
                  id: "branch1",
                  actions: {
                    finishSceneReplay: {},
                  },
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
  accountViewedRegistry = { sections: [], resources: [] },
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
      global: { accountViewedRegistry },
    },
  });
  effects.length = 0;

  return { effects, engine };
};

const selectCurrentContext = (engine) =>
  engine.selectSystemState().contexts.at(-1);

describe("RouteEngine scene replay catalog", () => {
  it("returns null when absent and projects ordered pages when configured", () => {
    const absent = createEngine({
      projectData: createProjectData({
        sceneReplay: ABSENT_SCENE_REPLAY,
      }),
    }).engine;
    expect(absent.selectSceneReplay()).toBeNull();
    expect(absent.selectIsSceneReplayActive()).toBe(false);

    const { engine } = createEngine();
    expect(engine.selectSceneReplay()).toEqual({
      isActive: false,
      activeReplayId: null,
      pageReplays: [
        {
          replayId: "firstMeeting",
          title: "First Meeting",
          thumbnailImageId: "firstMeetingThumb",
        },
        {
          replayId: "secondMemory",
          title: "Second Memory",
          thumbnailImageId: "secondMemoryThumb",
        },
      ],
      pagination: {
        pageIndex: 0,
        pageCount: 2,
        canMoveToPreviousPage: false,
        canMoveToNextPage: true,
      },
    });

    engine.handleActions({ moveToNextSceneReplayPage: {} });
    expect(
      engine.selectSceneReplay().pageReplays.map((item) => item.replayId),
    ).toEqual(["thirdMemory"]);
    expect(engine.selectSceneReplay().pagination).toEqual({
      pageIndex: 1,
      pageCount: 2,
      canMoveToPreviousPage: true,
      canMoveToNextPage: false,
    });

    engine.handleActions({
      moveToSceneReplayPage: { pageIndex: 0 },
      moveToPreviousSceneReplayPage: {},
    });
    expect(engine.selectSceneReplay().pagination.pageIndex).toBe(0);
  });

  it("starts from fresh defaults plus cloned initial overrides", () => {
    const { engine } = createEngine();
    engine.handleActions({
      updateVariable: {
        id: "callerSetup",
        operations: [
          { variableId: "affection", op: "set", value: 99 },
          { variableId: "routeName", op: "set", value: "caller" },
          {
            variableId: "replayObject",
            op: "set",
            value: { route: "caller" },
          },
        ],
      },
      startSceneReplay: { replayId: "firstMeeting" },
    });

    const context = selectCurrentContext(engine);
    expect(context.kind).toBe("sceneReplay");
    expect(context.pointers.read).toMatchObject({
      sectionId: "replayStart",
      lineId: "replay1",
    });
    expect(context.variables).toEqual({
      affection: 10,
      routeName: "normal",
      readonlyName: "fixed",
      replayObject: { route: "replay" },
    });
    expect(engine.selectSceneReplay()).toMatchObject({
      isActive: true,
      activeReplayId: "firstMeeting",
    });
    expect(engine.selectIsSceneReplayActive()).toBe(true);

    engine.handleActions({
      updateVariable: {
        id: "mutateReplayObject",
        operations: [
          {
            variableId: "replayObject",
            op: "set",
            value: { route: "changed-in-replay" },
          },
        ],
      },
      exitSceneReplay: {},
    });
    expect(selectCurrentContext(engine)).toMatchObject({
      pointers: {
        read: {
          sectionId: "caller",
          lineId: "caller1",
        },
      },
      variables: {
        affection: 99,
        routeName: "caller",
        readonlyName: "fixed",
        replayObject: { route: "caller" },
      },
    });
  });

  it("keeps a finish-marked line visible and exits on the next completed advance", () => {
    const { engine } = createEngine();
    engine.handleActions({
      startSceneReplay: { replayId: "firstMeeting" },
    });

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({ nextLine: {} });
    expect(selectCurrentContext(engine)).toMatchObject({
      kind: "sceneReplay",
      pointers: { read: { lineId: "replay2" } },
      sceneReplay: { finishOnNextAdvance: true },
    });

    engine.handleActions({ nextLine: {} });
    expect(engine.selectIsSceneReplayActive()).toBe(true);
    expect(engine.selectSystemState().global.isLineCompleted).toBe(true);

    engine.handleActions({ nextLine: {} });
    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(selectCurrentContext(engine).pointers.read.lineId).toBe("caller1");
  });

  it("supports immediate exit and treats finish/exit outside replay as no-ops", () => {
    const { engine } = createEngine();
    const before = engine.selectSystemState();

    engine.handleActions({
      finishSceneReplay: {},
      exitSceneReplay: {},
    });
    expect(engine.selectSystemState()).toEqual(before);

    engine.handleActions({
      startSceneReplay: { replayId: "firstMeeting" },
      exitSceneReplay: {},
    });
    expect(engine.selectIsSceneReplayActive()).toBe(false);
  });

  it("drops deferred replay entry work without re-running caller line actions", () => {
    const projectData = createProjectData();
    projectData.story.scenes.main.sections.caller.lines[0].actions = {
      updateVariable: {
        id: "countCallerEntry",
        operations: [{ variableId: "affection", op: "increment", value: 1 }],
      },
    };
    const { effects, engine } = createEngine({ projectData });
    expect(selectCurrentContext(engine).variables.affection).toBe(2);

    engine.handleActions({
      startSceneReplay: { replayId: "firstMeeting" },
      exitSceneReplay: {},
    });

    expect(selectCurrentContext(engine).variables.affection).toBe(2);
    expect(effects.some((effect) => effect.name === "handleLineActions")).toBe(
      false,
    );
  });

  it("preserves caller line work queued before a same-batch replay exit", () => {
    const projectData = createProjectData();
    projectData.story.scenes.main.sections.caller.lines[1].actions = {
      updateVariable: {
        id: "applyCallerDestination",
        operations: [{ variableId: "affection", op: "set", value: 7 }],
      },
    };
    const { engine } = createEngine({ projectData });

    engine.handleActions({
      jumpToLine: { lineId: "caller2" },
      startSceneReplay: { replayId: "firstMeeting" },
      exitSceneReplay: {},
    });

    expect(selectCurrentContext(engine)).toMatchObject({
      pointers: { read: { lineId: "caller2" } },
      variables: { affection: 7 },
    });
  });

  it("derives replay defaults without cloning the full project graph", () => {
    const { engine } = createEngine();
    const structuredCloneSpy = vi.spyOn(globalThis, "structuredClone");

    engine.handleAction("startSceneReplay", { replayId: "firstMeeting" });

    const clonedFullProject = structuredCloneSpy.mock.calls.some(
      ([value]) =>
        value?.screen !== undefined &&
        value?.resources !== undefined &&
        value?.story !== undefined,
    );
    structuredCloneSpy.mockRestore();

    expect(clonedFullProject).toBe(false);
    expect(selectCurrentContext(engine).variables).toMatchObject({
      affection: 10,
      replayObject: { route: "replay" },
    });
  });

  it("restores caller transient UI state after replay exit", () => {
    const { engine } = createEngine();
    engine.handleActions({
      markLineCompleted: {},
      startAutoMode: {},
      hideDialogueUI: {},
      setNextLineConfig: {
        auto: {
          enabled: true,
          trigger: "fromComplete",
          delay: 4321,
        },
      },
      pushOverlay: { resourceId: "callerOverlay" },
    });
    const caller = engine.selectSystemState().global;

    engine.handleActions({
      startSceneReplay: { replayId: "firstMeeting" },
    });
    expect(engine.selectSystemState().global).toMatchObject({
      autoMode: false,
      skipMode: false,
      dialogueUIHidden: false,
      overlayStack: [],
      isLineCompleted: false,
    });

    engine.handleActions({
      pushOverlay: { resourceId: "replayOverlay" },
      exitSceneReplay: {},
    });
    expect(engine.selectSystemState().global).toMatchObject({
      autoMode: caller.autoMode,
      skipMode: caller.skipMode,
      dialogueUIHidden: caller.dialogueUIHidden,
      nextLineConfig: caller.nextLineConfig,
      overlayStack: caller.overlayStack,
      isLineCompleted: caller.isLineCompleted,
    });
  });

  it("allows normal cross-section routing inside an isolated replay", () => {
    const { engine } = createEngine();
    engine.handleActions({
      startSceneReplay: { replayId: "firstMeeting" },
      sectionTransition: { sectionId: "replayBranch" },
    });
    expect(selectCurrentContext(engine)).toMatchObject({
      kind: "sceneReplay",
      pointers: {
        read: {
          sectionId: "replayBranch",
          lineId: "branch1",
        },
      },
      sceneReplay: {
        finishOnNextAdvance: true,
      },
    });
  });

  it("restores replay initial variables and finish state during rollback", () => {
    const { engine } = createEngine();
    engine.handleActions({
      startSceneReplay: { replayId: "firstMeeting" },
    });
    engine.handleAction("markLineCompleted", {});
    engine.handleActions({ nextLine: {} });
    engine.handleActions({
      updateVariable: {
        id: "changeReplay",
        operations: [{ variableId: "affection", op: "set", value: 42 }],
      },
    });
    expect(selectCurrentContext(engine).sceneReplay.finishOnNextAdvance).toBe(
      true,
    );

    engine.handleActions({ rollbackByOffset: { offset: -1 } });
    expect(selectCurrentContext(engine)).toMatchObject({
      kind: "sceneReplay",
      pointers: { read: { lineId: "replay1" } },
      variables: { affection: 10 },
      sceneReplay: { finishOnNextAdvance: false },
    });
  });

  it("exits safely with a warning at a natural dead end", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { engine } = createEngine({
      projectData: createProjectData({
        replayLines: [{ id: "replay1", actions: {} }],
      }),
    });

    engine.handleActions({
      startSceneReplay: { replayId: "firstMeeting" },
    });
    engine.handleAction("markLineCompleted", {});
    engine.handleActions({ nextLine: {} });

    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "Scene replay reached the end of a section without finishSceneReplay; exiting replay.",
    );
    warn.mockRestore();
  });

  it("suppresses progress and achievements while allowing device preferences", () => {
    const { effects, engine } = createEngine();
    engine.handleActions({
      startSceneReplay: { replayId: "firstMeeting" },
      addViewedLine: { sectionId: "replayStart", lineId: "replay1" },
      addViewedResource: { resourceId: "firstMeetingThumb" },
      completeAchievement: { resourceId: "undeclared-is-suppressed" },
      setMusicVolume: { value: 23 },
    });
    engine.handleAction("markLineCompleted", {});

    expect(engine.selectSystemState().global.accountViewedRegistry).toEqual({
      sections: [],
      resources: [],
    });
    expect(
      effects.some(
        (effect) =>
          effect.name === "applyScopedDataUpdates" ||
          effect.name === "completeAchievement",
      ),
    ).toBe(false);

    engine.handleActions({ exitSceneReplay: {} });
    expect(engine.selectRuntime().musicVolume).toBe(23);
  });

  it("rejects persistent mutations and nested replay starts atomically", () => {
    const { engine } = createEngine();
    engine.handleActions({
      startSceneReplay: { replayId: "firstMeeting" },
    });

    expect(() =>
      engine.handleActions({
        updateVariable: {
          id: "mixedScopes",
          operations: [
            { variableId: "affection", op: "set", value: 50 },
            { variableId: "accountFlag", op: "set", value: true },
          ],
        },
      }),
    ).toThrow(
      'Cannot update account-scoped variable "accountFlag" while a scene replay is active',
    );
    expect(selectCurrentContext(engine).variables.affection).toBe(10);

    expect(() =>
      engine.handleActions({
        saveSlot: { slotId: 1 },
      }),
    ).toThrow("Cannot save while a scene replay is active");
    expect(() =>
      engine.handleActions({
        loadSlot: { slotId: 1 },
      }),
    ).toThrow("Cannot load while a scene replay is active");
    expect(() =>
      engine.handleActions({
        resetStoryAtSection: { sectionId: "caller" },
      }),
    ).toThrow("Cannot reset the story while a scene replay is active");
    expect(() =>
      engine.handleActions({
        updateProjectData: {
          projectData: createProjectData(),
        },
      }),
    ).toThrow("Cannot update project data while a scene replay is active");
    expect(() =>
      engine.handleActions({
        startSceneReplay: { replayId: "secondMemory" },
      }),
    ).toThrow("Cannot start a scene replay while another replay is active");
  });

  it("rolls back replay entry when a later action in the batch fails", () => {
    const { engine } = createEngine();

    expect(() =>
      engine.handleActions({
        startSceneReplay: { replayId: "firstMeeting" },
        updateVariable: {
          id: "forbiddenAfterStart",
          operations: [{ variableId: "accountFlag", op: "set", value: true }],
        },
      }),
    ).toThrow(
      'Cannot update account-scoped variable "accountFlag" while a scene replay is active',
    );

    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(engine.selectSystemState().contexts).toHaveLength(1);
    expect(selectCurrentContext(engine).pointers.read).toMatchObject({
      sectionId: "caller",
      lineId: "caller1",
    });
  });

  it("preserves declared template-looking replay IDs through real action dispatch", () => {
    const replayId = "${variables.routeName}";
    const projectData = createProjectData({
      sceneReplay: {
        pageSize: 1,
        replays: [
          {
            id: replayId,
            title: "Literal ID",
            thumbnailImageId: "firstMeetingThumb",
            startSectionId: "replayStart",
          },
        ],
      },
    });
    const { engine } = createEngine({ projectData });

    engine.handleActions({
      startSceneReplay: { replayId },
    });
    expect(engine.selectSceneReplay()).toMatchObject({
      isActive: true,
      activeReplayId: replayId,
    });
  });

  it.each([
    [
      "a duplicate replay ID",
      (projectData) => {
        projectData.resources.sceneReplay.replays[1].id = "firstMeeting";
      },
      'Duplicate scene replay id "firstMeeting"',
    ],
    [
      "an unknown thumbnail",
      (projectData) => {
        projectData.resources.sceneReplay.replays[0].thumbnailImageId =
          "missing";
      },
      'references unknown thumbnail image "missing"',
    ],
    [
      "an unknown start section",
      (projectData) => {
        projectData.resources.sceneReplay.replays[0].startSectionId = "missing";
      },
      'references unknown start section "missing"',
    ],
    [
      "an invalid section initial line",
      (projectData) => {
        projectData.story.scenes.main.sections.replayStart.initialLineId =
          "missing";
      },
      'references unknown initial line "missing"',
    ],
    [
      "an unknown initial variable",
      (projectData) => {
        projectData.resources.sceneReplay.replays[0].initialVariables.missing = true;
      },
      'references unknown variable "missing"',
    ],
    [
      "a computed initial variable",
      (projectData) => {
        projectData.resources.sceneReplay.replays[0].initialVariables = {
          doubledAffection: 20,
        };
      },
      'cannot initialize computed variable "doubledAffection"',
    ],
    [
      "a readonly initial variable",
      (projectData) => {
        projectData.resources.sceneReplay.replays[0].initialVariables = {
          readonlyName: "changed",
        };
      },
      'cannot initialize readonly variable "readonlyName"',
    ],
    [
      "a persistent initial variable",
      (projectData) => {
        projectData.resources.sceneReplay.replays[0].initialVariables = {
          accountFlag: true,
        };
      },
      'can only initialize context variable "accountFlag"',
    ],
    [
      "a wrongly typed initial variable",
      (projectData) => {
        projectData.resources.sceneReplay.replays[0].initialVariables = {
          affection: "ten",
        };
      },
      "expected type number, got string",
    ],
    [
      "an unsupported replay property",
      (projectData) => {
        projectData.resources.sceneReplay.replays[0].layoutId = "forbidden";
      },
      'contains unsupported property "layoutId"',
    ],
  ])("rejects %s during project initialization", (_label, mutate, message) => {
    const projectData = createProjectData();
    mutate(projectData);

    expect(() => createEngine({ projectData })).toThrow(message);
  });
});
