import { describe, expect, it } from "vitest";
import { createStore, RUN_STORE_TRANSACTION } from "../src/util.js";

const createCounterStore = () =>
  createStore(
    { count: 0 },
    {
      selectCount: (state) => state.count,
      increment: (state) => {
        state.count += 1;
      },
    },
  );

describe("createStore transactions", () => {
  it("commits successful actions and returns the callback result", () => {
    const store = createCounterStore();

    const result = store[RUN_STORE_TRANSACTION](() => {
      store.increment();
      return "committed";
    });

    expect(result).toBe("committed");
    expect(store.selectCount()).toBe(1);
  });

  it("restores the state when the callback throws", () => {
    const store = createCounterStore();
    const error = new Error("failed");

    expect(() =>
      store[RUN_STORE_TRANSACTION](() => {
        store.increment();
        throw error;
      }),
    ).toThrow(error);
    expect(store.selectCount()).toBe(0);
  });

  it("restores only the failed nested transaction", () => {
    const store = createCounterStore();

    store[RUN_STORE_TRANSACTION](() => {
      store.increment();
      try {
        store[RUN_STORE_TRANSACTION](() => {
          store.increment();
          throw new Error("nested failure");
        });
      } catch (error) {
        expect(error).toHaveProperty("message", "nested failure");
      }
      store.increment();
    });

    expect(store.selectCount()).toBe(2);
  });
});
