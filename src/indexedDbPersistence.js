const DEFAULT_DATABASE_NAME = "route-engine";
const DEFAULT_OBJECT_STORE_NAME = "projectPersistence";
const PERSISTENCE_RECORD_VERSION = 1;

const createEmptyPersistedState = () => ({
  saveSlots: {},
  globalDeviceVariables: {},
  globalAccountVariables: {},
  globalRuntime: {},
  accountViewedRegistry: {},
});

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

const VARIABLE_PATH_PREFIX = "variables.";

const normalizeMarkViewedValue = (value = {}) => {
  const markViewedValue = isPlainObject(value) ? value : {};

  return {
    sections: (Array.isArray(markViewedValue.sections)
      ? markViewedValue.sections
      : []
    )
      .map((section) => {
        if (typeof section === "string" || typeof section === "number") {
          return { sectionId: String(section) };
        }

        if (
          !isPlainObject(section) ||
          typeof section.sectionId !== "string" ||
          section.sectionId.length === 0
        ) {
          return null;
        }

        return {
          sectionId: section.sectionId,
          ...(typeof section.lineId === "string"
            ? { lineId: section.lineId }
            : {}),
        };
      })
      .filter(Boolean),
    resources: (Array.isArray(markViewedValue.resources)
      ? markViewedValue.resources
      : []
    )
      .map((resource) => {
        if (typeof resource === "string" || typeof resource === "number") {
          return { resourceId: String(resource) };
        }

        if (
          !isPlainObject(resource) ||
          typeof resource.resourceId !== "string" ||
          resource.resourceId.length === 0
        ) {
          return null;
        }

        return { resourceId: resource.resourceId };
      })
      .filter(Boolean),
  };
};

const normalizeStoredViewedRegistry = (value = {}) => {
  const registry = isPlainObject(value) ? value : {};

  return {
    sections: (Array.isArray(registry.sections) ? registry.sections : [])
      .map((section) => {
        if (typeof section === "string" || typeof section === "number") {
          return { sectionId: String(section) };
        }

        if (
          !isPlainObject(section) ||
          typeof section.sectionId !== "string" ||
          section.sectionId.length === 0
        ) {
          return null;
        }

        return {
          sectionId: section.sectionId,
          ...(typeof section.lastLineId === "string"
            ? { lastLineId: section.lastLineId }
            : {}),
        };
      })
      .filter(Boolean),
    resources: (Array.isArray(registry.resources) ? registry.resources : [])
      .map((resource) => {
        if (typeof resource === "string" || typeof resource === "number") {
          return { resourceId: String(resource) };
        }

        if (
          !isPlainObject(resource) ||
          typeof resource.resourceId !== "string" ||
          resource.resourceId.length === 0
        ) {
          return null;
        }

        return { resourceId: resource.resourceId };
      })
      .filter(Boolean),
  };
};

const markViewedInRegistry = (currentRegistry, markViewedValue) => {
  const current = normalizeStoredViewedRegistry(currentRegistry);
  const markViewed = normalizeMarkViewedValue(markViewedValue);
  const sections = current.sections.map((section) => ({ ...section }));
  const resources = current.resources.map((resource) => ({ ...resource }));

  markViewed.sections.forEach((sectionPatch) => {
    const existing = sections.find(
      (section) => section.sectionId === sectionPatch.sectionId,
    );

    if (!existing) {
      sections.push({
        sectionId: sectionPatch.sectionId,
        ...(sectionPatch.lineId === undefined
          ? {}
          : { lastLineId: sectionPatch.lineId }),
      });
      return;
    }

    if (existing.lastLineId === undefined) {
      return;
    }

    if (sectionPatch.lineId === undefined) {
      delete existing.lastLineId;
      return;
    }

    existing.lastLineId = sectionPatch.lineId;
  });

  markViewed.resources.forEach((resourcePatch) => {
    const existing = resources.find(
      (resource) => resource.resourceId === resourcePatch.resourceId,
    );

    if (!existing) {
      resources.push({ ...resourcePatch });
    }
  });

  return { sections, resources };
};

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
    globalRuntime: isPlainObject(normalizedValue.globalRuntime)
      ? normalizedValue.globalRuntime
      : {},
    accountViewedRegistry: isPlainObject(normalizedValue.accountViewedRegistry)
      ? normalizedValue.accountViewedRegistry
      : {},
  };
};

