import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import { selectDialogueHistory } from "../src/stores/system.store.js";

const createResources = () => ({
  layouts: {},
  sounds: {},
  images: {},
  videos: {},
  sprites: {},
  characters: {},
  variables: {},
  transforms: {},
  sectionTransitions: {},
  animations: {},
  fonts: {},
  colors: {},
  textStyles: {},
  controls: {},
});

const dialogueLine = (id, text, dialogue = {}) => ({
  id,
  actions: {
    dialogue: {
      content: [{ text }],
      ...dialogue,
    },
  },
});

const createHistoryProjectData = () => ({
  screen: { width: 1920, height: 1080 },
  resources: createResources(),
  story: {
    initialSceneId: "main",
    scenes: {
      main: {
        initialSectionId: "introduction",
        sections: {
          introduction: {
            lines: [
              dialogueLine("intro-1", "Introduction one"),
              dialogueLine("intro-2", "Introduction two"),
              {
                id: "to-chapter",
                actions: {
                  sectionTransition: { sectionId: "chapter" },
                },
              },
            ],
          },
          chapter: {
            lines: [
              dialogueLine("chapter-1", "Chapter one"),
              dialogueLine("chapter-2", "Chapter prefix: "),
              dialogueLine("chapter-3", "continued", { append: true }),
            ],
          },
          alternate: {
            lines: [dialogueLine("alternate-1", "Alternate branch")],
          },
          reset: {
            lines: [dialogueLine("reset-1", "Fresh story")],
          },
        },
      },
    },
  },
});

const createEngine = (projectData, global) => {
  let engine;
  const handlePendingEffects = (effects) => {
    effects.forEach((effect) => {
      if (effect.name === "handleLineActions") {
        engine.handleLineActions(effect.payload);
      }
    });
  };
  engine = createRouteEngine({ handlePendingEffects });
  engine.init({ initialState: { projectData, ...(global ? { global } : {}) } });
  return engine;
};

const advance = (engine) => {
  engine.handleAction("markLineCompleted", {});
  engine.handleAction("nextLine", {});
};

const getHistory = (engine) =>
  selectDialogueHistory({ state: engine.selectSystemState() });

const getHistoryText = (engine) =>
  getHistory(engine).map((entry) => entry.text);

