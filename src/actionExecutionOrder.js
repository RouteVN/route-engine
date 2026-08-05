const freezePhase = (name, actions) =>
  Object.freeze({ name, actions: Object.freeze(actions) });

// This is a public execution contract, not an implementation inventory.
// Reordering an entry changes authored batch semantics and requires docs/tests.
export const ACTION_EXECUTION_PHASES = Object.freeze([
  freezePhase("cleanup", ["clearPendingEffects", "cleanAll"]),
  freezePhase("state", [
    "addViewedLine",
    "addViewedResource",
    "updateVariable",
    "updateFormField",
    "updateProjectData",
    "updateLocalizationPackage",
    "markLineCompleted",
    "random:integer",
  ]),
  freezePhase("decision", [
    "submitForm",
    "cancelForm",
    "random:weighted",
    "conditional",
  ]),
  freezePhase("presentation", [
    "screen",
    "background",
    "dialogue",
    "character",
    "visual",
    "choice",
    "form",
    "sfx",
    "bgm",
    "voice",
    "control",
    "layout",
  ]),
  freezePhase("runtime", [
    "setNextLineConfig",
    "startAutoMode",
    "stopAutoMode",
    "toggleAutoMode",
    "startSkipMode",
    "stopSkipMode",
    "toggleSkipMode",
    "showDialogueUI",
    "hideDialogueUI",
    "toggleDialogueUI",
    "setDialogueTextSpeed",
    "setAutoForwardDelay",
    "setAutoForwardSpeed",
    "setSkipUnseenText",
    "setSkipTransitionsAndAnimations",
    "setSoundVolume",
    "setMusicVolume",
    "setMuteAll",
    "setSaveLoadPagination",
    "incrementSaveLoadPagination",
    "decrementSaveLoadPagination",
    "setMenuPage",
    "setMenuEntryPoint",
    "showConfirmDialog",
    "hideConfirmDialog",
    "pushOverlay",
    "popOverlay",
    "replaceLastOverlay",
    "clearOverlays",
    "completeAchievement",
    "setAchievementProgress",
    "showImageGalleryVariant",
    "moveToPreviousImageGalleryVariant",
    "moveToNextImageGalleryVariant",
    "clearImageGallerySelection",
    "moveToImageGalleryPage",
    "moveToNextImageGalleryPage",
    "moveToPreviousImageGalleryPage",
    "playMusicRoomTrack",
    "playMusicRoom",
    "pauseMusicRoom",
    "stopMusicRoom",
    "seekMusicRoom",
    "playPreviousMusicRoomTrack",
    "playNextMusicRoomTrack",
    "clearMusicRoomSelection",
    "moveToMusicRoomPage",
    "moveToNextMusicRoomPage",
    "moveToPreviousMusicRoomPage",
    "finishSceneReplay",
    "moveToSceneReplayPage",
    "moveToNextSceneReplayPage",
    "moveToPreviousSceneReplayPage",
    "musicRoomSoundReady",
    "musicRoomSoundProgress",
    "musicRoomSoundComplete",
    "musicRoomSoundError",
    "appendPendingEffect",
    "beginRollbackActionBatch",
    "endRollbackActionBatch",
    "ensureRandomReplayOccurrence",
    "recordRandomOutcome",
    "markRollbackCheckpointTransient",
    "markSavedRollbackCheckpointTransient",
    "recordCurrentDialogueHistory",
  ]),
  freezePhase("persistence", ["saveSlot"]),
  freezePhase("navigation", [
    "loadSlot",
    "rollbackByOffset",
    "rollbackToLine",
    "resetStoryAtSection",
    "sectionTransition",
    "jumpToLine",
    "startSceneReplay",
    "exitSceneReplay",
    "nextLine",
    "nextLineFromSystem",
  ]),
]);

const ACTION_EXECUTION_RANKS = new Map();
ACTION_EXECUTION_PHASES.forEach((phase) => {
  phase.actions.forEach((actionKey) => {
    if (ACTION_EXECUTION_RANKS.has(actionKey)) {
      throw new Error(`duplicate action execution key: ${actionKey}`);
    }
    ACTION_EXECUTION_RANKS.set(actionKey, ACTION_EXECUTION_RANKS.size);
  });
});

export const TERMINAL_NAVIGATION_ACTION_TYPES = new Set(
  ACTION_EXECUTION_PHASES.find(({ name }) => name === "navigation").actions,
);
const UNKNOWN_ACTION_RANK = ACTION_EXECUTION_RANKS.get("saveSlot") - 0.5;

const getActionExecutionKey = (actionType, payload) => {
  if (actionType !== "random") {
    return actionType;
  }

  return payload?.distribution?.type === "weighted"
    ? "random:weighted"
    : "random:integer";
};

const compareCodeUnits = (left, right) => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

export const orderActionEntries = (actions) =>
  Object.entries(actions).sort((left, right) => {
    const leftKey = getActionExecutionKey(...left);
    const rightKey = getActionExecutionKey(...right);
    const leftKnownRank = ACTION_EXECUTION_RANKS.get(leftKey);
    const rightKnownRank = ACTION_EXECUTION_RANKS.get(rightKey);
    const leftRank = leftKnownRank ?? UNKNOWN_ACTION_RANK;
    const rightRank = rightKnownRank ?? UNKNOWN_ACTION_RANK;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    if (leftKnownRank !== undefined && rightKnownRank !== undefined) {
      return 0;
    }
    return compareCodeUnits(leftKey, rightKey);
  });

export const isTerminalNavigationActionType = (actionType) =>
  TERMINAL_NAVIGATION_ACTION_TYPES.has(actionType);

export const assertUnambiguousNavigationActions = (entries) => {
  const navigationTypes = entries
    .map(([actionType]) => actionType)
    .filter(isTerminalNavigationActionType);
  if (navigationTypes.length <= 1) {
    return;
  }

  throw new Error(
    `action batch cannot contain multiple navigation actions: ${navigationTypes.join(
      ", ",
    )}`,
  );
};
