export const RUNTIME_FIELDS = Object.freeze({
  dialogueTextSpeed: {
    source: "global.dialogueTextSpeed",
  },
  autoForwardDelay: {
    source: "global.autoForwardDelay",
  },
  autoForwardSpeed: {
    source: "global.autoForwardSpeed",
  },
  skipUnseenText: {
    source: "global.skipUnseenText",
  },
  skipTransitionsAndAnimations: {
    source: "global.skipTransitionsAndAnimations",
  },
  soundVolume: {
    source: "global.soundVolume",
  },
  musicVolume: {
    source: "global.musicVolume",
  },
  muteAll: {
    source: "global.muteAll",
  },
  localizationPackageId: {
    source: "global.localizationPackageId",
  },
  saveLoadPagination: {
    source: "context.runtime.saveLoadPagination",
  },
  menuPage: {
    source: "context.runtime.menuPage",
  },
  menuEntryPoint: {
    source: "context.runtime.menuEntryPoint",
  },
  autoMode: {
    source: "global.autoMode",
  },
  skipMode: {
    source: "global.skipMode",
  },
  dialogueUIHidden: {
    source: "global.dialogueUIHidden",
  },
  isLineCompleted: {
    source: "global.isLineCompleted",
  },
});

export const GLOBAL_RUNTIME_DEFAULTS = Object.freeze({
  dialogueTextSpeed: 50,
  autoForwardDelay: 1000,
  autoForwardSpeed: 50,
  skipUnseenText: false,
  skipTransitionsAndAnimations: false,
  soundVolume: 50,
  musicVolume: 50,
  muteAll: false,
  localizationPackageId: null,
  autoMode: false,
  skipMode: false,
  dialogueUIHidden: false,
  isLineCompleted: false,
});

export const CONTEXT_RUNTIME_DEFAULTS = Object.freeze({
  saveLoadPagination: 1,
  menuPage: "",
  menuEntryPoint: "",
});

export const RUNTIME_FIELD_TYPES = Object.freeze({
  dialogueTextSpeed: "number",
  autoForwardDelay: "number",
  autoForwardSpeed: "number",
  skipUnseenText: "boolean",
  skipTransitionsAndAnimations: "boolean",
  soundVolume: "number",
  musicVolume: "number",
  muteAll: "boolean",
  localizationPackageId: "nullableString",
  saveLoadPagination: "number",
  menuPage: "string",
  menuEntryPoint: "string",
  autoMode: "boolean",
  skipMode: "boolean",
  dialogueUIHidden: "boolean",
  isLineCompleted: "boolean",
});

export const PERSISTED_GLOBAL_RUNTIME_FIELDS = Object.freeze([
  "dialogueTextSpeed",
  "autoForwardDelay",
  "autoForwardSpeed",
  "skipUnseenText",
  "skipTransitionsAndAnimations",
  "soundVolume",
  "musicVolume",
  "muteAll",
  "localizationPackageId",
]);

export const PROJECT_RUNTIME_DEFAULT_FIELDS = Object.freeze([
  "dialogueTextSpeed",
  "autoForwardDelay",
  "autoForwardSpeed",
  "skipUnseenText",
  "skipTransitionsAndAnimations",
  "soundVolume",
  "musicVolume",
  "muteAll",
]);

export const CONTEXT_RUNTIME_FIELDS = Object.freeze([
  "saveLoadPagination",
  "menuPage",
  "menuEntryPoint",
]);

const isRecord = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const assertRuntimeValueType = (runtimeId, value) => {
  const type = RUNTIME_FIELD_TYPES[runtimeId];

  if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${runtimeId} requires a finite numeric value`);
    }
    return;
  }

  if (type === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${runtimeId} requires a boolean value`);
    }
    return;
  }

  if (type === "string") {
    if (typeof value !== "string") {
      throw new Error(`${runtimeId} requires a string value`);
    }
    return;
  }

  if (type === "nullableString") {
    if (value !== null && typeof value !== "string") {
      throw new Error(`${runtimeId} requires a string or null value`);
    }
    return;
  }

  throw new Error(`Unsupported runtime field "${runtimeId}"`);
};