describe("RouteEngine cross-section dialogue history", () => {
  it("keeps chronological dialogue across sections and preserves ADV append behavior", () => {
    const engine = createEngine(createHistoryProjectData());

    advance(engine);
    advance(engine);
    advance(engine);
    advance(engine);

    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Introduction two",
      "Chapter one",
      "Chapter prefix: continued",
    ]);
    expect(
      getHistory(engine).map(({ sectionId, lineId }) => ({
        sectionId,
        lineId,
      })),
    ).toEqual([
      { sectionId: "introduction", lineId: "intro-1" },
      { sectionId: "introduction", lineId: "intro-2" },
      { sectionId: "chapter", lineId: "chapter-1" },
      { sectionId: "chapter", lineId: "chapter-2" },
    ]);

    engine.handleAction("saveSlot", { slotId: 2, savedAt: 200 });
    engine.handleAction("sectionTransition", { sectionId: "alternate" });
    engine.handleAction("loadSlot", { slotId: 2 });
    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Introduction two",
      "Chapter one",
      "Chapter prefix: continued",
    ]);
  });

  it("restores slot-local history and patches saves authored on a dialogue line", () => {
    const projectData = createHistoryProjectData();
    projectData.story.scenes.main.sections.introduction.lines[0].actions.saveSlot =
      { slotId: 1, savedAt: 100 };
    const engine = createEngine(projectData);

    expect(
      engine.selectSystemState().global.saveSlots["1"].state.contexts[0]
        .dialogueHistory,
    ).toEqual({
      entries: [{ sectionId: "introduction", lineId: "intro-1" }],
      currentLength: 1,
      checkpointLengths: [1],
    });

    advance(engine);
    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Introduction two",
    ]);

    engine.handleAction("loadSlot", { slotId: 1 });
    expect(getHistoryText(engine)).toEqual(["Introduction one"]);
  });

  it("reconstructs history when loading an older slot without a history log", () => {
    const projectData = createHistoryProjectData();
    const engine = createEngine(projectData, {
      saveSlots: {
        1: {
          formatVersion: 1,
          slotId: 1,
          savedAt: 100,
          state: {
            contexts: [
              {
                currentPointerMode: "read",
                pointers: {
                  read: {
                    sectionId: "chapter",
                    lineId: "chapter-1",
                  },
                },
                configuration: {},
                views: [],
                bgm: {},
                variables: {},
                rollback: {
                  currentIndex: 3,
                  isRestoring: false,
                  replayStartIndex: 0,
                  timeline: [
                    { sectionId: "introduction", lineId: "intro-1" },
                    { sectionId: "introduction", lineId: "intro-2" },
                    { sectionId: "introduction", lineId: "to-chapter" },
                    { sectionId: "chapter", lineId: "chapter-1" },
                  ],
                },
              },
            ],
          },
        },
      },
    });

    engine.handleAction("loadSlot", { slotId: 1 });

    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Introduction two",
      "Chapter one",
    ]);
    expect(
      engine.selectSystemState().contexts.at(-1).dialogueHistory,
    ).toMatchObject({
      currentLength: 3,
      checkpointLengths: [1, 2, 2, 3],
    });
  });

  it("derives loaded history cursors from the rollback timeline", () => {
    const projectData = createHistoryProjectData();
    const sourceEngine = createEngine(projectData);
    advance(sourceEngine);
    advance(sourceEngine);
    sourceEngine.handleAction("saveSlot", { slotId: 4, savedAt: 400 });

    const saveSlot = structuredClone(
      sourceEngine.selectSystemState().global.saveSlots["4"],
    );
    saveSlot.state.contexts[0].dialogueHistory.currentLength = 0;
    saveSlot.state.contexts[0].dialogueHistory.checkpointLengths.fill(0);

    const engine = createEngine(projectData, {
      saveSlots: { 4: saveSlot },
    });
    engine.handleAction("loadSlot", { slotId: 4 });

    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Introduction two",
      "Chapter one",
    ]);
    expect(engine.selectSystemState().contexts.at(-1).dialogueHistory).toEqual({
      entries: [
        { sectionId: "introduction", lineId: "intro-1" },
        { sectionId: "introduction", lineId: "intro-2" },
        { sectionId: "chapter", lineId: "chapter-1" },
      ],
      currentLength: 3,
      checkpointLengths: [1, 2, 2, 3],
    });
  });

  it("moves the history cursor on rollback and prunes the abandoned branch", () => {
    const engine = createEngine(createHistoryProjectData());

    advance(engine);
    advance(engine);
    advance(engine);
    advance(engine);
    expect(getHistoryText(engine).at(-1)).toBe("Chapter prefix: continued");

    engine.handleAction("rollbackByOffset", { offset: -1 });
    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Introduction two",
      "Chapter one",
      "Chapter prefix: ",
    ]);

    engine.handleAction("sectionTransition", { sectionId: "alternate" });
    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Introduction two",
      "Chapter one",
      "Chapter prefix: ",
      "Alternate branch",
    ]);

    const context = engine.selectSystemState().contexts.at(-1);
    expect(context.dialogueHistory.entries).not.toContainEqual({
      sectionId: "chapter",
      lineId: "chapter-3",
    });
  });

  it("does not record a dialogue line that routes away before it can render", () => {
    const projectData = createHistoryProjectData();
    projectData.story.scenes.main.sections.introduction.lines = [
      {
        id: "transient-dialogue",
        actions: {
          dialogue: { content: [{ text: "Never displayed" }] },
          sectionTransition: { sectionId: "alternate" },
        },
      },
    ];
    const engine = createEngine(projectData);

    expect(getHistoryText(engine)).toEqual(["Alternate branch"]);
  });

  it("starts a fresh history when story state is reset", () => {
    const engine = createEngine(createHistoryProjectData());
    advance(engine);

    engine.handleAction("resetStoryAtSection", { sectionId: "reset" });

    expect(getHistoryText(engine)).toEqual(["Fresh story"]);
    expect(engine.selectSystemState().contexts.at(-1).dialogueHistory).toEqual({
      entries: [{ sectionId: "reset", lineId: "reset-1" }],
      currentLength: 1,
      checkpointLengths: [1],
    });
  });

  it("isolates scene-replay dialogue from the main story history", () => {
    const projectData = createHistoryProjectData();
    projectData.resources.images.memoryThumb = {
      fileId: "memory.png",
      width: 320,
      height: 180,
    };
    projectData.resources.sceneReplay = {
      pageSize: 1,
      replays: [
        {
          sceneId: "memory",
          title: "Memory",
          thumbnailImageId: "memoryThumb",
        },
      ],
    };
    projectData.story.scenes.memory = {
      initialSectionId: "memory-section",
      sections: {
        "memory-section": {
          lines: [
            dialogueLine("memory-1", "Replay-only dialogue"),
            { id: "memory-finish", actions: { finishSceneReplay: {} } },
          ],
        },
      },
    };
    const engine = createEngine(projectData, {
      accountReplayRegistry: { sceneIds: ["memory"] },
    });

    expect(getHistoryText(engine)).toEqual(["Introduction one"]);
    engine.handleAction("startSceneReplay", { sceneId: "memory" });
    expect(getHistoryText(engine)).toEqual(["Replay-only dialogue"]);

    engine.handleActions({ exitSceneReplay: {} });
    expect(getHistoryText(engine)).toEqual(["Introduction one"]);
  });
});
