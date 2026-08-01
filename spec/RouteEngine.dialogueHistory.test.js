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

  it("keeps append occurrences separate after a section re-entry", () => {
    const projectData = createHistoryProjectData();
    projectData.story.scenes.main.sections.reentry = {
      initialLineId: "append-only",
      lines: [
        dialogueLine("append-only", "Repeated append", { append: true }),
        {
          id: "reenter",
          actions: { sectionTransition: { sectionId: "reentry" } },
        },
      ],
    };
    const engine = createEngine(projectData);

    engine.handleAction("sectionTransition", { sectionId: "reentry" });
    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Repeated append",
    ]);

    advance(engine);
    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Repeated append",
      "Repeated append",
    ]);
    expect(
      engine
        .selectSystemState()
        .contexts.at(-1)
        .dialogueHistory.entries.slice(-2),
    ).toEqual([
      { sectionId: "reentry", lineId: "append-only" },
      { sectionId: "reentry", lineId: "append-only" },
    ]);

    engine.handleAction("saveSlot", { slotId: 6, savedAt: 600 });
    engine.handleAction("sectionTransition", { sectionId: "alternate" });
    engine.handleAction("loadSlot", { slotId: 6 });
    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Repeated append",
      "Repeated append",
    ]);
  });

  it("projects a long single-section history with one action read per line", () => {
    const lineCount = 2000;
    let actionReads = 0;
    const lines = Array.from({ length: lineCount }, (_, index) => {
      const line = { id: `line-${index}` };
      const actions = {
        dialogue: { content: [{ text: `Line ${index}` }] },
      };
      Object.defineProperty(line, "actions", {
        enumerable: true,
        get: () => {
          actionReads += 1;
          return actions;
        },
      });
      return line;
    });
    const state = {
      projectData: {
        resources: createResources(),
        story: {
          scenes: {
            main: {
              sections: { long: { lines } },
            },
          },
        },
      },
      global: { variables: {} },
      contexts: [
        {
          pointers: {
            read: { sectionId: "long", lineId: `line-${lineCount - 1}` },
          },
          variables: {},
          dialogueHistory: {
            entries: Array.from({ length: lineCount }, (_, index) => ({
              sectionId: "long",
              lineId: `line-${index}`,
            })),
            currentLength: lineCount,
            checkpointLengths: [],
          },
        },
      ],
    };

    expect(selectDialogueHistory({ state })).toHaveLength(lineCount);
    expect(actionReads).toBe(lineCount);
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

  it("patches a line-authored save reached without a rollback checkpoint", () => {
    const projectData = createHistoryProjectData();
    projectData.story.scenes.main.sections.chapter.lines[0].actions.saveSlot = {
      slotId: 7,
      savedAt: 700,
    };
    const engine = createEngine(projectData);

    engine.handleAction("jumpToLine", {
      sectionId: "chapter",
      lineId: "chapter-1",
    });

    expect(
      engine.selectSystemState().global.saveSlots["7"].state.contexts[0]
        .dialogueHistory,
    ).toEqual({
      entries: [
        { sectionId: "introduction", lineId: "intro-1" },
        { sectionId: "chapter", lineId: "chapter-1" },
      ],
      currentLength: 2,
      checkpointLengths: [1],
    });

    engine.handleAction("loadSlot", { slotId: 7 });
    expect(getHistoryText(engine)).toEqual(["Introduction one", "Chapter one"]);
  });

  it("prunes stale historical lines and remaps rollback history lengths", () => {
    const projectData = createHistoryProjectData();
    const engine = createEngine(projectData);
    advance(engine);
    advance(engine);
    engine.handleAction("saveSlot", { slotId: 8, savedAt: 800 });

    const updatedProjectData = structuredClone(projectData);
    updatedProjectData.story.scenes.main.sections.introduction.lines =
      updatedProjectData.story.scenes.main.sections.introduction.lines.filter(
        (line) => line.id !== "intro-2",
      );
    engine.handleAction("updateProjectData", {
      projectData: updatedProjectData,
    });

    expect(() => engine.handleAction("loadSlot", { slotId: 8 })).not.toThrow();
    expect(getHistoryText(engine)).toEqual(["Introduction one", "Chapter one"]);
    expect(engine.selectSystemState().contexts.at(-1).dialogueHistory).toEqual({
      entries: [
        { sectionId: "introduction", lineId: "intro-1" },
        { sectionId: "chapter", lineId: "chapter-1" },
      ],
      currentLength: 2,
      checkpointLengths: [1, 1, 2],
    });
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

  it("loads engine-generated saves containing checkpoint-less jump history", () => {
    const projectData = createHistoryProjectData();
    const sourceEngine = createEngine(projectData);
    sourceEngine.handleAction("jumpToLine", {
      sectionId: "chapter",
      lineId: "chapter-1",
    });
    sourceEngine.handleAction("saveSlot", { slotId: 3, savedAt: 300 });
    const checkpointLessSave = structuredClone(
      sourceEngine.selectSystemState().global.saveSlots["3"],
    );
    expect(checkpointLessSave.state.contexts[0].dialogueHistory).toEqual({
      entries: [
        { sectionId: "introduction", lineId: "intro-1" },
        { sectionId: "chapter", lineId: "chapter-1" },
      ],
      currentLength: 2,
      checkpointLengths: [1],
    });

    const checkpointLessEngine = createEngine(projectData, {
      saveSlots: { 3: checkpointLessSave },
    });
    checkpointLessEngine.handleAction("loadSlot", { slotId: 3 });
    expect(getHistoryText(checkpointLessEngine)).toEqual([
      "Introduction one",
      "Chapter one",
    ]);
    expect(
      checkpointLessEngine.selectSystemState().contexts.at(-1).dialogueHistory,
    ).toMatchObject({
      currentLength: 2,
      checkpointLengths: [1, 2],
    });

    advance(sourceEngine);
    sourceEngine.handleAction("saveSlot", { slotId: 4, savedAt: 400 });

    const saveSlot = structuredClone(
      sourceEngine.selectSystemState().global.saveSlots["4"],
    );
    expect(saveSlot.state.contexts[0].dialogueHistory).toEqual({
      entries: [
        { sectionId: "introduction", lineId: "intro-1" },
        { sectionId: "chapter", lineId: "chapter-1" },
        { sectionId: "chapter", lineId: "chapter-2" },
      ],
      currentLength: 3,
      checkpointLengths: [1, 3],
    });

    const engine = createEngine(projectData, {
      saveSlots: { 4: saveSlot },
    });
    engine.handleAction("loadSlot", { slotId: 4 });

    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Chapter one",
      "Chapter prefix: ",
    ]);
    expect(engine.selectSystemState().contexts.at(-1).dialogueHistory).toEqual({
      entries: [
        { sectionId: "introduction", lineId: "intro-1" },
        { sectionId: "chapter", lineId: "chapter-1" },
        { sectionId: "chapter", lineId: "chapter-2" },
      ],
      currentLength: 3,
      checkpointLengths: [1, 3],
    });

    engine.handleAction("rollbackByOffset", { offset: -1 });
    expect(getHistoryText(engine)).toEqual(["Introduction one"]);
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

  it("does not append across an undisplayed transient dialogue", () => {
    const projectData = createHistoryProjectData();
    projectData.story.scenes.main.sections.introduction.lines = [
      dialogueLine("displayed", "Displayed dialogue"),
      {
        id: "transient-append-base",
        actions: {
          dialogue: { content: [{ text: "Transient prefix: " }] },
          conditional: { branches: [{ when: false, actions: {} }] },
        },
      },
      dialogueLine("settled-append", "continued", { append: true }),
    ];
    const engine = createEngine(projectData);

    advance(engine);

    expect(getHistoryText(engine)).toEqual([
      "Displayed dialogue",
      "Transient prefix: continued",
    ]);
    expect(
      engine.selectSystemState().contexts.at(-1).dialogueHistory.entries,
    ).toEqual([
      { sectionId: "introduction", lineId: "displayed" },
      { sectionId: "introduction", lineId: "settled-append" },
    ]);

    engine.handleAction("saveSlot", { slotId: 9, savedAt: 900 });
    const legacySlot = structuredClone(
      engine.selectSystemState().global.saveSlots["9"],
    );
    delete legacySlot.state.contexts[0].dialogueHistory;
    const legacyEngine = createEngine(projectData, {
      saveSlots: { 9: legacySlot },
    });
    legacyEngine.handleAction("loadSlot", { slotId: 9 });
    expect(getHistoryText(legacyEngine)).toEqual([
      "Displayed dialogue",
      "Transient prefix: continued",
    ]);
  });

  it("records and reloads a same-line jump as a new occurrence", () => {
    const engine = createEngine(createHistoryProjectData());

    engine.handleAction("jumpToLine", {
      sectionId: "introduction",
      lineId: "intro-1",
    });
    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Introduction one",
    ]);

    engine.handleAction("saveSlot", { slotId: 10, savedAt: 1000 });
    engine.handleAction("sectionTransition", { sectionId: "alternate" });
    engine.handleAction("loadSlot", { slotId: 10 });
    expect(getHistoryText(engine)).toEqual([
      "Introduction one",
      "Introduction one",
    ]);
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
