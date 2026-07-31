const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const cloneValue = (value) =>
  value === undefined ? undefined : structuredClone(value);

const RESOURCE_PATCH_COLLECTIONS = Object.freeze({
  achievement: "achievements",
  animation: "animations",
  character: "characters",
  color: "colors",
  control: "controls",
  font: "fonts",
  image: "images",
  layout: "layouts",
  particle: "particles",
  sound: "sounds",
  spritesheet: "spritesheets",
  textStyle: "textStyles",
  transform: "transforms",
  video: "videos",
});

const PRESENTATION_ACTION_TYPES = new Set([
  "background",
  "bgm",
  "character",
  "choice",
  "cleanAll",
  "control",
  "dialogue",
  "form",
  "layout",
  "screen",
  "sfx",
  "visual",
  "voice",
]);

const PACKAGE_KEYS = new Set([
  "fallbackLocales",
  "files",
  "formatVersion",
  "locale",
  "patches",
  "sourceLocale",
  "sourceRevision",
]);

const LINE_ACTION_PATCH_KEYS = new Set([
  "actionType",
  "ignoreFields",
  "lineId",
  "mode",
  "payload",
  "type",
]);

const LINE_DIALOGUE_PATCH_KEYS = new Set(["lineId", "mode", "payload", "type"]);

const SCENE_PATCH_KEYS = new Set(["mode", "payload", "sceneId", "type"]);

const RESOURCE_PATCH_KEYS = new Set([
  "mode",
  "operation",
  "payload",
  "resourceId",
  "type",
]);

const FILE_ENTRY_KEYS = new Set(["fileId", "mimeType"]);

const fail = (path, message) => {
  throw new Error(`Invalid l10nData at ${path}: ${message}`);
};

const assertRecord = (value, path) => {
  if (!isRecord(value)) {
    fail(path, "expected an object");
  }
};

const assertArray = (value, path) => {
  if (!Array.isArray(value)) {
    fail(path, "expected an array");
  }
};

const assertString = (value, path) => {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "expected a non-empty string");
  }
};

const assertText = (value, path) => {
  if (typeof value !== "string") {
    fail(path, "expected a string");
  }
};

const assertAllowedKeys = (value, allowedKeys, path) => {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      fail(`${path}.${key}`, "unknown field");
    }
  }
};

const assertRequiredKeys = (value, requiredKeys, path) => {
  for (const key of requiredKeys) {
    if (!hasOwn(value, key)) {
      fail(path, `missing required field "${key}"`);
    }
  }
};

const assertSafeMapId = (value, path) => {
  assertString(value, path);
  if (
    value === "__proto__" ||
    value === "constructor" ||
    value === "prototype"
  ) {
    fail(path, `"${value}" is not a safe ID`);
  }
};

const assertSafeFileId = (value, path) => {
  assertString(value, path);
  if (
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    fail(path, "must be a safe single filename");
  }
};

const deepEqual = (left, right) => {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    return (
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    );
  }

  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    deepEqual(leftKeys, rightKeys) &&
    leftKeys.every((key) => deepEqual(left[key], right[key]))
  );
};

const collectFileIds = (value, fileIds = new Set(), seen = new WeakSet()) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectFileIds(entry, fileIds, seen));
    return fileIds;
  }

  if (!isRecord(value) || seen.has(value)) {
    return fileIds;
  }
  seen.add(value);

  for (const [key, entryValue] of Object.entries(value)) {
    if (key === "fileId" && typeof entryValue === "string") {
      fileIds.add(entryValue);
    }
    collectFileIds(entryValue, fileIds, seen);
  }

  return fileIds;
};

const createLineIndex = (projectData) => {
  const lineIndex = new Map();

  for (const [sceneId, scene] of Object.entries(
    projectData?.story?.scenes ?? {},
  )) {
    for (const [sectionId, section] of Object.entries(scene?.sections ?? {})) {
      for (const [lineIndexInSection, line] of (
        section?.lines ?? []
      ).entries()) {
        if (typeof line?.id !== "string") {
          continue;
        }
        const locations = lineIndex.get(line.id) ?? [];
        locations.push({
          sceneId,
          sectionId,
          lineIndex: lineIndexInSection,
          line,
        });
        lineIndex.set(line.id, locations);
      }
    }
  }

  return lineIndex;
};

