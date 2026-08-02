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

  it("commits private metadata atomically without exposing it to ordinary selectors", () => {
    const store = createStore(
      { count: 0 },
      {
        selectSnapshot: ({ state, metadata }) => ({
          count: state.count,
          revision: metadata.revision,
        }),
        selectPublicState: ({ state }) => structuredClone(state),
        increment: ({ state }) => {
          state.count += 1;
        },
      },
      {
        createTransactionalMetadata: () => ({ revision: 0 }),
        transformSelectorFirstArgument: (state, metadata) => ({
          state,
          metadata,
        }),
        transformActionFirstArgument: (state, metadata) => ({
          state,
          metadata,
        }),
        updateTransactionalMetadata: ({ transactionalMetadata }) => {
          transactionalMetadata.revision += 1;
        },
      },
    );

    store.increment();

    expect(store.selectSnapshot()).toEqual({ count: 1, revision: 1 });
    expect(store.selectPublicState()).toEqual({ count: 1 });
  });

  it("rolls semantic state and private metadata back together", () => {
    const store = createStore(
      { count: 0 },
      {
        selectSnapshot: ({ state, metadata }) => ({
          count: state.count,
          revision: metadata.revision,
        }),
        increment: ({ state }) => {
          state.count += 1;
        },
      },
      {
        createTransactionalMetadata: () => ({ revision: 0 }),
        transformSelectorFirstArgument: (state, metadata) => ({
          state,
          metadata,
        }),
        transformActionFirstArgument: (state, metadata) => ({
          state,
          metadata,
        }),
        updateTransactionalMetadata: ({ transactionalMetadata }) => {
          transactionalMetadata.revision += 1;
        },
      },
    );

    expect(() =>
      store[RUN_STORE_TRANSACTION](() => {
        store.increment();
        throw new Error("abort both");
      }),
    ).toThrow("abort both");
    expect(store.selectSnapshot()).toEqual({ count: 0, revision: 0 });
  });

  it("finalizes metadata once from the outer transaction's settled state", () => {
    const finalizedCounts = [];
    const store = createStore(
      { count: 0 },
      {
        selectRevision: ({ metadata }) => metadata.revision,
        setCount: ({ state }, count) => {
          state.count = count;
        },
      },
      {
        createTransactionalMetadata: () => ({ revision: 0 }),
        transformSelectorFirstArgument: (state, metadata) => ({
          state,
          metadata,
        }),
        transformActionFirstArgument: (state, metadata) => ({
          state,
          metadata,
        }),
        finalizeTransactionalMetadata: ({ state, transactionalMetadata }) => {
          finalizedCounts.push(state.count);
          transactionalMetadata.revision += 1;
        },
      },
    );

    store[RUN_STORE_TRANSACTION](() => {
      store.setCount(1);
      store.setCount(2);
      store.setCount(0);
    });

    expect({ finalizedCounts, revision: store.selectRevision() }).toEqual({
      finalizedCounts: [0],
      revision: 1,
    });
  });
});
