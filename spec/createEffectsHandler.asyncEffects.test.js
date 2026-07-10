import { describe, expect, it, vi } from "vitest";
import createEffectsHandler from "../src/createEffectsHandler.js";

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const createTicker = () => ({
  add: vi.fn(),
  remove: vi.fn(),
});

const createEngine = (overrides = {}) => ({
  prepareRenderState: vi.fn(() => ({ id: "render-1" })),
  commitRenderState: vi.fn(),
  handleLineActions: vi.fn(),
  handleInternalAction: vi.fn(),
  hasQueuedRenderEffect: vi.fn(() => false),
  isEffectProcessingBlocked: vi.fn(() => false),
  ...overrides,
});

describe("createEffectsHandler asynchronous effects", () => {
  it("keeps fully synchronous render effects synchronous", () => {
    const engine = createEngine();
    const routeGraphics = { render: vi.fn() };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker: createTicker(),
    });

    const result = effectsHandler([{ name: "render" }]);

    expect(result).toBeUndefined();
    expect(routeGraphics.render).toHaveBeenCalledWith({ id: "render-1" });
    expect(engine.commitRenderState).toHaveBeenCalledWith({ id: "render-1" });
  });

  it("commits an asynchronous render before running later effects", async () => {
    const deferred = createDeferred();
    const order = [];
    const engine = createEngine({
      commitRenderState: vi.fn(() => order.push("commit")),
    });
    const routeGraphics = {
      render: vi.fn(() => {
        order.push("render");
        return deferred.promise;
      }),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker: createTicker(),
      handleUnhandledEffect: (effect) => order.push(effect.name),
    });

    const result = effectsHandler([
      { name: "render" },
      { name: "afterRender" },
    ]);

    expect(result).toBeInstanceOf(Promise);
    expect(order).toEqual(["render"]);

    deferred.resolve();
    await result;

    expect(order).toEqual(["render", "commit", "afterRender"]);
  });

  it("does not run destination line actions before an asynchronous render resolves", async () => {
    const deferred = createDeferred();
    const order = [];
    const renderStates = [{ id: "render-1" }, { id: "render-2" }];
    const engine = createEngine({
      prepareRenderState: vi.fn(() => renderStates.shift()),
      commitRenderState: vi.fn((renderState) =>
        order.push(`commit:${renderState.id}`),
      ),
      handleLineActions: vi.fn(() => order.push("lineActions")),
    });
    const routeGraphics = {
      render: vi
        .fn()
        .mockImplementationOnce((renderState) => {
          order.push(`render:${renderState.id}`);
          return deferred.promise;
        })
        .mockImplementationOnce((renderState) => {
          order.push(`render:${renderState.id}`);
        }),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker: createTicker(),
    });

    const result = effectsHandler([
      { name: "render" },
      { name: "handleLineActions" },
    ]);

    expect(order).toEqual(["render:render-1"]);

    deferred.resolve();
    await result;

    expect(order).toEqual([
      "render:render-1",
      "commit:render-1",
      "lineActions",
      "render:render-2",
      "commit:render-2",
    ]);
  });

  it("does not issue a fallback render when line actions already queued one", () => {
    const engine = createEngine({
      hasQueuedRenderEffect: vi.fn(() => true),
    });
    const routeGraphics = { render: vi.fn() };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker: createTicker(),
    });

    effectsHandler([{ name: "handleLineActions" }]);

    expect(engine.handleLineActions).toHaveBeenCalledTimes(1);
    expect(routeGraphics.render).not.toHaveBeenCalled();
  });

  it("does not commit or continue after an asynchronous render rejects", async () => {
    const error = new Error("scene acquisition failed");
    const engine = createEngine();
    const afterRender = vi.fn();
    const routeGraphics = {
      render: vi.fn(() => Promise.reject(error)),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker: createTicker(),
      handleUnhandledEffect: afterRender,
    });

    await expect(
      effectsHandler([{ name: "render" }, { name: "afterRender" }]),
    ).rejects.toBe(error);
    expect(engine.commitRenderState).not.toHaveBeenCalled();
    expect(afterRender).not.toHaveBeenCalled();
  });

  it.each([
    ["startAutoNextTimer", { delay: 80 }],
    ["startSkipNextTimer", { delay: 80 }],
    ["nextLineConfigTimer", { delay: 80 }],
  ])("pauses %s while effect processing is blocked", (effectName, payload) => {
    let blocked = true;
    const engine = createEngine({
      isEffectProcessingBlocked: vi.fn(() => blocked),
    });
    const ticker = createTicker();
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: { render: vi.fn() },
      ticker,
    });

    effectsHandler([{ name: effectName, payload }]);
    const timerCallback = ticker.add.mock.calls[0][0];

    timerCallback({ deltaMS: 100 });
    expect(engine.handleInternalAction).not.toHaveBeenCalled();

    blocked = false;
    timerCallback({ deltaMS: 80 });
    expect(engine.handleInternalAction).toHaveBeenCalledWith(
      "nextLineFromSystem",
      {},
    );
  });
});
