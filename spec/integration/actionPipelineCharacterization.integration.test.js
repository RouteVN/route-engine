import { readFileSync } from "node:fs";
import { loadAll } from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { createActionPipelineTranscriptHarness } from "./helpers/createActionPipelineTranscriptHarness.js";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
  findRenderElement,
} from "./helpers/createEngineIntegrationHarness.js";

const updateScore = (value) => ({
  updateVariable: {
    id: `score${value}`,
    operations: [{ variableId: "score", op: "increment", value }],
  },
});

const dialogue = (text) => ({
  mode: "adv",
  content: [{ text }],
});

const createPipelineProject = ({ sections, resources = {} }) =>
  createIntegrationProject({
    initialSectionId: Object.keys(sections)[0],
    resources: {
      variables: {
        score: { type: "number", scope: "context", default: 0 },
      },
      ...resources,
    },
    sections,
  });

const getScore = (harness) =>
  harness.getState().contexts.at(-1).variables.score;

const loadVtProject = (filename) => {
  const documents = loadAll(
    readFileSync(
      new URL(`../../vt/specs/robustness/${filename}`, import.meta.url),
      "utf8",
    ),
  ).filter((document) => document !== undefined);
  return documents.at(-1);
};

const findElement = (elements, elementId) =>
  elements.find((element) => element.id === elementId);

