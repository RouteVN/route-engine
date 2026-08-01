import { describe, expect, it, vi } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
  createIntegrationTicker,
} from "./helpers/createEngineIntegrationHarness.js";
import { itKnownDefect } from "./helpers/knownDefect.js";

const createIsolationProject = (label) =>
  createIntegrationProject({
    resources: {
      variables: {
        score: { type: "number", scope: "context", default: 0 },
      },
    },
    sections: {
      main: {
        lines: ["line1", "line2", "line3"].map((id) => ({
          id,
          actions: {
            dialogue: { content: [{ text: `${label}:${id}` }] },
          },
        })),
      },
    },
  });

const createTimerProject = () =>
  createIntegrationProject({
    sections: {
      main: {
        lines: ["line1", "line2", "line3"].map((id) => ({
          id,
          actions: {},
        })),
      },
    },
  });

const currentScore = (harness) =>
  harness.getState().contexts.at(-1).variables.score;

describe("multiple RouteEngine instances", () => {
  it("keeps story state, save slots, rendering, and persistence isolated", async () => {
    const first = createEngineIntegrationHarness({
      namespace: "isolation:first",
      projectData: createIsolationProject("first"),
    });
    const second = createEngineIntegrationHarness({
      namespace: "isolation:second",
      projectData: createIsolationProject("second"),
    });

    first.engine.handleAction("updateVariable", {
      id: "firstScore",
      operations: [{ variableId: "score", op: "set", value: 7 }],
    });
    first.engine.handleAction("markLineCompleted", {});
    first.engine.handleAction("nextLine", {});
    first.engine.handleAction("saveSlot", { slotId: "first-only", savedAt: 1 });

    expect(first.getPointer().lineId).toBe("line2");
    expect(currentScore(first)).toBe(7);
    expect(second.getPointer().lineId).toBe("line1");
    expect(currentScore(second)).toBe(0);
    expect(
      second.engine.selectSaveSlot({ slotId: "first-only" }),
    ).toBeUndefined();
    expect(first.renderStates.at(-1).id).not.toBe(
      second.renderStates.at(-1).id,
    );

    await vi.waitFor(() =>
      expect(first.persistence.saveSlots).toHaveBeenCalledTimes(1),
    );
    expect(second.persistence.saveSlots).not.toHaveBeenCalled();
  });

  it("keeps timer ownership isolated when engines share one host ticker", () => {
    const ticker = createIntegrationTicker();
    const first = createEngineIntegrationHarness({
      namespace: "isolation:skip",
      projectData: createTimerProject(),
      global: { runtime: { skipUnseenText: true } },
      ticker,
    });
    const second = createEngineIntegrationHarness({
      namespace: "isolation:auto",
      projectData: createTimerProject(),
      global: { runtime: { autoForwardDelay: 200 } },
      ticker,
    });
    first.completeLatestRender();
    second.completeLatestRender();

    first.engine.handleAction("startSkipMode", {});
    second.engine.handleAction("startAutoMode", {});

    expect(ticker.size).toBe(2);
    ticker.tick(80);
    expect(first.getPointer().lineId).toBe("line2");
    expect(second.getPointer().lineId).toBe("line1");
    expect(ticker.size).toBe(2);

    ticker.tick(120);
    expect(first.getPointer().lineId).toBe("line3");
    expect(second.getPointer().lineId).toBe("line2");
  });

  itKnownDefect(
    "rejects another engine's render completion event",
    ({ expectFailure }) => {
      const first = createEngineIntegrationHarness({
        namespace: "isolation:render-first",
        projectData: createIsolationProject("first"),
      });
      const second = createEngineIntegrationHarness({
        namespace: "isolation:render-second",
        projectData: createIsolationProject("second"),
      });
      const firstRenderId = first.renderStates.at(-1).id;

      const completionAccepted = second.effectsHandler.handleRouteGraphicsEvent(
        "renderComplete",
        {
          id: firstRenderId,
          aborted: false,
        },
      );
      expectFailure({
        observed: () => expect(completionAccepted).toBe(true),
        desired: () => expect(completionAccepted).toBe(false),
      });
      expect(second.getState().global.isLineCompleted).toBe(true);
      expect(first.getState().global.isLineCompleted).toBe(false);
    },
  );

  it("does not disturb another engine when one instance is reinitialized", () => {
    const ticker = createIntegrationTicker();
    const first = createEngineIntegrationHarness({
      namespace: "isolation:reinitialized",
      projectData: createTimerProject(),
      ticker,
    });
    const second = createEngineIntegrationHarness({
      namespace: "isolation:survivor",
      projectData: createTimerProject(),
      global: { runtime: { autoForwardDelay: 100 } },
      ticker,
    });
    second.completeLatestRender();
    second.engine.handleAction("startAutoMode", {});
    expect(ticker.size).toBe(1);

    first.reinitialize();

    expect(ticker.size).toBe(1);
    ticker.tick(100);
    expect(second.getPointer().lineId).toBe("line2");
    expect(first.getPointer().lineId).toBe("line1");
  });

  it("contains a failed transaction to its owning engine", () => {
    const first = createEngineIntegrationHarness({
      namespace: "isolation:failed-batch",
      projectData: createIsolationProject("first"),
    });
    const second = createEngineIntegrationHarness({
      namespace: "isolation:healthy-batch",
      projectData: createIsolationProject("second"),
    });

    expect(() =>
      first.engine.handleActions({
        updateVariable: {
          id: "rolledBack",
          operations: [{ variableId: "score", op: "set", value: 99 }],
        },
        rollbackByOffset: { offset: 0 },
      }),
    ).toThrow("rollbackByOffset requires a negative offset");

    expect(currentScore(first)).toBe(0);

    second.engine.handleAction("updateVariable", {
      id: "secondScore",
      operations: [{ variableId: "score", op: "set", value: 2 }],
    });
    first.engine.handleAction("updateVariable", {
      id: "firstRecovery",
      operations: [{ variableId: "score", op: "set", value: 1 }],
    });

    expect(currentScore(first)).toBe(1);
    expect(currentScore(second)).toBe(2);
  });
});