const resolveLineLocation = (lineIndex, lineId, path) => {
  const locations = lineIndex.get(lineId) ?? [];
  if (locations.length === 0) {
    fail(path, `lineId "${lineId}" does not exist in projectData`);
  }
  if (locations.length > 1) {
    fail(path, `lineId "${lineId}" is not globally unique in projectData`);
  }
  return locations[0];
};

const getLineAtLocation = (projectData, location) =>
  projectData.story.scenes[location.sceneId].sections[location.sectionId].lines[
    location.lineIndex
  ];

const projectChoiceBehavior = (choice) => ({
  items: (choice?.items ?? []).map((item) => ({
    id: item?.id,
    events: item?.events,
  })),
});

const projectFormBehavior = (form) => {
  const behavior = cloneValue(form ?? {});
  delete behavior.resourceId;
  delete behavior.animations;

  for (const field of Object.values(behavior.fields ?? {})) {
    if (isRecord(field)) {
      delete field.placeholder;
    }
  }

  return behavior;
};

const validateProtectedActionBehavior = (
  actionType,
  sourceAction,
  payload,
  path,
) => {
  if (
    actionType === "choice" &&
    !deepEqual(
      projectChoiceBehavior(sourceAction),
      projectChoiceBehavior(payload),
    )
  ) {
    fail(
      path,
      "choice item IDs and events must remain identical to the source action",
    );
  }

  if (
    actionType === "form" &&
    !deepEqual(projectFormBehavior(sourceAction), projectFormBehavior(payload))
  ) {
    fail(
      path,
      "form behavior must remain identical; only presentation fields and placeholders may change",
    );
  }
};

const validateLineActionPatch = ({ patch, path, lineIndex }) => {
  assertAllowedKeys(patch, LINE_ACTION_PATCH_KEYS, path);
  assertRequiredKeys(patch, ["type", "lineId", "actionType", "payload"], path);
  assertSafeMapId(patch.lineId, `${path}.lineId`);
  assertString(patch.actionType, `${path}.actionType`);
  assertRecord(patch.payload, `${path}.payload`);

  if (patch.mode !== undefined && patch.mode !== "replace") {
    fail(`${path}.mode`, 'line.action supports only "replace"');
  }
  if (!PRESENTATION_ACTION_TYPES.has(patch.actionType)) {
    fail(
      `${path}.actionType`,
      `"${patch.actionType}" is not a localizable presentation action`,
    );
  }

  const location = resolveLineLocation(
    lineIndex,
    patch.lineId,
    `${path}.lineId`,
  );
  const sourceAction = location.line?.actions?.[patch.actionType];
  if (sourceAction === undefined) {
    fail(
      `${path}.actionType`,
      `source line "${patch.lineId}" does not contain action "${patch.actionType}"`,
    );
  }

  if (patch.actionType === "dialogue") {
    if (
      !Array.isArray(patch.ignoreFields) ||
      patch.ignoreFields.length !== 1 ||
      patch.ignoreFields[0] !== "content"
    ) {
      fail(
        `${path}.ignoreFields`,
        'dialogue action replacement requires exactly ["content"]',
      );
    }
    if (hasOwn(patch.payload, "content")) {
      fail(
        `${path}.payload.content`,
        "dialogue content must use a separate line.dialogue patch",
      );
    }
  } else if (patch.ignoreFields !== undefined) {
    fail(
      `${path}.ignoreFields`,
      "ignoreFields is supported only for dialogue actions",
    );
  }

  validateProtectedActionBehavior(
    patch.actionType,
    sourceAction,
    patch.payload,
    `${path}.payload`,
  );

  return {
    kind: "line.action",
    key: `line.action:${patch.lineId}:${patch.actionType}`,
    location,
    patch,
  };
};

