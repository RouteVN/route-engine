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
      selectIsChoiceVisible: vi.fn(() => false),
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

  it("forwards preprocessPayload action changes into handleActions", async () => {
    const engine = {
      selectRenderState: vi.fn(() => ({ id: "render-1" })),
      handleAction: vi.fn(),
      handleActions: vi.fn(),
      selectIsChoiceVisible: vi.fn(() => false),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: {
        render: vi.fn(),
      },
      ticker: createTicker(),
    });

    const eventHandler = effectsHandler.createRouteGraphicsEventHandler({
      preprocessPayload: async (eventName, payload) => ({
        ...payload,
        actions: {
          ...payload.actions,
          saveSlot: {
            ...payload.actions.saveSlot,
            thumbnailImage: "data:image/png;base64,updated",
            savedAt: 1701234567890,
          },
        },
      }),
    });

    await eventHandler("click", {
      actions: {
        saveSlot: {
          slotId: 1,
        },
      },
      _event: {
        id: "slot_1_box",
      },
    });

    expect(engine.handleActions).toHaveBeenCalledWith(
      {
        saveSlot: {
          slotId: 1,
          thumbnailImage: "data:image/png;base64,updated",
          savedAt: 1701234567890,
        },
      },
      {
        _event: {
          id: "slot_1_box",
        },
      },
    );
  });

  it("does not forward non-choice actions while a choice is visible", async () => {
    const engine = {
      selectRenderState: vi.fn(() => ({ id: "render-1" })),
      handleAction: vi.fn(),
      handleActions: vi.fn(),
      selectIsChoiceVisible: vi.fn(() => true),
    };
    const preprocessPayload = vi.fn();
    const onEvent = vi.fn();
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: {
        render: vi.fn(),
      },
      ticker: createTicker(),
    });

    const payload = {
      actions: {
        updateVariable: {
          id: "blocked",
          operations: [
            {
              variableId: "marker",
              op: "set",
              value: "blocked",
            },
          ],
        },
      },
      _event: {
        x: 10,
        y: 20,
      },
    };

    const eventHandler = effectsHandler.createRouteGraphicsEventHandler({
      preprocessPayload,
      onEvent,
    });

    await eventHandler("click", payload);

    expect(preprocessPayload).not.toHaveBeenCalled();
    expect(engine.handleActions).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalledWith("click", payload);
  });

  it("still forwards choice-tagged actions while a choice is visible", async () => {
    const engine = {
      selectRenderState: vi.fn(() => ({ id: "render-1" })),
      handleAction: vi.fn(),
      handleActions: vi.fn(),
      selectIsChoiceVisible: vi.fn(() => true),
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
      _interactionSource: "choice",
      actions: {
        sectionTransition: {
          sectionId: "next-section",
        },
      },
      _event: {
        x: 10,
        y: 20,
      },
    });

    expect(engine.handleActions).toHaveBeenCalledWith(
      {
        sectionTransition: {
          sectionId: "next-section",
        },
      },
      {
        _event: {
          x: 10,
          y: 20,
        },
      },
      {
        interactionSource: "choice",
      },
    );
  });

  it("blocks non-form actions while a form is visible and forwards matching form payloads", async () => {
    const engine = {
      selectRenderState: vi.fn(() => ({ id: "render-1" })),
      handleAction: vi.fn(),
      handleActions: vi.fn(),
      selectActiveInteraction: vi.fn(() => ({
        source: "form",
        formKey: "section1:line1:profileForm",
      })),
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
    });

    expect(engine.handleActions).not.toHaveBeenCalled();

    await eventHandler("change", {
      _interactionSource: "form",
      _formKey: "section1:line1:profileForm",
      actions: {
        updateFormField: {
          formKey: "section1:line1:profileForm",
          field: "name",
          value: "_event.value",
        },
      },
      _event: {
        value: "Ada",
      },
    });

    expect(engine.handleActions).toHaveBeenCalledWith(
      {
        updateFormField: {
          formKey: "section1:line1:profileForm",
          field: "name",
          value: "_event.value",
        },
      },
      {
        _event: {
          value: "Ada",
        },
      },
      {
        interactionSource: "form",
      },
    );
  });

  it("coalesces replaceable effects by name and keeps the last payload", () => {
    const ticker = createTicker();
    const engine = {
      selectRenderState: vi.fn(() => ({ id: "render-1" })),
      handleAction: vi.fn(),
      handleInternalAction: vi.fn(),
      handleActions: vi.fn(),
    };
    const routeGraphics = {
      render: vi.fn(),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics,
      ticker,
    });

    effectsHandler([
      { name: "render" },
      { name: "nextLineConfigTimer", payload: { delay: 20 } },
      { name: "render" },
      { name: "nextLineConfigTimer", payload: { delay: 50 } },
    ]);

    expect(routeGraphics.render).toHaveBeenCalledTimes(1);
    expect(ticker.add).toHaveBeenCalledTimes(1);

    const timerCallback = ticker.add.mock.calls[0][0];
    timerCallback({ deltaMS: 50 });

    expect(engine.handleInternalAction).toHaveBeenCalledWith(
      "nextLineFromSystem",
      {},
    );
  });

  it("waits for the slower skip cadence before advancing again", () => {
    const ticker = createTicker();
    const engine = {
      selectRenderState: vi.fn(() => ({ id: "render-1" })),
      handleAction: vi.fn(),
      handleInternalAction: vi.fn(),
      handleActions: vi.fn(),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      routeGraphics: {
        render: vi.fn(),
      },
      ticker,
    });

    effectsHandler([{ name: "startSkipNextTimer" }]);

    expect(ticker.add).toHaveBeenCalledTimes(1);

    const skipTimerCallback = ticker.add.mock.calls[0][0];

    skipTimerCallback({ deltaMS: 79 });
    expect(engine.handleInternalAction).not.toHaveBeenCalled();

    skipTimerCallback({ deltaMS: 1 });
    expect(engine.handleInternalAction).toHaveBeenCalledTimes(1);
    expect(engine.handleInternalAction).toHaveBeenNthCalledWith(
      1,
      "nextLineFromSystem",
      {},
    );

    skipTimerCallback({ deltaMS: 79 });
    expect(engine.handleInternalAction).toHaveBeenCalledTimes(1);

    skipTimerCallback({ deltaMS: 1 });
    expect(engine.handleInternalAction).toHaveBeenCalledTimes(2);
    expect(engine.handleInternalAction).toHaveBeenNthCalledWith(
      2,
      "nextLineFromSystem",
      {},
    );
  });

  it("preserves unknown effects in order when an unhandled-effect callback is provided", () => {
    const unhandledEffects = [];
    const effectsHandler = createEffectsHandler({
      getEngine: () => ({
        selectRenderState: vi.fn(() => ({ id: "render-1" })),
        handleAction: vi.fn(),
        handleActions: vi.fn(),
      }),
      routeGraphics: {
        render: vi.fn(),
      },
      ticker: createTicker(),
      handleUnhandledEffect: (effect) => {
        unhandledEffects.push(effect);
      },
    });

    effectsHandler([
      { name: "customEffect", payload: { index: 1 } },
      { name: "customEffect", payload: { index: 2 } },
    ]);

    expect(unhandledEffects).toEqual([
      { name: "customEffect", payload: { index: 1 } },
      { name: "customEffect", payload: { index: 2 } },
    ]);
  });

  it("throws for unknown effects when no unhandled-effect callback is provided", () => {
    const effectsHandler = createEffectsHandler({
      getEngine: () => ({
        selectRenderState: vi.fn(() => ({ id: "render-1" })),
        handleAction: vi.fn(),
        handleActions: vi.fn(),
      }),
      routeGraphics: {
        render: vi.fn(),
      },
      ticker: createTicker(),
    });

    expect(() => effectsHandler([{ name: "customEffect" }])).toThrow(
      'Unhandled pending effect "customEffect".',
    );
  });
});
