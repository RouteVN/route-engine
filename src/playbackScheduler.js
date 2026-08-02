const DEFAULT_DELAYS_MS = Object.freeze({
  auto: 1000,
  skip: 80,
  authored: 1000,
});

export const PLAYBACK_TIMER_EFFECT_NAMES = new Set([
  "startAutoNextTimer",
  "clearAutoNextTimer",
  "startSkipNextTimer",
  "clearSkipNextTimer",
  "nextLineConfigTimer",
  "clearNextLineConfigTimer",
]);

const tickerCoordinators = new WeakMap();
const binary64Buffer = new ArrayBuffer(8);
const binary64View = new DataView(binary64Buffer);

const getTickerCoordinator = (ticker) => {
  const current = tickerCoordinators.get(ticker);
  if (current) return current;

  const coordinator = { dispatchDepth: 0 };
  tickerCoordinators.set(ticker, coordinator);
  return coordinator;
};

const isPlainObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (value, expectedKeys) => {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
};

const assertPlainObjectWithKeys = (value, keys, label) => {
  if (!isPlainObject(value) || !hasExactKeys(value, keys)) {
    throw new TypeError(`${label} has an invalid shape`);
  }
};

const assertSafeIdentity = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
};

const assertDelay = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number`);
  }
};

export const toExactDurationQuanta = (value) => {
  assertDelay(value, "duration");
  if (value === 0) return 0n;

  binary64View.setFloat64(0, value, false);
  const high = binary64View.getUint32(0, false);
  const low = binary64View.getUint32(4, false);
  const exponentBits = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0x000fffff) << 32n) | BigInt(low);

  if (exponentBits === 0) {
    return fraction;
  }

  const significand = (1n << 52n) | fraction;
  const exponentShift = exponentBits - 1;
  return significand << BigInt(exponentShift);
};

const cloneDescriptor = (descriptor) => structuredClone(descriptor);

const descriptorEquals = (left, right) => {
  if (left === right) return true;
  if (!left || !right || left.mode !== right.mode || left.kind !== right.kind) {
    return false;
  }

  if (left.mode === "legacy") {
    return left.instanceToken === right.instanceToken;
  }

  if (left.delayMs !== right.delayMs) return false;
  if (left.kind === "auto") {
    return (
      left.contentKey === right.contentKey &&
      left.owner.sessionId === right.owner.sessionId &&
      left.owner.lineEntryId === right.owner.lineEntryId
    );
  }
  if (left.kind === "skip") {
    return left.owner.sessionId === right.owner.sessionId;
  }
  return (
    left.trigger === right.trigger &&
    left.owner.lineEntryId === right.owner.lineEntryId
  );
};

const validateTimerDescriptor = (kind, descriptor, lineEntryId) => {
  if (descriptor === null) return null;

  if (kind === "auto") {
    assertPlainObjectWithKeys(
      descriptor,
      ["owner", "delayMs", "contentKey"],
      "auto timer",
    );
    assertPlainObjectWithKeys(
      descriptor.owner,
      ["sessionId", "lineEntryId"],
      "auto timer owner",
    );
    assertSafeIdentity(descriptor.owner.sessionId, "auto owner sessionId");
    assertSafeIdentity(descriptor.owner.lineEntryId, "auto owner lineEntryId");
    if (descriptor.owner.lineEntryId !== lineEntryId) {
      throw new TypeError(
        "auto owner lineEntryId must match schedule lineEntryId",
      );
    }
    assertDelay(descriptor.delayMs, "auto delayMs");
    if (typeof descriptor.contentKey !== "string") {
      throw new TypeError("auto contentKey must be a string");
    }
  } else if (kind === "skip") {
    assertPlainObjectWithKeys(descriptor, ["owner", "delayMs"], "skip timer");
    assertPlainObjectWithKeys(
      descriptor.owner,
      ["sessionId"],
      "skip timer owner",
    );
    assertSafeIdentity(descriptor.owner.sessionId, "skip owner sessionId");
    assertDelay(descriptor.delayMs, "skip delayMs");
  } else {
    assertPlainObjectWithKeys(
      descriptor,
      ["owner", "delayMs", "trigger"],
      "authored timer",
    );
    assertPlainObjectWithKeys(
      descriptor.owner,
      ["lineEntryId"],
      "authored timer owner",
    );
    assertSafeIdentity(
      descriptor.owner.lineEntryId,
      "authored owner lineEntryId",
    );
    if (descriptor.owner.lineEntryId !== lineEntryId) {
      throw new TypeError(
        "authored owner lineEntryId must match schedule lineEntryId",
      );
    }
    assertDelay(descriptor.delayMs, "authored delayMs");
    if (
      descriptor.trigger !== "fromStart" &&
      descriptor.trigger !== "fromComplete"
    ) {
      throw new TypeError(
        'authored trigger must be "fromStart" or "fromComplete"',
      );
    }
  }

  return {
    mode: "reconciled",
    kind,
    ...cloneDescriptor(descriptor),
  };
};

export const validatePlaybackScheduleV1 = (schedule) => {
  assertPlainObjectWithKeys(
    schedule,
    ["contractVersion", "status", "lineEntryId", "timers"],
    "playback schedule",
  );
  if (schedule.contractVersion !== 1) {
    throw new TypeError("playback schedule contractVersion must be 1");
  }
  if (schedule.status !== "settled" && schedule.status !== "unsettled") {
    throw new TypeError(
      'playback schedule status must be "settled" or "unsettled"',
    );
  }
  assertSafeIdentity(schedule.lineEntryId, "playback schedule lineEntryId");

  if (schedule.status === "unsettled") {
    if (schedule.timers !== null) {
      throw new TypeError("unsettled playback schedule timers must be null");
    }
    return {
      contractVersion: 1,
      status: "unsettled",
      lineEntryId: schedule.lineEntryId,
      timers: null,
    };
  }

  assertPlainObjectWithKeys(
    schedule.timers,
    ["auto", "skip", "authored"],
    "playback schedule timers",
  );
  const timers = {
    auto: validateTimerDescriptor(
      "auto",
      schedule.timers.auto,
      schedule.lineEntryId,
    ),
    skip: validateTimerDescriptor(
      "skip",
      schedule.timers.skip,
      schedule.lineEntryId,
    ),
    authored: validateTimerDescriptor(
      "authored",
      schedule.timers.authored,
      schedule.lineEntryId,
    ),
  };
  if (timers.auto && timers.skip) {
    throw new TypeError(
      "playback schedule cannot enable auto and skip together",
    );
  }

  return {
    contractVersion: 1,
    status: "settled",
    lineEntryId: schedule.lineEntryId,
    timers,
  };
};

const createLogicalTimer = (descriptor) => ({
  descriptor,
  remainingQuanta: toExactDurationQuanta(descriptor.delayMs),
});

const timerKinds = ["auto", "skip", "authored"];

export const createPlaybackScheduler = ({
  ticker,
  dispatchAutomaticAttempt,
  classifyAutomaticAttemptError = () => "preCommit",
}) => {
  if (
    !ticker ||
    typeof ticker.add !== "function" ||
    typeof ticker.remove !== "function"
  ) {
    throw new TypeError("playback scheduler requires a ticker with add/remove");
  }
  if (typeof dispatchAutomaticAttempt !== "function") {
    throw new TypeError("playback scheduler requires dispatchAutomaticAttempt");
  }

  const coordinator = getTickerCoordinator(ticker);
  let isActive = true;
  let lifecycleToken = {};
  let generationToken = {};
  let activeCallback = null;
  let publishedRegistrationToken = null;
  let pendingPublication = null;
  let blockedRemovalCallback = null;
  let publicationQueued = false;
  let isTicking = false;
  let mode = "legacy";
  let logicalTimers = { auto: null, skip: null, authored: null };
  let suppressedDescriptors = { auto: null, skip: null, authored: null };
  const kindRevisions = { auto: 0, skip: 0, authored: 0 };

  const hasTimers = () => timerKinds.some((kind) => logicalTimers[kind]);

  const invalidateRegistration = () => {
    publishedRegistrationToken = null;
    pendingPublication = null;
  };

  const queuePendingPublication = () => {
    if (publicationQueued) return;
    publicationQueued = true;
    queueMicrotask(() => {
      publicationQueued = false;
      const pending = pendingPublication;
      if (!pending) return;
      if (coordinator.dispatchDepth > 0 || isTicking) {
        queuePendingPublication();
        return;
      }
      if (
        isActive &&
        lifecycleToken === pending.lifecycleToken &&
        generationToken === pending.generationToken &&
        activeCallback === pending.callback &&
        hasTimers() &&
        !blockedRemovalCallback
      ) {
        publishedRegistrationToken = pending.registrationToken;
      }
      if (pendingPublication === pending) {
        pendingPublication = null;
      }
    });
  };

  const removeBlockedCallback = () => {
    if (!blockedRemovalCallback) return;
    const callback = blockedRemovalCallback;
    ticker.remove(callback);
    if (blockedRemovalCallback === callback) {
      blockedRemovalCallback = null;
    }
  };

  const removeActiveCallbackFailClosed = () => {
    const callback = activeCallback;
    if (!callback) return;
    invalidateRegistration();
    activeCallback = null;
    blockedRemovalCallback = callback;
    ticker.remove(callback);
    if (blockedRemovalCallback === callback) {
      blockedRemovalCallback = null;
    }
  };

  const clearAllLogicalTimers = () => {
    logicalTimers = { auto: null, skip: null, authored: null };
  };

  const clearFailClosed = () => {
    clearAllLogicalTimers();
    generationToken = {};
    if (!isTicking) {
      removeActiveCallbackFailClosed();
    }
  };

  const publishOrDefer = (candidate) => {
    if (coordinator.dispatchDepth > 0 || isTicking) {
      pendingPublication = candidate;
      queuePendingPublication();
      return;
    }
    if (
      isActive &&
      lifecycleToken === candidate.lifecycleToken &&
      generationToken === candidate.generationToken &&
      activeCallback === candidate.callback &&
      hasTimers()
    ) {
      publishedRegistrationToken = candidate.registrationToken;
    }
    if (pendingPublication === candidate) {
      pendingPublication = null;
    }
  };

  const ensurePhysicalCallback = () => {
    if (!isActive || !hasTimers() || activeCallback) return;
    removeBlockedCallback();

    const callbackLifecycleToken = lifecycleToken;
    const callbackGenerationToken = generationToken;
    const registrationToken = {};
    const callback = (time) => {
      if (
        !isActive ||
        callbackLifecycleToken !== lifecycleToken ||
        callbackGenerationToken !== generationToken ||
        registrationToken !== publishedRegistrationToken ||
        callback !== activeCallback
      ) {
        return;
      }
      if (isTicking) return;
      if (
        !time ||
        typeof time.deltaMS !== "number" ||
        !Number.isFinite(time.deltaMS) ||
        time.deltaMS < 0
      ) {
        throw new TypeError(
          "playback ticker deltaMS must be a finite non-negative number",
        );
      }

      const deltaQuanta = toExactDurationQuanta(time.deltaMS);
      isTicking = true;
      coordinator.dispatchDepth += 1;
      const tickGenerationToken = generationToken;
      let primaryError = null;
      try {
        const due = [];
        for (const kind of timerKinds) {
          const timer = logicalTimers[kind];
          if (!timer) continue;
          if (timer.remainingQuanta <= deltaQuanta) {
            due.push({
              kind,
              descriptor: timer.descriptor,
              revision: kindRevisions[kind],
            });
            logicalTimers[kind] = null;
          } else {
            timer.remainingQuanta -= deltaQuanta;
          }
        }

        if (due.length > 0) {
          try {
            dispatchAutomaticAttempt({
              dueKinds: due.map(({ kind }) => kind),
            });
          } catch (error) {
            const classification = classifyAutomaticAttemptError(error);
            if (mode === "reconciled" && classification === "preCommit") {
              for (const { kind, descriptor } of due) {
                suppressedDescriptors[kind] = descriptor;
              }
            } else if (mode === "legacy") {
              clearAllLogicalTimers();
            }
            throw error;
          }

          if (mode === "legacy") {
            for (const item of due) {
              if (
                item.kind === "skip" &&
                kindRevisions.skip === item.revision &&
                logicalTimers.skip === null
              ) {
                logicalTimers.skip = createLogicalTimer(item.descriptor);
              }
            }
          }
        }
      } catch (error) {
        primaryError = error;
      } finally {
        coordinator.dispatchDepth -= 1;
        isTicking = false;
        try {
          if (tickGenerationToken === generationToken) {
            if (hasTimers()) {
              ensurePhysicalCallback();
            } else {
              removeActiveCallbackFailClosed();
            }
          } else if (activeCallback === callback && !hasTimers()) {
            // A fail-closed reset can invalidate this callback while its
            // dispatch is still on the stack. Retire that exact callback once
            // the dispatch unwinds, without touching a callback installed by
            // a reentrant lifecycle.
            removeActiveCallbackFailClosed();
          }
        } catch (cleanupError) {
          if (primaryError) {
            throw new AggregateError(
              [primaryError, cleanupError],
              "Playback attempt and ticker cleanup both failed",
            );
          }
          throw cleanupError;
        }
      }
      if (primaryError) throw primaryError;
    };

    const publication = {
      callback,
      lifecycleToken: callbackLifecycleToken,
      generationToken: callbackGenerationToken,
      registrationToken,
    };
    activeCallback = callback;
    pendingPublication = publication;
    try {
      ticker.add(callback);
    } catch (error) {
      activeCallback = null;
      invalidateRegistration();
      clearAllLogicalTimers();
      generationToken = {};
      blockedRemovalCallback = callback;
      throw error;
    }
    publishOrDefer(publication);
  };

  const clearKind = (kind) => {
    kindRevisions[kind] += 1;
    logicalTimers[kind] = null;
    suppressedDescriptors[kind] = null;
    if (!hasTimers() && !isTicking) {
      removeActiveCallbackFailClosed();
    }
  };

  const startLegacy = (kind, delayMs) => {
    assertDelay(delayMs, `${kind} delay`);
    mode = "legacy";
    kindRevisions[kind] += 1;
    suppressedDescriptors[kind] = null;
    logicalTimers[kind] = createLogicalTimer({
      mode: "legacy",
      kind,
      instanceToken: {},
      delayMs,
    });
    ensurePhysicalCallback();
  };

  const handleLegacyEffect = (effect) => {
    switch (effect.name) {
      case "startAutoNextTimer":
        startLegacy("auto", effect.payload?.delay ?? DEFAULT_DELAYS_MS.auto);
        return true;
      case "clearAutoNextTimer":
        clearKind("auto");
        return true;
      case "startSkipNextTimer":
        startLegacy("skip", effect.payload?.delay ?? DEFAULT_DELAYS_MS.skip);
        return true;
      case "clearSkipNextTimer":
        clearKind("skip");
        return true;
      case "nextLineConfigTimer":
        startLegacy(
          "authored",
          effect.payload?.delay ?? DEFAULT_DELAYS_MS.authored,
        );
        return true;
      case "clearNextLineConfigTimer":
        clearKind("authored");
        return true;
      default:
        return false;
    }
  };

  const reconcilePlaybackScheduleV1 = (schedule) => {
    let normalized;
    try {
      normalized = validatePlaybackScheduleV1(schedule);
    } catch (error) {
      try {
        clearFailClosed();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Playback schedule validation and cleanup both failed",
        );
      }
      throw error;
    }

    mode = "reconciled";
    if (normalized.status === "unsettled") {
      clearAllLogicalTimers();
      if (!isTicking) removeActiveCallbackFailClosed();
      return;
    }

    const nextTimers = {};
    for (const kind of timerKinds) {
      const desired = normalized.timers[kind];
      const suppressed = suppressedDescriptors[kind];
      if (suppressed && (!desired || !descriptorEquals(suppressed, desired))) {
        suppressedDescriptors[kind] = null;
      }
      if (
        desired &&
        suppressedDescriptors[kind] &&
        descriptorEquals(suppressedDescriptors[kind], desired)
      ) {
        nextTimers[kind] = null;
        continue;
      }

      const current = logicalTimers[kind];
      nextTimers[kind] =
        desired && current && descriptorEquals(current.descriptor, desired)
          ? current
          : desired
            ? createLogicalTimer(desired)
            : null;
    }
    logicalTimers = nextTimers;
    if (hasTimers()) {
      ensurePhysicalCallback();
    } else if (!isTicking) {
      removeActiveCallbackFailClosed();
    }
  };

  const reset = () => {
    const callbacks = [activeCallback, blockedRemovalCallback].filter(
      (callback, index, values) =>
        callback && values.indexOf(callback) === index,
    );
    lifecycleToken = {};
    generationToken = {};
    invalidateRegistration();
    activeCallback = null;
    blockedRemovalCallback = null;
    clearAllLogicalTimers();
    suppressedDescriptors = { auto: null, skip: null, authored: null };
    for (const kind of timerKinds) kindRevisions[kind] += 1;
    mode = "legacy";
    isActive = true;

    let firstError = null;
    let failedCallback = null;
    for (const callback of callbacks) {
      try {
        ticker.remove(callback);
      } catch (error) {
        firstError ??= error;
        failedCallback ??= callback;
      }
    }
    blockedRemovalCallback = failedCallback;
    if (firstError) throw firstError;
  };

  const dispose = () => {
    isActive = false;
    lifecycleToken = {};
    generationToken = {};
    invalidateRegistration();
    clearAllLogicalTimers();
    suppressedDescriptors = { auto: null, skip: null, authored: null };
    const callbacks = [activeCallback, blockedRemovalCallback].filter(
      (callback, index, values) =>
        callback && values.indexOf(callback) === index,
    );
    activeCallback = null;
    blockedRemovalCallback = null;
    let firstError = null;
    let failedCallback = null;
    for (const callback of callbacks) {
      try {
        ticker.remove(callback);
      } catch (error) {
        firstError ??= error;
        failedCallback ??= callback;
      }
    }
    blockedRemovalCallback = failedCallback;
    if (firstError) throw firstError;
  };

  return {
    handleLegacyEffect,
    reconcilePlaybackScheduleV1,
    reset,
    dispose,
  };
};