const validateDialogueContent = (content, path) => {
  assertArray(content, path);
  content.forEach((entry, index) => {
    assertRecord(entry, `${path}[${index}]`);
    assertAllowedKeys(entry, new Set(["text"]), `${path}[${index}]`);
    assertRequiredKeys(entry, ["text"], `${path}[${index}]`);
    assertText(entry.text, `${path}[${index}].text`);
  });
};

const validateLineDialoguePatch = ({ patch, path, lineIndex }) => {
  assertAllowedKeys(patch, LINE_DIALOGUE_PATCH_KEYS, path);
  assertRequiredKeys(patch, ["type", "lineId", "payload"], path);
  assertSafeMapId(patch.lineId, `${path}.lineId`);
  assertRecord(patch.payload, `${path}.payload`);
  assertAllowedKeys(patch.payload, new Set(["content"]), `${path}.payload`);
  assertRequiredKeys(patch.payload, ["content"], `${path}.payload`);
  validateDialogueContent(patch.payload.content, `${path}.payload.content`);

  if (patch.mode !== undefined && patch.mode !== "replace") {
    fail(`${path}.mode`, 'line.dialogue supports only "replace"');
  }

  const location = resolveLineLocation(
    lineIndex,
    patch.lineId,
    `${path}.lineId`,
  );
  if (location.line?.actions?.dialogue === undefined) {
    fail(
      `${path}.lineId`,
      `source line "${patch.lineId}" does not contain a dialogue action`,
    );
  }

  return {
    kind: "line.dialogue",
    key: `line.dialogue:${patch.lineId}`,
    location,
    patch,
  };
};

const validateScenePatch = ({ patch, path, projectData }) => {
  assertAllowedKeys(patch, SCENE_PATCH_KEYS, path);
  assertRequiredKeys(patch, ["type", "mode", "sceneId", "payload"], path);
  assertSafeMapId(patch.sceneId, `${path}.sceneId`);
  assertRecord(patch.payload, `${path}.payload`);
  assertAllowedKeys(patch.payload, new Set(["name"]), `${path}.payload`);
  assertRequiredKeys(patch.payload, ["name"], `${path}.payload`);
  assertText(patch.payload.name, `${path}.payload.name`);

  if (patch.mode !== "patch") {
    fail(`${path}.mode`, 'story.scene requires "patch"');
  }
  if (!hasOwn(projectData?.story?.scenes ?? {}, patch.sceneId)) {
    fail(`${path}.sceneId`, `sceneId "${patch.sceneId}" does not exist`);
  }

  return {
    kind: "story.scene",
    key: `story.scene:${patch.sceneId}`,
    patch,
  };
};

const validateResourcePayload = (resourceType, payload, path) => {
  assertRecord(payload, path);

  if (
    ["font", "image", "sound", "spritesheet", "video"].includes(resourceType)
  ) {
    assertString(payload.fileId, `${path}.fileId`);
  }

  if (["image", "video"].includes(resourceType)) {
    if (!Number.isInteger(payload.width)) {
      fail(`${path}.width`, "expected an integer");
    }
    if (!Number.isInteger(payload.height)) {
      fail(`${path}.height`, "expected an integer");
    }
  }

  if (resourceType === "spritesheet") {
    assertRecord(payload.jsonData, `${path}.jsonData`);
    if (!Number.isInteger(payload.width)) {
      fail(`${path}.width`, "expected an integer");
    }
    if (!Number.isInteger(payload.height)) {
      fail(`${path}.height`, "expected an integer");
    }
  }

  if (resourceType === "color") {
    if (
      typeof payload.hex !== "string" ||
      !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(payload.hex)
    ) {
      fail(`${path}.hex`, "expected an opaque #RGB or #RRGGBB color");
    }
  }
};

