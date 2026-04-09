import { describe, expect, it, vi } from "vitest";
import createEffectsHandler from "../src/createEffectsHandler.js";
import createRouteEngine from "../src/RouteEngine.js";
import {
  createIndexedDbPersistence,
  normalizeNamespace,
} from "../src/indexedDbPersistence.js";

const createTicker = () => ({
  add: vi.fn(),
  remove: vi.fn(),
});

const cloneValue = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
};

class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
  }
}

class FakeObjectStore {
  constructor(transaction, definition) {
    this.transaction = transaction;
    this.definition = definition;
  }

  get(key) {
    const request = new FakeRequest();

    this.transaction.track(() => {
      request.result = cloneValue(this.definition.records.get(key));
      request.onsuccess?.({ target: request });
    });

    return request;
  }

  put(value) {
    const request = new FakeRequest();

    this.transaction.track(() => {
      const record = cloneValue(value);
      const key = record[this.definition.keyPath];
      this.definition.records.set(key, record);
      request.result = key;
      request.onsuccess?.({ target: request });
    });

    return request;
  }

  delete(key) {
    const request = new FakeRequest();

    this.transaction.track(() => {
      this.definition.records.delete(key);
      request.result = undefined;
      request.onsuccess?.({ target: request });
    });

    return request;
  }
}

class FakeTransaction {
  constructor(database) {
    this.database = database;
    this.error = null;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.pendingCount = 0;
    this.failed = false;
  }

  objectStore(name) {
    const definition = this.database.stores.get(name);
    if (!definition) {
      throw new Error(`Object store "${name}" does not exist.`);
    }

    return new FakeObjectStore(this, definition);
  }

  track(run) {
    this.pendingCount += 1;

    queueMicrotask(() => {
      if (this.failed) {
        return;
      }

      try {
        run();
      } catch (error) {
        this.failed = true;
        this.error = error;
        this.onerror?.({ target: this });
        this.onabort?.({ target: this });
      } finally {
        this.pendingCount -= 1;
        if (!this.failed && this.pendingCount === 0) {
          queueMicrotask(() => {
            if (!this.failed) {
              this.oncomplete?.({ target: this });
            }
          });
        }
      }
    });
  }
}

class FakeDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.stores = new Map();
    this.objectStoreNames = {
      contains: (storeName) => this.stores.has(storeName),
    };
  }

  createObjectStore(name, options = {}) {
    this.stores.set(name, {
      keyPath: options.keyPath,
      records: new Map(),
    });
  }

  transaction() {
    return new FakeTransaction(this);
  }
}

const createFakeIndexedDB = () => {
  const databases = new Map();

  return {
    open: (name, version) => {
      const request = new FakeRequest();

      queueMicrotask(() => {
        let database = databases.get(name);
        const shouldUpgrade = !database;

        if (!database) {
          database = new FakeDatabase(name, version);
          databases.set(name, database);
        }

        request.result = database;

        if (shouldUpgrade) {
          request.onupgradeneeded?.({ target: request });
        }

        request.onsuccess?.({ target: request });
      });

      return request;
    },
  };
};

const flushAsync = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const createProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: {},
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            lines: [
              {
                id: "line1",
                actions: {},
              },
            ],
          },
        },
      },
    },
  },
});

describe("indexedDbPersistence", () => {
  it("stores the init-time namespace on the engine", () => {
    const engine = createRouteEngine({
      handlePendingEffects: vi.fn(),
    });

    engine.init({
      namespace: "sample-vn",
      initialState: {
        projectData: createProjectData(),
      },
    });

    expect(engine.getNamespace()).toBe("sample-vn");
  });

  it("stores browser persistence in isolated namespaces", async () => {
    const indexedDB = createFakeIndexedDB();
    const alphaPersistence = createIndexedDbPersistence({
      indexedDB,
      namespace: "vn-alpha",
    });
    const betaPersistence = createIndexedDbPersistence({
      indexedDB,
      namespace: "vn-beta",
    });

    await alphaPersistence.saveSlots({
      1: {
        slotId: 1,
        savedAt: 1700000000000,
      },
    });
    await alphaPersistence.saveGlobalDeviceVariables({
      textSpeed: 42,
    });

    expect(await alphaPersistence.load()).toEqual({
      saveSlots: {
        1: {
          slotId: 1,
          savedAt: 1700000000000,
        },
      },
      globalDeviceVariables: {
        textSpeed: 42,
      },
      globalAccountVariables: {},
    });

    expect(await betaPersistence.load()).toEqual({
      saveSlots: {},
      globalDeviceVariables: {},
      globalAccountVariables: {},
    });
  });

  it("requires an explicit namespace", () => {
    expect(() =>
      createIndexedDbPersistence({ indexedDB: createFakeIndexedDB() }),
    ).toThrowError(
      "createIndexedDbPersistence requires a non-empty namespace.",
    );
  });

  it("clears persisted data for a single namespace", async () => {
    const indexedDB = createFakeIndexedDB();
    const alphaPersistence = createIndexedDbPersistence({
      indexedDB,
      namespace: "vn-alpha",
    });
    const betaPersistence = createIndexedDbPersistence({
      indexedDB,
      namespace: "vn-beta",
    });

    await alphaPersistence.saveSlots({
      1: {
        slotId: 1,
        savedAt: 1700000000000,
      },
    });
    await betaPersistence.saveGlobalAccountVariables({
      routeUnlocked: true,
    });

    await alphaPersistence.clear();

    expect(await alphaPersistence.load()).toEqual({
      saveSlots: {},
      globalDeviceVariables: {},
      globalAccountVariables: {},
    });

    expect(await betaPersistence.load()).toEqual({
      saveSlots: {},
      globalDeviceVariables: {},
      globalAccountVariables: {
        routeUnlocked: true,
      },
    });
  });

  it("normalizes namespace values", () => {
    expect(normalizeNamespace("  sample-vn  ")).toBe("sample-vn");
    expect(normalizeNamespace("")).toBeNull();
    expect(normalizeNamespace("   ")).toBeNull();
  });

  it("uses IndexedDB persistence effects with the current namespace", async () => {
    const indexedDB = createFakeIndexedDB();
    const engine = {
      getNamespace: vi.fn(() => "effect-handler-vn"),
    };
    const effectsHandler = createEffectsHandler({
      getEngine: () => engine,
      indexedDB,
      routeGraphics: {
        render: vi.fn(),
      },
      ticker: createTicker(),
    });

    effectsHandler([
      {
        name: "saveSlots",
        payload: {
          saveSlots: {
            7: {
              slotId: 7,
              savedAt: 1700000000007,
            },
          },
        },
      },
      {
        name: "saveGlobalAccountVariables",
        payload: {
          globalAccountVariables: {
            unlockedChapter: 3,
          },
        },
      },
    ]);

    await flushAsync();

    const persistence = createIndexedDbPersistence({
      indexedDB,
      namespace: "effect-handler-vn",
    });

    expect(await persistence.load()).toEqual({
      saveSlots: {
        7: {
          slotId: 7,
          savedAt: 1700000000007,
        },
      },
      globalDeviceVariables: {},
      globalAccountVariables: {
        unlockedChapter: 3,
      },
    });
  });
});
