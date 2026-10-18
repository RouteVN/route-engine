// Opt-in strict validation of authored engine input.
//
// The default mode keeps the engine's historical tolerance. Strict mode adds
// eager checks at initialization and project-data replacement. Each failure
// throws an Error with a stable `code` and a JSON Pointer `path` (RFC 6901)
// into the object passed to `init({ initialState })` or to the
// `updateProjectData` payload, so both paths start with `/projectData`.

const DEFAULT_VALIDATION_MODE = "default";
export const STRICT_VALIDATION_MODE = "strict";

const VALIDATION_MODES = new Set([
  DEFAULT_VALIDATION_MODE,
  STRICT_VALIDATION_MODE,
]);

// Stable error codes. Hosts and tests match these, never message text.
const LONE_SURROGATE = "lone_surrogate";
const RESERVED_KEY = "reserved_key";
const UNKNOWN_FIELD = "unknown_field";
const MISSING_FIELD = "missing_field";
const INVALID_VALUE = "invalid_value";
const UNKNOWN_REFERENCE = "unknown_reference";
const UNKNOWN_ACTION = "unknown_action";

// Keys that JavaScript property access treats specially. The engine already
// refuses all three as L10n IDs and template path segments, and "__proto__"
// as a variable ID; assigning "__proto__" through obj[key] sets a prototype
// instead of an entry.
const RESERVED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Action types an author may write in a story line batch: the properties of
// presentationActions.yaml and systemActions.yaml (exactly the line action
// properties of story.yaml) plus the public actions docs/RouteEngine.md
// documents that the schemas do not list yet. Internal store actions such as
// appendPendingEffect or markLineCompleted are not authored actions.
export const AUTHORED_ACTION_TYPES = Object.freeze([
  "cleanAll",
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
  "conditional",
  "random",
  "nextLine",
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
  "updateLocalizationPackage",
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
  "saveSlot",
  "loadSlot",
  "resetStoryAtSection",
  "sectionTransition",
  "jumpToLine",
  "pushOverlay",
  "popOverlay",
  "replaceLastOverlay",
  "clearOverlays",
  "rollbackByOffset",
  "rollbackToLine",
  "updateVariable",
  "updateFormField",
  "submitForm",
  "cancelForm",
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
  "startSceneReplay",
  "finishSceneReplay",
  "exitSceneReplay",
  "moveToSceneReplayPage",
  "moveToNextSceneReplayPage",
  "moveToPreviousSceneReplayPage",
  "addViewedLine",
  "addViewedResource",
  "updateProjectData",
]);

const AUTHORED_ACTION_TYPE_SET = new Set(AUTHORED_ACTION_TYPES);
const PROJECT_DATA_FIELDS = new Set(["config", "screen", "resources", "story"]);
const SCREEN_FIELDS = new Set(["width", "height", "backgroundColor"]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const isPlainContainer = (value) => {
  if (Array.isArray(value)) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const childPath = (path, token) =>
  `${path}/${String(token).replaceAll("~", "~0").replaceAll("/", "~1")}`;

const fail = (code, path, detail) => {
  // JSON.stringify escapes lone surrogates, keeping the message printable.
  const error = new Error(
    `Strict validation failed (${code}) at ${JSON.stringify(path)}: ${detail}`,
  );
  // Hosts identify the failure by code and path, not by message text.
  error.code = code;
  error.path = path;
  throw error;
};

export const normalizeValidationMode = (validation) => {
  if (validation === undefined) {
    return DEFAULT_VALIDATION_MODE;
  }
  if (!VALIDATION_MODES.has(validation)) {
    throw new TypeError(
      'RouteEngine validation must be "default" or "strict" when provided',
    );
  }
  return validation;
};

// Returns the UTF-16 code-unit index of the first unpaired surrogate, or -1.
const findLoneSurrogate = (value) => {
  if (typeof value.isWellFormed === "function" && value.isWellFormed()) {
    return -1;
  }
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
      return index;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      return index;
    }
  }
  return -1;
};

