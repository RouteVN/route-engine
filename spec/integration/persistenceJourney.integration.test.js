import { describe, expect, it, vi } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationResources,
} from "./helpers/createEngineIntegrationHarness.js";

const dialogueLine = (id, text, actions = {}) => ({
  id,
  actions: {
    dialogue: { content: [{ text }] },
    ...actions,
  },
});

const createJourneyProject = ({ variables, memoryLines } = {}) => ({
  screen: { width: 1280, height: 720 },
  resources: createIntegrationResources({
    images: {
      memoryThumb: {
        fileId: "memory-thumb.png",
        width: 320,
        height: 180,
      },
    },
    variables: {
      contextScore: {
        type: "number",
        scope: "context",
        default: 0,
      },
      accountFlag: {
        type: "boolean",
        scope: "account",
        default: false,
      },
      deviceTheme: {
        type: "string",
        scope: "device",
        default: "light",
      },
      profile: {
        type: "object",
        scope: "account",
        default: { route: "none" },
      },
      ...variables,
    },
    sceneReplay: {
      pageSize: 4,
      replays: [
        {
          sceneId: "memory",
          title: "Memory",
          thumbnailImageId: "memoryThumb",
          initialVariables: { contextScore: 100 },
        },
      ],
    },
  }),
  story: {
    initialSceneId: "main",
    scenes: {
      main: {
        initialSectionId: "opening",
        sections: {
          opening: {
            lines: [
              dialogueLine("opening-1", "Opening one"),
              dialogueLine("opening-2", "Opening two"),
              dialogueLine("opening-3", "Opening three"),
            ],
          },
          branchA: {
            lines: [
              dialogueLine("branch-a-1", "Branch A one"),
              dialogueLine("branch-a-2", "Branch A two"),
            ],
          },
          branchB: {
            lines: [
              dialogueLine("branch-b-1", "Branch B one"),
              dialogueLine("branch-b-2", "Branch B two"),
            ],
          },
        },
      },
      memory: {
        initialSectionId: "memoryStart",
        sections: {
          memoryStart: {
            lines: memoryLines ?? [
              dialogueLine("memory-1", "Memory one"),
              dialogueLine("memory-2", "Memory two", {
                finishSceneReplay: {},
              }),
            ],
          },
        },
      },
    },
  },
});

const createJapanesePackage = () => ({
  language: "Japanese",
  files: [],
  patches: [
    {
      type: "line.dialogue",
      lineId: "opening-1",
      payload: { content: [{ text: "日本語の冒頭" }] },
    },
  ],
});

const advance = (engine) => {
  engine.handleAction("markLineCompleted", {});
  engine.handleAction("nextLine", {});
};

const currentContext = (engine) => engine.selectSystemState().contexts.at(-1);

const currentPointer = (engine) => currentContext(engine).pointers.read;

const historyEntries = (engine) => {
  const context = currentContext(engine);
  return (context.dialogueHistory?.entries ?? []).slice(
    0,
    context.dialogueHistory?.currentLength ?? 0,
  );
};

const currentDialogueText = (engine) => {
  const state = engine.selectSystemState();
  const pointer = state.contexts.at(-1).pointers.read;
  for (const scene of Object.values(state.projectData.story.scenes)) {
    const section = scene.sections?.[pointer.sectionId];
    const line = section?.lines?.find(({ id }) => id === pointer.lineId);
    if (line) {
      return line.actions?.dialogue?.content?.map(({ text }) => text).join("");
    }
  }
  return undefined;
};