describe("action pipeline black-box characterization", () => {
  it("records stable rendered snapshots without lifecycle-specific render IDs", () => {
    const projectData = createPipelineProject({
      resources: {
        layouts: {
          markerLayout: {
            elements: [
              { id: "rendered-marker", type: "text", content: "Rendered" },
            ],
          },
        },
      },
      sections: {
        main: {
          lines: [
            {
              id: "line1",
              actions: { layout: { resourceId: "markerLayout" } },
            },
          ],
        },
      },
    });

    const trace = createActionPipelineTranscriptHarness({ projectData });
    const renderEntry = trace.transcript.find(({ type }) => type === "render");

    expect(renderEntry).toMatchObject({
      type: "render",
      sequence: 1,
      payload: {
        animations: [],
        audio: [],
      },
    });
    expect(renderEntry.payload).not.toHaveProperty("id");
    expect(
      findRenderElement(renderEntry.payload.elements, "rendered-marker"),
    ).toMatchObject({ type: "text", content: "Rendered" });
  });

  it("makes the initialized harness available to initial external effects", () => {
    let effectHarness;
    let initialPointer;
    const projectData = createPipelineProject({
      sections: {
        main: {
          lines: [
            {
              id: "line1",
              actions: {
                appendPendingEffect: { name: "pipeline:initial" },
              },
            },
          ],
        },
      },
    });

    const trace = createActionPipelineTranscriptHarness({
      projectData,
      onExternalEffect: (effect, { harness }) => {
        expect(effect.name).toBe("pipeline:initial");
        effectHarness = harness;
        initialPointer = harness.getPointer();
      },
    });

    expect(effectHarness).toBe(trace.harness);
    expect(initialPointer).toEqual({
      sceneId: "scene",
      sectionId: "main",
      lineId: "line1",
    });
  });

  it("tracks only successful lifecycle boundaries through every exposed path", async () => {
    const projectData = createPipelineProject({
      sections: {
        main: { lines: [{ id: "line1", actions: {} }] },
      },
    });
    const trace = createActionPipelineTranscriptHarness({ projectData });

    expect(trace.summarizeState().successfulLifecycleEpoch).toBe(1);

    trace.harness.reinitialize();
    expect(trace.summarizeState().successfulLifecycleEpoch).toBe(2);

    expect(() =>
      trace.harness.engine.init({
        namespace: "invalid-transcript-lifecycle",
        initialState: { projectData: {} },
      }),
    ).toThrow();
    expect(trace.summarizeState().successfulLifecycleEpoch).toBe(2);

    trace.harness.engine.dispose();
    expect(trace.summarizeState().successfulLifecycleEpoch).toBe(3);
    trace.harness.engine.dispose();
    expect(trace.summarizeState().successfulLifecycleEpoch).toBe(3);

    trace.reinitialize();
    expect(trace.summarizeState().successfulLifecycleEpoch).toBe(4);

    trace.harness.engine.init({
      namespace: "direct-transcript-lifecycle",
      initialState: { projectData },
    });
    expect(trace.summarizeState().successfulLifecycleEpoch).toBe(5);

    await trace.settlePersistence();
  });

  it("rejects ambiguous batched navigation before any action runs", async () => {
    const projectData = createPipelineProject({
      sections: {
        source: { lines: [{ id: "source", actions: {} }] },
        intermediate: {
          lines: [{ id: "intermediate", actions: updateScore(100) }],
        },
        final: {
          lines: [
            {
              id: "final",
              actions: {
                ...updateScore(10),
                appendPendingEffect: {
                  name: "pipeline:destination",
                  payload: { marker: "final" },
                },
              },
            },
          ],
        },
      },
    });
    const trace = createActionPipelineTranscriptHarness({ projectData });
    await trace.clearTranscript();

    expect(() =>
      trace.dispatchActions({
        ...updateScore(1),
        jumpToLine: { sectionId: "intermediate", lineId: "intermediate" },
        sectionTransition: { sectionId: "final" },
      }),
    ).toThrow(
      "action batch cannot contain multiple navigation actions: sectionTransition, jumpToLine",
    );

    expect(trace.transcript.map(({ type }) => type)).toEqual([
      "dispatch",
      "error",
    ]);
    expect(trace.summarizeState()).toMatchObject({
      pointer: { sectionId: "source", lineId: "source" },
      variables: { score: 0 },
      pendingEffects: [],
    });
  });

  it("rolls back state, effects, and rendering when store work fails before commit", async () => {
    const projectData = createPipelineProject({
      sections: { main: { lines: [{ id: "line1", actions: {} }] } },
    });
    const trace = createActionPipelineTranscriptHarness({ projectData });
    await trace.clearTranscript();

    expect(() =>
      trace.dispatchActions({
        ...updateScore(3),
        appendPendingEffect: { name: "pipeline:must-not-run" },
        rollbackByOffset: { offset: 0 },
      }),
    ).toThrow("rollbackByOffset requires a negative offset");

    expect(trace.transcript.map(({ type }) => type)).toEqual([
      "dispatch",
      "error",
    ]);
    expect(trace.summarizeState()).toMatchObject({
      pointer: { sectionId: "main", lineId: "line1" },
      variables: { score: 0 },
      pendingEffects: [],
    });
  });

  it("keeps a committed mutation and retries its effect after post-commit failure", async () => {
    let attempts = 0;
    const projectData = createPipelineProject({
      sections: { main: { lines: [{ id: "line1", actions: {} }] } },
    });
    const trace = createActionPipelineTranscriptHarness({
      projectData,
      onExternalEffect: (effect) => {
        if (effect.name !== "pipeline:retry") {
          throw new Error(`Unexpected effect ${effect.name}`);
        }
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary pipeline failure");
        }
      },
    });
    await trace.clearTranscript();

    expect(() =>
      trace.dispatchActions({
        appendPendingEffect: { name: "pipeline:retry" },
        ...updateScore(1),
      }),
    ).toThrow("temporary pipeline failure");
    expect(getScore(trace.harness)).toBe(1);
    expect(attempts).toBe(1);

    trace.dispatchActions({ setMenuPage: { value: "resume" } });

    expect(attempts).toBe(2);
    expect(trace.harness.engine.selectRuntime().menuPage).toBe("resume");
    expect(
      trace.transcript
        .filter(({ type }) => type === "externalEffect")
        .map(({ name }) => name),
    ).toEqual(["pipeline:retry", "pipeline:retry"]);
    expect(
      trace.transcript.filter(({ type }) => type === "render"),
    ).toHaveLength(2);
  });

  it("drains reentrant actions after the current effect without duplicating work", async () => {
    const projectData = createPipelineProject({
      sections: { main: { lines: [{ id: "line1", actions: {} }] } },
    });
    const trace = createActionPipelineTranscriptHarness({
      projectData,
      onExternalEffect: (effect, { engine }) => {
        if (effect.name === "pipeline:outer") {
          engine.handleActions({
            ...updateScore(1),
            appendPendingEffect: { name: "pipeline:inner" },
          });
        }
      },
    });
    await trace.clearTranscript();

    trace.dispatchActions({
      appendPendingEffect: { name: "pipeline:outer" },
    });

    expect(
      trace.transcript
        .filter(({ type }) => type === "externalEffect")
        .map(({ name }) => name),
    ).toEqual(["pipeline:outer", "pipeline:inner"]);
    expect(getScore(trace.harness)).toBe(1);
    expect(
      trace.transcript.filter(({ type }) => type === "render"),
    ).toHaveLength(1);
    expect(trace.summarizeState().pendingEffects).toEqual([]);
  });

  it("reconciles playback once after the complete outer action batch", async () => {
    const schedules = [];
    const projectData = createPipelineProject({
      sections: {
        main: {
          lines: [
            {
              id: "line1",
              actions: { dialogue: dialogue("A stable auto-forward line.") },
            },
            { id: "line2", actions: {} },
          ],
        },
      },
    });
    const harness = createEngineIntegrationHarness({
      projectData,
      onPlaybackSchedule: (schedule) => schedules.push(schedule),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});
    schedules.length = 0;
    const renderCount = harness.renderStates.length;

    harness.engine.handleActions({
      setAutoForwardDelay: { value: 2400 },
      setAutoForwardSpeed: { value: 75 },
      setMuteAll: { value: true },
    });

    expect({
      reconciliations: schedules.length,
      liveCallbacks: harness.ticker.size,
      renders: harness.renderStates.length - renderCount,
    }).toEqual({
      reconciliations: 1,
      liveCallbacks: 1,
      renders: 1,
    });
  });

  it("saves a destination line only after its actions, history, and checkpoint settle", async () => {
    const projectData = createPipelineProject({
      sections: {
        main: {
          lines: [
            {
              id: "source",
              actions: { dialogue: dialogue("Source") },
            },
            {
              id: "destination",
              actions: {
                dialogue: dialogue("Destination"),
                ...updateScore(5),
                saveSlot: { slotId: "destination", savedAt: 1700000000000 },
              },
            },
            { id: "after", actions: { dialogue: dialogue("After") } },
          ],
        },
      },
    });
    const trace = createActionPipelineTranscriptHarness({ projectData });
    trace.harness.completeLatestRender();
    await trace.clearTranscript();

    trace.dispatchActions({ nextLine: {} });
    await vi.waitFor(() => {
      const persistedSlots = trace.transcript
        .filter(
          ({ type, operation }) =>
            type === "persistence" && operation === "saveSlots",
        )
        .at(-1)?.payload;
      const persistedSlot = Object.values(persistedSlots ?? {}).find(
        ({ slotId }) => slotId === "destination",
      );
      const persistedContext = persistedSlot?.state?.contexts?.at(-1);
      expect({
        pointer: persistedContext?.pointers?.read,
        rollbackIndex: persistedContext?.rollback?.currentIndex,
        historyLength: persistedContext?.dialogueHistory?.currentLength,
      }).toEqual({
        pointer: { sectionId: "main", lineId: "destination" },
        rollbackIndex: 1,
        historyLength: 2,
      });
    });

    const persistedSlots = trace.transcript
      .filter(
        ({ type, operation }) =>
          type === "persistence" && operation === "saveSlots",
      )
      .at(-1).payload;
    const persistedSlot = Object.values(persistedSlots).find(
      ({ slotId }) => slotId === "destination",
    );
    const slotContext = persistedSlot.state.contexts.at(-1);
    const slotHistory = slotContext.dialogueHistory.entries.slice(
      0,
      slotContext.dialogueHistory.currentLength,
    );
    expect({
      pointer: slotContext.pointers.read,
      score: slotContext.variables.score,
      historyPointers: slotHistory.map(({ sectionId, lineId }) => ({
        sectionId,
        lineId,
      })),
    }).toEqual({
      pointer: { sectionId: "main", lineId: "destination" },
      score: 5,
      historyPointers: [
        { sectionId: "main", lineId: "source" },
        { sectionId: "main", lineId: "destination" },
      ],
    });

    const reloaded = createActionPipelineTranscriptHarness({
      projectData,
      global: { saveSlots: persistedSlots },
    });
    reloaded.dispatchActions({ loadSlot: { slotId: "destination" } });
    reloaded.dispatchActions({ rollbackByOffset: { offset: -1 } });

    expect(reloaded.summarizeState()).toMatchObject({
      pointer: { sectionId: "main", lineId: "source" },
      variables: { score: 0 },
      rollbackCheckpointIndex: 0,
    });
  });

  it("restores rollback state without replaying external line effects", async () => {
    const projectData = createPipelineProject({
      resources: {
        achievements: {
          firstLine: {
            type: "boolean",
            name: "First line",
            description: "Reached the first line.",
          },
        },
      },
      sections: {
        main: {
          lines: [
            {
              id: "line1",
              actions: {
                dialogue: dialogue("One"),
                ...updateScore(1),
                completeAchievement: { resourceId: "firstLine" },
              },
            },
            {
              id: "line2",
              actions: {
                dialogue: dialogue("Two"),
                ...updateScore(10),
              },
            },
          ],
        },
      },
    });
    const trace = createActionPipelineTranscriptHarness({ projectData });
    expect(
      trace.transcript
        .filter(({ type }) => type === "externalEffect")
        .map(({ name }) => name),
    ).toEqual(["completeAchievement"]);
    trace.harness.completeLatestRender();
    trace.dispatchActions({ nextLine: {} });
    expect(getScore(trace.harness)).toBe(11);
    expect(trace.summarizeState().rollbackCheckpointIndex).toBe(1);
    await trace.clearTranscript();

    trace.dispatchActions({ rollbackByOffset: { offset: -1 } });

    expect(trace.summarizeState()).toMatchObject({
      pointer: { sectionId: "main", lineId: "line1" },
      variables: { score: 1 },
      rollbackCheckpointIndex: 0,
    });
    expect(
      trace.transcript.filter(({ type }) => type === "externalEffect"),
    ).toEqual([]);
  });

  it("preserves repeated nested form effects through the renderer boundary", async () => {
    const projectData = createPipelineProject({
      resources: {
        layouts: { formLayout: { elements: [] } },
      },
      sections: {
        main: {
          lines: [
            {
              id: "form",
              actions: {
                form: { resourceId: "formLayout", fields: {} },
              },
            },
            { id: "done", actions: {} },
          ],
        },
      },
    });
    const trace = createActionPipelineTranscriptHarness({ projectData });
    trace.harness.completeLatestRender();
    const formKey = trace.harness.engine.selectActiveInteraction().formKey;
    await trace.clearTranscript();

    await trace.dispatchRendererEvent("click", {
      _interactionSource: "form",
      actions: {
        submitForm: {
          formKey,
          actions: {
            conditional: {
              branches: [
                {
                  when: true,
                  actions: {
                    appendPendingEffect: {
                      name: "pipeline:form-effect",
                      payload: { order: 1 },
                    },
                  },
                },
              ],
            },
            appendPendingEffect: {
              name: "pipeline:form-effect",
              payload: { order: 2 },
            },
            nextLine: {},
          },
        },
      },
    });

    expect(
      trace.transcript
        .filter(({ type }) => type === "externalEffect")
        .map(({ name, payload }) => ({ name, payload })),
    ).toEqual([
      { name: "pipeline:form-effect", payload: { order: 1 } },
      { name: "pipeline:form-effect", payload: { order: 2 } },
    ]);
    expect(trace.summarizeState()).toMatchObject({
      pointer: { sectionId: "main", lineId: "done" },
      interaction: null,
      pendingEffects: [],
    });
  });

  it("carries renderer event context through a conditional choice route exactly once", async () => {
    const projectData = createPipelineProject({
      resources: {
        layouts: { choiceLayout: { elements: [] } },
      },
      sections: {
        source: {
          lines: [
            {
              id: "choice",
              actions: {
                choice: {
                  resourceId: "choiceLayout",
                  items: [{ id: "go", content: [{ text: "Go" }] }],
                },
              },
            },
          ],
        },
        destination: {
          lines: [
            {
              id: "destination",
              actions: {
                ...updateScore(10),
                appendPendingEffect: { name: "pipeline:choice-destination" },
              },
            },
          ],
        },
      },
    });
    const trace = createActionPipelineTranscriptHarness({ projectData });
    trace.harness.completeLatestRender();
    await trace.clearTranscript();

    await trace.dispatchRendererEvent("click", {
      bypassChoice: true,
      _event: { allowed: true },
      actions: {
        conditional: {
          branches: [
            {
              when: { eq: [{ var: "_event.allowed" }, true] },
              actions: {
                ...updateScore(1),
                sectionTransition: { sectionId: "destination" },
              },
            },
          ],
        },
      },
    });

    expect(trace.summarizeState()).toMatchObject({
      pointer: { sectionId: "destination", lineId: "destination" },
      variables: { score: 11 },
      interaction: null,
    });
    expect(
      trace.transcript
        .filter(({ type }) => type === "externalEffect")
        .map(({ name }) => name),
    ).toEqual(["pipeline:choice-destination"]);
    expect(
      trace.transcript.filter(({ type }) => type === "render"),
    ).toHaveLength(1);
  });
});

