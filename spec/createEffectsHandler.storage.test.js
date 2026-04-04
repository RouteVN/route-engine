import { afterEach, describe, expect, it, vi } from "vitest";
import createEffectsHandler from "../src/createEffectsHandler.js";

const createTicker = () => ({
  add: vi.fn(),
  remove: vi.fn(),
});

const createEngine = () => ({
  selectRenderState: vi.fn(() => ({ id: "render-1" })),
  handleAction: vi.fn(),
  handleActions: vi.fn(),
  handleInternalAction: vi.fn(),
});

describe("createEffectsHandler storage effects", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws when localStorage quota is exceeded while saving saveSlots", () => {
    const quotaExceededError = new Error("quota exceeded");
    quotaExceededError.name = "QuotaExceededError";

    const setItem = vi.fn().mockImplementation(() => {
      throw quotaExceededError;
    });

    vi.stubGlobal("localStorage", {
      setItem,
    });

    const routeGraphics = {
      render: vi.fn(),
    };

    const effectsHandler = createEffectsHandler({
      getEngine: createEngine,
      routeGraphics,
      ticker: createTicker(),
    });

    const saveSlots = {
      1: {
        formatVersion: 1,
        slotId: 1,
        savedAt: 1700000000000,
        image: "data:image/jpeg;base64,thumbnail",
        state: {
          contexts: [{ id: "context-1" }],
          viewedRegistry: {
            sections: [],
            resources: [],
          },
        },
      },
    };

    expect(() => {
      effectsHandler([
        {
          name: "saveSlots",
          payload: {
            saveSlots,
          },
        },
        {
          name: "render",
        },
      ]);
    }).toThrow(quotaExceededError);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith(
      "saveSlots",
      JSON.stringify(saveSlots),
    );
    expect(routeGraphics.render).not.toHaveBeenCalled();
  });
});
