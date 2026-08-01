import { describe, expect } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
} from "./helpers/createEngineIntegrationHarness.js";
import { itKnownDefect } from "./helpers/knownDefect.js";

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
  itKnownDefect(
    "restores authored context runtime when rolling back",
    ({ expectFailure }) => {
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
      expectFailure({
        observed: () =>
          expect(runtimeState).toMatchObject({
            saveLoadPagination: 1,
            menuPage: "",
            menuEntryPoint: "",
          }),
        desired: () =>
          expect(runtimeState).toMatchObject({
            saveLoadPagination: 4,
            menuPage: "settings",
            menuEntryPoint: "pause",
          }),
      });
    },
  );

  itKnownDefect(
    "restores interaction context runtime after save, load, and rollback",
    ({ expectFailure }) => {
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
      expectFailure({
        observed: () =>
          expect(runtimeState).toMatchObject({
            saveLoadPagination: 1,
            menuPage: "",
            menuEntryPoint: "",
          }),
        desired: () =>
          expect(runtimeState).toMatchObject({
            saveLoadPagination: 4,
            menuPage: "gallery",
            menuEntryPoint: "title",
          }),
      });
    },
  );

  itKnownDefect(
    "prunes removed rollback checkpoints during a live project update",
    ({ expectFailure }) => {
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
      expectFailure({
        observed: () =>
          expect(rollbackResult).toEqual({
            rollbackError: undefined,
            pointer: { sectionId: "main", lineId: "line2" },
            hasPresentation: true,
          }),
        desired: () =>
          expect(rollbackResult).toEqual({
            rollbackError: undefined,
            pointer: { sectionId: "main", lineId: "line1" },
            hasPresentation: true,
          }),
      });
    },
  );

  itKnownDefect(
    "removes a stale context value when its variable moves scope",
    ({ expectFailure }) => {
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
      expectFailure({
        observed: () =>
          expect(migratedValues).toEqual({ contextRoute: 7, accountRoute: 2 }),
        desired: () =>
          expect(migratedValues).toEqual({
            contextRoute: undefined,
            accountRoute: 2,
          }),
      });
    },
  );

  itKnownDefect(
    "drops incompatible historical variable operations after a type change",
    ({ expectFailure }) => {
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
      expectFailure({
        observed: () =>
          expect(rollbackResult).toEqual({
            rollbackError:
              'Operation "increment" is not valid for variable "route" of type "string". Valid operations: set',
            route: 1,
          }),
        desired: () =>
          expect(rollbackResult).toEqual({
            rollbackError: undefined,
            route: "safe",
          }),
      });
    },
  );

  itKnownDefect(
    "filters persisted values that violate the current variable type",
    ({ expectFailure }) => {
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
      expectFailure({
        observed: () =>
          expect(updateResult).toEqual({
            updateError:
              'Operation "increment" requires current value to be a number.',
            score: "stale",
          }),
        desired: () =>
          expect(updateResult).toEqual({ updateError: undefined, score: 1 }),
      });
    },
  );

  itKnownDefect(
    "keeps numeric-looking string slot IDs stable and loadable",
    ({ expectFailure }) => {
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
      expectFailure({
        observed: () =>
          expect(slotResult).toEqual({ slotId: 1, roundTrip: undefined }),
        desired: () =>
          expect(slotResult).toEqual({ slotId: "01", roundTrip: slot }),
      });
    },
  );

  itKnownDefect(
    "does not expose inherited object properties as save slots",
    ({ expectFailure }) => {
      const projectData = createProject({
        lines: [{ id: "line1", actions: {} }],
      });
      const { engine } = createEngineIntegrationHarness({ projectData });

      const inheritedSlotResult = {
        prototypeSlot: engine.selectSaveSlot({ slotId: "__proto__" }),
        constructorSlot: engine.selectSaveSlot({ slotId: "constructor" }),
      };
      expectFailure({
        observed: () =>
          expect({
            prototypeIsObject:
              typeof inheritedSlotResult.prototypeSlot === "object",
            constructorIsObject: inheritedSlotResult.constructorSlot === Object,
          }).toEqual({ prototypeIsObject: true, constructorIsObject: true }),
        desired: () =>
          expect(inheritedSlotResult).toEqual({
            prototypeSlot: undefined,
            constructorSlot: undefined,
          }),
      });
    },
  );

  itKnownDefect(
    "rejects non-finite slot IDs through the public action",
    ({ expectFailure }) => {
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
      expectFailure({
        observed: () => expect(saveError).toBeUndefined(),
        desired: () => expect(saveError?.message ?? "").toMatch(/slotId/),
      });
    },
  );
});
