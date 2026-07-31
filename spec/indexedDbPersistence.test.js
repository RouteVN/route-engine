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
    await alphaPersistence.saveGlobalRuntime({
      localizationPackageId: "japanese",
    });
    await alphaPersistence.applyScopedDataUpdates([
      {
        scope: "device",
        path: "variables.textSpeed",
        op: "set",
        value: 60,
      },
      {
        scope: "account",
        path: "viewedRegistry",
        op: "markViewed",
        value: {
          sections: [{ sectionId: "prologue", lineId: "line2" }],
          resources: [],
        },
      },
    ]);

    expect(await alphaPersistence.load()).toEqual({
      saveSlots: {
        1: {
          slotId: 1,
          savedAt: 1700000000000,
        },
      },
      globalDeviceVariables: {
        textSpeed: 60,
      },
      globalAccountVariables: {},
      globalRuntime: {
        localizationPackageId: "japanese",
      },
      accountViewedRegistry: {
        sections: [{ sectionId: "prologue", lastLineId: "line2" }],
        resources: [],
      },
      accountReplayRegistry: {},
    });

    expect(await betaPersistence.load()).toEqual({
      saveSlots: {},
      globalDeviceVariables: {},
      globalAccountVariables: {},
      globalRuntime: {},
      accountViewedRegistry: {},
      accountReplayRegistry: {},
    });
  });

  it("requires an explicit namespace", () => {
    expect(() =>
      createIndexedDbPersistence({ indexedDB: createFakeIndexedDB() }),
    ).toThrowError(
      "createIndexedDbPersistence requires a non-empty namespace.",
    );
  });

  it("merges account viewed registry scoped data patches", async () => {
    const persistence = createIndexedDbPersistence({
      indexedDB: createFakeIndexedDB(),
      namespace: "viewed-patch-vn",
    });

    await persistence.applyScopedDataUpdates([
      {
        scope: "account",
        path: "viewedRegistry",
        op: "markViewed",
        value: {
          sections: [{ sectionId: "common", lineId: "line2" }],
          resources: [{ resourceId: "bg-1" }],
        },
      },
      {
        scope: "account",
        path: "variables.routeUnlocked",
        op: "set",
        value: true,
      },
    ]);
    await persistence.applyScopedDataUpdates([
      {
        scope: "account",
        path: "viewedRegistry",
        op: "markViewed",
        value: {
          sections: [
            { sectionId: "common", lineId: "line3" },
            { sectionId: "branch" },
          ],
          resources: [{ resourceId: "bg-2" }],
        },
      },
      {
        scope: "device",
        path: "variables.textSpeed",
        op: "set",
        value: 42,
      },
    ]);
    await persistence.applyScopedDataUpdates([
      {
        scope: "account",
        path: "viewedRegistry",
        op: "markViewed",
        value: {
          sections: [{ sectionId: "branch", lineId: "branch-line-1" }],
          resources: [{ resourceId: "bg-1" }],
        },
      },
    ]);

    expect(await persistence.load()).toMatchObject({
      globalDeviceVariables: {
        textSpeed: 42,
      },
      globalAccountVariables: {
        routeUnlocked: true,
      },
      accountViewedRegistry: {
        sections: [
          { sectionId: "common", lastLineId: "line3" },
          { sectionId: "branch" },
        ],
        resources: [{ resourceId: "bg-1" }, { resourceId: "bg-2" }],
      },
    });
  });

  it("merges account replay unlocks as a monotonic scene-ID set", async () => {
    const persistence = createIndexedDbPersistence({
      indexedDB: createFakeIndexedDB(),
      namespace: "replay-unlocks-vn",
    });

    await persistence.applyScopedDataUpdates([
      {
        scope: "account",
        path: "replayRegistry",
        op: "unlock",
        value: { sceneIds: ["firstEnding", "firstEnding"] },
      },
    ]);
    await persistence.applyScopedDataUpdates([
      {
        scope: "account",
        path: "replayRegistry",
        op: "unlock",
        value: { sceneIds: ["secondEnding", "firstEnding"] },
      },
    ]);

    expect((await persistence.load()).accountReplayRegistry).toEqual({
      sceneIds: ["firstEnding", "secondEnding"],
    });
  });

  it.each([
    [
      "device scope",
      {
        scope: "device",
        path: "replayRegistry",
        op: "unlock",
        value: { sceneIds: ["firstEnding"] },
      },
    ],
    [
      "unsupported operation",
      {
        scope: "account",
        path: "replayRegistry",
        op: "set",
        value: { sceneIds: ["firstEnding"] },
      },
    ],
    [
      "empty scene list",
      {
        scope: "account",
        path: "replayRegistry",
        op: "unlock",
        value: { sceneIds: [] },
      },
    ],
    [
      "invalid scene ID",
      {
        scope: "account",
        path: "replayRegistry",
        op: "unlock",
        value: { sceneIds: [""] },
      },
    ],
  ])(
    "rejects malformed replay unlock updates with %s",
    async (_label, update) => {
      const persistence = createIndexedDbPersistence({
        indexedDB: createFakeIndexedDB(),
        namespace: `invalid-replay-unlock-${_label}`,
      });

      await expect(
        persistence.applyScopedDataUpdates([update]),
      ).rejects.toThrow();
    },
  );

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
      globalRuntime: {},
      accountViewedRegistry: {},
      accountReplayRegistry: {},
    });

    expect(await betaPersistence.load()).toEqual({
      saveSlots: {},
      globalDeviceVariables: {},
      globalAccountVariables: {
        routeUnlocked: true,
      },
      globalRuntime: {},
      accountViewedRegistry: {},
      accountReplayRegistry: {},
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
        name: "applyScopedDataUpdates",
        payload: {
          updates: [
            {
              scope: "account",
              path: "variables.unlockedChapter",
              op: "set",
              value: 3,
            },
            {
              scope: "account",
              path: "viewedRegistry",
              op: "markViewed",
              value: {
                sections: [{ sectionId: "common", lineId: "line4" }],
                resources: [],
              },
            },
          ],
        },
      },
      {
        name: "applyScopedDataUpdates",
        payload: {
          updates: [
            {
              scope: "account",
              path: "viewedRegistry",
              op: "markViewed",
              value: {
                sections: [{ sectionId: "common", lineId: "line4" }],
                resources: [],
              },
            },
            {
              scope: "account",
              path: "viewedRegistry",
              op: "markViewed",
              value: {
                sections: [{ sectionId: "branch", lineId: "line1" }],
                resources: [{ resourceId: "cg-1" }],
              },
            },
            {
              scope: "account",
              path: "replayRegistry",
              op: "unlock",
              value: {
                sceneIds: ["firstEnding"],
              },
            },
          ],
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
      globalRuntime: {},
      accountViewedRegistry: {
        sections: [
          { sectionId: "common", lastLineId: "line4" },
          { sectionId: "branch", lastLineId: "line1" },
        ],
        resources: [{ resourceId: "cg-1" }],
      },
      accountReplayRegistry: {
        sceneIds: ["firstEnding"],
      },
    });
  });
});
