const DEFAULT_DATABASE_NAME = "route-engine";
const DEFAULT_OBJECT_STORE_NAME = "projectPersistence";
const PERSISTENCE_RECORD_VERSION = 1;

const createEmptyPersistedState = () => ({
  saveSlots: {},
  globalDeviceVariables: {},
  globalAccountVariables: {},
});

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

const normalizePersistedState = (value = {}) => {
  const normalizedValue = isPlainObject(value) ? value : {};

  return {
    saveSlots: isPlainObject(normalizedValue.saveSlots)
      ? normalizedValue.saveSlots
      : {},
    globalDeviceVariables: isPlainObject(normalizedValue.globalDeviceVariables)
      ? normalizedValue.globalDeviceVariables
      : {},
    globalAccountVariables: isPlainObject(
      normalizedValue.globalAccountVariables,
    )
      ? normalizedValue.globalAccountVariables
      : {},
  };
};

export const normalizeNamespace = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const requireNamespace = (namespace) => {
  const normalizedNamespace = normalizeNamespace(namespace);
  if (!normalizedNamespace) {
    throw new Error(
      "createIndexedDbPersistence requires a non-empty namespace.",
    );
  }

  return normalizedNamespace;
};

const resolveIndexedDb = (indexedDBOverride) => {
  const indexedDBInstance = indexedDBOverride ?? globalThis.indexedDB;
  if (!indexedDBInstance) {
    throw new Error("IndexedDB is not available in this environment.");
  }

  return indexedDBInstance;
};

const openDatabase = ({ indexedDB, databaseName, objectStoreName }) =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(objectStoreName)) {
        database.createObjectStore(objectStoreName, {
          keyPath: "namespace",
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error(`Failed to open IndexedDB database "${databaseName}".`),
      );
    };
  });

const readNamespaceRecord = async ({
  databasePromise,
  objectStoreName,
  namespace,
}) => {
  const database = await databasePromise;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(objectStoreName, "readonly");
    const store = transaction.objectStore(objectStoreName);
    const request = store.get(namespace);

    request.onsuccess = () => {
      resolve(request.result ?? null);
    };

    request.onerror = () => {
      reject(
        request.error ??
          new Error(
            `Failed to read persisted namespace "${namespace}" from IndexedDB.`,
          ),
      );
    };
  });
};

const writeNamespaceRecord = async ({
  databasePromise,
  objectStoreName,
  namespace,
  patch,
}) => {
  const database = await databasePromise;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(objectStoreName, "readwrite");
    const store = transaction.objectStore(objectStoreName);
    const readRequest = store.get(namespace);
    let settled = false;

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const resolveOnce = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    readRequest.onerror = () => {
      rejectOnce(
        readRequest.error ??
          new Error(
            `Failed to read persisted namespace "${namespace}" before updating IndexedDB.`,
          ),
      );
    };

    readRequest.onsuccess = () => {
      const currentRecord = normalizePersistedState(readRequest.result);
      const nextRecord = {
        namespace,
        version: PERSISTENCE_RECORD_VERSION,
        ...createEmptyPersistedState(),
        ...currentRecord,
        ...patch,
      };

      const writeRequest = store.put(nextRecord);
      writeRequest.onerror = () => {
        rejectOnce(
          writeRequest.error ??
            new Error(
              `Failed to persist namespace "${namespace}" to IndexedDB.`,
            ),
        );
      };
    };

    transaction.oncomplete = () => {
      resolveOnce();
    };

    transaction.onerror = () => {
      rejectOnce(
        transaction.error ??
          new Error(
            `IndexedDB transaction failed while updating namespace "${namespace}".`,
          ),
      );
    };

    transaction.onabort = () => {
      rejectOnce(
        transaction.error ??
          new Error(
            `IndexedDB transaction aborted while updating namespace "${namespace}".`,
          ),
      );
    };
  });
};

const clearNamespaceRecord = async ({
  databasePromise,
  objectStoreName,
  namespace,
}) => {
  const database = await databasePromise;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(objectStoreName, "readwrite");
    const store = transaction.objectStore(objectStoreName);
    const deleteRequest = store.delete(namespace);
    let settled = false;

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const resolveOnce = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    deleteRequest.onerror = () => {
      rejectOnce(
        deleteRequest.error ??
          new Error(
            `Failed to clear persisted namespace "${namespace}" from IndexedDB.`,
          ),
      );
    };

    transaction.oncomplete = () => {
      resolveOnce();
    };

    transaction.onerror = () => {
      rejectOnce(
        transaction.error ??
          new Error(
            `IndexedDB transaction failed while clearing namespace "${namespace}".`,
          ),
      );
    };

    transaction.onabort = () => {
      rejectOnce(
        transaction.error ??
          new Error(
            `IndexedDB transaction aborted while clearing namespace "${namespace}".`,
          ),
      );
    };
  });
};

export const createIndexedDbPersistence = (options = {}) => {
  const {
    indexedDB: indexedDBOverride,
    databaseName = DEFAULT_DATABASE_NAME,
    objectStoreName = DEFAULT_OBJECT_STORE_NAME,
    namespace,
  } = options;

  const indexedDB = resolveIndexedDb(indexedDBOverride);
  const resolvedNamespace = requireNamespace(namespace);
  const databasePromise = openDatabase({
    indexedDB,
    databaseName,
    objectStoreName,
  });

  return {
    namespace: resolvedNamespace,
    load: async () => {
      const record = await readNamespaceRecord({
        databasePromise,
        objectStoreName,
        namespace: resolvedNamespace,
      });

      return {
        ...createEmptyPersistedState(),
        ...normalizePersistedState(record),
      };
    },
    clear: async () =>
      clearNamespaceRecord({
        databasePromise,
        objectStoreName,
        namespace: resolvedNamespace,
      }),
    saveSlots: async (saveSlots) =>
      writeNamespaceRecord({
        databasePromise,
        objectStoreName,
        namespace: resolvedNamespace,
        patch: {
          saveSlots: isPlainObject(saveSlots) ? saveSlots : {},
        },
      }),
    saveGlobalDeviceVariables: async (globalDeviceVariables) =>
      writeNamespaceRecord({
        databasePromise,
        objectStoreName,
        namespace: resolvedNamespace,
        patch: {
          globalDeviceVariables: isPlainObject(globalDeviceVariables)
            ? globalDeviceVariables
            : {},
        },
      }),
    saveGlobalAccountVariables: async (globalAccountVariables) =>
      writeNamespaceRecord({
        databasePromise,
        objectStoreName,
        namespace: resolvedNamespace,
        patch: {
          globalAccountVariables: isPlainObject(globalAccountVariables)
            ? globalAccountVariables
            : {},
        },
      }),
  };
};

export default createIndexedDbPersistence;