// Walks plain objects and arrays in document order. Strings and keys must be
// well-formed UTF-16 and keys must not be reserved. The pointer is only built
// for a failure, which keeps the walk cheap on large projects.
const assertDocumentKeysAndStrings = (root, rootPath) => {
  const tokens = [];
  const ancestors = new Set();
  const checked = new WeakSet();
  const failAt = (code, detail) =>
    fail(code, tokens.reduce(childPath, rootPath), detail);
  const visit = (value) => {
    if (typeof value === "string") {
      const index = findLoneSurrogate(value);
      if (index !== -1) {
        failAt(
          LONE_SURROGATE,
          `string has an unpaired UTF-16 surrogate at code unit ${index}`,
        );
      }
      return;
    }
    if (!isPlainContainer(value) || checked.has(value)) {
      return;
    }
    if (ancestors.has(value)) {
      failAt(INVALID_VALUE, "value contains a cyclic reference");
    }

    ancestors.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        tokens.push(index);
        visit(item);
        tokens.pop();
      });
    } else {
      for (const key of Object.keys(value)) {
        tokens.push(key);
        if (findLoneSurrogate(key) !== -1) {
          failAt(LONE_SURROGATE, "key has an unpaired UTF-16 surrogate");
        }
        if (RESERVED_OBJECT_KEYS.has(key)) {
          failAt(RESERVED_KEY, `"${key}" is a reserved key`);
        }
        visit(value[key]);
        tokens.pop();
      }
    }
    ancestors.delete(value);
    checked.add(value);
  };

  visit(root);
};

const assertRequiredRecord = (parent, key, parentPath) => {
  const path = childPath(parentPath, key);
  if (!hasOwn(parent, key) || parent[key] === undefined) {
    fail(MISSING_FIELD, path, `${key} is required`);
  }
  if (!isRecord(parent[key])) {
    fail(INVALID_VALUE, path, `${key} must be an object`);
  }
  return parent[key];
};

const assertKnownFields = (value, knownFields, path) => {
  for (const key of Object.keys(value)) {
    if (!knownFields.has(key)) {
      fail(UNKNOWN_FIELD, childPath(path, key), `unknown field "${key}"`);
    }
  }
};

const assertScreen = (projectData, projectDataPath) => {
  const screen = assertRequiredRecord(projectData, "screen", projectDataPath);
  const screenPath = childPath(projectDataPath, "screen");
  assertKnownFields(screen, SCREEN_FIELDS, screenPath);
  for (const dimension of ["width", "height"]) {
    const path = childPath(screenPath, dimension);
    if (screen[dimension] === undefined) {
      fail(MISSING_FIELD, path, `screen ${dimension} is required`);
    }
    if (!Number.isSafeInteger(screen[dimension]) || screen[dimension] <= 0) {
      fail(
        INVALID_VALUE,
        path,
        `screen ${dimension} must be a positive integer`,
      );
    }
  }
};

const assertString = (value, path, label) => {
  if (typeof value !== "string") {
    fail(INVALID_VALUE, path, `${label} must be a string`);
  }
  return value;
};

const assertActionMap = (actions, path) => {
  if (!isRecord(actions)) {
    fail(INVALID_VALUE, path, "actions must be an object");
  }
  for (const actionType of Object.keys(actions)) {
    const actionPath = childPath(path, actionType);
    if (!AUTHORED_ACTION_TYPE_SET.has(actionType)) {
      fail(
        UNKNOWN_ACTION,
        actionPath,
        `"${actionType}" is not an authored action type`,
      );
    }
    const payload = actions[actionType];
    if (!isRecord(payload)) {
      fail(INVALID_VALUE, actionPath, "action payload must be an object");
    }

    // Nested batches the action schemas type as action maps.
    if (actionType === "conditional" && Array.isArray(payload.branches)) {
      const branchesPath = childPath(actionPath, "branches");
      payload.branches.forEach((branch, index) => {
        if (isRecord(branch) && branch.actions !== undefined) {
          assertActionMap(
            branch.actions,
            childPath(childPath(branchesPath, index), "actions"),
          );
        }
      });
    }
    if (
      actionType === "random" &&
      isRecord(payload.distribution) &&
      Array.isArray(payload.distribution.outcomes)
    ) {
      const outcomesPath = childPath(
        childPath(actionPath, "distribution"),
        "outcomes",
      );
      payload.distribution.outcomes.forEach((outcome, index) => {
        if (isRecord(outcome) && outcome.actions !== undefined) {
          assertActionMap(
            outcome.actions,
            childPath(childPath(outcomesPath, index), "actions"),
          );
        }
      });
    }
  }
};

