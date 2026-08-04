import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { createActionPipelineTranscriptHarness } from "./helpers/createActionPipelineTranscriptHarness.js";
import {
  createDeferred,
  createIntegrationProject,
} from "./helpers/createEngineIntegrationHarness.js";

const readYaml = (relativePath) =>
  load(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

const getStoryActionTypes = () => {
  const storySchema = readYaml("../../src/schemas/projectData/story.yaml");
  return Object.keys(
    storySchema.properties.scenes.patternProperties["^.+$"].properties.sections
      .patternProperties["^.+$"].properties.lines.items.properties.actions
      .properties,
  );
};

const getStoreActionTypes = () => {
  const source = readFileSync(
    new URL("../../src/stores/system.store.js", import.meta.url),
    "utf8",
  );
  const actionBlock = source
    .split("    // Actions\n", 2)
    .at(1)
    ?.split("  };\n\n  return createStore", 1)
    .at(0);
  if (!actionBlock) {
    throw new Error("Unable to locate the system-store action inventory");
  }
  return [...actionBlock.matchAll(/^    ([A-Za-z][A-Za-z0-9]+),$/gm)].map(
    ([, actionType]) => actionType,
  );
};

const NON_AUTHORED_STORE_ACTION_TYPES = [
  "clearPendingEffects",
  "appendPendingEffect",
  "beginRollbackActionBatch",
  "endRollbackActionBatch",
  "markRollbackCheckpointTransient",
  "markSavedRollbackCheckpointTransient",
  "recordCurrentDialogueHistory",
  "addViewedLine",
  "addViewedResource",
  "musicRoomSoundReady",
  "musicRoomSoundProgress",
  "musicRoomSoundComplete",
  "musicRoomSoundError",
  "updateProjectData",
  "markLineCompleted",
  "nextLineFromSystem",
];

const TEST_ONLY_STORE_ACTION_TYPES = ["appendPendingEffect"];
const ENGINE_INTERNAL_STORE_ACTION_TYPES =
  NON_AUTHORED_STORE_ACTION_TYPES.filter(
    (actionType) => !TEST_ONLY_STORE_ACTION_TYPES.includes(actionType),
  );

const setVariable = (variableId, value, id = `set-${variableId}`) => ({
  updateVariable: {
    id: id.replace(/[^a-zA-Z0-9]/g, ""),
    operations: [{ variableId, op: "set", value }],
  },
});

const createMatrixProject = ({ line1Actions = {}, line2Actions = {} } = {}) =>
  createIntegrationProject({
    resources: {
      layouts: {
        choiceLayout: { elements: [] },
        formLayout: { elements: [] },
      },
      variables: {
        score: { type: "number", scope: "context", default: 0 },
        targetPage: {
          type: "string",
          scope: "context",
          default: "settings",
        },
      },
    },
    sections: {
      main: {
        lines: [
          { id: "line1", actions: line1Actions },
          { id: "line2", actions: line2Actions },
        ],
      },
    },
  });

const getScore = (trace) =>
  trace.harness.getState().contexts.at(-1).variables.score;

describe("action pipeline closed action inventory", () => {
  it("classifies every authored, presentation, store, internal, and test action", () => {
    const systemActionTypes = Object.keys(
      readYaml("../../src/schemas/systemActions.yaml").properties,
    );
    const presentationActionTypes = Object.keys(
      readYaml("../../src/schemas/presentationActions.yaml").properties,
    );
    const storyActionTypes = getStoryActionTypes();
    const storeActionTypes = getStoreActionTypes();

    expect(new Set(storyActionTypes)).toEqual(
      new Set([...presentationActionTypes, ...systemActionTypes]),
    );
    expect(
      systemActionTypes.filter((type) => !storeActionTypes.includes(type)),
    ).toEqual(["conditional"]);
    expect(
      storeActionTypes.filter((type) => !systemActionTypes.includes(type)),
    ).toEqual(NON_AUTHORED_STORE_ACTION_TYPES);
    expect(presentationActionTypes).toEqual([
      "cleanAll",
      "screen",
      "background",
      "dialogue",
      "character",
      "visual",
      "choice",
      "form",
      "sfx",
      "bgm",
      "voice",
      "control",
      "layout",
    ]);
    expect(TEST_ONLY_STORE_ACTION_TYPES).toEqual(["appendPendingEffect"]);
    expect(ENGINE_INTERNAL_STORE_ACTION_TYPES).toEqual([
      "clearPendingEffects",
      "beginRollbackActionBatch",
      "endRollbackActionBatch",
      "markRollbackCheckpointTransient",
      "markSavedRollbackCheckpointTransient",
      "recordCurrentDialogueHistory",
      "addViewedLine",
      "addViewedResource",
      "musicRoomSoundReady",
      "musicRoomSoundProgress",
      "musicRoomSoundComplete",
      "musicRoomSoundError",
      "updateProjectData",
      "markLineCompleted",
      "nextLineFromSystem",
    ]);
  });
});

describe("action pipeline dispatch and admission matrix", () => {
  it("keeps direct host actions raw while batches render templates incrementally", async () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject(),
    });
    await trace.clearTranscript();

    trace.dispatchAction("setMenuPage", {
      value: "${variables.targetPage}",
    });
    expect(trace.harness.engine.selectRuntime().menuPage).toBe(
      "${variables.targetPage}",
    );

    trace.dispatchActions({
      ...setVariable("targetPage", "backlog"),
      setMenuPage: { value: "${variables.targetPage}" },
    });

    expect(trace.harness.engine.selectRuntime().menuPage).toBe("backlog");
    expect(
      trace.transcript
        .filter(({ type }) => type === "dispatch")
        .map(({ source }) => source),
    ).toEqual(["host-single", "host"]);
  });

  it("keeps direct unknown actions raw but rolls back a batch whose unknown entry template fails", async () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject(),
    });
    const unknownPayload = Object.freeze({ value: "${missing()}" });
    await trace.clearTranscript();

    expect(() =>
      trace.dispatchAction("notAnAction", unknownPayload),
    ).not.toThrow();
    expect(trace.transcript.map(({ type }) => type)).toEqual([
      "dispatch",
      "settled",
    ]);
    await trace.clearTranscript();

    let thrownError;
    try {
      trace.dispatchActions({
        ...setVariable("score", 5),
        notAnAction: unknownPayload,
      });
    } catch (error) {
      thrownError = error;
    }
    expect({
      name: thrownError?.constructor?.name,
      message: thrownError?.message,
    }).toEqual({
      name: "JemplRenderError",
      message: "Render Error: Unknown function 'missing' (now)",
    });
    await trace.settlePersistence();
    expect(getScore(trace)).toBe(0);
    expect(
      trace.transcript.filter(({ type }) =>
        [
          "render",
          "externalEffect",
          "persistence",
          "playbackSchedule",
        ].includes(type),
      ),
    ).toEqual([]);
  });

  it("does not mutate caller-owned action or event payloads", () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject(),
    });
    const actions = {
      updateVariable: {
        id: "fromevent",
        operations: [{ variableId: "score", op: "set", value: "_event.score" }],
      },
    };
    const eventContext = { _event: { score: 9 } };
    const before = structuredClone({ actions, eventContext });

    trace.dispatchActions(actions, eventContext);

    expect({ actions, eventContext }).toEqual(before);
    expect(getScore(trace)).toBe(9);
  });

  it("admits an ordinary renderer action when no interaction owns input", async () => {
    const onRendererEvent = vi.fn(() => "general-observed");
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject(),
      onRendererEvent,
    });
    await trace.clearTranscript();

    const result = await trace.dispatchRendererEvent("click", {
      actions: { setMenuPage: { value: "settings" } },
    });

    expect(result).toBe("general-observed");
    expect(trace.harness.engine.selectRuntime().menuPage).toBe("settings");
    expect(onRendererEvent).toHaveBeenCalledOnce();
  });

  it("ignores stale authored line work captured for a previous pointer", async () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject({
        line1Actions: setVariable("score", 1, "line-one"),
        line2Actions: setVariable("score", 10, "line-two"),
      }),
    });
    trace.harness.completeLatestRender();
    trace.dispatchActions({ nextLine: {} });
    expect(getScore(trace)).toBe(10);
    await trace.clearTranscript();

    expect(
      trace.harness.engine.handleLineActions({
        pointer: { sectionId: "main", lineId: "line1" },
      }),
    ).toBe(false);
    expect(getScore(trace)).toBe(10);
    expect(trace.transcript).toEqual([]);
  });

  it("keeps choice admission permissive for an ordinary renderer update", async () => {
    const onRendererEvent = vi.fn(() => "choice-observed");
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject({
        line1Actions: {
          choice: {
            resourceId: "choiceLayout",
            items: [{ id: "continue", content: "Continue" }],
          },
        },
      }),
      onRendererEvent,
    });
    await trace.clearTranscript();

    const result = await trace.dispatchRendererEvent("click", {
      actions: setVariable("score", 4, "choice-update"),
    });

    expect(result).toBe("choice-observed");
    expect(getScore(trace)).toBe(4);
    expect(onRendererEvent).toHaveBeenCalledOnce();
  });

  it("admits matching form work with concurrent variable mutation", async () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject({
        line1Actions: {
          form: { resourceId: "formLayout", fields: {} },
        },
      }),
    });
    const { formKey } = trace.harness.engine.selectActiveInteraction();
    await trace.clearTranscript();

    await trace.dispatchRendererEvent("click", {
      _interactionSource: "form",
      actions: {
        ...setVariable("score", 6, "form-concurrent"),
        submitForm: {
          formKey,
          actions: { setMenuPage: { value: "submitted" } },
        },
      },
    });

    expect(getScore(trace)).toBe(6);
    expect(trace.harness.engine.selectRuntime().menuPage).toBe("submitted");
  });

  it("blocks an entire matching-form batch when one action type is forbidden", async () => {
    const onRendererEvent = vi.fn(() => "blocked-form-observed");
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject({
        line1Actions: {
          form: { resourceId: "formLayout", fields: {} },
        },
      }),
      onRendererEvent,
    });
    const { formKey } = trace.harness.engine.selectActiveInteraction();
    await trace.clearTranscript();

    const result = await trace.dispatchRendererEvent("click", {
      _interactionSource: "form",
      actions: {
        submitForm: { formKey },
        ...setVariable("score", 8, "must-not-run"),
        nextLine: {},
      },
    });

    expect(result).toBe("blocked-form-observed");
    expect(getScore(trace)).toBe(0);
    expect(trace.harness.getPointer().lineId).toBe("line1");
    expect(trace.harness.engine.selectIsFormVisible()).toBe(true);
    expect(onRendererEvent).toHaveBeenCalledOnce();
  });

  it("returns a mismatched form event to the host without dispatching it", async () => {
    const onRendererEvent = vi.fn(() => "stale-form-observed");
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject({
        line1Actions: {
          form: { resourceId: "formLayout", fields: {} },
        },
      }),
      onRendererEvent,
    });
    const { formKey } = trace.harness.engine.selectActiveInteraction();
    await trace.clearTranscript();

    const result = await trace.dispatchRendererEvent("change", {
      _interactionSource: "form",
      actions: {
        updateFormField: {
          formKey: `${formKey}:stale`,
          field: "name",
          value: "Ada",
        },
      },
    });

    expect(result).toBe("stale-form-observed");
    expect(trace.harness.getState().global.formDrafts).toEqual({});
    expect(trace.harness.engine.selectIsFormVisible()).toBe(true);
    expect(onRendererEvent).toHaveBeenCalledOnce();
  });

  it("rejects input when render ownership changes during preprocessing", async () => {
    const deferred = createDeferred();
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject({
        line2Actions: {
          form: { resourceId: "formLayout", fields: {} },
        },
      }),
      preprocessPayload: async (_eventName, payload) => {
        await deferred.promise;
        return payload;
      },
    });
    trace.harness.completeLatestRender();
    await trace.clearTranscript();

    const pending = trace.dispatchRendererEvent("click", {
      actions: setVariable("score", 12, "stale-preprocess"),
    });
    trace.harness.engine.handleAction("jumpToLine", {
      sectionId: "main",
      lineId: "line2",
    });
    deferred.resolve();

    expect(await pending).toBe(false);
    expect(getScore(trace)).toBe(0);
    expect(trace.harness.getPointer().lineId).toBe("line2");
    expect(trace.harness.engine.selectIsFormVisible()).toBe(true);
  });

  it("records engine-internal automatic progression as its own source", async () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject(),
    });
    trace.harness.completeLatestRender();
    await trace.clearTranscript();

    trace.dispatchInternalAction("nextLineFromSystem", {});

    expect(trace.harness.getPointer().lineId).toBe("line2");
    expect(trace.transcript.at(0)).toMatchObject({
      type: "dispatch",
      source: "engine-internal",
      actionType: "nextLineFromSystem",
    });
    expect(
      trace.transcript.filter(({ type }) => type === "playbackSchedule"),
    ).toHaveLength(1);
  });

  it("returns before all policy hooks when selecting the active L10n package", async () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createMatrixProject(),
      l10nData: {
        packages: {
          packageA: { language: "Language A", files: [], patches: [] },
        },
      },
      global: { runtime: { localizationPackageId: "packageA" } },
    });
    await trace.clearTranscript();

    trace.dispatchActions({
      updateLocalizationPackage: { l10nId: "packageA" },
    });
    await trace.settlePersistence();

    expect(trace.transcript.map(({ type }) => type)).toEqual([
      "dispatch",
      "settled",
    ]);
    expect(trace.harness.engine.selectRuntime().localizationPackageId).toBe(
      "packageA",
    );
  });
});