export const normalizeRuntimeValue = (runtimeId, value) => {
  assertRuntimeValueType(runtimeId, value);

  if (runtimeId === "autoForwardDelay" && value < 0) {
    throw new Error(
      "autoForwardDelay requires a value greater than or equal to 0",
    );
  }

  if (
    ["autoForwardSpeed", "soundVolume", "musicVolume"].includes(runtimeId) &&
    (value < 0 || value > 100)
  ) {
    throw new Error(`${runtimeId} requires a value between 0 and 100`);
  }

  if (runtimeId === "saveLoadPagination") {
    return Math.max(1, Math.trunc(value));
  }

  return value;
};

export const resolveProjectRuntimeDefaults = (projectData = {}) => {
  const config = projectData?.config;
  if (config === undefined) {
    return { ...GLOBAL_RUNTIME_DEFAULTS };
  }
  if (!isRecord(config)) {
    throw new Error("projectData.config must be an object");
  }

  const unsupportedConfigField = Object.keys(config).find(
    (field) => field !== "runtimeDefaults",
  );
  if (unsupportedConfigField) {
    throw new Error(
      `projectData.config contains unsupported field "${unsupportedConfigField}"`,
    );
  }

  const authoredDefaults = config.runtimeDefaults;
  if (authoredDefaults === undefined) {
    return { ...GLOBAL_RUNTIME_DEFAULTS };
  }
  if (!isRecord(authoredDefaults)) {
    throw new Error("projectData.config.runtimeDefaults must be an object");
  }

  const allowedFields = new Set(PROJECT_RUNTIME_DEFAULT_FIELDS);
  const unsupportedRuntimeField = Object.keys(authoredDefaults).find(
    (field) => !allowedFields.has(field),
  );
  if (unsupportedRuntimeField) {
    throw new Error(
      `projectData.config.runtimeDefaults contains unsupported field "${unsupportedRuntimeField}"`,
    );
  }

  const defaults = { ...GLOBAL_RUNTIME_DEFAULTS };
  PROJECT_RUNTIME_DEFAULT_FIELDS.forEach((runtimeId) => {
    if (authoredDefaults[runtimeId] !== undefined) {
      defaults[runtimeId] = normalizeRuntimeValue(
        runtimeId,
        authoredDefaults[runtimeId],
      );
    }
  });
  return defaults;
};

const readRuntimeValueFromState = (state, source) => {
  if (source.startsWith("global.")) {
    const key = source.slice("global.".length);
    return state?.global?.[key];
  }

  if (source.startsWith("context.runtime.")) {
    const key = source.slice("context.runtime.".length);
    const contexts = Array.isArray(state?.contexts) ? state.contexts : [];
    const lastContext = contexts[contexts.length - 1];
    return lastContext?.runtime?.[key];
  }

  return undefined;
};

export const selectRuntimeFromState = (state) => {
  return Object.fromEntries(
    Object.entries(RUNTIME_FIELDS).map(([runtimeId, config]) => {
      const sourceValue = readRuntimeValueFromState(state, config.source);
      const defaultValue =
        sourceValue !== undefined
          ? sourceValue
          : (GLOBAL_RUNTIME_DEFAULTS[runtimeId] ??
            CONTEXT_RUNTIME_DEFAULTS[runtimeId]);

      return [runtimeId, defaultValue];
    }),
  );
};

export const selectRuntimeValueFromState = (state, runtimeId) => {
  const runtime = selectRuntimeFromState(state);
  return runtime[runtimeId];
};

export const pickPersistedGlobalRuntime = (globalState = {}) => {
  return Object.fromEntries(
    PERSISTED_GLOBAL_RUNTIME_FIELDS.map((runtimeId) => [
      runtimeId,
      globalState[runtimeId] ?? GLOBAL_RUNTIME_DEFAULTS[runtimeId],
    ]),
  );
};