describe("engine persistence journeys", () => {
  it("round-trips story state while keeping newer device and account values", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });
    const { engine } = harness;

    engine.handleAction("updateVariable", {
      id: "establishSaveState",
      operations: [
        { variableId: "contextScore", op: "set", value: 5 },
        { variableId: "accountFlag", op: "set", value: true },
        { variableId: "deviceTheme", op: "set", value: "dark" },
      ],
    });
    advance(engine);
    engine.handleAction("saveSlot", { slotId: "journey", savedAt: 10 });

    engine.handleAction("updateVariable", {
      id: "mutateAfterSave",
      operations: [
        { variableId: "contextScore", op: "set", value: 99 },
        { variableId: "accountFlag", op: "set", value: false },
        { variableId: "deviceTheme", op: "set", value: "contrast" },
      ],
    });
    advance(engine);
    engine.handleAction("loadSlot", { slotId: "journey" });

    const state = harness.getState();
    expect(currentPointer(engine)).toMatchObject({
      sectionId: "opening",
      lineId: "opening-2",
    });
    expect(state.contexts.at(-1).variables.contextScore).toBe(5);
    expect(state.global.variables).toMatchObject({
      accountFlag: false,
      deviceTheme: "contrast",
    });
    expect(historyEntries(engine).map(({ lineId }) => lineId)).toEqual([
      "opening-1",
      "opening-2",
    ]);
  });

  it("keeps independent branch slots and loads each branch chronology", () => {
    const { engine } = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });

    advance(engine);
    engine.handleAction("saveSlot", { slotId: "opening", savedAt: 1 });
    engine.handleAction("sectionTransition", { sectionId: "branchA" });
    engine.handleAction("saveSlot", { slotId: "a", savedAt: 2 });
    engine.handleAction("sectionTransition", { sectionId: "branchB" });
    engine.handleAction("saveSlot", { slotId: "b", savedAt: 3 });

    engine.handleAction("loadSlot", { slotId: "a" });
    expect(currentPointer(engine)).toMatchObject({
      sectionId: "branchA",
      lineId: "branch-a-1",
    });
    expect(historyEntries(engine).map(({ lineId }) => lineId)).toEqual([
      "opening-1",
      "opening-2",
      "branch-a-1",
    ]);

    engine.handleAction("loadSlot", { slotId: "b" });
    expect(currentPointer(engine)).toMatchObject({
      sectionId: "branchB",
      lineId: "branch-b-1",
    });
    expect(Object.keys(engine.selectSaveSlotMap()).sort()).toEqual([
      "a",
      "b",
      "opening",
    ]);
  });

  it("overwrites a slot atomically with its newest pointer and variables", () => {
    const { engine } = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });

    engine.handleAction("updateVariable", {
      id: "firstValue",
      operations: [{ variableId: "contextScore", op: "set", value: 1 }],
    });
    engine.handleAction("saveSlot", { slotId: "quick", savedAt: 1 });
    advance(engine);
    engine.handleAction("updateVariable", {
      id: "secondValue",
      operations: [{ variableId: "contextScore", op: "set", value: 2 }],
    });
    engine.handleAction("saveSlot", { slotId: "quick", savedAt: 2 });
    advance(engine);

    engine.handleAction("loadSlot", { slotId: "quick" });

    expect(engine.selectSaveSlot({ slotId: "quick" }).savedAt).toBe(2);
    expect(currentPointer(engine).lineId).toBe("opening-2");
    expect(currentContext(engine).variables.contextScore).toBe(2);
  });

  it("treats a missing slot load as a no-op", () => {
    const { engine } = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });
    advance(engine);
    const before = engine.selectSystemState();

    engine.handleAction("loadSlot", { slotId: "missing" });

    expect(engine.selectSystemState()).toEqual(before);
  });

  it("restores the saved rollback branch instead of post-save navigation", () => {
    const { engine } = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });
    advance(engine);
    advance(engine);
    engine.handleAction("saveSlot", { slotId: "before-branch", savedAt: 1 });
    engine.handleAction("sectionTransition", { sectionId: "branchA" });
    advance(engine);

    engine.handleAction("loadSlot", { slotId: "before-branch" });
    engine.handleAction("rollbackByOffset", {});

    expect(currentPointer(engine)).toEqual({
      sectionId: "opening",
      lineId: "opening-2",
    });
    expect(
      historyEntries(engine).some(({ sectionId }) => sectionId === "branchA"),
    ).toBe(false);
  });

  it("truncates the abandoned rollback future when a new branch is entered", () => {
    const { engine } = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });
    advance(engine);
    advance(engine);
    engine.handleAction("rollbackByOffset", {});
    engine.handleAction("sectionTransition", { sectionId: "branchB" });
    engine.handleAction("saveSlot", { slotId: "fork", savedAt: 1 });

    expect(() =>
      engine.handleAction("rollbackToLine", {
        sectionId: "opening",
        lineId: "opening-3",
      }),
    ).toThrow(/not found.*rollback timeline/);

    engine.handleAction("loadSlot", { slotId: "fork" });
    expect(historyEntries(engine).map(({ lineId }) => lineId)).toEqual([
      "opening-1",
      "opening-2",
      "branch-b-1",
    ]);
  });

  it("round-trips checkpoint-less jump history and can still roll back", () => {
    const { engine } = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });

    engine.handleAction("jumpToLine", {
      sectionId: "opening",
      lineId: "opening-3",
    });
    engine.handleAction("saveSlot", { slotId: "jump", savedAt: 1 });
    engine.handleAction("sectionTransition", { sectionId: "branchA" });
    engine.handleAction("loadSlot", { slotId: "jump" });

    expect(historyEntries(engine).map(({ lineId }) => lineId)).toEqual([
      "opening-1",
      "opening-3",
    ]);
    engine.handleAction("rollbackByOffset", {});
    expect(currentPointer(engine).lineId).toBe("opening-1");
  });

  it("preserves repeated same-line jump occurrences through save and load", () => {
    const { engine } = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });

    engine.handleAction("jumpToLine", {
      sectionId: "opening",
      lineId: "opening-1",
    });
    engine.handleAction("saveSlot", { slotId: "loop", savedAt: 1 });
    engine.handleAction("sectionTransition", { sectionId: "branchA" });
    engine.handleAction("loadSlot", { slotId: "loop" });

    expect(historyEntries(engine).map(({ lineId }) => lineId)).toEqual([
      "opening-1",
      "opening-1",
    ]);
  });

  it("prunes removed historical lines when loading an older slot", () => {
    const initialProject = createJourneyProject();
    const { engine } = createEngineIntegrationHarness({
      projectData: initialProject,
    });
    advance(engine);
    advance(engine);
    engine.handleAction("saveSlot", { slotId: "before-edit", savedAt: 1 });

    const replacementProject = structuredClone(initialProject);
    replacementProject.story.scenes.main.sections.opening.lines.splice(1, 1);
    engine.handleAction("updateProjectData", {
      projectData: replacementProject,
    });
    engine.handleAction("loadSlot", { slotId: "before-edit" });

    expect(historyEntries(engine).map(({ lineId }) => lineId)).toEqual([
      "opening-1",
      "opening-3",
    ]);
    engine.handleAction("rollbackByOffset", {});
    expect(currentPointer(engine).lineId).toBe("opening-1");
  });

  it("rolls back context variables without rolling back device or account data", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });
    const { engine } = harness;
    engine.handleAction("updateVariable", {
      id: "lineOneValues",
      operations: [
        { variableId: "contextScore", op: "set", value: 1 },
        { variableId: "accountFlag", op: "set", value: true },
        { variableId: "deviceTheme", op: "set", value: "dark" },
      ],
    });
    advance(engine);
    engine.handleAction("updateVariable", {
      id: "lineTwoValues",
      operations: [
        { variableId: "contextScore", op: "set", value: 2 },
        { variableId: "accountFlag", op: "set", value: false },
        { variableId: "deviceTheme", op: "set", value: "contrast" },
      ],
    });

    engine.handleAction("rollbackByOffset", {});

    const state = harness.getState();
    expect(state.contexts.at(-1).variables.contextScore).toBe(1);
    expect(state.global.variables).toMatchObject({
      accountFlag: false,
      deviceTheme: "contrast",
    });
  });

  it("rolls back an entire action batch when a later action is invalid", async () => {
    const harness = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });
    const { engine, persistence } = harness;

    expect(() =>
      engine.handleActions({
        saveSlot: { slotId: "must-not-exist", savedAt: 1 },
        rollbackByOffset: { offset: 1 },
      }),
    ).toThrow(/negative offset/);
    await Promise.resolve();

    expect(engine.selectSaveSlot({ slotId: "must-not-exist" })).toBeUndefined();
    expect(persistence.saveSlots).not.toHaveBeenCalled();
  });

  it("rejects a malformed slot without partially replacing live state", () => {
    const projectData = createJourneyProject();
    const harness = createEngineIntegrationHarness({
      projectData,
      global: {
        saveSlots: {
          broken: {
            formatVersion: 1,
            slotId: "broken",
            savedAt: 1,
            state: { contexts: [] },
          },
        },
      },
    });
    const before = harness.getState();

    expect(() =>
      harness.engine.handleAction("loadSlot", { slotId: "broken" }),
    ).toThrow(/contexts must be a non-empty array/);
    expect(harness.getState()).toEqual(before);
  });

  it("persists localization selection independently from save slots", async () => {
    const projectData = createJourneyProject();
    const l10nData = {
      packages: { jp: createJapanesePackage() },
    };
    const harness = createEngineIntegrationHarness({ projectData, l10nData });
    const { engine, persistence } = harness;

    engine.handleAction("updateLocalizationPackage", { l10nId: "jp" });
    expect(currentDialogueText(engine)).toBe("日本語の冒頭");
    engine.handleAction("saveSlot", { slotId: "localized", savedAt: 1 });
    engine.handleAction("updateLocalizationPackage", { l10nId: null });
    engine.handleAction("loadSlot", { slotId: "localized" });

    expect(engine.selectRuntime().localizationPackageId).toBeNull();
    expect(currentDialogueText(engine)).toBe("Opening one");

    engine.handleAction("updateLocalizationPackage", { l10nId: "jp" });
    engine.handleAction("loadSlot", { slotId: "localized" });
    expect(engine.selectRuntime().localizationPackageId).toBe("jp");
    expect(currentDialogueText(engine)).toBe("日本語の冒頭");

    await vi.waitFor(() => {
      expect(persistence.saveGlobalRuntime).toHaveBeenCalled();
    });
    const persistedRuntime = persistence.saveGlobalRuntime.mock.calls.at(-1)[0];
    const restarted = createEngineIntegrationHarness({
      projectData,
      l10nData,
      global: { runtime: persistedRuntime },
    });
    expect(restarted.engine.selectRuntime().localizationPackageId).toBe("jp");
    expect(currentDialogueText(restarted.engine)).toBe("日本語の冒頭");
  });

  it("falls back to canonical content when a persisted package is unavailable", () => {
    const { engine } = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
      l10nData: { packages: {} },
      global: { runtime: { localizationPackageId: "retired-package" } },
    });

    expect(engine.selectRuntime().localizationPackageId).toBeNull();
    expect(currentDialogueText(engine)).toBe("Opening one");
  });

  it("reapplies the selected localization after canonical project replacement", () => {
    const initialProject = createJourneyProject();
    const replacementProject = createJourneyProject();
    replacementProject.story.scenes.main.sections.opening.lines[0].actions.dialogue.content =
      [{ text: "Updated canonical opening" }];
    const { engine } = createEngineIntegrationHarness({
      projectData: initialProject,
      l10nData: { packages: { jp: createJapanesePackage() } },
      global: { runtime: { localizationPackageId: "jp" } },
    });

    engine.handleAction("updateProjectData", {
      projectData: replacementProject,
    });

    expect(engine.selectRuntime().localizationPackageId).toBe("jp");
    expect(currentDialogueText(engine)).toBe("日本語の冒頭");
    engine.handleAction("updateLocalizationPackage", { l10nId: null });
    expect(currentDialogueText(engine)).toBe("Updated canonical opening");
  });
});

