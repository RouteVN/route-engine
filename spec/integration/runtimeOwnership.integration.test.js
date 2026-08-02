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
  it("executes destination line actions once after effect-driven navigation", () => {
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
    const score = harness.getState().contexts.at(-1).variables.score;
    expect(score).toBe(10);
  });

  it("drops an asynchronously preprocessed click after a newer render", async () => {
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
    const staleClickAccepted = await staleClick;

    expect({
      staleClickAccepted,
      settledLineId: harness.getPointer().lineId,
    }).toEqual({
      staleClickAccepted: false,
      settledLineId: "line2",
    });
  });

  it("blocks mixed form and progression actions as one unsafe batch", async () => {
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
    const interactionState = {
      formVisible: harness.engine.selectIsFormVisible(),
      lineCompleted: harness.getState().global.isLineCompleted,
    };
    expect(interactionState).toEqual({
      formVisible: true,
      lineCompleted: false,
    });
  });

  it("restarts an enabled authored timer when its delay changes", () => {
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

    const timerState = {
      lineId: harness.getPointer().lineId,
      timerCount: harness.ticker.size,
    };
    expect(timerState).toEqual({ lineId: "line1", timerCount: 1 });
  });

  it("reschedules global auto mode when its base delay changes", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { autoForwardDelay: 100 } },
      projectData: createLinearProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});
    harness.engine.handleAction("setAutoForwardDelay", { value: 1000 });

    harness.ticker.tick(100);

    const timerState = {
      lineId: harness.getPointer().lineId,
      timerCount: harness.ticker.size,
    };
    expect(timerState).toEqual({ lineId: "line1", timerCount: 1 });
  });

  it("clears authored auto state after manual advance at section end", () => {
    const projectData = createIntegrationProject({
      sections: { main: { lines: [{ id: "only", actions: {} }] } },
    });
    const harness = createEngineIntegrationHarness({ projectData });
    harness.engine.handleAction("setNextLineConfig", {
      auto: { enabled: true, trigger: "fromStart", delay: 100 },
    });

    harness.engine.handleAction("nextLine", {});

    expect(harness.ticker.size).toBe(0);
    const authoredAutoEnabled =
      harness.getState().global.nextLineConfig.auto.enabled;
    expect(authoredAutoEnabled).toBe(false);
  });

  it("keeps auto mode progressing after it reveals hidden dialogue", () => {
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

    const settledLineId = harness.getPointer().lineId;
    expect(settledLineId).toBe("line2");
  });

  it("accepts only the current render completion after reinitializing", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    const previousRenderId = harness.renderStates.at(-1).id;
    expect(harness.completeLatestRender()).toBe(true);

    harness.reinitialize();
    const currentRenderId = harness.renderStates.at(-1).id;

    const staleCompletionAccepted =
      harness.effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: previousRenderId,
        aborted: false,
      });
    const currentCompletionAccepted = harness.completeLatestRender();
    expect({
      renderIdsAreUnique: currentRenderId !== previousRenderId,
      staleCompletionAccepted,
      currentCompletionAccepted,
      lineCompleted: harness.getState().global.isLineCompleted,
    }).toEqual({
      renderIdsAreUnique: true,
      staleCompletionAccepted: false,
      currentCompletionAccepted: true,
      lineCompleted: true,
    });
  });

  it("clears ticker callbacks when reinitializing the same engine", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    harness.engine.handleAction("startSkipMode", {});
    expect(harness.ticker.size).toBe(1);

    harness.reinitialize();

    expect(harness.ticker.size).toBe(0);
  });
});
