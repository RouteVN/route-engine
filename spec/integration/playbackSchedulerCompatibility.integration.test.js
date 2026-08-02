import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../../src/RouteEngine.js";
import { createIntegrationProject } from "./helpers/createEngineIntegrationHarness.js";

const TIMER_EFFECT_NAMES = new Set([
  "startAutoNextTimer",
  "clearAutoNextTimer",
  "startSkipNextTimer",
  "clearSkipNextTimer",
  "nextLineConfigTimer",
  "clearNextLineConfigTimer",
]);

const createProject = ({ actions = {} } = {}) =>
  createIntegrationProject({
    sections: {
      main: {
        lines: [
          { id: "line1", actions },
          { id: "line2", actions: {} },
        ],
      },
    },
  });

describe("playback scheduler handler compatibility", () => {
  it("delivers the unchanged legacy timer effects to a non-opted handler", () => {
    const batches = [];
    let engine;
    const handler = vi.fn((effects) => {
      batches.push(structuredClone(effects));
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    });
    engine = createRouteEngine({ handlePendingEffects: handler });
    engine.init({
      initialState: {
        projectData: createProject({
          actions: {
            setNextLineConfig: {
              auto: { enabled: true, trigger: "fromStart", delay: 123 },
            },
          },
        }),
      },
    });
    engine.handleAction("startAutoMode", {});
    engine.handleAction("startSkipMode", {});
    engine.handleAction("setNextLineConfig", {
      auto: { enabled: false },
    });

    const timerEffects = batches
      .flat()
      .filter((effect) => TIMER_EFFECT_NAMES.has(effect.name));
    expect(timerEffects).toEqual([
      { name: "nextLineConfigTimer", payload: { delay: 123 } },
      { name: "nextLineConfigTimer", payload: { delay: 123 } },
      { name: "clearAutoNextTimer" },
      { name: "clearAutoNextTimer" },
      { name: "clearSkipNextTimer" },
      { name: "startSkipNextTimer" },
      { name: "clearNextLineConfigTimer" },
    ]);
  });

  it("filters timer effects and supplies authoritative schedules to a V1 handler", () => {
    const delivered = [];
    const schedules = [];
    let engine;
    const handler = function (effects) {
      delivered.push(structuredClone(effects));
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    };
    handler.reset = vi.fn();
    handler.dispose = vi.fn();
    handler.reconcilePlaybackScheduleV1 = vi.fn((schedule) => {
      schedules.push(structuredClone(schedule));
    });
    engine = createRouteEngine({ handlePendingEffects: handler });
    engine.init({
      initialState: {
        projectData: createProject({
          actions: {
            setNextLineConfig: {
              auto: { enabled: true, trigger: "fromStart", delay: 123 },
            },
          },
        }),
      },
    });

    expect(
      delivered.flat().some((effect) => TIMER_EFFECT_NAMES.has(effect.name)),
    ).toBe(false);
    expect(schedules.at(-1)).toMatchObject({
      contractVersion: 1,
      status: "settled",
      timers: {
        auto: null,
        skip: null,
        authored: {
          delayMs: 123,
          trigger: "fromStart",
        },
      },
    });
  });

  it("does not invoke an opted handler for an all-filtered snapshot", () => {
    let engine;
    const handler = vi.fn((effects) => {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    });
    handler.reset = vi.fn();
    handler.dispose = vi.fn();
    handler.reconcilePlaybackScheduleV1 = vi.fn();
    engine = createRouteEngine({ handlePendingEffects: handler });
    engine.init({ initialState: { projectData: createProject() } });
    const callCount = handler.mock.calls.length;

    engine.handleAction("appendPendingEffect", {
      name: "clearAutoNextTimer",
    });

    expect(handler).toHaveBeenCalledTimes(callCount);
  });

  it("requires reset and dispose when a handler opts into V1", () => {
    const missingReset = () => {};
    missingReset.dispose = () => {};
    missingReset.reconcilePlaybackScheduleV1 = () => {};
    expect(() =>
      createRouteEngine({ handlePendingEffects: missingReset }),
    ).toThrow("requires reset and dispose");

    const missingDispose = () => {};
    missingDispose.reset = () => {};
    missingDispose.reconcilePlaybackScheduleV1 = () => {};
    expect(() =>
      createRouteEngine({ handlePendingEffects: missingDispose }),
    ).toThrow("requires reset and dispose");
  });

  it("captures lifecycle capabilities once and preserves their receiver", () => {
    const calls = [];
    let engine;
    const handler = function (effects) {
      expect(this).toBe(handler);
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    };
    handler.reset = function () {
      calls.push(["reset", this]);
    };
    handler.dispose = function () {
      calls.push(["dispose", this]);
    };
    handler.reconcilePlaybackScheduleV1 = function () {
      calls.push(["reconcile", this]);
    };
    engine = createRouteEngine({ handlePendingEffects: handler });

    handler.reset = () => {
      throw new Error("replacement reset must not run");
    };
    handler.dispose = () => {
      throw new Error("replacement dispose must not run");
    };
    handler.reconcilePlaybackScheduleV1 = () => {
      throw new Error("replacement reconcile must not run");
    };

    engine.init({ initialState: { projectData: createProject() } });
    engine.dispose();

    expect(calls.map(([name]) => name)).toEqual([
      "reset",
      "reconcile",
      "dispose",
    ]);
    expect(calls.every(([, receiver]) => receiver === handler)).toBe(true);
  });

  it("blocks mutating engine reentrancy during reconciliation", () => {
    const errors = [];
    const initialState = { projectData: createProject() };
    let engine;
    const handler = function (effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    };
    handler.reset = () => {};
    handler.dispose = () => {};
    handler.reconcilePlaybackScheduleV1 = () => {
      for (const operation of [
        () => engine.handleAction("setMuteAll", { value: true }),
        () => engine.init({ initialState }),
        () => engine.dispose(),
      ]) {
        try {
          operation();
        } catch (error) {
          errors.push(error.message);
        }
      }
    };
    engine = createRouteEngine({ handlePendingEffects: handler });

    engine.init({ initialState });

    expect(errors).toHaveLength(3);
    expect(errors.every((message) => message.includes("reconciliation"))).toBe(
      true,
    );
  });

  it("rejects asynchronous reconciliation contracts", () => {
    let engine;
    const handler = function (effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    };
    handler.reset = () => {};
    handler.dispose = () => {};
    handler.reconcilePlaybackScheduleV1 = () => Promise.resolve();
    engine = createRouteEngine({ handlePendingEffects: handler });

    let thrown;
    try {
      engine.init({ initialState: { projectData: createProject() } });
    } catch (error) {
      thrown = error;
    }

    expect({
      type: thrown?.constructor,
      causes: thrown?.errors?.map((error) => error.message),
    }).toEqual({
      type: AggregateError,
      causes: [
        "reconcilePlaybackScheduleV1 must complete synchronously",
        "reconcilePlaybackScheduleV1 must complete synchronously",
      ],
    });
  });

  it("sends an unsettled fail-closed schedule after settled reconciliation fails", () => {
    const schedules = [];
    let engine;
    const handler = function (effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    };
    handler.reset = () => {};
    handler.dispose = () => {};
    handler.reconcilePlaybackScheduleV1 = (schedule) => {
      schedules.push(structuredClone(schedule));
      if (schedule.status === "settled") {
        throw new Error("settled reconciliation failed");
      }
    };
    engine = createRouteEngine({ handlePendingEffects: handler });

    expect(() =>
      engine.init({ initialState: { projectData: createProject() } }),
    ).toThrow("settled reconciliation failed");
    expect(schedules.map(({ status }) => status)).toEqual([
      "settled",
      "unsettled",
    ]);
  });
});