describe("scene replay persistence journeys", () => {
  it("keeps a normal-story replay unlock after loading an older save", async () => {
    const harness = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
      global: { accountReplayRegistry: { sceneIds: [] } },
    });
    const { engine, persistence } = harness;
    engine.handleAction("saveSlot", { slotId: "before-unlock", savedAt: 1 });
    engine.handleAction("sectionTransition", { sectionId: "memoryStart" });
    advance(engine);

    expect(harness.getState().global.accountReplayRegistry.sceneIds).toEqual([
      "memory",
    ]);
    engine.handleAction("loadSlot", { slotId: "before-unlock" });
    expect(harness.getState().global.accountReplayRegistry.sceneIds).toEqual([
      "memory",
    ]);
    await vi.waitFor(() => {
      expect(persistence.applyScopedDataUpdates).toHaveBeenCalledWith([
        {
          scope: "account",
          path: "replayRegistry",
          op: "unlock",
          value: { sceneIds: ["memory"] },
        },
      ]);
    });
  });

  it("isolates replay variables and history, then restores the caller", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
      global: { accountReplayRegistry: { sceneIds: ["memory"] } },
    });
    const { engine } = harness;
    engine.handleAction("updateVariable", {
      id: "callerScore",
      operations: [{ variableId: "contextScore", op: "set", value: 7 }],
    });
    const callerHistory = historyEntries(engine);

    engine.handleAction("startSceneReplay", { sceneId: "memory" });
    expect(currentContext(engine).variables.contextScore).toBe(100);
    engine.handleAction("updateVariable", {
      id: "replayScore",
      operations: [{ variableId: "contextScore", op: "set", value: 110 }],
    });
    advance(engine);
    advance(engine);

    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(currentPointer(engine)).toEqual({
      sceneId: "main",
      sectionId: "opening",
      lineId: "opening-1",
    });
    expect(currentContext(engine).variables.contextScore).toBe(7);
    expect(historyEntries(engine)).toEqual(callerHistory);
  });

  it("rejects save, load, and persistent-variable mutation during replay", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
      global: { accountReplayRegistry: { sceneIds: ["memory"] } },
    });
    const { engine } = harness;
    engine.handleAction("saveSlot", { slotId: "caller", savedAt: 1 });
    engine.handleAction("startSceneReplay", { sceneId: "memory" });

    expect(() =>
      engine.handleAction("saveSlot", { slotId: "inside", savedAt: 2 }),
    ).toThrow(/Cannot save while a scene replay is active/);
    expect(() => engine.handleAction("loadSlot", { slotId: "caller" })).toThrow(
      /Cannot load while a scene replay is active/,
    );
    expect(() =>
      engine.handleAction("updateVariable", {
        id: "accountMutation",
        operations: [{ variableId: "accountFlag", op: "set", value: true }],
      }),
    ).toThrow(/while a scene replay is active/);
    expect(engine.selectIsSceneReplayActive()).toBe(true);

    engine.handleAction("exitSceneReplay", {});
    expect(engine.selectIsSceneReplayActive()).toBe(false);
    expect(engine.selectSaveSlot({ slotId: "inside" })).toBeUndefined();
  });

  it("reconstructs replay initial variables and line actions on rollback", () => {
    const projectData = createJourneyProject({
      memoryLines: [
        dialogueLine("memory-1", "Memory one", {
          updateVariable: {
            id: "memoryOneScore",
            operations: [
              { variableId: "contextScore", op: "increment", value: 1 },
            ],
          },
        }),
        dialogueLine("memory-2", "Memory two", {
          updateVariable: {
            id: "memoryTwoScore",
            operations: [
              { variableId: "contextScore", op: "increment", value: 2 },
            ],
          },
          finishSceneReplay: {},
        }),
      ],
    });
    const { engine } = createEngineIntegrationHarness({
      projectData,
      global: { accountReplayRegistry: { sceneIds: ["memory"] } },
    });

    engine.handleAction("startSceneReplay", { sceneId: "memory" });
    expect(currentContext(engine).variables.contextScore).toBe(101);
    advance(engine);
    expect(currentContext(engine).variables.contextScore).toBe(103);

    engine.handleAction("rollbackByOffset", {});

    expect(engine.selectIsSceneReplayActive()).toBe(true);
    expect(currentPointer(engine).lineId).toBe("memory-1");
    expect(currentContext(engine).variables.contextScore).toBe(101);
  });
});

