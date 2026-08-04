import { describe, expect, it } from "vitest";
import { createActionPipelineTranscriptHarness } from "./helpers/createActionPipelineTranscriptHarness.js";
import { createIntegrationProject } from "./helpers/createEngineIntegrationHarness.js";

const dialogue = (text) => ({
  mode: "adv",
  content: [{ text }],
});

const updateScore = (value, id) => ({
  updateVariable: {
    id,
    operations: [{ variableId: "score", op: "set", value }],
  },
});

const createWorkProject = ({ line2Actions = {} } = {}) =>
  createIntegrationProject({
    resources: {
      variables: {
        score: { type: "number", scope: "context", default: 0 },
      },
    },
    sections: {
      main: {
        lines: [
          {
            id: "line1",
            actions: { dialogue: dialogue("First line") },
          },
          {
            id: "line2",
            actions: {
              dialogue: dialogue("Second line"),
              ...line2Actions,
            },
          },
        ],
      },
    },
  });

const countTranscriptTypes = (transcript) =>
  transcript.reduce((counts, entry) => {
    counts[entry.type] = (counts[entry.type] ?? 0) + 1;
    return counts;
  }, {});

const countLogicalTimers = (schedule) =>
  Object.values(schedule?.payload?.timers ?? {}).filter(Boolean).length;

describe("action pipeline deterministic work counts", () => {
  it("settles a representative mixed navigation batch once", async () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createWorkProject({
        line2Actions: {
          ...updateScore(11, "destinationScore"),
          appendPendingEffect: {
            name: "work:destination",
            payload: { order: 3 },
          },
        },
      }),
    });
    trace.harness.completeLatestRender();
    await trace.clearTranscript();

    trace.dispatchActions({
      setAutoForwardDelay: { value: 1800 },
      setAutoForwardSpeed: { value: 70 },
      setMenuPage: { value: "backlog" },
      conditional: {
        branches: [
          {
            when: true,
            actions: {
              ...updateScore(3, "conditionalScore"),
              appendPendingEffect: {
                name: "work:conditional",
                payload: { order: 1 },
              },
            },
          },
        ],
      },
      appendPendingEffect: {
        name: "work:outer",
        payload: { order: 2 },
      },
      nextLine: {},
    });

    await trace.settlePersistence();

    expect(trace.summarizeState()).toMatchObject({
      pointer: { sectionId: "main", lineId: "line2" },
      variables: { score: 11 },
      pendingEffects: [],
    });
    expect(
      trace.transcript
        .filter(({ type }) => type === "externalEffect")
        .map(({ name, payload }) => ({ name, payload })),
    ).toEqual([
      { name: "work:conditional", payload: { order: 1 } },
      { name: "work:outer", payload: { order: 2 } },
      { name: "work:destination", payload: { order: 3 } },
    ]);
    expect(countTranscriptTypes(trace.transcript)).toMatchObject({
      dispatch: 1,
      render: 1,
      externalEffect: 3,
      persistence: 1,
      playbackSchedule: 1,
      settled: 1,
    });
    const persistenceEntries = trace.transcript.filter(
      ({ type }) => type === "persistence",
    );
    expect(persistenceEntries.map(({ operation }) => operation)).toEqual([
      "saveGlobalRuntime",
    ]);
    expect(persistenceEntries[0].payload).toMatchObject({
      autoForwardDelay: 1800,
      autoForwardSpeed: 70,
    });
    expect(trace.harness.ticker.size).toBe(0);
  });

  it("uses zero or one physical callback independently of logical timer count", async () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createWorkProject(),
    });
    await trace.clearTranscript();

    trace.dispatchActions({
      setNextLineConfig: {
        manual: { enabled: true, requireLineCompleted: false },
        auto: { enabled: true, trigger: "fromComplete", delay: 900 },
        applyMode: "persistent",
      },
      startAutoMode: {},
    });
    trace.harness.completeLatestRender();

    const activeSchedule = trace.transcript
      .filter(({ type }) => type === "playbackSchedule")
      .at(-1);
    expect(countLogicalTimers(activeSchedule)).toBe(2);
    expect(Object.keys(activeSchedule.payload.timers)).toEqual([
      "auto",
      "skip",
      "authored",
    ]);
    expect(activeSchedule.payload.timers.skip).toBeNull();
    expect(activeSchedule.payload).toMatchObject({
      contractVersion: 1,
      status: "settled",
      lineEntryId: 1,
      timers: {
        auto: { owner: { sessionId: 1, lineEntryId: 1 } },
        authored: { owner: { lineEntryId: 1 } },
      },
    });
    const activeBoundary = trace.transcript.filter(({ type }) =>
      ["playbackSchedule", "ticker"].includes(type),
    );
    expect(activeBoundary.slice(-2).map(({ type }) => type)).toEqual([
      "playbackSchedule",
      "ticker",
    ]);
    expect(activeBoundary.at(-1)).toMatchObject({
      operation: "add",
      liveCallbacks: 1,
    });
    const activeCallbackId = activeBoundary.at(-1).callbackId;
    expect(trace.harness.ticker.size).toBe(1);

    await trace.clearTranscript();
    trace.dispatchActions({
      stopAutoMode: {},
      setNextLineConfig: {
        manual: { enabled: true, requireLineCompleted: false },
        auto: { enabled: false },
        applyMode: "persistent",
      },
    });

    const inactiveSchedule = trace.transcript
      .filter(({ type }) => type === "playbackSchedule")
      .at(-1);
    expect(countLogicalTimers(inactiveSchedule)).toBe(0);
    expect(inactiveSchedule.payload.timers).toEqual({
      auto: null,
      skip: null,
      authored: null,
    });
    expect(trace.harness.ticker.size).toBe(0);
    expect(
      trace.transcript.filter(
        ({ type, operation }) => type === "ticker" && operation === "remove",
      ),
    ).toEqual([
      expect.objectContaining({
        callbackId: activeCallbackId,
        liveCallbacks: 0,
      }),
    ]);
    expect(
      trace.transcript
        .filter(({ type }) => ["playbackSchedule", "ticker"].includes(type))
        .slice(-2)
        .map(({ type }) => type),
    ).toEqual(["playbackSchedule", "ticker"]);
  });

  it("returns effects and ticker ownership to baseline through 100 success/failure cycles", async () => {
    const trace = createActionPipelineTranscriptHarness({
      projectData: createWorkProject(),
    });
    await trace.clearTranscript();

    for (let index = 0; index < 100; index += 1) {
      trace.dispatchActions({
        setNextLineConfig: {
          manual: { enabled: true, requireLineCompleted: false },
          auto: {
            enabled: true,
            trigger: "fromComplete",
            delay: 1000 + index,
          },
          applyMode: "persistent",
        },
        ...updateScore(index, `success${index}`),
      });

      expect(() =>
        trace.dispatchActions({
          ...updateScore(1000 + index, `failure${index}`),
          rollbackByOffset: { offset: 0 },
        }),
      ).toThrow("rollbackByOffset requires a negative offset");

      expect(trace.summarizeState()).toMatchObject({
        variables: { score: index },
        pendingEffects: [],
      });
      expect(trace.harness.ticker.size).toBe(0);
    }

    await trace.settlePersistence();

    const counts = countTranscriptTypes(trace.transcript);
    expect(counts).toMatchObject({
      dispatch: 200,
      settled: 100,
      error: 100,
      render: 100,
      playbackSchedule: 100,
    });
    expect(counts.externalEffect ?? 0).toBe(0);
    expect(counts.persistence ?? 0).toBe(0);
    expect(counts.ticker ?? 0).toBe(0);
  });
});
