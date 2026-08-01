import { describe, expect, it, vi } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
  findRenderElement,
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

const findLatestElement = (harness, id) =>
  findRenderElement(harness.renderStates.at(-1)?.elements, id);

const completeAndAdvance = (harness) => {
  harness.completeLatestRender();
  harness.engine.handleAction("nextLine", {});
};

describe("player interaction integration journeys", () => {
  it("uses the first manual click to complete an unfinished render", async () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });

    await harness.eventHandler("click", { actions: { nextLine: {} } });
    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.getState().global.isLineCompleted).toBe(true);

    await harness.eventHandler("click", { actions: { nextLine: {} } });
    expect(harness.getPointer().lineId).toBe("line2");
    expect(harness.getState().global.isLineCompleted).toBe(false);
  });

  it("uses the first manual click to reveal hidden dialogue", async () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("hideDialogueUI", {});

    await harness.eventHandler("click", { actions: { nextLine: {} } });
    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.getState().global.dialogueUIHidden).toBe(false);

    await harness.eventHandler("click", { actions: { nextLine: {} } });
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("cancels an active auto timer when auto mode stops", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { autoForwardDelay: 100 } },
      projectData: createLinearProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});
    expect(harness.ticker.size).toBe(1);

    harness.engine.handleAction("stopAutoMode", {});
    expect(harness.ticker.size).toBe(0);
    harness.ticker.tick(1000);

    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.getState().global.autoMode).toBe(false);
  });

  it("advances a blocking choice through the payload produced for the renderer", async () => {
    const projectData = createLinearProject({
      resources: {
        layouts: {
          choiceLayout: {
            elements: [
              {
                id: "choice-button",
                type: "rect",
                width: 300,
                height: 80,
                click: { payload: { actions: { nextLine: {} } } },
              },
            ],
          },
        },
      },
      lineActions: {
        line1: {
          choice: {
            resourceId: "choiceLayout",
            items: [{ id: "continue", content: "Continue" }],
          },
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });
    harness.completeLatestRender();
    expect(harness.engine.selectIsChoiceVisible()).toBe(true);
    const choiceButton = findLatestElement(harness, "choice-button");

    await harness.eventHandler("click", choiceButton.click.payload);

    expect(harness.getPointer().lineId).toBe("line2");
    expect(harness.engine.selectIsChoiceVisible()).toBe(false);
  });

  it("blocks a background advance while a choice is active", async () => {
    const projectData = createLinearProject({
      resources: {
        layouts: {
          choiceLayout: {
            elements: [{ id: "choice", type: "container" }],
          },
        },
      },
      lineActions: {
        line1: {
          choice: {
            resourceId: "choiceLayout",
            items: [{ id: "stay", content: "Stay" }],
          },
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });
    harness.completeLatestRender();

    await harness.eventHandler("click", { actions: { nextLine: {} } });

    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.engine.selectIsChoiceVisible()).toBe(true);
  });

  it("updates and submits a form using only rendered event payloads", async () => {
    const projectData = createLinearProject({
      resources: {
        variables: {
          playerName: { type: "string", scope: "context", default: "" },
        },
        layouts: {
          formLayout: {
            elements: [
              {
                id: "name-input",
                type: "input",
                field: "name",
                width: 300,
                height: 50,
              },
              {
                id: "submit-button",
                type: "container",
                formRole: "submit",
                width: 200,
                height: 70,
              },
            ],
          },
        },
      },
      lineActions: {
        line1: {
          form: {
            id: "profile",
            resourceId: "formLayout",
            fields: {
              name: {
                variableId: "playerName",
                required: true,
                trim: true,
              },
            },
            submitActions: { nextLine: {} },
          },
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });
    harness.completeLatestRender();
    const input = findLatestElement(harness, "name-input");

    await harness.eventHandler("change", {
      ...input.change.payload,
      _event: { value: "  Ada  " },
    });

    const submit = findLatestElement(harness, "submit-button");
    await harness.eventHandler("click", submit.click.payload);

    expect(harness.getPointer().lineId).toBe("line2");
    expect(harness.getState().contexts.at(-1).variables.playerName).toBe("Ada");
    expect(harness.engine.selectIsFormVisible()).toBe(false);
  });

  it("allows a concurrent variable update without dismissing a form", async () => {
    const projectData = createLinearProject({
      resources: {
        variables: {
          counter: { type: "number", scope: "context", default: 0 },
        },
        layouts: { formLayout: { elements: [] } },
      },
      lineActions: {
        line1: {
          form: { resourceId: "formLayout", fields: {} },
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });

    await harness.eventHandler("click", {
      actions: {
        updateVariable: {
          id: "incrementWhileEditing",
          operations: [{ variableId: "counter", op: "increment", value: 1 }],
        },
      },
    });

    expect(harness.getState().contexts.at(-1).variables.counter).toBe(1);
    expect(harness.engine.selectIsFormVisible()).toBe(true);
    expect(harness.getPointer().lineId).toBe("line1");
  });

  it("persists a settings batch as one final runtime snapshot", async () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });

    harness.engine.handleActions({
      setDialogueTextSpeed: { value: 73 },
      setAutoForwardDelay: { value: 1450 },
      setAutoForwardSpeed: { value: 62 },
      setSkipUnseenText: { value: true },
      setSkipTransitionsAndAnimations: { value: true },
      setSoundVolume: { value: 41 },
      setMusicVolume: { value: 52 },
      setMuteAll: { value: true },
    });

    await vi.waitFor(() => {
      expect(harness.persistence.saveGlobalRuntime).toHaveBeenCalledTimes(1);
    });
    expect(harness.engine.selectRuntime()).toMatchObject({
      dialogueTextSpeed: 73,
      autoForwardDelay: 1450,
      autoForwardSpeed: 62,
      skipUnseenText: true,
      skipTransitionsAndAnimations: true,
      soundVolume: 41,
      musicVolume: 52,
      muteAll: true,
    });
    expect(harness.persistence.saveGlobalRuntime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dialogueTextSpeed: 73,
        autoForwardDelay: 1450,
        autoForwardSpeed: 62,
        skipUnseenText: true,
        skipTransitionsAndAnimations: true,
        soundVolume: 41,
        musicVolume: 52,
        muteAll: true,
      }),
    );
  });

  it("stops skip before unseen text and resumes after the policy changes", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startSkipMode", {});

    harness.ticker.tick(80);
    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.getState().global.skipMode).toBe(false);

    harness.engine.handleAction("setSkipUnseenText", { value: true });
    harness.engine.handleAction("startSkipMode", {});
    harness.ticker.tick(80);

    expect(harness.getPointer().lineId).toBe("line2");
    expect(harness.getState().global.skipMode).toBe(true);
  });

  it("resets a single-line progression policy after entering its destination", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    harness.engine.handleAction("setNextLineConfig", {
      manual: { enabled: true, requireLineCompleted: false },
      auto: { enabled: false },
      applyMode: "singleLine",
    });

    harness.completeLatestRender();
    harness.engine.handleAction("nextLine", {});

    expect(harness.getPointer().lineId).toBe("line2");
    expect(harness.getState().global.nextLineConfig).toEqual({
      manual: { enabled: true, requireLineCompleted: false },
      auto: { enabled: false },
      applyMode: "persistent",
    });
  });

  it("executes deferred confirm actions from the rendered button payload", async () => {
    const projectData = createLinearProject({
      resources: {
        variables: {
          confirmation: {
            type: "string",
            scope: "context",
            default: "pending",
          },
        },
        layouts: {
          confirmLayout: {
            elements: [
              {
                id: "confirm-button",
                type: "rect",
                width: 240,
                height: 80,
                click: {
                  payload: { actions: "${confirmDialog.confirmActions}" },
                },
              },
            ],
          },
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });
    harness.engine.handleAction("showConfirmDialog", {
      resourceId: "confirmLayout",
      confirmActions: {
        updateVariable: {
          id: "confirmSelection",
          operations: [
            {
              variableId: "confirmation",
              op: "set",
              value: "_event.value",
            },
          ],
        },
      },
    });
    const button = findLatestElement(harness, "confirm-button");

    await harness.eventHandler("click", {
      ...button.click.payload,
      _event: { value: "accepted" },
    });

    expect(harness.getState().contexts.at(-1).variables.confirmation).toBe(
      "accepted",
    );
    expect(harness.getState().global.confirmDialog).toBeNull();
  });

  it("retries an external effect after its handler throws", () => {
    let attempts = 0;
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
      handleUnhandledEffect: (effect) => {
        if (effect.name !== "integration:retry") {
          throw new Error(`Unexpected effect ${effect.name}`);
        }
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary failure");
        }
      },
    });

    expect(() =>
      harness.engine.handleAction("appendPendingEffect", {
        name: "integration:retry",
      }),
    ).toThrow("temporary failure");
    expect(attempts).toBe(1);

    harness.engine.handleAction("setMenuPage", { value: "resume" });

    expect(attempts).toBe(2);
    expect(harness.engine.selectRuntime().menuPage).toBe("resume");
  });

  it("resolves event data through the renderer event boundary", async () => {
    const projectData = createLinearProject({
      resources: {
        variables: {
          score: { type: "number", scope: "context", default: 0 },
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });

    await harness.eventHandler("change", {
      _event: { value: 27 },
      actions: {
        updateVariable: {
          id: "eventValue",
          operations: [
            { variableId: "score", op: "set", value: "_event.value" },
          ],
        },
      },
    });

    expect(harness.getState().contexts.at(-1).variables.score).toBe(27);
  });

  it("renders overlay stack changes through the real effects pipeline", () => {
    const projectData = createLinearProject({
      resources: {
        layouts: {
          menu: {
            elements: [{ id: "menu-panel", type: "container" }],
          },
          details: {
            elements: [{ id: "details-panel", type: "container" }],
          },
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });

    harness.engine.handleAction("pushOverlay", {
      resourceId: "menu",
      resourceType: "layout",
    });
    expect(findLatestElement(harness, "menu-panel")).toBeDefined();

    harness.engine.handleAction("replaceLastOverlay", {
      resourceId: "details",
      resourceType: "layout",
    });
    expect(findLatestElement(harness, "menu-panel")).toBeUndefined();
    expect(findLatestElement(harness, "details-panel")).toBeDefined();

    harness.engine.handleAction("popOverlay", {});
    expect(findLatestElement(harness, "details-panel")).toBeUndefined();
    expect(harness.getState().global.overlayStack).toEqual([]);
  });

  it("records completed lines as viewed while advancing a player journey", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });

    completeAndAdvance(harness);

    expect(harness.getPointer().lineId).toBe("line2");
    expect(
      harness.getState().global.accountViewedRegistry.sections,
    ).toContainEqual({
      sectionId: "main",
      lastLineId: "line1",
    });
  });
});
