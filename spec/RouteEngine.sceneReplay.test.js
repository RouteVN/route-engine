import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import createEffectsHandler from "../src/createEffectsHandler.js";

const ABSENT_SCENE_REPLAY = Symbol("absent-scene-replay");

const createReplayEntries = () => [
  {
    sceneId: "firstMeeting",
    title: "First Meeting",
    thumbnailImageId: "firstMeetingThumb",
    initialVariables: {
      affection: 10,
      replayObject: { route: "replay" },
    },
  },
  {
    sceneId: "secondMemory",
    title: "Second Memory",
    thumbnailImageId: "secondMemoryThumb",
  },
  {
    sceneId: "thirdMemory",
    title: "Third Memory",
    thumbnailImageId: "thirdMemoryThumb",
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
          },
        },
        firstMeeting: {
          initialSectionId: "replayStart",
          sections: {
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
        secondMemory: {
          initialSectionId: "secondMemoryStart",
          sections: {
            secondMemoryStart: {
              lines: [{ id: "secondMemory1", actions: {} }],
            },
          },
        },
        thirdMemory: {
          initialSectionId: "thirdMemoryStart",
          sections: {
            thirdMemoryStart: {
              lines: [{ id: "thirdMemory1", actions: {} }],
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
  accountReplayRegistry = {
    sceneIds: ["firstMeeting", "secondMemory", "thirdMemory"],
  },
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
      global: { accountViewedRegistry, accountReplayRegistry },
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
      activeSceneId: null,
      pageReplays: [
        {
          sceneId: "firstMeeting",
          title: "First Meeting",
          thumbnailImageId: "firstMeetingThumb",
          locked: false,
        },
        {
          sceneId: "secondMemory",
          title: "Second Memory",
          thumbnailImageId: "secondMemoryThumb",
          locked: false,
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
      engine.selectSceneReplay().pageReplays.map((item) => item.sceneId),
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

  it("projects locked scenes and refuses to start them", () => {
    const { effects, engine } = createEngine({
      accountReplayRegistry: { sceneIds: [] },
    });

    expect(engine.selectSceneReplay().pageReplays).toEqual([
      expect.objectContaining({ sceneId: "firstMeeting", locked: true }),
      expect.objectContaining({ sceneId: "secondMemory", locked: true }),
    ]);

    engine.handleActions({
      startSceneReplay: { sceneId: "firstMeeting" },
    });
    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(effects).toEqual([]);
  });

  it("deduplicates loaded replay unlocks and rejects malformed registries", () => {
    const { engine } = createEngine({
      accountReplayRegistry: {
        sceneIds: ["firstMeeting", "firstMeeting", "retiredScene"],
      },
    });
    expect(engine.selectSystemState().global.accountReplayRegistry).toEqual({
      sceneIds: ["firstMeeting", "retiredScene"],
    });

    for (const accountReplayRegistry of [
      null,
      { sceneIds: "firstMeeting" },
      { sceneIds: [""] },
      { sceneIds: [1] },
    ]) {
      expect(() => createEngine({ accountReplayRegistry })).toThrow(
        "Malformed accountReplayRegistry",
      );
    }
  });

  it("automatically unlocks the current scene at its normal-story finish marker", () => {
    const { effects, engine } = createEngine({
      accountReplayRegistry: { sceneIds: [] },
    });

    engine.handleActions({
      sectionTransition: { sectionId: "replayStart" },
    });
    engine.handleAction("markLineCompleted", {});
    effects.length = 0;
    engine.handleActions({ nextLine: {} });

    expect(engine.selectSystemState().global.accountReplayRegistry).toEqual({
      sceneIds: ["firstMeeting"],
    });
    expect(engine.selectSceneReplay().pageReplays[0]).toMatchObject({
      sceneId: "firstMeeting",
      locked: false,
    });
    expect(effects).toContainEqual({
      name: "applyScopedDataUpdates",
      payload: {
        updates: [
          {
            scope: "account",
            path: "replayRegistry",
            op: "unlock",
            value: { sceneIds: ["firstMeeting"] },
          },
        ],
      },
    });

    effects.length = 0;
    engine.handleActions({ finishSceneReplay: {} });
    expect(effects).toEqual([]);
    expect(
      engine.selectSystemState().global.accountReplayRegistry.sceneIds,
    ).toEqual(["firstMeeting"]);
  });

  it("keeps account replay unlocks when loading a save made before completion", () => {
    const { engine } = createEngine({
      accountReplayRegistry: { sceneIds: [] },
    });
    engine.handleActions({ saveSlot: { slotId: 1, savedAt: 1700000000000 } });

    engine.handleActions({
      sectionTransition: { sectionId: "replayStart" },
    });
    engine.handleAction("markLineCompleted", {});
    engine.handleActions({ nextLine: {} });
    expect(engine.selectSceneReplay().pageReplays[0].locked).toBe(false);

    engine.handleActions({ loadSlot: { slotId: 1 } });

    expect(selectCurrentContext(engine).pointers.read).toMatchObject({
      sectionId: "caller",
      lineId: "caller1",
    });
    expect(engine.selectSystemState().global.accountReplayRegistry).toEqual({
      sceneIds: ["firstMeeting"],
    });
    expect(engine.selectSceneReplay().pageReplays[0].locked).toBe(false);
  });

  it("rolls back a new unlock and its persistence effect when the action batch fails", () => {
    const { effects, engine } = createEngine({
      accountReplayRegistry: { sceneIds: [] },
    });
    engine.handleActions({
      sectionTransition: { sectionId: "replayStart" },
    });
    effects.length = 0;

    expect(() =>
      engine.handleActions({
        finishSceneReplay: {},
        moveToSceneReplayPage: { pageIndex: -1 },
      }),
    ).toThrow("requires a non-negative integer pageIndex");

    expect(engine.selectSystemState().global.accountReplayRegistry).toEqual({
      sceneIds: [],
    });
    expect(engine.selectSceneReplay().pageReplays[0].locked).toBe(true);
    expect(effects).toEqual([]);
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
      startSceneReplay: { sceneId: "firstMeeting" },
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
      activeSceneId: "firstMeeting",
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
      startSceneReplay: { sceneId: "firstMeeting" },
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

  it("defers an already-due automatic replay exit until the terminal line completes", () => {
    const { engine } = createEngine({
      projectData: createProjectData({
        replayLines: [
          { id: "replay1", actions: {} },
          {
            id: "replay2",
            actions: {
              finishSceneReplay: {},
              setNextLineConfig: {
                auto: {
                  enabled: true,
                  trigger: "fromStart",
                  delay: 1,
                },
              },
            },
          },
        ],
      }),
    });
    engine.handleActions({
      startSceneReplay: { sceneId: "firstMeeting" },
    });
    engine.handleAction("markLineCompleted", {});
    engine.handleActions({ nextLine: {} });

    expect(engine.selectSystemState().global.isLineCompleted).toBe(false);
    engine.handleAction("nextLineFromSystem", {});
    expect(engine.selectIsSceneReplayActive()).toBe(true);
    expect(selectCurrentContext(engine).sceneReplay).toMatchObject({
      finishOnNextAdvance: true,
      exitOnLineCompleted: true,
    });

    engine.handleAction("markLineCompleted", {});
    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(selectCurrentContext(engine).pointers.read.lineId).toBe("caller1");
  });

  it("supports immediate exit without unlocking and ignores an unlisted normal scene", () => {
    const { engine } = createEngine();
    const before = engine.selectSystemState();

    engine.handleActions({
      finishSceneReplay: {},
      exitSceneReplay: {},
    });
    expect(engine.selectSystemState()).toEqual(before);

    engine.handleActions({
      startSceneReplay: { sceneId: "firstMeeting" },
      exitSceneReplay: {},
    });
    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(engine.selectSystemState().global.accountReplayRegistry).toEqual(
      before.global.accountReplayRegistry,
    );
  });

  it("does not restore a dialog that started replay from its confirm actions", () => {
    const { engine } = createEngine();
    engine.handleActions({
      showConfirmDialog: {
        resourceId: "confirmReplay",
        confirmActions: {
          startSceneReplay: { sceneId: "firstMeeting" },
        },
      },
    });
    const confirmActions =
      engine.selectSystemState().global.confirmDialog.confirmActions;
    expect(Object.keys(confirmActions)[0]).toBe("hideConfirmDialog");

    engine.handleActions(confirmActions);
    expect(engine.selectIsSceneReplayActive()).toBe(true);
    expect(engine.selectSystemState().global.confirmDialog).toBeNull();

    engine.handleActions({ exitSceneReplay: {} });
    expect(engine.selectSystemState().global.confirmDialog).toBeNull();
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
      startSceneReplay: { sceneId: "firstMeeting" },
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
      startSceneReplay: { sceneId: "firstMeeting" },
      exitSceneReplay: {},
    });

    expect(selectCurrentContext(engine)).toMatchObject({
      pointers: { read: { lineId: "caller2" } },
      variables: { affection: 7 },
    });
  });

  it("ignores replay-owned line work already captured by an effect snapshot", () => {
    const projectData = createProjectData();
    projectData.story.scenes.main.sections.caller.lines[0].actions = {
      updateVariable: {
        id: "countCallerEntry",
        operations: [{ variableId: "affection", op: "increment", value: 1 }],
      },
    };
    let engine;
    const ticker = {
      add: vi.fn(),
      remove: vi.fn(),
    };
    const handlePendingEffects = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: { render: vi.fn() },
      ticker,
      handleUnhandledEffect: (effect) => {
        if (effect.name === "exitReplayBeforeOwnedLineWork") {
          engine.handleActions({ exitSceneReplay: {} });
        }
      },
    });
    engine = createRouteEngine({ handlePendingEffects });
    engine.init({
      initialState: {
        projectData,
        global: {
          accountViewedRegistry: { sections: [], resources: [] },
          accountReplayRegistry: { sceneIds: ["firstMeeting"] },
        },
      },
    });
    expect(selectCurrentContext(engine).variables.affection).toBe(2);

    engine.handleActions({
      appendPendingEffect: { name: "exitReplayBeforeOwnedLineWork" },
      startSceneReplay: { sceneId: "firstMeeting" },
    });

    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(selectCurrentContext(engine).variables.affection).toBe(2);
  });

  it("does not reuse captured line work after effect-driven replay navigation", () => {
    const projectData = createProjectData();
    projectData.story.scenes.firstMeeting.sections.replayBranch.lines[0].actions =
      {
        updateVariable: {
          id: "countBranchEntry",
          operations: [{ variableId: "affection", op: "increment", value: 1 }],
        },
        finishSceneReplay: {},
      };
    let engine;
    const handlePendingEffects = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: { render: vi.fn() },
      ticker: { add: vi.fn(), remove: vi.fn() },
      handleUnhandledEffect: (effect) => {
        if (effect.name === "routeReplayBeforeOwnedLineWork") {
          engine.handleActions({
            sectionTransition: { sectionId: "replayBranch" },
          });
        }
      },
    });
    engine = createRouteEngine({ handlePendingEffects });
    engine.init({
      initialState: {
        projectData,
        global: {
          accountViewedRegistry: { sections: [], resources: [] },
          accountReplayRegistry: { sceneIds: ["firstMeeting"] },
        },
      },
    });

    engine.handleActions({
      appendPendingEffect: { name: "routeReplayBeforeOwnedLineWork" },
      startSceneReplay: { sceneId: "firstMeeting" },
    });

    expect(selectCurrentContext(engine)).toMatchObject({
      pointers: { read: { sectionId: "replayBranch", lineId: "branch1" } },
      variables: { affection: 11 },
      sceneReplay: { entryId: 2 },
    });
  });

  it("does not reuse captured line work after restarting the same replay scene", () => {
    const projectData = createProjectData({
      replayLines: [
        {
          id: "replay1",
          actions: {
            updateVariable: {
              id: "countReplayStart",
              operations: [
                { variableId: "affection", op: "increment", value: 1 },
              ],
            },
          },
        },
      ],
    });
    let engine;
    const handlePendingEffects = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: { render: vi.fn() },
      ticker: { add: vi.fn(), remove: vi.fn() },
      handleUnhandledEffect: (effect) => {
        if (effect.name === "restartReplayBeforeOwnedLineWork") {
          engine.handleActions({
            exitSceneReplay: {},
            startSceneReplay: { sceneId: "firstMeeting" },
          });
        }
      },
    });
    engine = createRouteEngine({ handlePendingEffects });
    engine.init({
      initialState: {
        projectData,
        global: {
          accountViewedRegistry: { sections: [], resources: [] },
          accountReplayRegistry: { sceneIds: ["firstMeeting"] },
        },
      },
    });

    engine.handleActions({
      appendPendingEffect: { name: "restartReplayBeforeOwnedLineWork" },
      startSceneReplay: { sceneId: "firstMeeting" },
    });

    expect(selectCurrentContext(engine)).toMatchObject({
      pointers: { read: { sectionId: "replayStart", lineId: "replay1" } },
      variables: { affection: 11 },
      sceneReplay: { sceneId: "firstMeeting", entryId: 2 },
    });
  });

  it("derives replay defaults without cloning the full project graph", () => {
    const { engine } = createEngine();
    const structuredCloneSpy = vi.spyOn(globalThis, "structuredClone");

    engine.handleAction("startSceneReplay", { sceneId: "firstMeeting" });

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
      startSceneReplay: { sceneId: "firstMeeting" },
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
      startSceneReplay: { sceneId: "firstMeeting" },
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
      startSceneReplay: { sceneId: "firstMeeting" },
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
      startSceneReplay: { sceneId: "firstMeeting" },
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
      startSceneReplay: { sceneId: "firstMeeting" },
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
      startSceneReplay: { sceneId: "firstMeeting" },
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
        startSceneReplay: { sceneId: "secondMemory" },
      }),
    ).toThrow("Cannot start a scene replay while another replay is active");
  });

  it("rolls back replay entry when a later action in the batch fails", () => {
    const { engine } = createEngine();

    expect(() =>
      engine.handleActions({
        startSceneReplay: { sceneId: "firstMeeting" },
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

  it("preserves declared template-looking scene IDs through real action dispatch", () => {
    const sceneId = "${variables.routeName}";
    const projectData = createProjectData({
      sceneReplay: {
        pageSize: 1,
        replays: [
          {
            sceneId,
            title: "Literal ID",
            thumbnailImageId: "firstMeetingThumb",
          },
        ],
      },
    });
    projectData.story.scenes[sceneId] = projectData.story.scenes.firstMeeting;
    delete projectData.story.scenes.firstMeeting;
    const { engine } = createEngine({
      projectData,
      accountReplayRegistry: { sceneIds: [sceneId] },
    });

    engine.handleActions({
      startSceneReplay: { sceneId },
    });
    expect(engine.selectSceneReplay()).toMatchObject({
      isActive: true,
      activeSceneId: sceneId,
    });
  });

  it.each([
    [
      "a duplicate replay scene ID",
      (projectData) => {
        projectData.resources.sceneReplay.replays[1].sceneId = "firstMeeting";
      },
      'Duplicate scene replay sceneId "firstMeeting"',
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
      "an unknown scene",
      (projectData) => {
        projectData.resources.sceneReplay.replays[0].sceneId = "missing";
      },
      'references unknown scene "missing"',
    ],
    [
      "an invalid section initial line",
      (projectData) => {
        projectData.story.scenes.firstMeeting.sections.replayStart.initialLineId =
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
