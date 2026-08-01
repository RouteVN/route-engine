import { describe, expect, it } from "vitest";
import {
  createDeferred,
  createEngineIntegrationHarness,
  createIntegrationProject,
} from "./helpers/createEngineIntegrationHarness.js";

const createLinearProject = ({ lineActions = {}, resources = {} } = {}) =>
  createIntegrationProject({
    resources,
    sections: {
      main: {
        lines: ["line1", "line2", "line3"].map((id) => ({
          id,
          actions: lineActions[id] ?? {},
        })),
      },
    },
  });

describe("engine/effects integration ownership regressions", () => {
  it.fails(
    "executes destination line actions once after effect-driven navigation",
    () => {
      const projectData = createIntegrationProject({
        resources: {
          variables: {
            score: { type: "number", scope: "context", default: 0 },
          },
        },
        initialSectionId: "source",
        sections: {
          source: { lines: [{ id: "source", actions: {} }] },
          firstDestination: {
            lines: [{ id: "first", actions: {} }],
          },
          finalDestination: {
            lines: [
              {
                id: "final",
                actions: {
                  updateVariable: {
                    id: "countFinalEntry",
                    operations: [
                      { variableId: "score", op: "increment", value: 10 },
                    ],
                  },
                },
              },
            ],
          },
        },
      });
      const harness = createEngineIntegrationHarness({
        projectData,
        handleUnhandledEffect: (effect, { engine }) => {
          if (effect.name === "integration:navigate") {
            engine.handleActions({
              sectionTransition: { sectionId: "finalDestination" },
            });
          }
        },
      });

      harness.engine.handleActions({
        appendPendingEffect: { name: "integration:navigate" },
        sectionTransition: { sectionId: "firstDestination" },
      });

      expect(harness.getPointer()).toEqual({
        sectionId: "finalDestination",
        lineId: "final",
      });
      expect(harness.getState().contexts.at(-1).variables.score).toBe(10);
    },
  );

  it.fails(
    "drops an asynchronously preprocessed click after a newer render",
    async () => {
      const deferred = createDeferred();
      const harness = createEngineIntegrationHarness({
        projectData: createLinearProject(),
        preprocessPayload: async (_eventName, payload) => {
          if (payload.defer === true) {
            await deferred.promise;
          }
          return payload;
        },
      });
      harness.completeLatestRender();

      const staleClick = harness.eventHandler("click", {
        defer: true,
        actions: { nextLine: {} },
      });
      harness.engine.handleActions({ nextLine: {} });
      harness.completeLatestRender();
      expect(harness.getPointer().lineId).toBe("line2");

      deferred.resolve();
      await staleClick;

      expect(harness.getPointer().lineId).toBe("line2");
    },
  );

  it.fails(
    "blocks mixed form and progression actions as one unsafe batch",
    async () => {
      const projectData = createLinearProject({
        resources: {
          layouts: { profileForm: { elements: [] } },
          variables: {
            playerName: { type: "string", scope: "context", default: "" },
          },
        },
        lineActions: {
          line1: {
            form: {
              resourceId: "profileForm",
              fields: {
                name: { variableId: "playerName", required: true },
              },
              submitActions: { nextLine: {} },
            },
          },
        },
      });
      const harness = createEngineIntegrationHarness({ projectData });
      const activeForm = harness.engine.selectActiveInteraction();

      await harness.eventHandler("change", {
        _interactionSource: "form",
        actions: {
          updateFormField: {
            formKey: activeForm.formKey,
            field: "name",
            value: "Ada",
          },
          nextLine: {},
        },
      });

      expect(harness.getPointer().lineId).toBe("line1");
      expect(harness.engine.selectIsFormVisible()).toBe(true);
      expect(harness.getState().global.isLineCompleted).toBe(false);
    },
  );

  it.fails("restarts an enabled authored timer when its delay changes", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    harness.engine.handleAction("setNextLineConfig", {
      auto: { enabled: true, trigger: "fromStart", delay: 100 },
    });
    harness.engine.handleAction("setNextLineConfig", {
      auto: { enabled: true, trigger: "fromStart", delay: 1000 },
    });

    harness.ticker.tick(100);

    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.ticker.size).toBe(1);
  });

  it.fails("reschedules global auto mode when its base delay changes", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { autoForwardDelay: 100 } },
      projectData: createLinearProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});
    harness.engine.handleAction("setAutoForwardDelay", { value: 1000 });

    harness.ticker.tick(100);

    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.ticker.size).toBe(1);
  });

  it.fails(
    "clears authored auto state after manual advance at section end",
    () => {
      const projectData = createIntegrationProject({
        sections: { main: { lines: [{ id: "only", actions: {} }] } },
      });
      const harness = createEngineIntegrationHarness({ projectData });
      harness.engine.handleAction("setNextLineConfig", {
        auto: { enabled: true, trigger: "fromStart", delay: 100 },
      });

      harness.engine.handleAction("nextLine", {});

      expect(harness.ticker.size).toBe(0);
      expect(harness.getState().global.nextLineConfig.auto.enabled).toBe(false);
    },
  );

  it.fails(
    "keeps auto mode progressing after it reveals hidden dialogue",
    () => {
      const harness = createEngineIntegrationHarness({
        global: { runtime: { autoForwardDelay: 100 } },
        projectData: createLinearProject(),
      });
      harness.completeLatestRender();
      harness.engine.handleAction("startAutoMode", {});
      harness.engine.handleAction("hideDialogueUI", {});

      harness.ticker.tick(100);
      expect(harness.getPointer().lineId).toBe("line1");
      expect(harness.getState().global.dialogueUIHidden).toBe(false);
      harness.ticker.tick(100);

      expect(harness.getPointer().lineId).toBe("line2");
    },
  );

  it.fails(
    "accepts render completion after reinitializing the same engine",
    () => {
      const harness = createEngineIntegrationHarness({
        projectData: createLinearProject(),
      });
      expect(harness.completeLatestRender()).toBe(true);

      harness.reinitialize();

      expect(harness.completeLatestRender()).toBe(true);
      expect(harness.getState().global.isLineCompleted).toBe(true);
    },
  );

  it.fails(
    "clears ticker callbacks when reinitializing the same engine",
    () => {
      const harness = createEngineIntegrationHarness({
        projectData: createLinearProject(),
      });
      harness.engine.handleAction("startSkipMode", {});
      expect(harness.ticker.size).toBe(1);

      harness.reinitialize();

      expect(harness.ticker.size).toBe(0);
    },
  );
});