const validateResourcePatch = ({
  patch,
  path,
  projectData,
  packageFileIds,
  canonicalFileIds,
}) => {
  assertAllowedKeys(patch, RESOURCE_PATCH_KEYS, path);
  assertRequiredKeys(patch, ["type", "resourceId", "payload"], path);
  assertSafeMapId(patch.resourceId, `${path}.resourceId`);

  const resourceType = patch.type.slice("resource.".length);
  const collectionName = RESOURCE_PATCH_COLLECTIONS[resourceType];
  if (!collectionName) {
    fail(`${path}.type`, `unsupported resource patch type "${patch.type}"`);
  }

  if (patch.mode !== undefined && patch.mode !== "replace") {
    fail(`${path}.mode`, 'resource patches support only "replace"');
  }
  if (patch.operation !== undefined && patch.operation !== "add") {
    fail(`${path}.operation`, 'the only resource operation is "add"');
  }

  validateResourcePayload(resourceType, patch.payload, `${path}.payload`);

  const sourceCollection = projectData?.resources?.[collectionName] ?? {};
  const sourceHasResource = hasOwn(sourceCollection, patch.resourceId);
  if (patch.operation === "add" && sourceHasResource) {
    fail(
      `${path}.resourceId`,
      `cannot add existing ${resourceType} resource "${patch.resourceId}"`,
    );
  }
  if (patch.operation !== "add" && !sourceHasResource) {
    fail(
      `${path}.resourceId`,
      `cannot replace missing ${resourceType} resource "${patch.resourceId}"`,
    );
  }

  for (const fileId of collectFileIds(patch.payload)) {
    if (!packageFileIds.has(fileId) && !canonicalFileIds.has(fileId)) {
      fail(
        `${path}.payload`,
        `fileId "${fileId}" is not declared by this package or the canonical project`,
      );
    }
  }

  return {
    kind: "resource",
    key: `${patch.type}:${patch.resourceId}`,
    collectionName,
    patch,
  };
};

const validatePatch = ({
  patch,
  path,
  projectData,
  lineIndex,
  packageFileIds,
  canonicalFileIds,
}) => {
  assertRecord(patch, path);
  assertString(patch.type, `${path}.type`);

  if (patch.type === "line.action") {
    return validateLineActionPatch({ patch, path, lineIndex });
  }
  if (patch.type === "line.dialogue") {
    return validateLineDialoguePatch({ patch, path, lineIndex });
  }
  if (patch.type === "story.scene") {
    return validateScenePatch({ patch, path, projectData });
  }
  if (patch.type.startsWith("resource.")) {
    return validateResourcePatch({
      patch,
      path,
      projectData,
      packageFileIds,
      canonicalFileIds,
    });
  }

  fail(`${path}.type`, `unsupported patch type "${patch.type}"`);
};

const validateFileEntries = (files, path) => {
  assertArray(files, path);
  const fileIds = new Set();

  files.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    assertRecord(entry, entryPath);
    assertAllowedKeys(entry, FILE_ENTRY_KEYS, entryPath);
    assertRequiredKeys(entry, ["fileId"], entryPath);
    assertSafeFileId(entry.fileId, `${entryPath}.fileId`);
    if (
      entry.mimeType !== undefined &&
      (typeof entry.mimeType !== "string" || entry.mimeType.length === 0)
    ) {
      fail(`${entryPath}.mimeType`, "expected a non-empty string");
    }
    if (fileIds.has(entry.fileId)) {
      fail(`${entryPath}.fileId`, `duplicate fileId "${entry.fileId}"`);
    }
    fileIds.add(entry.fileId);
  });

  return fileIds;
};

