import { describe, expect, it, vi } from "vitest";
import {
  createPlaybackScheduler,
  toExactDurationQuanta,
  validatePlaybackScheduleV1,
} from "../src/playbackScheduler.js";

const createTicker = ({ inlineAdd = false, retainRemoved = false } = {}) => {
  const callbacks = [];
  return {
    callbacks,
    add: vi.fn((callback) => {
      callbacks.push(callback);
      if (inlineAdd) callback({ deltaMS: 1_000_000 });
    }),
    remove: vi.fn((callback) => {
      if (retainRemoved) return;
      const index = callbacks.indexOf(callback);
      if (index >= 0) callbacks.splice(index, 1);
    }),
    tick(deltaMS) {
      [...callbacks].forEach((callback) => callback({ deltaMS }));
    },
  };
};

const settledSchedule = ({ lineEntryId = 1, auto, skip, authored } = {}) => ({
  contractVersion: 1,
  status: "settled",
  lineEntryId,
  timers: {
    auto: auto ?? null,
    skip: skip ?? null,
    authored: authored ?? null,
  },
});

const authoredDescriptor = ({ lineEntryId = 1, delayMs = 100 } = {}) => ({
  owner: { lineEntryId },
  delayMs,
  trigger: "fromStart",
});

describe("playback scheduler", () => {
  it("converts every finite binary64 duration to exact integer quanta", () => {
    expect({
      zero: toExactDurationQuanta(0),
      minimum: toExactDurationQuanta(Number.MIN_VALUE),
      one: toExactDurationQuanta(1),
      maximumIsPositive: toExactDurationQuanta(Number.MAX_VALUE) > 0n,
    }).toEqual({
      zero: 0n,
      minimum: 1n,
      one: 1n << 1074n,
      maximumIsPositive: true,
    });
  });

  it("uses one physical callback for three logical legacy timers", () => {
    const ticker = createTicker();
    const dispatch = vi.fn();
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });

    scheduler.handleLegacyEffect({
      name: "startAutoNextTimer",
      payload: { delay: 100 },
    });
    scheduler.handleLegacyEffect({
      name: "startSkipNextTimer",
      payload: { delay: 100 },
    });
    scheduler.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 100 },
    });

    expect(ticker.callbacks).toHaveLength(1);
    ticker.tick(100);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      dueKinds: ["auto", "skip", "authored"],
    });
  });

  it("does not apply a source tick's excess delta to a destination timer", () => {
    const ticker = createTicker();
    let scheduler;
    const dispatch = vi.fn(() => {
      scheduler.handleLegacyEffect({
        name: "nextLineConfigTimer",
        payload: { delay: 50 },
      });
    });
    scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });
    scheduler.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 100 },
    });

    ticker.tick(1_000_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
    ticker.tick(49);
    expect(dispatch).toHaveBeenCalledTimes(1);
    ticker.tick(1);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("makes synchronous inline add callbacks inert until registration publishes", () => {
    const ticker = createTicker({ inlineAdd: true });
    const dispatch = vi.fn();
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });

    scheduler.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 1 },
    });

    expect(dispatch).not.toHaveBeenCalled();
    ticker.tick(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("keeps retained removed callbacks inert in the same lifecycle", () => {
    const ticker = createTicker({ retainRemoved: true });
    const dispatch = vi.fn();
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });
    scheduler.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 10 },
    });
    const staleCallback = ticker.callbacks[0];
    scheduler.handleLegacyEffect({ name: "clearNextLineConfigTimer" });
    scheduler.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 10 },
    });

    expect(ticker.callbacks).toHaveLength(2);
    staleCallback({ deltaMS: 10 });
    expect(dispatch).not.toHaveBeenCalled();
    ticker.callbacks[1]({ deltaMS: 10 });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("ignores a nested invocation of its active callback", () => {
    const ticker = createTicker();
    const dispatch = vi.fn(() => ticker.tick(100));
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });
    scheduler.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 100 },
    });

    ticker.tick(100);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("invalidates retained callbacks on reset and dispose", () => {
    const ticker = createTicker({ retainRemoved: true });
    const dispatch = vi.fn();
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });
    scheduler.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 1 },
    });
    const beforeReset = ticker.callbacks[0];
    scheduler.reset();
    beforeReset({ deltaMS: 1 });

    scheduler.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 1 },
    });
    const beforeDispose = ticker.callbacks.at(-1);
    scheduler.dispose();
    beforeDispose({ deltaMS: 1 });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("invalidates ownership before a reentrant ticker removal during reset", () => {
    let callback;
    const dispatch = vi.fn();
    const ticker = {
      add: vi.fn((nextCallback) => {
        callback = nextCallback;
      }),
      remove: vi.fn((removedCallback) => {
        removedCallback({ deltaMS: 100 });
        callback = null;
      }),
    };
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });
    scheduler.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 100 },
    });

    scheduler.reset();

    expect(callback).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps a failed disposal removal stale and retries it on reset", () => {
    const callbacks = new Set();
    let rejectRemoval = true;
    const ticker = {
      add: vi.fn((callback) => callbacks.add(callback)),
      remove: vi.fn((callback) => {
        if (rejectRemoval) {
          throw new Error("remove failed");
        }
        callbacks.delete(callback);
      }),
    };
    const dispatch = vi.fn();
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });
    scheduler.handleLegacyEffect({
      name: "startAutoNextTimer",
      payload: { delay: 10 },
    });
    const staleCallback = [...callbacks][0];

    expect(() => scheduler.dispose()).toThrow("remove failed");
    staleCallback({ deltaMS: 10 });
    expect(dispatch).not.toHaveBeenCalled();

    rejectRemoval = false;
    scheduler.reset();
    expect(callbacks.size).toBe(0);
    expect(ticker.remove).toHaveBeenCalledTimes(2);
  });

  it("preserves an equal reconciled descriptor's exact remainder", () => {
    const ticker = createTicker();
    const dispatch = vi.fn();
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });
    const schedule = settledSchedule({
      authored: authoredDescriptor({ delayMs: 100 }),
    });
    scheduler.reconcilePlaybackScheduleV1(schedule);
    ticker.tick(40);

    scheduler.reconcilePlaybackScheduleV1(structuredClone(schedule));
    ticker.tick(59);
    expect(dispatch).not.toHaveBeenCalled();
    ticker.tick(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh deadline when any reconciled descriptor field changes", () => {
    const ticker = createTicker();
    const dispatch = vi.fn();
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });
    scheduler.reconcilePlaybackScheduleV1(
      settledSchedule({ authored: authoredDescriptor({ delayMs: 100 }) }),
    );
    ticker.tick(40);
    scheduler.reconcilePlaybackScheduleV1(
      settledSchedule({ authored: authoredDescriptor({ delayMs: 101 }) }),
    );

    ticker.tick(100);
    expect(dispatch).not.toHaveBeenCalled();
    ticker.tick(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("suppresses a consumed descriptor after a pre-commit attempt failure", () => {
    const ticker = createTicker();
    const attemptError = new Error("pre-commit failure");
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: () => {
        throw attemptError;
      },
      classifyAutomaticAttemptError: () => "preCommit",
    });
    const schedule = settledSchedule({
      authored: authoredDescriptor({ delayMs: 10 }),
    });
    scheduler.reconcilePlaybackScheduleV1(schedule);

    expect(() => ticker.tick(10)).toThrow(attemptError);
    scheduler.reconcilePlaybackScheduleV1(schedule);
    expect(ticker.callbacks).toHaveLength(0);

    scheduler.reconcilePlaybackScheduleV1(
      settledSchedule({ authored: authoredDescriptor({ delayMs: 11 }) }),
    );
    expect(ticker.callbacks).toHaveLength(1);
  });

  it("allows authoritative reconciliation to rearm after a committed failure", () => {
    const ticker = createTicker();
    const attemptError = new Error("post-commit failure");
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: () => {
        throw attemptError;
      },
      classifyAutomaticAttemptError: () => "postCommitUnsettled",
    });
    const schedule = settledSchedule({
      authored: authoredDescriptor({ delayMs: 10 }),
    });
    scheduler.reconcilePlaybackScheduleV1(schedule);

    expect(() => ticker.tick(10)).toThrow(attemptError);
    scheduler.reconcilePlaybackScheduleV1(schedule);
    expect(ticker.callbacks).toHaveLength(1);
  });

  it("rejects invalid V1 candidates and clears the active schedule fail-closed", () => {
    const ticker = createTicker();
    const dispatch = vi.fn();
    const scheduler = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatch,
    });
    scheduler.reconcilePlaybackScheduleV1(
      settledSchedule({ authored: authoredDescriptor({ delayMs: 10 }) }),
    );

    expect(() =>
      scheduler.reconcilePlaybackScheduleV1({
        ...settledSchedule(),
        extra: true,
      }),
    ).toThrow(TypeError);
    expect(ticker.callbacks).toHaveLength(0);
  });

  it("validates exact descriptor keys, ownership, and mode exclusivity", () => {
    expect(() =>
      validatePlaybackScheduleV1(
        settledSchedule({
          lineEntryId: 2,
          authored: authoredDescriptor({ lineEntryId: 1 }),
        }),
      ),
    ).toThrow("must match schedule lineEntryId");

    expect(() =>
      validatePlaybackScheduleV1(
        settledSchedule({
          auto: {
            owner: { sessionId: 1, lineEntryId: 1 },
            delayMs: 10,
            contentKey: "",
          },
          skip: { owner: { sessionId: 1 }, delayMs: 10 },
        }),
      ),
    ).toThrow("cannot enable auto and skip together");

    expect(() =>
      validatePlaybackScheduleV1({
        contractVersion: 1,
        status: "unsettled",
        lineEntryId: 1,
        timers: {},
      }),
    ).toThrow("timers must be null");
  });

  it("defers publication of another scheduler registered during a shared-ticker dispatch", async () => {
    const ticker = createTicker({ inlineAdd: true });
    const dispatchB = vi.fn();
    const schedulerB = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: dispatchB,
    });
    const schedulerA = createPlaybackScheduler({
      ticker,
      dispatchAutomaticAttempt: () => {
        schedulerB.handleLegacyEffect({
          name: "nextLineConfigTimer",
          payload: { delay: 1 },
        });
      },
    });
    schedulerA.handleLegacyEffect({
      name: "nextLineConfigTimer",
      payload: { delay: 1 },
    });

    ticker.tick(1);
    expect(dispatchB).not.toHaveBeenCalled();
    await Promise.resolve();
    ticker.tick(1);
    expect(dispatchB).toHaveBeenCalledTimes(1);
  });
});