describe("known persistence compatibility gaps", () => {
  it.fails("keeps the active pointer valid after a live project edit", () => {
    const initialProject = createJourneyProject();
    const harness = createEngineIntegrationHarness({
      projectData: initialProject,
    });
    advance(harness.engine);

    const replacementProject = structuredClone(initialProject);
    replacementProject.story.scenes.main.sections.opening.lines.splice(1, 1);
    harness.engine.handleAction("updateProjectData", {
      projectData: replacementProject,
    });

    const pointer = currentPointer(harness.engine);
    const activeSection =
      harness.getState().projectData.story.scenes.main.sections[
        pointer.sectionId
      ];
    expect(activeSection.lines.some(({ id }) => id === pointer.lineId)).toBe(
      true,
    );
  });

  it.fails("drops variables removed by a live project edit", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createJourneyProject(),
    });
    harness.engine.handleAction("updateVariable", {
      id: "valuesToRemove",
      operations: [
        { variableId: "contextScore", op: "set", value: 4 },
        { variableId: "accountFlag", op: "set", value: true },
      ],
    });
    const replacementProject = createJourneyProject();
    replacementProject.resources.variables = {};

    harness.engine.handleAction("updateProjectData", {
      projectData: replacementProject,
    });

    expect(currentContext(harness.engine).variables).not.toHaveProperty(
      "contextScore",
    );
    expect(harness.getState().global.variables).not.toHaveProperty(
      "accountFlag",
    );
  });

  it.fails(
    "keeps rollback usable after loading a save across a variable type change",
    () => {
      const initialProject = createJourneyProject();
      const harness = createEngineIntegrationHarness({
        projectData: initialProject,
      });
      const { engine } = harness;
      engine.handleAction("updateVariable", {
        id: "oldIncrement",
        operations: [{ variableId: "contextScore", op: "increment", value: 1 }],
      });
      advance(engine);
      advance(engine);
      engine.handleAction("saveSlot", { slotId: "old-type", savedAt: 1 });

      const replacementProject = createJourneyProject({
        variables: {
          contextScore: {
            type: "string",
            scope: "context",
            default: "safe",
          },
        },
      });
      engine.handleAction("updateProjectData", {
        projectData: replacementProject,
      });
      engine.handleAction("loadSlot", { slotId: "old-type" });

      expect(() => engine.handleAction("rollbackByOffset", {})).not.toThrow();
      expect(currentContext(engine).variables.contextScore).toBe("safe");
    },
  );
});