const validatePackage = ({
  packageId,
  packageData,
  path,
  projectData,
  lineIndex,
  canonicalFileIds,
}) => {
  assertRecord(packageData, path);
  assertAllowedKeys(packageData, PACKAGE_KEYS, path);
  assertRequiredKeys(
    packageData,
    [
      "formatVersion",
      "locale",
      "sourceLocale",
      "sourceRevision",
      "fallbackLocales",
      "files",
      "patches",
    ],
    path,
  );

  if (packageData.formatVersion !== 1) {
    fail(`${path}.formatVersion`, "only formatVersion 1 is supported");
  }
  assertString(packageData.locale, `${path}.locale`);
  assertString(packageData.sourceLocale, `${path}.sourceLocale`);
  assertString(packageData.sourceRevision, `${path}.sourceRevision`);
  assertArray(packageData.fallbackLocales, `${path}.fallbackLocales`);
  packageData.fallbackLocales.forEach((locale, index) =>
    assertString(locale, `${path}.fallbackLocales[${index}]`),
  );
  if (
    new Set(packageData.fallbackLocales).size !==
    packageData.fallbackLocales.length
  ) {
    fail(`${path}.fallbackLocales`, "must not contain duplicate locales");
  }

  const packageFileIds = validateFileEntries(
    packageData.files,
    `${path}.files`,
  );
  assertArray(packageData.patches, `${path}.patches`);

  const patchKeys = new Set();
  const patches = packageData.patches.map((patch, index) => {
    const validatedPatch = validatePatch({
      patch,
      path: `${path}.patches[${index}]`,
      projectData,
      lineIndex,
      packageFileIds,
      canonicalFileIds,
    });
    if (patchKeys.has(validatedPatch.key)) {
      fail(
        `${path}.patches[${index}]`,
        `duplicate patch target "${validatedPatch.key}"`,
      );
    }
    patchKeys.add(validatedPatch.key);
    return validatedPatch;
  });

  return {
    id: packageId,
    data: packageData,
    fileIds: packageFileIds,
    patches,
  };
};

const validateL10nData = ({ projectData, l10nData }) => {
  if (l10nData === undefined) {
    return {
      activeL10nId: null,
      packages: new Map(),
    };
  }

  assertRecord(l10nData, "l10nData");
  assertAllowedKeys(
    l10nData,
    new Set(["activeL10nId", "packages"]),
    "l10nData",
  );
  assertRequiredKeys(l10nData, ["packages"], "l10nData");
  assertRecord(l10nData.packages, "l10nData.packages");

  if (l10nData.activeL10nId !== undefined && l10nData.activeL10nId !== null) {
    assertSafeMapId(l10nData.activeL10nId, "l10nData.activeL10nId");
  }

  const lineIndex = createLineIndex(projectData);
  const canonicalFileIds = collectFileIds(projectData?.resources ?? {});
  const packages = new Map();
  const importedFileOwners = new Map();
  let sourceLocale;

  for (const [packageId, packageData] of Object.entries(l10nData.packages)) {
    assertSafeMapId(packageId, `l10nData.packages.${packageId}`);
    const validatedPackage = validatePackage({
      packageId,
      packageData,
      path: `l10nData.packages.${packageId}`,
      projectData,
      lineIndex,
      canonicalFileIds,
    });

    if (sourceLocale === undefined) {
      sourceLocale = packageData.sourceLocale;
    } else if (packageData.sourceLocale !== sourceLocale) {
      fail(
        `l10nData.packages.${packageId}.sourceLocale`,
        `expected source locale "${sourceLocale}"`,
      );
    }

    for (const fileId of validatedPackage.fileIds) {
      if (canonicalFileIds.has(fileId)) {
        fail(
          `l10nData.packages.${packageId}.files`,
          `fileId "${fileId}" conflicts with a canonical project file`,
        );
      }
      const previousOwner = importedFileOwners.get(fileId);
      if (previousOwner !== undefined) {
        fail(
          `l10nData.packages.${packageId}.files`,
          `fileId "${fileId}" is already declared by package "${previousOwner}"`,
        );
      }
      importedFileOwners.set(fileId, packageId);
    }

    packages.set(packageId, validatedPackage);
  }

  const activeL10nId = l10nData.activeL10nId ?? null;
  if (activeL10nId !== null && !packages.has(activeL10nId)) {
    fail("l10nData.activeL10nId", `package "${activeL10nId}" was not imported`);
  }

  return {
    activeL10nId,
    packages,
  };
};