const normalizeScopedDataUpdates = (updates = []) => {
  if (updates === undefined) {
    return [];
  }

  if (!Array.isArray(updates)) {
    throw new Error("applyScopedDataUpdates requires an updates array.");
  }

  return updates.map((update, index) => {
    if (!isPlainObject(update)) {
      throw new Error(
        `Malformed applyScopedDataUpdates.updates[${index}] entry.`,
      );
    }

    const variableId = update.path?.startsWith(VARIABLE_PATH_PREFIX)
      ? update.path.slice(VARIABLE_PATH_PREFIX.length)
      : null;

    if (variableId !== null) {
      if (!["device", "account"].includes(update.scope)) {
        throw new Error(
          `Unsupported applyScopedDataUpdates scope "${update.scope}" at updates[${index}].`,
        );
      }
      if (variableId.length === 0) {
        throw new Error(
          `Malformed applyScopedDataUpdates path "${update.path}" at updates[${index}].`,
        );
      }
      if (update.op !== "set") {
        throw new Error(
          `Unsupported applyScopedDataUpdates operation "${update.op}" at updates[${index}].`,
        );
      }

      return {
        scope: update.scope,
        path: update.path,
        op: update.op,
        value: update.value,
        variableId,
      };
    }

    if (update.path === "viewedRegistry") {
      if (update.scope !== "account") {
        throw new Error(
          `Unsupported applyScopedDataUpdates scope "${update.scope}" at updates[${index}].`,
        );
      }
      if (update.op !== "markViewed") {
        throw new Error(
          `Unsupported applyScopedDataUpdates operation "${update.op}" at updates[${index}].`,
        );
      }

      return update;
    }

    if (typeof update.path !== "string") {
      throw new Error(
        `Malformed applyScopedDataUpdates path at updates[${index}].`,
      );
    }

    throw new Error(
      `Unsupported applyScopedDataUpdates path "${update.path}" at updates[${index}].`,
    );
  });
};

const createPersistedStatePatch = (currentRecord, updates) => {
  const nextPatch = {};

  normalizeScopedDataUpdates(updates).forEach((update) => {
    if (update.path === "viewedRegistry") {
      nextPatch.accountViewedRegistry = markViewedInRegistry(
        nextPatch.accountViewedRegistry ?? currentRecord.accountViewedRegistry,
        update.value,
      );
      return;
    }

    const field =
      update.scope === "device"
        ? "globalDeviceVariables"
        : "globalAccountVariables";
    nextPatch[field] = {
      ...currentRecord[field],
      ...nextPatch[field],
      [update.variableId]: update.value,
    };
  });

  return nextPatch;
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
      const resolvedPatch =
        typeof patch === "function" ? patch(currentRecord) : patch;
      const nextRecord = {
        namespace,
        version: PERSISTENCE_RECORD_VERSION,
        ...createEmptyPersistedState(),
        ...currentRecord,
        ...resolvedPatch,
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
    saveGlobalRuntime: async (globalRuntime) =>
      writeNamespaceRecord({
        databasePromise,
        objectStoreName,
        namespace: resolvedNamespace,
        patch: {
          globalRuntime: isPlainObject(globalRuntime) ? globalRuntime : {},
        },
      }),
    applyScopedDataUpdates: async (updates) =>
      writeNamespaceRecord({
        databasePromise,
        objectStoreName,
        namespace: resolvedNamespace,
        patch: (currentRecord) =>
          createPersistedStatePatch(currentRecord, updates),
      }),
  };
};

export default createIndexedDbPersistence;
