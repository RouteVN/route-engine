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

  it("reports persistence errors when saving saveSlots exceeds quota", async () => {
    const quotaExceededError = new Error("quota exceeded");
    quotaExceededError.name = "QuotaExceededError";

    const saveSlotsWrite = vi.fn().mockImplementation(() => {
      throw quotaExceededError;
    });

    const routeGraphics = {
      render: vi.fn(),
    };
    const handlePersistenceError = vi.fn();

    const effectsHandler = createEffectsHandler({
      getEngine: createEngine,
      routeGraphics,
      ticker: createTicker(),
      persistence: {
        saveSlots: saveSlotsWrite,
      },
      handlePersistenceError,
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

    await vi.waitFor(() => {
      expect(saveSlotsWrite).toHaveBeenCalledTimes(1);
    });
    expect(saveSlotsWrite).toHaveBeenCalledWith(saveSlots);

    await vi.waitFor(() => {
      expect(handlePersistenceError).toHaveBeenCalledTimes(1);
    });
    expect(handlePersistenceError).toHaveBeenCalledWith(quotaExceededError);
    expect(routeGraphics.render).toHaveBeenCalledTimes(1);
    expect(routeGraphics.render).toHaveBeenCalledWith({ id: "render-1" });
  });

  it("reports a persistence adapter error when applyScopedDataUpdates is missing", async () => {
    const handlePersistenceError = vi.fn();

    const effectsHandler = createEffectsHandler({
      getEngine: createEngine,
      routeGraphics: {
        render: vi.fn(),
      },
      ticker: createTicker(),
      persistence: {
        saveSlots: vi.fn(),
      },
      handlePersistenceError,
    });

    effectsHandler([
      {
        name: "applyScopedDataUpdates",
        payload: {
          updates: [
            {
              scope: "account",
              path: "viewedRegistry",
              op: "markViewed",
              value: {
                sections: [{ sectionId: "prologue", lineId: "line2" }],
              },
            },
          ],
        },
      },
    ]);

    await vi.waitFor(() => {
      expect(handlePersistenceError).toHaveBeenCalledTimes(1);
    });
    expect(handlePersistenceError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(handlePersistenceError.mock.calls[0][0].message).toBe(
      "RouteEngine persistence adapter must implement applyScopedDataUpdates.",
    );
  });
});
