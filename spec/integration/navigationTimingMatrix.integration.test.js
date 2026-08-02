import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../../src/RouteEngine.js";
import createEffectsHandler from "../../src/createEffectsHandler.js";
import {
  createDeferred,
  createEngineIntegrationHarness,
  createIntegrationPersistence,
  createIntegrationProject,
  createIntegrationResources,
  createIntegrationTicker,
} from "./helpers/createEngineIntegrationHarness.js";

const createLinearProject = ({
  lineActions = {},
  lineIds = ["line1", "line2", "line3"],
  resources = {},
} = {}) =>
  createIntegrationProject({
    resources,
    sections: {
      main: {
        lines: lineIds.map((id) => ({
          id,
          actions: lineActions[id] ?? {},
        })),
      },
    },
  });

const createFormProject = ({ required = true } = {}) =>
  createLinearProject({
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
            name: {
              variableId: "playerName",
              ...(required ? { required: true } : {}),
            },
          },
          submitActions: { nextLine: {} },
        },
      },
    },
  });

const incrementScore = (value) => ({
  updateVariable: {
    id: `incrementScoreBy${value}`,
    operations: [{ variableId: "score", op: "increment", value }],
  },
});

const getContextVariable = (harness, variableId) =>
  harness.getState().contexts.at(-1).variables[variableId];

