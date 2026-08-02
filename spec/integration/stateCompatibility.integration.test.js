import { describe, expect, it } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
} from "./helpers/createEngineIntegrationHarness.js";

const createProject = ({ lines, variables = {} }) =>
  createIntegrationProject({
    resources: { variables },
    sections: { main: { lines } },
  });

const advance = (engine) => {
  engine.handleAction("markLineCompleted", {});
  engine.handleAction("nextLine", {});
};

describe("engine persistence and live-project integration regressions", () => {
  it("restores authored context runtime when rolling back", () => {
    const projectData = createProject({
      lines: [
        {
          id: "line1",
          actions: {
            setSaveLoadPagination: { value: 3 },
            setMenuPage: { value: "library" },
            setMenuEntryPoint: { value: "title" },
          },
        },
        {
          id: "line2",
          actions: {
            incrementSaveLoadPagination: {},
            setMenuPage: { value: "settings" },
            setMenuEntryPoint: { value: "pause" },
          },
        },
        { id: "line3", actions: {} },
      ],
    });
    const { engine } = createEngineIntegrationHarness({ projectData });

    advance(engine);
    advance(engine);
    engine.handleAction("rollbackByOffset", {});

    const runtimeState = engine.selectRuntime();
    expect(runtimeState).toMatchObject({
      saveLoadPagination: 4,
      menuPage: "settings",
      menuEntryPoint: "pause",
    });
  });

  it("replays authored save-page decrements during rollback", () => {
    const projectData = createProject({
      lines: [
        {
          id: "line1",
          actions: { setSaveLoadPagination: { value: 3 } },
        },
        {
          id: "line2",
          actions: { decrementSaveLoadPagination: {} },
        },
        { id: "line3", actions: {} },
      ],
    });
    const { engine } = createEngineIntegrationHarness({ projectData });

    advance(engine);
    expect(engine.selectRuntime().saveLoadPagination).toBe(2);
    advance(engine);
    engine.handleAction("rollbackByOffset", {});

    expect(engine.selectRuntime().saveLoadPagination).toBe(2);
  });

  it("restores interaction context runtime after save, load, and rollback", () => {
    const projectData = createProject({
      lines: [
        { id: "line1", actions: {} },
        { id: "line2", actions: {} },
      ],
    });
    const { engine } = createEngineIntegrationHarness({ projectData });
    engine.handleActions({
      setSaveLoadPagination: { value: 4 },
      setMenuPage: { value: "gallery" },
      setMenuEntryPoint: { value: "title" },
    });
    advance(engine);
    engine.handleActions({
      setSaveLoadPagination: { value: 9 },
      setMenuPage: { value: "save" },
      setMenuEntryPoint: { value: "pause" },
      saveSlot: { slotId: "slot" },
    });

    engine.handleAction("setMenuPage", { value: "temporary" });
    engine.handleAction("loadSlot", { slotId: "slot" });
    engine.handleAction("rollbackByOffset", {});

    const runtimeState = engine.selectRuntime();
    expect(runtimeState).toMatchObject({
      saveLoadPagination: 4,
      menuPage: "gallery",
      menuEntryPoint: "title",
    });
  });

  it("prunes removed rollback checkpoints during a live project update", () => {
    const initialProject = createProject({
      lines: ["line1", "line2", "line3"].map((id) => ({ id, actions: {} })),
    });
    const replacementProject = createProject({
      lines: ["line1", "line3"].map((id) => ({ id, actions: {} })),
    });
    const { engine } = createEngineIntegrationHarness({
      projectData: initialProject,
    });
    advance(engine);
    advance(engine);

    engine.handleAction("updateProjectData", {
      projectData: replacementProject,
    });
    let rollbackError;
    try {
      engine.handleAction("rollbackByOffset", {});
    } catch (error) {
      rollbackError = error;
    }
    const rollbackResult = {
      rollbackError: rollbackError?.message,
      pointer: engine.selectSystemState().contexts.at(-1).pointers.read,
      hasPresentation: engine.selectPresentationState() !== undefined,
    };
    expect(rollbackResult).toEqual({
      rollbackError: undefined,
      pointer: { sectionId: "main", lineId: "line1" },
      hasPresentation: true,
    });
  });

  it("removes a stale context value when its variable moves scope", () => {
    const lines = [{ id: "line1", actions: {} }];
    const initialProject = createProject({
      lines,
      variables: {
        route: { type: "number", scope: "context", default: 1 },
      },
    });
    const replacementProject = createProject({
      lines,
      variables: {
        route: { type: "number", scope: "account", default: 2 },
      },
    });
    const { engine } = createEngineIntegrationHarness({
      projectData: initialProject,
    });
    engine.handleAction("updateVariable", {
      id: "setContextRoute",
      operations: [{ variableId: "route", op: "set", value: 7 }],
    });

    engine.handleAction("updateProjectData", {
      projectData: replacementProject,
    });

    const state = engine.selectSystemState();
    const migratedValues = {
      contextRoute: state.contexts.at(-1).variables.route,
      accountRoute: state.global.variables.route,
    };
    expect(migratedValues).toEqual({
      contextRoute: undefined,
      accountRoute: 2,
    });
  });

  it("drops incompatible historical variable operations after a type change", () => {
    const lines = ["line1", "line2", "line3"].map((id) => ({
      id,
      actions: {},
    }));
    const initialProject = createProject({
      lines,
      variables: {
        route: { type: "number", scope: "context", default: 0 },
      },
    });
    const replacementProject = createProject({
      lines,
      variables: {
        route: { type: "string", scope: "context", default: "safe" },
      },
    });
    const { engine } = createEngineIntegrationHarness({
      projectData: initialProject,
    });
    engine.handleAction("updateVariable", {
      id: "incrementRoute",
      operations: [{ variableId: "route", op: "increment", value: 1 }],
    });
    advance(engine);
    advance(engine);
    engine.handleAction("updateProjectData", {
      projectData: replacementProject,
    });

    let rollbackError;
    try {
      engine.handleAction("rollbackByOffset", {});
    } catch (error) {
      rollbackError = error;
    }
    const rollbackResult = {
      rollbackError: rollbackError?.message,
      route: engine.selectSystemState().contexts.at(-1).variables.route,
    };
    expect(rollbackResult).toEqual({
      rollbackError: undefined,
      route: "safe",
    });
  });

  it("filters persisted values that violate the current variable type", () => {
    const projectData = createProject({
      lines: [{ id: "line1", actions: {} }],
      variables: {
        score: { type: "number", scope: "account", default: 0 },
      },
    });
    const { engine } = createEngineIntegrationHarness({
      projectData,
      global: { variables: { score: "stale" } },
    });

    let updateError;
    try {
      engine.handleAction("updateVariable", {
        id: "incrementScore",
        operations: [{ variableId: "score", op: "increment", value: 1 }],
      });
    } catch (error) {
      updateError = error;
    }
    const updateResult = {
      updateError: updateError?.message,
      score: engine.selectSystemState().global.variables.score,
    };
    expect(updateResult).toEqual({ updateError: undefined, score: 1 });
  });

  it("keeps numeric-looking string slot IDs stable and loadable", () => {
    const projectData = createProject({
      lines: [{ id: "line1", actions: {} }],
    });
    const { engine } = createEngineIntegrationHarness({ projectData });
    engine.handleAction("saveSlot", { slotId: "01", savedAt: 1 });

    const slot = engine.selectSaveSlot({ slotId: "01" });

    const slotResult = {
      slotId: slot.slotId,
      roundTrip: engine.selectSaveSlot({ slotId: slot.slotId }),
    };
    expect(slotResult).toEqual({ slotId: "01", roundTrip: slot });
  });

  it("does not expose inherited object properties as save slots", () => {
    const projectData = createProject({
      lines: [{ id: "line1", actions: {} }],
    });
    const { engine } = createEngineIntegrationHarness({ projectData });

    const inheritedSlotResult = {
      prototypeSlot: engine.selectSaveSlot({ slotId: "__proto__" }),
      constructorSlot: engine.selectSaveSlot({ slotId: "constructor" }),
    };
    expect(inheritedSlotResult).toEqual({
      prototypeSlot: undefined,
      constructorSlot: undefined,
    });
  });

  it("rejects non-finite slot IDs through the public action", () => {
    const projectData = createProject({
      lines: [{ id: "line1", actions: {} }],
    });
    const { engine } = createEngineIntegrationHarness({ projectData });

    let saveError;
    try {
      engine.handleAction("saveSlot", { slotId: Number.NaN });
    } catch (error) {
      saveError = error;
    }
    expect(saveError?.message ?? "").toMatch(/slotId/);
  });
});
