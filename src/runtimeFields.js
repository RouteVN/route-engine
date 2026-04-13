export const RUNTIME_FIELDS = Object.freeze({
  dialogueTextSpeed: {
    source: "global.dialogueTextSpeed",
  },
  autoForwardDelay: {
    source: "global.autoForwardDelay",
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
  skipUnseenText: false,
  skipTransitionsAndAnimations: false,
  soundVolume: 50,
  musicVolume: 50,
  muteAll: false,
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
  skipUnseenText: "boolean",
  skipTransitionsAndAnimations: "boolean",
  soundVolume: "number",
  musicVolume: "number",
  muteAll: "boolean",
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