describe("action pipeline VT project companions", () => {
  it("executes effect-owned navigation from the exact VT project once", async () => {
    const projectData = loadVtProject("effect-owned-line-actions.yaml");
    const harness = createEngineIntegrationHarness({
      projectData,
      handleUnhandledEffect: (effect, { engine }) => {
        if (effect.name !== "vt:dispatchActions") {
          throw new Error(`Unexpected VT effect ${effect.name}`);
        }
        engine.handleActions(effect.payload.actions);
      },
    });
    const clickPayload = findElement(
      projectData.resources.controls.sourceControl.elements,
      "run-button",
    ).click.payload;

    await harness.eventHandler("click", clickPayload);

    expect({
      pointer: harness.getPointer(),
      score: harness.getState().contexts.at(-1).variables.score,
    }).toEqual({
      pointer: { sectionId: "finalDestination", lineId: "final" },
      score: 10,
    });
  });

  it("rejects the exact VT mixed form/progression payload as one batch", async () => {
    const projectData = loadVtProject("form-mixed-action-guard.yaml");
    const harness = createEngineIntegrationHarness({ projectData });
    const clickPayload = findElement(
      projectData.resources.layouts.profileForm.elements,
      "malicious-button",
    ).click.payload;

    await harness.eventHandler("click", clickPayload);

    expect({
      pointer: harness.getPointer(),
      formVisible: harness.engine.selectIsFormVisible(),
      playerName: harness.getState().contexts.at(-1).variables.playerName,
      formDrafts: harness.getState().global.formDrafts,
    }).toEqual({
      pointer: { sceneId: "main", sectionId: "main", lineId: "formLine" },
      formVisible: true,
      playerName: "",
      formDrafts: {},
    });
  });

  it("restores context runtime using the exact VT next/next/back journey", async () => {
    const projectData = loadVtProject("context-runtime-rollback.yaml");
    const harness = createEngineIntegrationHarness({ projectData });
    const controlElements =
      projectData.resources.controls.runtimeControl.elements;
    const nextPayload = findElement(controlElements, "next-button").click
      .payload;
    const backPayload = findElement(controlElements, "back-button").click
      .payload;

    harness.completeLatestRender();
    await harness.eventHandler("click", nextPayload);
    harness.completeLatestRender();
    await harness.eventHandler("click", nextPayload);
    harness.completeLatestRender();
    await harness.eventHandler("click", backPayload);

    expect({
      pointer: harness.getPointer(),
      runtime: harness.engine.selectRuntime(),
    }).toMatchObject({
      pointer: { sectionId: "main", lineId: "line2" },
      runtime: {
        menuPage: "settings",
        menuEntryPoint: "pause",
        saveLoadPagination: 4,
      },
    });
  });
});
