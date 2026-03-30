import { describe, expect, it, vi } from "vitest";
import createEffectsHandler from "../src/createEffectsHandler.js";

const createTicker = () => ({
  add: vi.fn(),
  remove: vi.fn(),
});

describe("createEffectsHandler RouteGraphics event bridge", () => {
  it("tracks the latest render id internally during render effects", async () => {
    const engine = {
      selectRenderState: vi.fn(() => ({ id: "render-1" })),
      handleAction: vi.fn(),
      handleActions: vi.fn(),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: {
        render: vi.fn(),
      },
      ticker: createTicker(),
    });

    await effectsHandler([{ name: "render" }]);

    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: "render-1",
        aborted: false,
      }),
    ).toBe(true);
    expect(engine.handleAction).toHaveBeenCalledWith("markLineCompleted", {});
  });

  it("marks the line completed only for the latest non-aborted renderComplete", async () => {
    const renderStates = [{ id: "render-1" }, { id: "render-2" }];
    const engine = {
      selectRenderState: vi.fn(() => renderStates.shift()),
      handleAction: vi.fn(),
      handleActions: vi.fn(),
    };
    const routeGraphics = {
      render: vi.fn(),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker: createTicker(),
    });

    await effectsHandler([{ name: "render" }]);
    await effectsHandler([{ name: "render" }]);

    expect(routeGraphics.render).toHaveBeenNthCalledWith(1, { id: "render-1" });
    expect(routeGraphics.render).toHaveBeenNthCalledWith(2, { id: "render-2" });

    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: "render-1",
        aborted: false,
      }),
    ).toBe(false);
    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: "render-2",
        aborted: true,
      }),
    ).toBe(false);

    expect(engine.handleAction).not.toHaveBeenCalled();

    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: "render-2",
        aborted: false,
      }),
    ).toBe(true);
    expect(
      effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: "render-2",
        aborted: false,
      }),
    ).toBe(false);

    expect(engine.handleAction).toHaveBeenCalledTimes(1);
    expect(engine.handleAction).toHaveBeenCalledWith("markLineCompleted", {});
  });

  it("creates a RouteGraphics event handler that forwards actions with _event context", async () => {
    const engine = {
      selectRenderState: vi.fn(() => ({ id: "render-1" })),
      handleAction: vi.fn(),
      handleActions: vi.fn(),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: {
        render: vi.fn(),
      },
      ticker: createTicker(),
    });

    const eventHandler = effectsHandler.createRouteGraphicsEventHandler();

    await eventHandler("click", {
      actions: {
        nextLine: {},
      },
      _event: {
        x: 10,
        y: 20,
      },
    });

    expect(engine.handleActions).toHaveBeenCalledWith(
      {
        nextLine: {},
      },
      {
        _event: {
          x: 10,
          y: 20,
        },
      },
    );
  });
});