const resolvePackagePriority = ({ activeL10nId, packages }) => {
  if (activeL10nId === null) {
    return [];
  }

  const packageIdsByLocale = new Map();
  for (const packageEntry of packages.values()) {
    const packageIds = packageIdsByLocale.get(packageEntry.data.locale) ?? [];
    packageIds.push(packageEntry.id);
    packageIdsByLocale.set(packageEntry.data.locale, packageIds);
  }

  const priority = [];
  const included = new Set();
  const visiting = new Set();

  const visit = (packageId) => {
    if (visiting.has(packageId)) {
      fail(
        `l10nData.packages.${packageId}.fallbackLocales`,
        "fallback chain contains a cycle",
      );
    }
    if (included.has(packageId)) {
      return;
    }

    const packageEntry = packages.get(packageId);
    visiting.add(packageId);
    included.add(packageId);
    priority.push(packageEntry);

    for (const fallbackLocale of packageEntry.data.fallbackLocales) {
      if (fallbackLocale === packageEntry.data.sourceLocale) {
        continue;
      }
      const fallbackPackageIds = packageIdsByLocale.get(fallbackLocale) ?? [];
      if (fallbackPackageIds.length > 1) {
        fail(
          `l10nData.packages.${packageId}.fallbackLocales`,
          `locale "${fallbackLocale}" matches multiple imported L10n packages`,
        );
      }
      if (fallbackPackageIds.length === 1) {
        visit(fallbackPackageIds[0]);
      }
    }

    visiting.delete(packageId);
  };

  visit(activeL10nId);
  return priority;
};

const selectPatches = (packagePriority) => {
  const selectedPatches = new Map();
  for (const packageEntry of packagePriority) {
    for (const patch of packageEntry.patches) {
      if (!selectedPatches.has(patch.key)) {
        selectedPatches.set(patch.key, patch);
      }
    }
  }
  return [...selectedPatches.values()];
};

const applyResourcePatch = (projectData, validatedPatch) => {
  const { collectionName, patch } = validatedPatch;
  projectData.resources[collectionName] ??= {};
  projectData.resources[collectionName][patch.resourceId] = cloneValue(
    patch.payload,
  );
};

const applyScenePatch = (projectData, validatedPatch) => {
  const { patch } = validatedPatch;
  const scene = projectData.story.scenes[patch.sceneId];
  scene.name = patch.payload.name;
};

const applyLineActionPatch = (projectData, validatedPatch) => {
  const { location, patch } = validatedPatch;
  const line = getLineAtLocation(projectData, location);

  if (patch.actionType !== "dialogue") {
    line.actions[patch.actionType] = cloneValue(patch.payload);
    return;
  }

  const sourceContent = cloneValue(location.line.actions.dialogue.content);
  line.actions.dialogue = cloneValue(patch.payload);
  if (sourceContent !== undefined) {
    line.actions.dialogue.content = sourceContent;
  }
};

const applyLineDialoguePatch = (projectData, validatedPatch) => {
  const { location, patch } = validatedPatch;
  const line = getLineAtLocation(projectData, location);
  line.actions.dialogue.content = cloneValue(patch.payload.content);
};

/**
 * Validates optional L10n input and materializes the active read-only overlay.
 * The supplied canonical project and L10n data are never mutated.
 */
export const resolveL10nProjectData = ({ projectData, l10nData }) => {
  const validatedL10nData = validateL10nData({ projectData, l10nData });
  for (const packageId of validatedL10nData.packages.keys()) {
    resolvePackagePriority({
      activeL10nId: packageId,
      packages: validatedL10nData.packages,
    });
  }
  const packagePriority = resolvePackagePriority(validatedL10nData);
  if (packagePriority.length === 0) {
    return projectData;
  }

  const resolvedProjectData = cloneValue(projectData);
  const selectedPatches = selectPatches(packagePriority);

  selectedPatches
    .filter((patch) => patch.kind === "resource")
    .forEach((patch) => applyResourcePatch(resolvedProjectData, patch));
  selectedPatches
    .filter((patch) => patch.kind === "story.scene")
    .forEach((patch) => applyScenePatch(resolvedProjectData, patch));
  selectedPatches
    .filter((patch) => patch.kind === "line.action")
    .forEach((patch) => applyLineActionPatch(resolvedProjectData, patch));
  selectedPatches
    .filter((patch) => patch.kind === "line.dialogue")
    .forEach((patch) => applyLineDialoguePatch(resolvedProjectData, patch));

  return resolvedProjectData;
};