describe("public navigation and timing integration matrix", () => {
  it("accepts only the latest non-aborted render completion once", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    const firstRenderId = harness.renderStates.at(-1).id;

    harness.engine.handleAction("setMuteAll", { value: true });
    const latestRenderId = harness.renderStates.at(-1).id;

    expect(latestRenderId).not.toBe(firstRenderId);
    expect(
      harness.effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: firstRenderId,
      }),
    ).toBe(false);
    expect(
      harness.effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: latestRenderId,
        aborted: true,
      }),
    ).toBe(false);
    expect(harness.getState().global.isLineCompleted).toBe(false);

    expect(
      harness.effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: latestRenderId,
      }),
    ).toBe(true);
    expect(
      harness.effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: latestRenderId,
      }),
    ).toBe(false);
    expect(harness.getState().global.isLineCompleted).toBe(true);
  });

  it("starts global auto timing only after the active render completes", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { autoForwardDelay: 100 } },
      projectData: createLinearProject(),
    });

    harness.engine.handleAction("startAutoMode", {});
    expect(harness.ticker.size).toBe(0);

    expect(harness.completeLatestRender()).toBe(true);
    expect(harness.ticker.size).toBe(1);

    harness.ticker.tick(99);
    expect(harness.getPointer().lineId).toBe("line1");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("switches from skip to auto without retaining the skip cadence", () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { autoForwardDelay: 100 } },
      projectData: createLinearProject(),
    });
    harness.completeLatestRender();

    harness.engine.handleAction("startSkipMode", {});
    harness.engine.handleAction("startAutoMode", {});

    expect(harness.getState().global.skipMode).toBe(false);
    expect(harness.getState().global.autoMode).toBe(true);
    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(80);
    expect(harness.getPointer().lineId).toBe("line1");
    harness.ticker.tick(20);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("switches from auto to skip and advances at the skip cadence", () => {
    const harness = createEngineIntegrationHarness({
      global: {
        runtime: { autoForwardDelay: 1000, skipUnseenText: true },
      },
      projectData: createLinearProject(),
    });
    harness.completeLatestRender();

    harness.engine.handleAction("startAutoMode", {});
    harness.engine.handleAction("startSkipMode", {});

    expect(harness.getState().global.autoMode).toBe(false);
    expect(harness.getState().global.skipMode).toBe(true);
    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(79);
    expect(harness.getPointer().lineId).toBe("line1");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("cancels an authored timer when authored auto is disabled", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });

    harness.engine.handleAction("setNextLineConfig", {
      auto: { enabled: true, trigger: "fromStart", delay: 100 },
    });
    expect(harness.ticker.size).toBe(1);

    harness.engine.handleAction("setNextLineConfig", {
      auto: { enabled: false },
    });
    expect(harness.ticker.size).toBe(0);
    harness.ticker.tick(1000);
    expect(harness.getPointer().lineId).toBe("line1");
  });

  it("starts fromComplete authored timing after render completion", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });

    harness.engine.handleAction("setNextLineConfig", {
      auto: { enabled: true, trigger: "fromComplete", delay: 120 },
    });
    expect(harness.ticker.size).toBe(0);

    harness.completeLatestRender();
    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(119);
    expect(harness.getPointer().lineId).toBe("line1");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("starts fromStart authored timing before render completion", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });

    harness.engine.handleAction("setNextLineConfig", {
      auto: { enabled: true, trigger: "fromStart", delay: 100 },
    });
    expect(harness.getState().global.isLineCompleted).toBe(false);
    expect(harness.ticker.size).toBe(1);

    harness.ticker.tick(100);
    expect(harness.getPointer().lineId).toBe("line2");
  });

  it("settles destination line actions before starting its persistent timer", () => {
    const projectData = createIntegrationProject({
      initialSectionId: "source",
      sections: {
        source: {
          lines: [
            {
              id: "source",
              actions: {
                setNextLineConfig: {
                  auto: { enabled: true, trigger: "fromStart", delay: 1000 },
                },
              },
            },
          ],
        },
        destination: {
          lines: [
            {
              id: "destination1",
              actions: {
                setNextLineConfig: {
                  auto: { enabled: true, trigger: "fromStart", delay: 200 },
                },
              },
            },
            { id: "destination2", actions: {} },
          ],
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });
    expect(harness.ticker.size).toBe(1);

    harness.engine.handleActions({
      sectionTransition: { sectionId: "destination" },
    });

    expect(harness.getPointer().lineId).toBe("destination1");
    expect(harness.ticker.size).toBe(1);
    harness.ticker.tick(199);
    expect(harness.getPointer().lineId).toBe("destination1");
    harness.ticker.tick(1);
    expect(harness.getPointer().lineId).toBe("destination2");
  });

  it("executes only the final destination line actions for synchronous batched navigation", () => {
    const projectData = createIntegrationProject({
      resources: {
        variables: {
          score: { type: "number", scope: "context", default: 0 },
        },
      },
      initialSectionId: "source",
      sections: {
        source: { lines: [{ id: "source", actions: {} }] },
        intermediate: {
          lines: [{ id: "intermediate", actions: incrementScore(1) }],
        },
        final: {
          lines: [{ id: "final", actions: incrementScore(10) }],
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });

    harness.engine.handleActions({
      jumpToLine: { sectionId: "intermediate", lineId: "intermediate" },
      sectionTransition: { sectionId: "final" },
    });

    expect(harness.getPointer()).toEqual({
      sectionId: "final",
      lineId: "final",
    });
    expect(getContextVariable(harness, "score")).toBe(10);
  });

  it("executes an ordinary section destination line action exactly once", () => {
    const projectData = createIntegrationProject({
      resources: {
        variables: {
          score: { type: "number", scope: "context", default: 0 },
        },
      },
      initialSectionId: "source",
      sections: {
        source: { lines: [{ id: "source", actions: {} }] },
        destination: {
          lines: [{ id: "destination", actions: incrementScore(7) }],
        },
      },
    });
    const harness = createEngineIntegrationHarness({ projectData });

    harness.engine.handleActions({
      sectionTransition: { sectionId: "destination" },
    });

    expect(getContextVariable(harness, "score")).toBe(7);
  });

  it("rolls back an entire public action batch when a later action throws", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject({
        resources: {
          variables: {
            score: { type: "number", scope: "context", default: 0 },
          },
        },
      }),
    });
    const renderCount = harness.renderStates.length;

    expect(() =>
      harness.engine.handleActions({
        ...incrementScore(1),
        rollbackByOffset: { offset: 0 },
      }),
    ).toThrow("rollbackByOffset requires a negative offset");

    expect(getContextVariable(harness, "score")).toBe(0);
    expect(harness.renderStates).toHaveLength(renderCount);
  });

  it("rolls back outer mutations when a nested conditional action throws", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject({
        resources: {
          variables: {
            score: { type: "number", scope: "context", default: 0 },
          },
        },
      }),
    });

    expect(() =>
      harness.engine.handleActions({
        ...incrementScore(3),
        conditional: {
          branches: [
            {
              when: true,
              actions: { rollbackByOffset: { offset: 0 } },
            },
          ],
        },
      }),
    ).toThrow("rollbackByOffset requires a negative offset");

    expect(getContextVariable(harness, "score")).toBe(0);
  });

  it("rechecks interaction ownership after async preprocessing introduces a form", async () => {
    const deferred = createDeferred();
    const projectData = createLinearProject({
      resources: {
        layouts: { profileForm: { elements: [] } },
        variables: {
          playerName: { type: "string", scope: "context", default: "" },
        },
      },
      lineActions: {
        line2: {
          form: {
            resourceId: "profileForm",
            fields: {
              name: { variableId: "playerName", required: true },
            },
          },
        },
      },
    });
    const harness = createEngineIntegrationHarness({
      projectData,
      preprocessPayload: async (_eventName, payload) => {
        await deferred.promise;
        return payload;
      },
    });
    harness.completeLatestRender();

    const pendingEvent = harness.eventHandler("click", {
      actions: { nextLine: {} },
    });
    harness.engine.handleAction("jumpToLine", {
      sectionId: "main",
      lineId: "line2",
    });
    expect(harness.engine.selectIsFormVisible()).toBe(true);

    deferred.resolve();
    await pendingEvent;

    expect(harness.getPointer().lineId).toBe("line2");
    expect(harness.engine.selectIsFormVisible()).toBe(true);
  });

  it("rejects a renderer form event carrying a mismatched form key", async () => {
    const harness = createEngineIntegrationHarness({
      projectData: createFormProject(),
    });
    const activeForm = harness.engine.selectActiveInteraction();

    await harness.eventHandler("change", {
      _interactionSource: "form",
      actions: {
        updateFormField: {
          formKey: `${activeForm.formKey}:stale`,
          field: "name",
          value: "Ada",
        },
      },
    });

    expect(harness.getState().global.formDrafts).toEqual({});
    expect(harness.getPointer().lineId).toBe("line1");
  });

  it("commits a matching form event and runs nested submit actions", async () => {
    const harness = createEngineIntegrationHarness({
      projectData: createFormProject(),
    });
    const activeForm = harness.engine.selectActiveInteraction();

    await harness.eventHandler("change", {
      _interactionSource: "form",
      actions: {
        updateFormField: {
          formKey: activeForm.formKey,
          field: "name",
          value: "Ada",
        },
      },
    });
    expect(
      harness.getState().global.formDrafts[activeForm.formKey].values.name,
    ).toBe("Ada");

    await harness.eventHandler("click", {
      _interactionSource: "form",
      actions: {
        submitForm: {
          formKey: activeForm.formKey,
          actions: { nextLine: {} },
        },
      },
    });

    expect(harness.getPointer().lineId).toBe("line2");
    expect(getContextVariable(harness, "playerName")).toBe("Ada");
    expect(harness.getState().global.formDrafts).toEqual({});
  });

  it("keeps an invalid required form active without committing its variable", async () => {
    const harness = createEngineIntegrationHarness({
      projectData: createFormProject(),
    });
    const activeForm = harness.engine.selectActiveInteraction();

    await harness.eventHandler("click", {
      _interactionSource: "form",
      actions: {
        submitForm: {
          formKey: activeForm.formKey,
          actions: { nextLine: {} },
        },
      },
    });

    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.engine.selectIsFormVisible()).toBe(true);
    expect(getContextVariable(harness, "playerName")).toBe("");
    expect(
      harness.getState().global.formDrafts[activeForm.formKey].errors.name,
    ).toBeTruthy();
  });

  it("stops skip timing when rollback restores an earlier line", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleActions({ nextLine: {} });
    harness.completeLatestRender();
    harness.engine.handleAction("startSkipMode", {});
    expect(harness.ticker.size).toBe(1);

    harness.engine.handleAction("rollbackByOffset", { offset: -1 });

    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.getState().global.skipMode).toBe(false);
    expect(harness.ticker.size).toBe(0);
  });

  it("load clears active playback timers and restores the saved pointer", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("saveSlot", {
      slotId: 1,
      savedAt: 1700000000000,
    });
    harness.engine.handleActions({ nextLine: {} });
    harness.completeLatestRender();
    harness.engine.handleAction("startSkipMode", {});
    expect(harness.ticker.size).toBe(1);

    harness.engine.handleAction("loadSlot", { slotId: 1 });

    expect(harness.getPointer().lineId).toBe("line1");
    expect(harness.getState().global.autoMode).toBe(false);
    expect(harness.getState().global.skipMode).toBe(false);
    expect(harness.ticker.size).toBe(0);
  });

  it("isolates replay playback and restarts caller auto timing on exit", () => {
    const resources = createIntegrationResources({
      images: {
        replayThumb: {
          fileId: "replay.png",
          width: 320,
          height: 180,
        },
      },
      sceneReplay: {
        pageSize: 1,
        replays: [
          {
            sceneId: "replay",
            title: "Replay",
            thumbnailImageId: "replayThumb",
          },
        ],
      },
    });
    const projectData = {
      screen: { width: 1280, height: 720 },
      resources,
      story: {
        initialSceneId: "main",
        scenes: {
          main: {
            initialSectionId: "caller",
            sections: {
              caller: {
                lines: [
                  { id: "caller1", actions: {} },
                  { id: "caller2", actions: {} },
                ],
              },
            },
          },
          replay: {
            initialSectionId: "memory",
            sections: {
              memory: {
                lines: [{ id: "memory1", actions: {} }],
              },
            },
          },
        },
      },
    };
    const harness = createEngineIntegrationHarness({
      projectData,
      global: {
        runtime: { autoForwardDelay: 1000 },
        accountReplayRegistry: { sceneIds: ["replay"] },
      },
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});
    expect(harness.ticker.size).toBe(1);

    harness.engine.handleAction("startSceneReplay", { sceneId: "replay" });
    expect(harness.engine.selectIsSceneReplayActive()).toBe(true);
    expect(harness.getState().global.autoMode).toBe(false);
    expect(harness.ticker.size).toBe(0);

    harness.engine.handleAction("exitSceneReplay", {});
    expect(harness.engine.selectIsSceneReplayActive()).toBe(false);
    expect(harness.getPointer()).toMatchObject({
      sectionId: "caller",
      lineId: "caller1",
    });
    expect(harness.getState().global.autoMode).toBe(true);
    expect(harness.ticker.size).toBe(1);
  });

  it("pauses skip on a choice and resumes it after an authorized choice advance", async () => {
    const harness = createEngineIntegrationHarness({
      global: { runtime: { skipUnseenText: true } },
      projectData: createLinearProject({
        resources: { layouts: { choiceLayout: { elements: [] } } },
        lineActions: {
          line2: {
            choice: {
              resourceId: "choiceLayout",
              items: [{ id: "continue", content: [{ text: "Continue" }] }],
            },
          },
        },
      }),
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startSkipMode", {});

    harness.engine.handleAction("jumpToLine", {
      sectionId: "main",
      lineId: "line2",
    });
    expect(harness.getState().global.skipMode).toBe(true);
    expect(harness.engine.selectIsChoiceVisible()).toBe(true);
    expect(harness.ticker.size).toBe(0);
    harness.completeLatestRender();

    await harness.eventHandler("click", {
      bypassChoice: true,
      actions: { nextLine: {} },
    });

    expect(harness.getPointer().lineId).toBe("line3");
    expect(harness.getState().global.skipMode).toBe(true);
    expect(harness.ticker.size).toBe(1);
  });

  it("validates an effect snapshot before executing any of its effects", () => {
    const routeGraphics = { render: vi.fn() };
    const effectsHandler = createEffectsHandler({
      getEngine: () => ({
        prepareRenderState: () => ({ id: "render-1" }),
        selectHasPendingRenderWork: () => false,
      }),
      routeGraphics,
      ticker: createIntegrationTicker(),
      persistence: createIntegrationPersistence(),
    });

    expect(() =>
      effectsHandler([{ name: "render" }, { name: "unknownEffect" }]),
    ).toThrow('Unhandled pending effect "unknownEffect".');
    expect(routeGraphics.render).not.toHaveBeenCalled();
  });

  it("serializes persistence writes in effect order", async () => {
    const firstWrite = createDeferred();
    const calls = [];
    const persistence = {
      applyScopedDataUpdates: vi.fn((updates) => {
        calls.push(updates[0].value);
        return calls.length === 1 ? firstWrite.promise : Promise.resolve();
      }),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => ({}),
      routeGraphics: { render: vi.fn() },
      ticker: createIntegrationTicker(),
      persistence,
    });

    effectsHandler([
      {
        name: "applyScopedDataUpdates",
        payload: {
          updates: [{ scope: "account", path: "a", op: "set", value: 1 }],
        },
      },
      {
        name: "applyScopedDataUpdates",
        payload: {
          updates: [{ scope: "account", path: "b", op: "set", value: 2 }],
        },
      },
    ]);

    await vi.waitFor(() => expect(calls).toEqual([1]));
    firstWrite.resolve();
    await vi.waitFor(() => expect(calls).toEqual([1, 2]));
  });

  it("reschedules enabled authored auto when its trigger changes", () => {
    const harness = createEngineIntegrationHarness({
      projectData: createLinearProject(),
    });
    harness.engine.handleAction("setNextLineConfig", {
      auto: { enabled: true, trigger: "fromComplete", delay: 100 },
    });
    expect(harness.ticker.size).toBe(0);

    harness.engine.handleAction("setNextLineConfig", {
      auto: { enabled: true, trigger: "fromStart", delay: 100 },
    });

    harness.ticker.tick(100);
    const schedulingState = {
      pointer: harness.getPointer().lineId,
      timerCount: harness.ticker.size,
    };
    expect(schedulingState).toEqual({ pointer: "line2", timerCount: 1 });
  });

  it("reschedules active global auto when speed changes", () => {
    const projectData = createLinearProject({
      lineActions: {
        line1: {
          dialogue: {
            content: [{ text: "A deliberately long line for auto timing." }],
          },
        },
      },
    });
    const harness = createEngineIntegrationHarness({
      projectData,
      global: {
        runtime: { autoForwardDelay: 100, autoForwardSpeed: 100 },
      },
    });
    harness.completeLatestRender();
    harness.engine.handleAction("startAutoMode", {});
    harness.engine.handleAction("setAutoForwardSpeed", { value: 0 });

    harness.ticker.tick(1300);

    const schedulingState = {
      pointer: harness.getPointer().lineId,
      timerCount: harness.ticker.size,
    };
    expect(schedulingState).toEqual({ pointer: "line1", timerCount: 1 });
  });

  it("does not replay committed line actions after a renderer failure", () => {
    const ticker = createIntegrationTicker();
    const persistence = createIntegrationPersistence();
    let throwNextRender = false;
    let engine;
    const routeGraphics = {
      render: vi.fn(() => {
        if (throwNextRender) {
          throwNextRender = false;
          throw new Error("render failed");
        }
      }),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker,
      persistence,
    });
    engine = createRouteEngine({ handlePendingEffects: effectsHandler });
    const projectData = createIntegrationProject({
      resources: {
        variables: {
          score: { type: "number", scope: "context", default: 0 },
        },
      },
      initialSectionId: "source",
      sections: {
        source: { lines: [{ id: "source", actions: {} }] },
        destination: {
          lines: [{ id: "destination", actions: incrementScore(1) }],
        },
      },
    });
    engine.init({ initialState: { projectData } });

    throwNextRender = true;
    expect(() =>
      engine.handleActions({
        sectionTransition: { sectionId: "destination" },
      }),
    ).toThrow("render failed");
    expect(engine.selectSystemState().contexts.at(-1).variables.score).toBe(1);

    engine.handleAction("setMuteAll", { value: true });

    expect(engine.selectSystemState().contexts.at(-1).variables.score).toBe(1);
  });
});