const assertSection = (section, sectionPath) => {
  if (!isRecord(section)) {
    fail(INVALID_VALUE, sectionPath, "section must be an object");
  }
  const linesPath = childPath(sectionPath, "lines");
  if (section.lines === undefined) {
    fail(MISSING_FIELD, linesPath, "lines is required");
  }
  if (!Array.isArray(section.lines)) {
    fail(INVALID_VALUE, linesPath, "lines must be an array");
  }
  if (section.lines.length === 0) {
    fail(INVALID_VALUE, linesPath, "lines must contain at least one line");
  }

  const lineIds = new Set();
  section.lines.forEach((line, index) => {
    const linePath = childPath(linesPath, index);
    if (!isRecord(line)) {
      fail(INVALID_VALUE, linePath, "line must be an object");
    }
    const idPath = childPath(linePath, "id");
    if (line.id === undefined) {
      fail(MISSING_FIELD, idPath, "line id is required");
    }
    lineIds.add(assertString(line.id, idPath, "line id"));
    if (line.actions !== undefined) {
      assertActionMap(line.actions, childPath(linePath, "actions"));
    }
  });

  if (section.initialLineId !== undefined) {
    const path = childPath(sectionPath, "initialLineId");
    const lineId = assertString(section.initialLineId, path, "initialLineId");
    if (!lineIds.has(lineId)) {
      fail(UNKNOWN_REFERENCE, path, `line "${lineId}" does not exist`);
    }
  }
};

const assertStory = (projectData, projectDataPath) => {
  const story = assertRequiredRecord(projectData, "story", projectDataPath);
  const storyPath = childPath(projectDataPath, "story");
  const scenes = assertRequiredRecord(story, "scenes", storyPath);
  const scenesPath = childPath(storyPath, "scenes");

  const initialScenePath = childPath(storyPath, "initialSceneId");
  if (story.initialSceneId === undefined) {
    fail(MISSING_FIELD, initialScenePath, "initialSceneId is required");
  }
  const initialSceneId = assertString(
    story.initialSceneId,
    initialScenePath,
    "initialSceneId",
  );
  if (!hasOwn(scenes, initialSceneId)) {
    fail(
      UNKNOWN_REFERENCE,
      initialScenePath,
      `scene "${initialSceneId}" does not exist`,
    );
  }

  for (const [sceneId, scene] of Object.entries(scenes)) {
    const scenePath = childPath(scenesPath, sceneId);
    if (!isRecord(scene)) {
      fail(INVALID_VALUE, scenePath, "scene must be an object");
    }
    const sections = assertRequiredRecord(scene, "sections", scenePath);
    const sectionsPath = childPath(scenePath, "sections");
    const initialSectionPath = childPath(scenePath, "initialSectionId");
    if (scene.initialSectionId === undefined && sceneId === initialSceneId) {
      fail(
        MISSING_FIELD,
        initialSectionPath,
        "the initial scene requires initialSectionId",
      );
    }
    if (scene.initialSectionId !== undefined) {
      const sectionId = assertString(
        scene.initialSectionId,
        initialSectionPath,
        "initialSectionId",
      );
      if (!hasOwn(sections, sectionId)) {
        fail(
          UNKNOWN_REFERENCE,
          initialSectionPath,
          `section "${sectionId}" does not exist in scene "${sceneId}"`,
        );
      }
    }
    for (const [sectionId, section] of Object.entries(sections)) {
      assertSection(section, childPath(sectionsPath, sectionId));
    }
  }
};

// Validates canonical project data, before L10n resolution.
export const assertStrictProjectData = (projectData) => {
  const projectDataPath = "/projectData";
  if (projectData === undefined) {
    fail(MISSING_FIELD, projectDataPath, "projectData is required");
  }
  assertDocumentKeysAndStrings(projectData, projectDataPath);
  if (!isRecord(projectData)) {
    fail(INVALID_VALUE, projectDataPath, "projectData must be an object");
  }
  assertKnownFields(projectData, PROJECT_DATA_FIELDS, projectDataPath);
  assertScreen(projectData, projectDataPath);
  if (projectData.resources !== undefined && !isRecord(projectData.resources)) {
    fail(
      INVALID_VALUE,
      childPath(projectDataPath, "resources"),
      "resources must be an object",
    );
  }
  assertStory(projectData, projectDataPath);
};

export const assertStrictInitialState = ({ projectData, l10nData }) => {
  assertStrictProjectData(projectData);
  if (l10nData !== undefined) {
    assertDocumentKeysAndStrings(l10nData, "/l10nData");
  }
};
