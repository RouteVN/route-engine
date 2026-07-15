import { parseAndRender } from "jempl";
import { interpolateDialogueText } from "../dialogueText.js";
import {
  createSequentialActionsExecutor,
  formatDate,
  resolveCharacterDisplayName,
} from "../util.js";
import { GLOBAL_RUNTIME_DEFAULTS } from "../runtimeFields.js";
import {
  DEFAULT_VISUAL_LAYER,
  VISUAL_LAYER,
  VISUAL_LAYER_VALUES,
} from "../renderLayers.js";

const jemplFunctions = {
  objectValues: (obj) =>
    Object.entries(obj).map(([id, value]) => ({ id, ...value })),
  formatDate,
};

const LOOP_DIRECTIVE_RE =
  /^\$for\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?\s+in\s+(.+):$/;

const resolveTemplatePath = (data, expression) => {
  const normalized = String(expression || "").trim();
  if (!normalized) {
    return undefined;
  }

  const parts = normalized.match(/[A-Za-z_][A-Za-z0-9_]*|\[\d+\]/g) || [];
  let current = data;
  for (const part of parts) {
    if (part.startsWith("[")) {
      const index = Number(part.slice(1, -1));
      current = Array.isArray(current) ? current[index] : undefined;
      continue;
    }
    current = current?.[part];
  }
  return current;
};

const expandLoopTemplates = (node, templateData, options) => {
  if (Array.isArray(node)) {
    const expanded = [];

    for (const item of node) {
      if (
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        Object.keys(item).length === 1
      ) {
        const [maybeLoopKey] = Object.keys(item);
        const loopMatch = LOOP_DIRECTIVE_RE.exec(maybeLoopKey);
        if (loopMatch) {
          const [, itemName, indexName, sourceExpression] = loopMatch;
          const iterable = resolveTemplatePath(templateData, sourceExpression);
          if (!Array.isArray(iterable)) {
            continue;
          }

          const loopTemplate = Array.isArray(item[maybeLoopKey])
            ? item[maybeLoopKey]
            : [];
          iterable.forEach((loopItem, loopIndex) => {
            const loopData = {
              ...templateData,
              [itemName]: loopItem,
            };
            if (indexName) {
              loopData[indexName] = loopIndex;
            }

            loopTemplate.forEach((loopNode) => {
              const expandedLoopNode = expandLoopTemplates(
                loopNode,
                loopData,
                options,
              );
              const rendered = parseAndRender(
                expandedLoopNode,
                loopData,
                options,
              );
              if (Array.isArray(rendered)) {
                expanded.push(...rendered);
              } else {
                expanded.push(rendered);
              }
            });
          });
          continue;
        }
      }

      expanded.push(expandLoopTemplates(item, templateData, options));
    }

    return expanded;
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const expanded = {};
  Object.entries(node).forEach(([key, value]) => {
    expanded[key] = expandLoopTemplates(value, templateData, options);
  });
  return expanded;
};

const assertSupportedAnimationType = ({
  animationType,
  animationId,
  animationPath,
}) => {
  if (animationType === undefined) {
    return;
  }

  if (animationType === "update" || animationType === "transition") {
    return;
  }

  throw new Error(
    `[${animationPath}] Animation "${animationId}" has unsupported type "${animationType}". Use "update" or "transition".`,
  );
};

const createAnimationInstance = ({
  id,
  targetId,
  animation,
  playback,
  animationPath = "animation",
}) => {
  const normalized = structuredClone(animation);
  assertSupportedAnimationType({
    animationType: normalized.type,
    animationId: id,
    animationPath,
  });
  delete normalized.name;
  delete normalized.playback;
  normalized.id = id;
  normalized.targetId = targetId;
  if (playback !== undefined) {
    const normalizedPlayback = normalizeAnimationPlayback(
      playback,
      `${animationPath}.playback`,
    );
    if (normalizedPlayback !== undefined) {
      normalized.playback = normalizedPlayback;
    }
  }
  return normalized;
};

const getAnimationType = (
  animation,
  { animationId = "animation", animationPath = "animation" } = {},
) => {
  if (!animation || typeof animation !== "object" || Array.isArray(animation)) {
    return undefined;
  }

  if (typeof animation.type !== "string") {
    return undefined;
  }

  assertSupportedAnimationType({
    animationType: animation.type,
    animationId,
    animationPath,
  });

  return animation.type;
};

const resolveAnimationResourceId = (animationDef) => {
  if (typeof animationDef === "string") {
    return animationDef;
  }

  if (
    !animationDef ||
    typeof animationDef !== "object" ||
    Array.isArray(animationDef)
  ) {
    return undefined;
  }

  return animationDef.resourceId;
};

const resolveAnimationPlayback = (animationDef) => {
  if (
    !animationDef ||
    typeof animationDef !== "object" ||
    Array.isArray(animationDef)
  ) {
    return undefined;
  }

  return animationDef.playback;
};

const normalizeAnimationPlayback = (
  playback,
  animationPath = "animation.playback",
) => {
  if (playback === undefined) {
    return undefined;
  }

  if (!playback || typeof playback !== "object" || Array.isArray(playback)) {
    throw new Error(`[${animationPath}] playback must be an object.`);
  }

  if (
    playback.continuity !== undefined &&
    playback.continuity !== "render" &&
    playback.continuity !== "persistent"
  ) {
    throw new Error(
      `[${animationPath}] playback.continuity must be "render" or "persistent".`,
    );
  }

  if (
    playback.speed !== undefined &&
    (typeof playback.speed !== "number" ||
      !Number.isFinite(playback.speed) ||
      playback.speed <= 0)
  ) {
    throw new Error(
      `[${animationPath}] playback.speed must be a finite number greater than 0.`,
    );
  }

  const normalized = {};

  if (playback.continuity !== undefined) {
    normalized.continuity = playback.continuity;
  }

  if (playback.speed !== undefined && playback.speed !== 1) {
    normalized.speed = playback.speed;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const getAnimationPlaybackSpeed = (animationInstance) => {
  const speed = animationInstance?.playback?.speed;
  return typeof speed === "number" && Number.isFinite(speed) && speed > 0
    ? speed
    : 1;
};

const hasOwnProperty = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

const isPersistentAnimationInstance = (animationInstance) =>
  animationInstance?.playback?.continuity === "persistent";

const sortObjectKeysDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeysDeep);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((sorted, key) => {
      sorted[key] = sortObjectKeysDeep(value[key]);
      return sorted;
    }, {});
};

export const getPersistentAnimationContinuationKey = (animationInstance) => {
  if (
    !animationInstance ||
    typeof animationInstance !== "object" ||
    Array.isArray(animationInstance)
  ) {
    return null;
  }

  const normalized = structuredClone(animationInstance);
  if (normalized.playback) {
    delete normalized.playback.continuity;
    if (normalized.playback.speed === 1) {
      delete normalized.playback.speed;
    }
    if (Object.keys(normalized.playback).length === 0) {
      delete normalized.playback;
    }
  }
  return JSON.stringify(sortObjectKeysDeep(normalized));
};

export const collectPersistentAnimationContinuations = (animations = []) =>
  animations
    .filter((animationInstance) =>
      isPersistentAnimationInstance(animationInstance),
    )
    .map((animationInstance) => structuredClone(animationInstance));

const getTweenPropertyDurationMs = (tweenProperty) => {
  if (!Array.isArray(tweenProperty?.keyframes)) {
    return 0;
  }

  return tweenProperty.keyframes.reduce((total, keyframe) => {
    const duration =
      typeof keyframe?.duration === "number" &&
      Number.isFinite(keyframe.duration)
        ? keyframe.duration
        : 0;
    return total + duration;
  }, 0);
};

const getTweenDurationMs = (tween) => {
  if (!tween || typeof tween !== "object" || Array.isArray(tween)) {
    return 0;
  }

  return Object.values(tween).reduce((maxDuration, tweenProperty) => {
    return Math.max(maxDuration, getTweenPropertyDurationMs(tweenProperty));
  }, 0);
};

export const getAnimationInstanceDurationMs = (animationInstance) => {
  if (
    !animationInstance ||
    typeof animationInstance !== "object" ||
    Array.isArray(animationInstance)
  ) {
    return 0;
  }

  const authoredDurationMs = Math.max(
    getTweenDurationMs(animationInstance.tween),
    getTweenDurationMs(animationInstance.prev?.tween),
    getTweenDurationMs(animationInstance.next?.tween),
    getTweenPropertyDurationMs(animationInstance.mask?.progress),
  );
  return authoredDurationMs / getAnimationPlaybackSpeed(animationInstance);
};

const hasPersistentAnimationContinuation = ({
  animationInstances,
  activePersistentAnimations,
}) => {
  if (
    !Array.isArray(animationInstances) ||
    animationInstances.length === 0 ||
    !Array.isArray(activePersistentAnimations) ||
    activePersistentAnimations.length === 0
  ) {
    return false;
  }

  const activeContinuationKeys = new Set(
    activePersistentAnimations
      .map(getPersistentAnimationContinuationKey)
      .filter(Boolean),
  );

  return animationInstances.some((animationInstance) => {
    if (!isPersistentAnimationInstance(animationInstance)) {
      return false;
    }

    const continuationKey =
      getPersistentAnimationContinuationKey(animationInstance);
    return continuationKey
      ? activeContinuationKeys.has(continuationKey)
      : false;
  });
};

const shouldEmitAnimationSelection = ({
  animationInstances,
  isLineCompleted,
  skipTransitionsAndAnimations,
  activePersistentAnimations,
  restoredPersistentAnimations,
  isAuthoredOnCurrentLine = true,
}) => {
  if (
    !Array.isArray(animationInstances) ||
    animationInstances.length === 0 ||
    skipTransitionsAndAnimations
  ) {
    return false;
  }

  if (isAuthoredOnCurrentLine && !isLineCompleted) {
    return true;
  }

  if (
    hasPersistentAnimationContinuation({
      animationInstances,
      activePersistentAnimations,
    })
  ) {
    return true;
  }

  if (!isAuthoredOnCurrentLine) {
    return hasPersistentAnimationContinuation({
      animationInstances,
      activePersistentAnimations: restoredPersistentAnimations,
    });
  }

  return false;
};

const hasLegacyAnimationLifecycleConfig = (animationsDef) => {
  if (
    !animationsDef ||
    typeof animationsDef !== "object" ||
    Array.isArray(animationsDef)
  ) {
    return false;
  }

  return ["in", "out", "update"].some(
    (key) => animationsDef[key] !== undefined,
  );
};

const assertNoLegacyAnimationLifecycleConfig = (
  animationsDef,
  animationPath,
) => {
  if (!hasLegacyAnimationLifecycleConfig(animationsDef)) {
    return;
  }

  throw new Error(
    `[${animationPath}] Legacy animations.in/out/update is no longer supported. Use a single animations.resourceId reference.`,
  );
};

const createAnimationInstanceIfPossible = ({
  resources,
  animationId,
  playback,
  instanceId,
  targetId,
  animationPath = "animation",
}) => {
  if (!animationId || !targetId) {
    return false;
  }

  const animation = resources?.animations?.[animationId];
  if (!animation) {
    return null;
  }

  return createAnimationInstance({
    id: instanceId,
    targetId,
    animation,
    playback,
    animationPath,
  });
};

const cloneAnimation = (
  animation,
  { defaultTargetId, defaultId, animationPath = "animation" } = {},
) => {
  if (!animation || typeof animation !== "object" || Array.isArray(animation)) {
    return animation;
  }

  const normalized = structuredClone(animation);
  assertSupportedAnimationType({
    animationType: normalized.type,
    animationId: normalized.id ?? defaultId,
    animationPath,
  });
  normalized.id ??= defaultId;
  normalized.targetId ??= defaultTargetId;
  return normalized;
};

const pushNormalizedLayoutTransitions = ({
  animations,
  transitions,
  defaultTargetId,
  idPrefix,
  animationPathPrefix = idPrefix,
}) => {
  transitions.forEach((transition, index) => {
    animations.push(
      cloneAnimation(transition, {
        defaultTargetId,
        defaultId: `${idPrefix}-transition-${index}`,
        animationPath: `${animationPathPrefix}.transitions[${index}]`,
      }),
    );
  });
};

const ensureDialogueContentItems = (content, path) => {
  if (content === undefined) {
    return [];
  }

  if (
    !Array.isArray(content) ||
    content.some(
      (item) =>
        item === null || typeof item !== "object" || Array.isArray(item),
    )
  ) {
    throw new Error(`${path} must be an array of objects`);
  }

  return content;
};

const getDialogueContentTextLength = ({ content, path, variables }) =>
  ensureDialogueContentItems(content, path).reduce((length, item) => {
    const text = interpolateDialogueText(item.text, { variables });
    return length + `${text ?? ""}`.length;
  }, 0);

const getDuplicateItemIds = (items = []) => {
  const counts = new Map();

  for (const item of items) {
    if (!item?.id) {
      continue;
    }

    counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
  );
};

const getCharacterContainerId = (
  item,
  index = 0,
  duplicateCharacterIds = new Set(),
) => {
  if (!duplicateCharacterIds.has(item?.id)) {
    return `character-container-${item.id}`;
  }

  const spritePartIds =
    item?.sprites?.map(({ resourceId }) => resourceId) || [];

  if (spritePartIds.length === 0) {
    return `character-container-${item.id}`;
  }

  return `character-container-${item.id}-${index}-${spritePartIds.join("-")}`;
};

const getRequiredVisualTransform = (resources, item) => {
  if (!item.transformId) {
    throw new Error(`Visual item "${item.id}" requires transformId`);
  }

  const transform = resources.transforms?.[item.transformId];
  if (!transform) {
    throw new Error(
      `Transform "${item.transformId}" not found for visual item "${item.id}"`,
    );
  }

  return transform;
};

const getBackgroundTransform = (resources, background = {}) => {
  if (!background?.transformId) {
    return undefined;
  }

  const transform = resources.transforms?.[background.transformId];
  if (!transform) {
    throw new Error(
      `Transform "${background.transformId}" not found for background`,
    );
  }

  return transform;
};

const BACKGROUND_TRANSFORM_FIELDS = [
  "x",
  "y",
  "anchorX",
  "anchorY",
  "scaleX",
  "scaleY",
  "rotation",
  "originX",
  "originY",
];

const hasBackgroundTransformOverrides = (background = {}) =>
  BACKGROUND_TRANSFORM_FIELDS.some((field) =>
    hasOwnProperty(background, field),
  );

const resolveBackgroundKind = (resources = {}, resourceId) => {
  if (!resourceId) {
    return undefined;
  }

  if (resources.images?.[resourceId]) {
    return "sprite";
  }

  if (resources.videos?.[resourceId]) {
    return "video";
  }

  if (resources.spritesheets?.[resourceId]) {
    return "spritesheet-animation";
  }

  if (resources.layouts?.[resourceId]) {
    return "container";
  }

  return undefined;
};

const resolveBackgroundTargetId = ({ resourceId, kind }) => {
  if (!resourceId) {
    return undefined;
  }

  if (kind) {
    return `bg-cg-background-${kind}`;
  }

  return `bg-cg-${resourceId}`;
};

const getTextStyleResources = (resources = {}) => resources.textStyles || {};
const getImageResources = (resources = {}) => resources.images || {};

const DEFAULT_SPRITESHEET_ANIMATION_SPEED = 0.5;

const resolveSpritesheetAnimationName = (
  spritesheet = {},
  animationName,
  resourceId,
) => {
  if (animationName) {
    if (!spritesheet.animations?.[animationName]) {
      throw new Error(
        `Animation '${animationName}' not found in spritesheet resource '${resourceId}'`,
      );
    }

    return animationName;
  }

  return Object.keys(spritesheet.animations ?? {})[0];
};

const createAnimatedSpriteElement = ({
  id,
  resourceId,
  spritesheet,
  animationName,
  animationSpeed,
  loop,
  transform = {},
} = {}) => {
  const resolvedAnimationName = resolveSpritesheetAnimationName(
    spritesheet,
    animationName,
    resourceId,
  );
  const animationDef = resolvedAnimationName
    ? spritesheet.animations?.[resolvedAnimationName]
    : undefined;

  if (!animationDef) {
    console.warn(`Spritesheet animation not found: ${resourceId}`);
    return undefined;
  }

  return {
    id,
    type: "spritesheet-animation",
    ...transform,
    width: spritesheet.width,
    height: spritesheet.height,
    src: spritesheet.fileId,
    atlas: spritesheet.jsonData,
    playback: {
      frames: animationDef.frames,
      animationSpeed:
        animationSpeed ??
        animationDef.animationSpeed ??
        DEFAULT_SPRITESHEET_ANIMATION_SPEED,
      loop: loop ?? animationDef.loop ?? true,
    },
  };
};

const createCharacterSpriteLayerElement = ({
  id,
  item,
  resources = {},
} = {}) => {
  const imageResource = resources.images?.[item.resourceId];
  if (imageResource) {
    return {
      type: "sprite",
      id,
      src: imageResource.fileId,
      width: imageResource.width,
      height: imageResource.height,
      x: 0,
      y: 0,
    };
  }

  const spritesheet = resources.spritesheets?.[item.resourceId];
  if (spritesheet) {
    return createAnimatedSpriteElement({
      id,
      resourceId: item.resourceId,
      spritesheet,
      animationName: item.animationName,
      animationSpeed: item.animationSpeed,
      loop: item.loop,
      transform: {
        x: 0,
        y: 0,
      },
    });
  }

  console.warn(`Character sprite resource not found: ${item.resourceId}`);
  return undefined;
};
const getColorResources = (resources = {}) => resources.colors || {};
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const getLayoutResourcePath = (path, key) =>
  path === "root" ? `${key}` : `${path}.${key}`;

const ensureNonEmptyLayoutResourceId = (value, path, fieldName) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `${fieldName} at "${path}" must resolve to a non-empty string`,
    );
  }
};

const ensureNormalizedAlpha = (value, fieldName, textStyleId) => {
  if (value === undefined) {
    return 1;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `${fieldName} for text style "${textStyleId}" must be a number between 0 and 1`,
    );
  }

  if (value < 0 || value > 1) {
    throw new Error(
      `${fieldName} for text style "${textStyleId}" must be a number between 0 and 1`,
    );
  }

  return value;
};

const normalizeHexColor = (value, errorContext) => {
  if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) {
    throw new Error(`${errorContext} must resolve to a hex color`);
  }

  if (value.length === 4) {
    return `#${value
      .slice(1)
      .split("")
      .map((character) => character.repeat(2))
      .join("")}`;
  }

  return value;
};

const applyAlphaToHexColor = (value, alpha, errorContext) => {
  const normalizedHexColor = normalizeHexColor(value, errorContext);

  if (alpha === 1) {
    return normalizedHexColor;
  }

  const red = Number.parseInt(normalizedHexColor.slice(1, 3), 16);
  const green = Number.parseInt(normalizedHexColor.slice(3, 5), 16);
  const blue = Number.parseInt(normalizedHexColor.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const resolveTextStyleResource = (resources = {}, textStyleId) => {
  const textStyleResource = getTextStyleResources(resources)?.[textStyleId];

  if (!textStyleResource) {
    throw new Error(`Text style "${textStyleId}" not found`);
  }

  const fontResource = resources.fonts?.[textStyleResource.fontId];
  if (!fontResource) {
    throw new Error(
      `Font "${textStyleResource.fontId}" not found for text style "${textStyleId}"`,
    );
  }

  const colorResource = resources.colors?.[textStyleResource.colorId];
  if (!colorResource) {
    throw new Error(
      `Color "${textStyleResource.colorId}" not found for text style "${textStyleId}"`,
    );
  }

  const colorAlpha = ensureNormalizedAlpha(
    textStyleResource.colorAlpha,
    "colorAlpha",
    textStyleId,
  );

  const resolvedTextStyle = {
    fontFamily: fontResource.fileId,
    fontSize: textStyleResource.fontSize ?? 16,
    fontWeight: textStyleResource.fontWeight ?? "400",
    fontStyle: textStyleResource.fontStyle ?? "normal",
    lineHeight: textStyleResource.lineHeight ?? 1.2,
    fill: applyAlphaToHexColor(
      colorResource.hex,
      colorAlpha,
      `Color "${textStyleResource.colorId}" for text style "${textStyleId}"`,
    ),
  };

  if (textStyleResource.align !== undefined) {
    resolvedTextStyle.align = textStyleResource.align;
  }

  if (textStyleResource.wordWrap !== undefined) {
    resolvedTextStyle.wordWrap = textStyleResource.wordWrap;
  }

  if (textStyleResource.breakWords !== undefined) {
    resolvedTextStyle.breakWords = textStyleResource.breakWords;
  }

  if (textStyleResource.wordWrapWidth !== undefined) {
    resolvedTextStyle.wordWrapWidth = textStyleResource.wordWrapWidth;
  }

  if (textStyleResource.strokeColorId) {
    const strokeColorResource =
      resources.colors?.[textStyleResource.strokeColorId];

    if (!strokeColorResource) {
      throw new Error(
        `Stroke color "${textStyleResource.strokeColorId}" not found for text style "${textStyleId}"`,
      );
    }

    const strokeAlpha = ensureNormalizedAlpha(
      textStyleResource.strokeAlpha,
      "strokeAlpha",
      textStyleId,
    );

    resolvedTextStyle.strokeColor = applyAlphaToHexColor(
      strokeColorResource.hex,
      strokeAlpha,
      `Stroke color "${textStyleResource.strokeColorId}" for text style "${textStyleId}"`,
    );
  } else if (textStyleResource.strokeAlpha !== undefined) {
    throw new Error(
      `strokeAlpha for text style "${textStyleId}" requires strokeColorId`,
    );
  }

  if (textStyleResource.strokeWidth !== undefined) {
    resolvedTextStyle.strokeWidth = textStyleResource.strokeWidth;
  }

  return resolvedTextStyle;
};

export const resolveTextStyleIds = (node, resources = {}, path = "root") => {
  if (Array.isArray(node)) {
    return node.map((item, index) =>
      resolveTextStyleIds(item, resources, `${path}[${index}]`),
    );
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  if (Object.prototype.hasOwnProperty.call(node, "textStyle")) {
    throw new Error(
      `Inline textStyle is not allowed in layout elements at "${path}". Use textStyleId instead`,
    );
  }

  const resolvedNode = {};

  for (const [key, value] of Object.entries(node)) {
    if (key === "textStyleId") {
      continue;
    }

    resolvedNode[key] = resolveTextStyleIds(
      value,
      resources,
      getLayoutResourcePath(path, key),
    );
  }

  if (node.textStyleId !== undefined) {
    ensureNonEmptyLayoutResourceId(node.textStyleId, path, "textStyleId");

    resolvedNode.textStyle = resolveTextStyleResource(
      resources,
      node.textStyleId,
    );
  }

  return resolvedNode;
};

const resolveColorResource = (resources = {}, colorId) => {
  const colorResource = getColorResources(resources)?.[colorId];

  if (!colorResource) {
    throw new Error(`Color "${colorId}" not found`);
  }

  return normalizeHexColor(colorResource.hex, `Color "${colorId}"`);
};

const getRectColorFieldReplacement = (fieldName) => {
  if (fieldName === "hover.fill") {
    return "hover.colorId";
  }

  if (fieldName === "click.fill") {
    return "click.colorId";
  }

  if (fieldName === "rightClick.fill") {
    return "rightClick.colorId";
  }

  return "colorId";
};

const ensureNoInlineRectInteractionFill = (node, interactionKey, path) => {
  const interaction = node?.[interactionKey];

  if (
    !interaction ||
    typeof interaction !== "object" ||
    Array.isArray(interaction)
  ) {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(interaction, "fill")) {
    throw new Error(
      `Inline ${interactionKey}.fill is not allowed in rect layout elements at "${path}". Use ${getRectColorFieldReplacement(`${interactionKey}.fill`)} instead`,
    );
  }
};

const resolveRectInteractionColorIds = (
  node,
  resources = {},
  path = "root",
) => {
  if (Array.isArray(node)) {
    return node.map((item, index) =>
      resolveColorIds(item, resources, `${path}[${index}]`),
    );
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const resolvedNode = {};

  for (const [key, value] of Object.entries(node)) {
    if (key === "colorId") {
      continue;
    }

    resolvedNode[key] = resolveColorIds(
      value,
      resources,
      getLayoutResourcePath(path, key),
    );
  }

  if (node.colorId !== undefined) {
    ensureNonEmptyLayoutResourceId(node.colorId, path, "colorId");
    resolvedNode.fill = resolveColorResource(resources, node.colorId);
  }

  return resolvedNode;
};

export const resolveColorIds = (node, resources = {}, path = "root") => {
  if (Array.isArray(node)) {
    return node.map((item, index) =>
      resolveColorIds(item, resources, `${path}[${index}]`),
    );
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  if (node.type === "rect") {
    if (Object.prototype.hasOwnProperty.call(node, "fill")) {
      throw new Error(
        `Inline fill is not allowed in rect layout elements at "${path}". Use ${getRectColorFieldReplacement("fill")} instead`,
      );
    }

    ensureNoInlineRectInteractionFill(node, "hover", path);
    ensureNoInlineRectInteractionFill(node, "click", path);
    ensureNoInlineRectInteractionFill(node, "rightClick", path);
  }

  const resolvedNode = {};

  for (const [key, value] of Object.entries(node)) {
    if (node.type === "rect" && key === "colorId") {
      continue;
    }

    if (
      node.type === "rect" &&
      (key === "hover" || key === "click" || key === "rightClick")
    ) {
      resolvedNode[key] = resolveRectInteractionColorIds(
        value,
        resources,
        getLayoutResourcePath(path, key),
      );
      continue;
    }

    resolvedNode[key] = resolveColorIds(
      value,
      resources,
      getLayoutResourcePath(path, key),
    );
  }

  if (node.type === "rect" && node.colorId !== undefined) {
    ensureNonEmptyLayoutResourceId(node.colorId, path, "colorId");
    resolvedNode.fill = resolveColorResource(resources, node.colorId);
  }

  return resolvedNode;
};

const resolveImageResource = (resources = {}, imageId) => {
  const imageResource = getImageResources(resources)?.[imageId];

  if (!imageResource) {
    return null;
  }

  return imageResource;
};

const getSpriteFieldReplacement = (fieldName) => {
  if (
    fieldName === "hoverUrl" ||
    fieldName === "hoverSrc" ||
    fieldName === "hover.src"
  ) {
    return "hoverImageId";
  }

  if (
    fieldName === "clickUrl" ||
    fieldName === "clickSrc" ||
    fieldName === "click.src"
  ) {
    return "clickImageId";
  }

  return "imageId";
};

const ensureNoInlineSpriteInteractionSource = (
  node,
  interactionKey,
  path,
  fieldName,
) => {
  const interaction = node?.[interactionKey];

  if (
    !interaction ||
    typeof interaction !== "object" ||
    Array.isArray(interaction)
  ) {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(interaction, fieldName)) {
    throw new Error(
      `Inline ${interactionKey}.${fieldName} is not allowed in sprite layout elements at "${path}". Use ${getSpriteFieldReplacement(`${interactionKey}.${fieldName}`)} instead`,
    );
  }
};

const setResolvedSpriteInteractionSource = (
  resolvedNode,
  interactionKey,
  source,
) => {
  const interaction = resolvedNode[interactionKey];

  resolvedNode[interactionKey] = {
    ...(interaction &&
    typeof interaction === "object" &&
    !Array.isArray(interaction)
      ? interaction
      : {}),
    src: source,
  };
};

export const resolveImageIds = (node, resources = {}, path = "root") => {
  if (Array.isArray(node)) {
    return node.map((item, index) =>
      resolveImageIds(item, resources, `${path}[${index}]`),
    );
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  if (node.type === "sprite") {
    for (const fieldName of [
      "url",
      "src",
      "hoverUrl",
      "hoverSrc",
      "clickUrl",
      "clickSrc",
    ]) {
      if (Object.prototype.hasOwnProperty.call(node, fieldName)) {
        throw new Error(
          `Inline ${fieldName} is not allowed in sprite layout elements at "${path}". Use ${getSpriteFieldReplacement(fieldName)} instead`,
        );
      }
    }

    ensureNoInlineSpriteInteractionSource(node, "hover", path, "src");
    ensureNoInlineSpriteInteractionSource(node, "click", path, "src");
  }

  const resolvedNode = {};

  for (const [key, value] of Object.entries(node)) {
    if (
      node.type === "sprite" &&
      (key === "imageId" || key === "hoverImageId" || key === "clickImageId")
    ) {
      continue;
    }

    resolvedNode[key] = resolveImageIds(
      value,
      resources,
      getLayoutResourcePath(path, key),
    );
  }

  if (node.type === "sprite" && node.imageId !== undefined) {
    ensureNonEmptyLayoutResourceId(node.imageId, path, "imageId");
    const imageResource = resolveImageResource(resources, node.imageId);
    const imageSource = imageResource?.fileId ?? node.imageId;

    resolvedNode.src = imageSource;

    if (
      resolvedNode.width === undefined &&
      imageResource?.width !== undefined
    ) {
      resolvedNode.width = imageResource.width;
    }

    if (
      resolvedNode.height === undefined &&
      imageResource?.height !== undefined
    ) {
      resolvedNode.height = imageResource.height;
    }
  }

  if (node.type === "sprite" && node.hoverImageId !== undefined) {
    ensureNonEmptyLayoutResourceId(node.hoverImageId, path, "hoverImageId");
    setResolvedSpriteInteractionSource(
      resolvedNode,
      "hover",
      resolveImageResource(resources, node.hoverImageId)?.fileId ??
        node.hoverImageId,
    );
  }

  if (node.type === "sprite" && node.clickImageId !== undefined) {
    ensureNonEmptyLayoutResourceId(node.clickImageId, path, "clickImageId");
    setResolvedSpriteInteractionSource(
      resolvedNode,
      "click",
      resolveImageResource(resources, node.clickImageId)?.fileId ??
        node.clickImageId,
    );
  }

  return resolvedNode;
};

export const resolveLayoutReferences = (node, resources = {}, path = "root") =>
  resolveImageIds(
    resolveColorIds(
      resolveTextStyleIds(node, resources, path),
      resources,
      path,
    ),
    resources,
    path,
  );

export const resolveLayoutResourceIds = resolveLayoutReferences;

const getStoryContainer = (elements = []) => {
  return elements.find((element) => element.id === "story");
};

const DEFAULT_BACKGROUND_COLOR = "#000000";
const BACKGROUND_COLOR_ELEMENT_ID = "bg-cg-background-color";

const resolveBackgroundFill = ({ resources = {}, background = {}, screen }) => {
  if (background?.colorId === undefined) {
    return normalizeHexColor(
      screen?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
      "screen.backgroundColor",
    );
  }

  return resolveColorResource(resources, background.colorId);
};

const getBackgroundOpacity = (background = {}) => {
  if (!hasOwnProperty(background, "opacity")) {
    return undefined;
  }

  return typeof background.opacity === "number"
    ? background.opacity
    : undefined;
};

const getBackgroundBlur = (background = {}) => {
  if (
    !background.blur ||
    typeof background.blur !== "object" ||
    Array.isArray(background.blur)
  ) {
    return undefined;
  }

  return background.blur;
};

const getBackgroundAppearance = (
  background = {},
  { includeDefaultAlpha = false } = {},
) => {
  const opacity = getBackgroundOpacity(background);
  const blur = getBackgroundBlur(background);
  const appearance = {};

  if (includeDefaultAlpha || opacity !== undefined) {
    appearance.alpha = opacity ?? 1;
  }

  if (blur) {
    appearance.blur = blur;
  }

  return appearance;
};

const getScreenOpacity = (screenState = {}) => {
  if (!hasOwnProperty(screenState, "opacity")) {
    return undefined;
  }

  return typeof screenState.opacity === "number"
    ? screenState.opacity
    : undefined;
};

const getScreenBlur = (screenState = {}) => {
  if (
    !screenState.blur ||
    typeof screenState.blur !== "object" ||
    Array.isArray(screenState.blur)
  ) {
    return undefined;
  }

  return screenState.blur;
};

const getScreenAppearance = (screenState = {}) => {
  const opacity = getScreenOpacity(screenState);
  const blur = getScreenBlur(screenState);
  const appearance = {};

  if (opacity !== undefined) {
    appearance.alpha = opacity;
  }

  if (blur) {
    appearance.blur = blur;
  }

  return appearance;
};

const getItemAppearance = (item = {}) => getScreenAppearance(item);

const getElementTransform = (transform = {}, item = {}) => {
  const elementTransform = {
    x: item.x ?? transform.x,
    y: item.y ?? transform.y,
    anchorX: item.anchorX ?? transform.anchorX,
    anchorY: item.anchorY ?? transform.anchorY,
    rotation: item.rotation ?? transform.rotation,
    scaleX: item.scaleX ?? transform.scaleX,
    scaleY: item.scaleY ?? transform.scaleY,
  };

  const originX = item.originX ?? transform.originX;
  const originY = item.originY ?? transform.originY;

  if (originX !== undefined) {
    elementTransform.originX = originX;
  }

  if (originY !== undefined) {
    elementTransform.originY = originY;
  }

  return elementTransform;
};

const VISUAL_TEXT_RESERVED_FIELDS = [
  "id",
  "type",
  "resourceId",
  "transformId",
  "x",
  "y",
  "anchorX",
  "anchorY",
  "scaleX",
  "scaleY",
  "rotation",
  "originX",
  "originY",
  "layer",
  "opacity",
  "blur",
  "animations",
];

const hasCompleteVisualText = (item = {}) =>
  item.text &&
  hasOwnProperty(item.text, "content") &&
  hasOwnProperty(item.text, "textStyleId");

const getVisualSubjectKey = (item = {}) => {
  if (item.resourceId) {
    return item.resourceId;
  }

  if (hasCompleteVisualText(item)) {
    return "text";
  }

  return undefined;
};

const assertVisualTextConfig = (item) => {
  if (!item.text) {
    return;
  }

  if (item.resourceId) {
    throw new Error(
      `Visual item "${item.id}" cannot define both resourceId and text`,
    );
  }

  if (!hasCompleteVisualText(item)) {
    throw new Error(
      `Visual item "${item.id}" text requires content and textStyleId`,
    );
  }

  for (const fieldName of VISUAL_TEXT_RESERVED_FIELDS) {
    if (hasOwnProperty(item.text, fieldName)) {
      throw new Error(
        `Visual item "${item.id}" text.${fieldName} is reserved for the visual item`,
      );
    }
  }
};

const createBackgroundColorElement = ({
  resources,
  background,
  screen = { width: 1920, height: 1080 },
  includeOpacity = false,
}) => {
  const element = {
    id: BACKGROUND_COLOR_ELEMENT_ID,
    type: "rect",
    x: 0,
    y: 0,
    width: screen?.width ?? 1920,
    height: screen?.height ?? 1080,
    fill: resolveBackgroundFill({ resources, background, screen }),
  };

  if (includeOpacity) {
    const opacity = getBackgroundOpacity(background);
    if (opacity !== undefined) {
      element.alpha = opacity;
    }
  }

  return element;
};

const hasRenderableBackgroundResource = (resources = {}, resourceId) => {
  if (!resourceId) {
    return false;
  }

  return !!(
    resources.images?.[resourceId] ||
    resources.videos?.[resourceId] ||
    resources.spritesheets?.[resourceId] ||
    resources.layouts?.[resourceId]
  );
};

const resolveBackgroundAnimationTarget = ({
  resources = {},
  resourceId,
  colorId,
}) => {
  const kind = resolveBackgroundKind(resources, resourceId);

  if (resourceId && (kind || colorId === undefined)) {
    return {
      resourceId,
      targetId: resolveBackgroundTargetId({ resourceId, kind }),
    };
  }

  if (colorId !== undefined) {
    return {
      resourceId: BACKGROUND_COLOR_ELEMENT_ID,
      targetId: BACKGROUND_COLOR_ELEMENT_ID,
    };
  }

  return {
    resourceId: undefined,
    targetId: undefined,
  };
};

const VOLUME_PERCENT_SCALE = 100;
const DEFAULT_AUTHORED_AUDIO_VOLUME = VOLUME_PERCENT_SCALE;

const getLayeredVolume = (volume, runtimeVolume) => {
  return (volume * runtimeVolume) / VOLUME_PERCENT_SCALE;
};

const getEffectiveSoundVolume = (
  runtime = {},
  volume = DEFAULT_AUTHORED_AUDIO_VOLUME,
) => {
  return runtime?.muteAll
    ? 0
    : getLayeredVolume(
        volume,
        runtime?.soundVolume ?? GLOBAL_RUNTIME_DEFAULTS.soundVolume,
      );
};

const getEffectiveMusicVolume = (
  runtime = {},
  volume = DEFAULT_AUTHORED_AUDIO_VOLUME,
) => {
  return runtime?.muteAll
    ? 0
    : getLayeredVolume(
        volume,
        runtime?.musicVolume ?? GLOBAL_RUNTIME_DEFAULTS.musicVolume,
      );
};

const createScopedSfxRenderId = ({ item, index } = {}) => {
  return `sfx:${index}:${item?.resourceId}`;
};

const createLayoutTemplateData = ({
  variables,
  runtime,
  saveSlots = [],
  dialogueState,
  includeInactiveAdvDialogue = false,
  isLineCompleted,
  autoMode,
  skipMode,
  isChoiceVisible,
  isFormVisible,
  canRollback,
  confirmDialog,
  form,
  historyDialogue = [],
  characters = {},
  dialogueUIHidden,
  skipOnlyViewedLines,
  skipTransitionsAndAnimations,
} = {}) => {
  const resolvedRuntime = {
    dialogueTextSpeed: runtime?.dialogueTextSpeed ?? 50,
    autoForwardDelay: runtime?.autoForwardDelay ?? 1000,
    autoForwardSpeed: runtime?.autoForwardSpeed ?? 1,
    skipUnseenText: runtime?.skipUnseenText ?? false,
    skipTransitionsAndAnimations:
      runtime?.skipTransitionsAndAnimations ?? false,
    soundVolume: runtime?.soundVolume ?? 50,
    musicVolume: runtime?.musicVolume ?? 50,
    muteAll: runtime?.muteAll ?? false,
    saveLoadPagination: runtime?.saveLoadPagination ?? 1,
    menuPage: runtime?.menuPage ?? "",
    menuEntryPoint: runtime?.menuEntryPoint ?? "",
    autoMode: runtime?.autoMode ?? autoMode ?? false,
    skipMode: runtime?.skipMode ?? skipMode ?? false,
    dialogueUIHidden: runtime?.dialogueUIHidden ?? dialogueUIHidden ?? false,
    isLineCompleted: runtime?.isLineCompleted ?? isLineCompleted ?? false,
  };
  const dialogue = createDialogueTemplateData({
    dialogueState,
    includeInactiveAdvDialogue,
    characters,
    variables,
    runtime: resolvedRuntime,
  });
  const templateData = {
    variables,
    runtime: resolvedRuntime,
    saveSlots,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    confirmDialog,
    form,
    historyDialogue,
    characters,
  };

  if (dialogue) {
    templateData.dialogue = dialogue;
    templateData.dialogueLines = dialogue.lines;
  }

  return templateData;
};

const SKIP_TEXT_REVEAL_SPEED = 100;

const normalizeTextRevealNodes = (node, transformTextRevealNode) => {
  if (Array.isArray(node)) {
    return node.map((item) =>
      normalizeTextRevealNodes(item, transformTextRevealNode),
    );
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const normalized = { ...node };

  Object.keys(normalized).forEach((key) => {
    normalized[key] = normalizeTextRevealNodes(
      normalized[key],
      transformTextRevealNode,
    );
  });

  if (normalized.type === "text-revealing") {
    return transformTextRevealNode(normalized);
  }

  return normalized;
};

const normalizeCompletedTextReveal = (node) =>
  normalizeTextRevealNodes(node, (textRevealNode) => ({
    ...textRevealNode,
    revealEffect: "none",
  }));

const normalizeSkipTextReveal = (node) =>
  normalizeTextRevealNodes(node, (textRevealNode) => {
    const resolvedBaseSpeed = Number(
      textRevealNode.speed ?? textRevealNode.displaySpeed,
    );
    const nextSpeed = Number.isFinite(resolvedBaseSpeed)
      ? Math.max(resolvedBaseSpeed, SKIP_TEXT_REVEAL_SPEED)
      : SKIP_TEXT_REVEAL_SPEED;

    return {
      ...textRevealNode,
      speed: nextSpeed,
      ...(Object.prototype.hasOwnProperty.call(textRevealNode, "displaySpeed")
        ? { displaySpeed: nextSpeed }
        : {}),
    };
  });

const settleTextRevealIfCompleted = (
  node,
  {
    isLineCompleted = false,
    skipMode = false,
    skipTransitionsAndAnimations = false,
  } = {},
) => {
  if (isLineCompleted || skipTransitionsAndAnimations) {
    return normalizeCompletedTextReveal(node);
  }

  if (skipMode) {
    return normalizeSkipTextReveal(node);
  }

  return node;
};

const createFullscreenClickBlocker = ({
  id,
  screen: currentScreen = { width: 1920, height: 1080 },
}) => ({
  id,
  type: "rect",
  fill: "transparent",
  width: currentScreen.width,
  height: currentScreen.height,
  x: 0,
  y: 0,
  click: {
    payload: {
      actions: {},
    },
  },
});

const tagBypassChoice = (node) => {
  if (Array.isArray(node)) {
    return node.map(tagBypassChoice);
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const taggedNode = {};
  for (const [key, value] of Object.entries(node)) {
    taggedNode[key] = tagBypassChoice(value);
  }

  const clickPayload = taggedNode.click?.payload;
  if (
    !clickPayload ||
    typeof clickPayload !== "object" ||
    Array.isArray(clickPayload)
  ) {
    return taggedNode;
  }

  const actions = clickPayload.actions;
  const nextLineAction =
    actions &&
    typeof actions === "object" &&
    !Array.isArray(actions) &&
    Object.prototype.hasOwnProperty.call(actions, "nextLine")
      ? {
          ...actions.nextLine,
          bypassChoice: true,
        }
      : undefined;

  return {
    ...taggedNode,
    click: {
      ...taggedNode.click,
      payload: {
        ...clickPayload,
        bypassChoice: true,
        ...(nextLineAction
          ? {
              actions: {
                ...actions,
                nextLine: nextLineAction,
              },
            }
          : {}),
      },
    },
  };
};

const FORM_EVENT_KEYS = new Set([
  "click",
  "change",
  "submit",
  "focusEvent",
  "blurEvent",
  "selectionChange",
  "compositionStart",
  "compositionUpdate",
  "compositionEnd",
]);

const FORM_ROLE_SUBMIT = "submit";

const mergeEventActions = (eventConfig, actions, options = {}) => {
  const payload =
    eventConfig?.payload &&
    typeof eventConfig.payload === "object" &&
    !Array.isArray(eventConfig.payload)
      ? eventConfig.payload
      : {};
  const existingActions =
    payload.actions && typeof payload.actions === "object"
      ? payload.actions
      : {};
  const nextActions =
    options.replaceActions === true
      ? actions
      : {
          ...existingActions,
          ...actions,
        };

  return {
    ...(eventConfig || {}),
    payload: {
      ...payload,
      actions: nextActions,
    },
  };
};

const enrichFormElements = (node, form, options = {}) => {
  if (Array.isArray(node)) {
    return node.map((item) => enrichFormElements(item, form, options));
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const isElementNode = typeof node.type === "string";
  const isSubmitRole = isElementNode && node.formRole === FORM_ROLE_SUBMIT;
  const inheritsSubmitRole = isElementNode && options.submitRoleAncestor;
  const childOptions =
    isSubmitRole || inheritsSubmitRole ? { submitRoleAncestor: true } : {};
  const enrichedNode = {};
  for (const [key, value] of Object.entries(node)) {
    enrichedNode[key] = enrichFormElements(
      value,
      form,
      key === "children" ? childOptions : {},
    );
  }

  let formNode = enrichedNode;

  if (formNode.type === "input" && typeof formNode.field === "string") {
    const field = form?.fields?.[formNode.field];

    if (field) {
      const updateFormField = {
        updateFormField: {
          formKey: form.key,
          field: field.id,
          value: "_event.value",
        },
      };

      formNode = {
        ...formNode,
        value: field.value,
        placeholder:
          formNode.placeholder === undefined
            ? field.placeholder
            : formNode.placeholder,
        multiline:
          formNode.multiline === undefined
            ? field.multiline
            : formNode.multiline,
        ...(formNode.maxLength === undefined && field.maxLength !== undefined
          ? { maxLength: field.maxLength }
          : {}),
        change: mergeEventActions(formNode.change, updateFormField),
        submit: mergeEventActions(formNode.submit, form.submitActions),
      };
    }
  }

  if (formNode.formRole === FORM_ROLE_SUBMIT || inheritsSubmitRole) {
    return {
      ...formNode,
      click: mergeEventActions(formNode.click, form.submitActions, {
        replaceActions: true,
      }),
    };
  }

  return formNode;
};

const tagFormInteractionSource = (node, form) => {
  if (Array.isArray(node)) {
    return node.map((item) => tagFormInteractionSource(item, form));
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const taggedNode = {};
  for (const [key, value] of Object.entries(node)) {
    taggedNode[key] = tagFormInteractionSource(value, form);
  }

  for (const eventKey of FORM_EVENT_KEYS) {
    const payload = taggedNode[eventKey]?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      continue;
    }

    taggedNode[eventKey] = {
      ...taggedNode[eventKey],
      payload: {
        ...payload,
        _interactionSource: "form",
      },
    };
  }

  return taggedNode;
};

const createDialogueCharacterTemplateData = ({
  characterId,
  character,
  characterName,
  characters = {},
  variables = {},
} = {}) => {
  const resourceCharacter = characterId ? characters?.[characterId] : undefined;
  const resolvedName = resolveCharacterDisplayName({
    characterId,
    character,
    characterName,
    characters,
    variables,
  });

  return {
    ...(resourceCharacter || {}),
    ...(character || {}),
    name: resolvedName,
  };
};

const createHistoryDialogueTemplateData = (
  dialogueHistory = [],
  characters = {},
  variables = {},
) => {
  return dialogueHistory.map((item) => {
    const character = createDialogueCharacterTemplateData({
      characterId: item.characterId,
      character: item.character,
      characterName: item.characterName,
      characters,
      variables,
    });
    const text =
      typeof item.text === "string"
        ? item.text
        : Array.isArray(item.content)
          ? item.content.map((part) => part?.text ?? "").join("")
          : "";

    return {
      ...item,
      text,
      character,
      characterName: character.name,
    };
  });
};

const hasActiveDialogueTemplateData = (dialogueState) => {
  if (!dialogueState) {
    return false;
  }

  // ADV keeps a persisted shell between lines so dialogue UI can remain mounted,
  // but generic templated layouts should only see active dialogue content.
  if (dialogueState.mode === "adv" && dialogueState.content === undefined) {
    return false;
  }

  return true;
};

const createDialogueTemplateData = ({
  dialogueState,
  includeInactiveAdvDialogue = false,
  characters = {},
  variables,
  runtime,
} = {}) => {
  if (
    !includeInactiveAdvDialogue &&
    !hasActiveDialogueTemplateData(dialogueState)
  ) {
    return undefined;
  }

  const dialogueContent =
    dialogueState.content === undefined
      ? [{ text: "" }]
      : ensureDialogueContentItems(dialogueState.content, "dialogue.content");
  const initialRevealedCharacters =
    dialogueState.content === undefined
      ? 0
      : getDialogueContentTextLength({
          content: dialogueState.initialRevealedContent,
          path: "dialogue.initialRevealedContent",
          variables,
        });
  const runtimeDialogueTextSpeed =
    runtime?.dialogueTextSpeed ?? GLOBAL_RUNTIME_DEFAULTS.dialogueTextSpeed;
  const textSpeed = dialogueState.textSpeed ?? runtimeDialogueTextSpeed;
  const dialogueLines = (dialogueState.lines || []).map((line, index) => {
    const lineContent = ensureDialogueContentItems(
      line.content,
      `dialogue.lines[${index}].content`,
    );
    const character = createDialogueCharacterTemplateData({
      characterId: line.characterId,
      character: line.character,
      characterName: line.characterName,
      characters,
      variables,
    });

    return {
      ...line,
      textSpeed: line.textSpeed ?? runtimeDialogueTextSpeed,
      content: lineContent.map((item) => ({
        ...item,
        text: interpolateDialogueText(item.text, { variables }),
      })),
      character,
      characterName: character.name,
    };
  });
  const character = createDialogueCharacterTemplateData({
    characterId: dialogueState.characterId,
    character: dialogueState.character,
    characters,
    variables,
  });

  return {
    characterId: dialogueState.characterId,
    persistCharacter: dialogueState.persistCharacter,
    character,
    textSpeed,
    content: dialogueContent.map((item) => ({
      ...item,
      text: interpolateDialogueText(item.text, { variables }),
    })),
    initialRevealedCharacters,
    lines: dialogueLines,
  };
};

const renderTemplatedLayoutContainer = ({
  container,
  resources,
  templateData,
  isLineCompleted = false,
  skipMode = false,
  skipTransitionsAndAnimations = false,
}) => {
  const processedContainer = parseAndRender(container, templateData, {
    functions: jemplFunctions,
  });

  return resolveLayoutResourceIds(
    settleTextRevealIfCompleted(processedContainer, {
      isLineCompleted,
      skipMode,
      skipTransitionsAndAnimations,
    }),
    resources,
  );
};

const toKeyboardPayload = (value, fallback = {}) => {
  if (value?.payload && typeof value.payload === "object") {
    return structuredClone(value.payload);
  }

  if (value?.actions && typeof value.actions === "object") {
    return {
      actions: structuredClone(value.actions),
    };
  }

  return structuredClone(fallback);
};

const assignRenderStateKeyboardPhase = ({
  renderStateKeyboard,
  keyboard,
  phase,
}) => {
  if (!keyboard || typeof keyboard !== "object" || Array.isArray(keyboard)) {
    return;
  }

  Object.entries(keyboard).forEach(([key, value]) => {
    const currentEntry = renderStateKeyboard[key] ?? {};
    const phasedValue = phase === "keydown" ? value?.keydown : value?.keyup;

    if (phase === "keydown" && phasedValue && typeof phasedValue === "object") {
      renderStateKeyboard[key] = {
        ...currentEntry,
        keydown: {
          payload: toKeyboardPayload(phasedValue),
        },
      };
      if (value?.keyup && typeof value.keyup === "object") {
        renderStateKeyboard[key].keyup = {
          payload: toKeyboardPayload(value.keyup),
        };
      }
      return;
    }

    renderStateKeyboard[key] = {
      ...currentEntry,
      [phase]: {
        payload: toKeyboardPayload(value),
      },
    };
  });
};

const toRenderStateKeyboard = (keyboard = {}, keyup = {}) => {
  const renderStateKeyboard = {};

  assignRenderStateKeyboardPhase({
    renderStateKeyboard,
    keyboard,
    phase: "keydown",
  });
  assignRenderStateKeyboardPhase({
    renderStateKeyboard,
    keyboard: keyup,
    phase: "keyup",
  });

  return Object.keys(renderStateKeyboard).length > 0
    ? renderStateKeyboard
    : undefined;
};

/**
 * Helper to push animations based on previous and current state
 * @param {Object} params
 * @param {Array} params.animations - The animations array to push to
 * @param {Object} params.animationsDef - Animation selection definition
 * @param {Object} params.resources - The resources object containing animations
 * @param {string|undefined} params.previousResourceId - Previous resource ID
 * @param {string|undefined} params.currentResourceId - Current resource ID
 * @param {string|undefined} params.previousTargetId - Previous target element ID
 * @param {string|undefined} params.currentTargetId - Current target element ID
 * @param {string} params.animationPath - Source path for error reporting
 * @param {string} params.idPrefix - Prefix for animation IDs
 */
const createAnimationInstances = ({
  animationsDef,
  resources,
  previousResourceId,
  currentResourceId,
  previousTargetId,
  currentTargetId,
  animationPath,
  idPrefix,
}) => {
  if (!animationsDef) {
    return [];
  }

  const animationInstances = [];
  const appendAnimationInstance = ({ instanceId, targetId }) => {
    const animationInstance = createAnimationInstanceIfPossible({
      resources,
      animationId,
      playback,
      instanceId,
      targetId,
      animationPath,
    });

    if (animationInstance) {
      animationInstances.push(animationInstance);
    }
  };

  const hasPrevious =
    previousResourceId !== undefined &&
    previousResourceId !== null &&
    previousResourceId !== false;
  const hasCurrent =
    currentResourceId !== undefined &&
    currentResourceId !== null &&
    currentResourceId !== false;
  const sharedTarget =
    previousTargetId && currentTargetId && previousTargetId === currentTargetId;

  assertNoLegacyAnimationLifecycleConfig(animationsDef, animationPath);

  const animationId = resolveAnimationResourceId(animationsDef);
  const playback = resolveAnimationPlayback(animationsDef);
  const animation = resources?.animations?.[animationId];
  const animationType = getAnimationType(animation, {
    animationId,
    animationPath,
  });
  if (animationType === "update") {
    if (hasCurrent && currentTargetId) {
      appendAnimationInstance({
        instanceId: `${idPrefix}-animation-update`,
        targetId: currentTargetId,
      });
    } else if (hasPrevious && previousTargetId) {
      appendAnimationInstance({
        instanceId: `${idPrefix}-animation-update`,
        targetId: previousTargetId,
      });
    }

    return animationInstances;
  }

  if (animationType === "transition") {
    const sharedTransitionInstanceId = `${idPrefix}-animation-transition`;
    const enterTransitionInstanceId =
      playback?.continuity === "persistent"
        ? sharedTransitionInstanceId
        : `${idPrefix}-animation-in`;

    if (hasPrevious && hasCurrent && sharedTarget) {
      appendAnimationInstance({
        instanceId: sharedTransitionInstanceId,
        targetId: currentTargetId,
      });

      return animationInstances;
    }

    if (hasPrevious) {
      appendAnimationInstance({
        instanceId: `${idPrefix}-animation-out`,
        targetId: previousTargetId,
      });
    }

    if (hasCurrent) {
      appendAnimationInstance({
        instanceId: enterTransitionInstanceId,
        targetId: currentTargetId,
      });
    }
  }

  return animationInstances;
};

export const createInitialState = () => {
  return {
    elements: [
      {
        id: "story",
        type: "container",
        x: 0,
        y: 0,
        children: [],
      },
    ],
    animations: [],
    audio: [],
    global: {},
  };
};

export const addBackgroundOrCg = (
  state,
  {
    presentationState,
    previousPresentationState,
    currentLineActions,
    resources = {},
    screen = { width: 1920, height: 1080 },
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
    runtime,
    activePersistentAnimations,
    restoredPersistentAnimations,
    autoMode,
    skipMode,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    form,
    saveSlots = [],
  },
) => {
  const { elements, animations } = state;
  if (presentationState.background) {
    const isBackgroundAnimationAuthoredOnCurrentLine =
      currentLineActions === undefined
        ? true
        : hasOwnProperty(currentLineActions?.background ?? {}, "animations");

    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) {
      return state;
    }
    const authoredBackgroundTransform = getBackgroundTransform(
      resources,
      presentationState.background,
    );
    const hasAuthoredBackgroundTransform =
      authoredBackgroundTransform ||
      hasBackgroundTransformOverrides(presentationState.background);

    const previousBackgroundResourceId =
      previousPresentationState?.background?.resourceId;
    const previousBackgroundColorId =
      previousPresentationState?.background?.colorId;
    const currentBackgroundResourceId =
      presentationState.background.resourceId ??
      (presentationState.background.animations
        ? previousBackgroundResourceId
        : undefined);
    const currentBackgroundColorId =
      presentationState.background.colorId ??
      (presentationState.background.animations
        ? previousBackgroundColorId
        : undefined);
    const currentHasRenderableBackgroundResource =
      hasRenderableBackgroundResource(resources, currentBackgroundResourceId);
    const backgroundForColorElement = {
      ...presentationState.background,
      colorId: currentBackgroundColorId,
    };

    if (
      currentBackgroundColorId !== undefined ||
      currentHasRenderableBackgroundResource
    ) {
      storyContainer.children.push(
        createBackgroundColorElement({
          resources,
          background: backgroundForColorElement,
          screen,
          includeOpacity: !currentHasRenderableBackgroundResource,
        }),
      );
    }

    if (currentBackgroundResourceId) {
      const { images = {}, videos = {}, spritesheets = {} } = resources;
      const backgroundKind = resolveBackgroundKind(
        resources,
        currentBackgroundResourceId,
      );
      let background;
      if (backgroundKind === "sprite") {
        background = images[currentBackgroundResourceId];
      } else if (backgroundKind === "video") {
        background = videos[currentBackgroundResourceId];
      } else if (backgroundKind === "spritesheet-animation") {
        background = spritesheets[currentBackgroundResourceId];
      }
      if (background) {
        const isVideo = backgroundKind === "video";
        const isSpritesheet = backgroundKind === "spritesheet-animation";
        const backgroundTransform = {
          x: (screen?.width ?? 1920) / 2,
          y: (screen?.height ?? 1080) / 2,
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          ...authoredBackgroundTransform,
        };
        const elementTransform = {
          ...getBackgroundAppearance(presentationState.background, {
            includeDefaultAlpha: true,
          }),
          ...getElementTransform(
            backgroundTransform,
            presentationState.background,
          ),
        };
        let element;

        if (isSpritesheet) {
          element = createAnimatedSpriteElement({
            id: resolveBackgroundTargetId({
              resourceId: currentBackgroundResourceId,
              kind: backgroundKind,
            }),
            resourceId: currentBackgroundResourceId,
            spritesheet: background,
            animationName: presentationState.background.animationName,
            animationSpeed: presentationState.background.animationSpeed,
            loop: presentationState.background.loop,
            transform: elementTransform,
          });
        } else {
          element = {
            id: resolveBackgroundTargetId({
              resourceId: currentBackgroundResourceId,
              kind: backgroundKind,
            }),
            type: isVideo ? "video" : "sprite",
            src: background.fileId,
            width: background.width,
            height: background.height,
            ...elementTransform,
          };
        }

        if (isVideo) {
          element.loop = presentationState.background.loop ?? false;
          element.volume = background.volume ?? 50;
        }

        if (element) {
          storyContainer.children.push(element);
        }
      }
    }

    if (currentBackgroundResourceId) {
      const { layouts = {} } = resources;
      const layout = layouts[currentBackgroundResourceId];
      if (layout) {
        const bgContainer = {
          id: resolveBackgroundTargetId({
            resourceId: currentBackgroundResourceId,
            kind: "container",
          }),
          type: "container",
          children: layout.elements,
          ...getBackgroundAppearance(presentationState.background),
        };
        if (hasAuthoredBackgroundTransform) {
          Object.assign(
            bgContainer,
            getElementTransform(
              {
                x: 0,
                y: 0,
                anchorX: 0,
                anchorY: 0,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                ...authoredBackgroundTransform,
              },
              presentationState.background,
            ),
          );
        }
        const processedContainer = parseAndRender(
          bgContainer,
          createLayoutTemplateData({
            variables,
            runtime,
            saveSlots,
            dialogueState: presentationState.dialogue,
            isLineCompleted,
            autoMode,
            skipMode,
            isChoiceVisible,
            isFormVisible,
            canRollback,
            form,
            characters: resources.characters || {},
            skipTransitionsAndAnimations,
          }),
          { functions: jemplFunctions },
        );
        storyContainer.children.push(
          resolveLayoutResourceIds(
            settleTextRevealIfCompleted(processedContainer, {
              isLineCompleted,
              skipMode,
              skipTransitionsAndAnimations,
            }),
            resources,
          ),
        );
      }
    }

    const previousBackgroundAnimationTarget = resolveBackgroundAnimationTarget({
      resources,
      resourceId: previousBackgroundResourceId,
      colorId: previousBackgroundColorId,
    });
    const currentBackgroundAnimationTarget = resolveBackgroundAnimationTarget({
      resources,
      resourceId: currentBackgroundResourceId,
      colorId: currentBackgroundColorId,
    });
    const backgroundAnimationInstances = createAnimationInstances({
      animationsDef: presentationState.background.animations,
      resources,
      previousResourceId: previousBackgroundAnimationTarget.resourceId,
      currentResourceId: currentBackgroundAnimationTarget.resourceId,
      previousTargetId: previousBackgroundAnimationTarget.targetId,
      currentTargetId: currentBackgroundAnimationTarget.targetId,
      animationPath: "background.animations",
      idPrefix: "bg-cg",
    });

    if (
      shouldEmitAnimationSelection({
        animationInstances: backgroundAnimationInstances,
        isLineCompleted,
        skipTransitionsAndAnimations,
        activePersistentAnimations,
        restoredPersistentAnimations,
        isAuthoredOnCurrentLine: isBackgroundAnimationAuthoredOnCurrentLine,
      })
    ) {
      animations.push(...backgroundAnimationInstances);
    }
  }
  return state;
};

/**
 *
 * @param {Object} params
 */
export const addCharacters = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources,
    isLineCompleted,
    skipTransitionsAndAnimations,
    activePersistentAnimations,
  },
) => {
  const { elements, animations } = state;
  if (presentationState.character && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.character.items || [];
    const previousItems = previousPresentationState?.character?.items || [];
    const duplicateCharacterIds = getDuplicateItemIds(items);
    const previousDuplicateCharacterIds = getDuplicateItemIds(previousItems);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { transformId, sprites } = item;

      // Find previous item with same id
      const previousItem = previousItems.find((p) => p.id === item.id);
      const previousItemIndex = previousItems.findIndex(
        (p) => p.id === item.id,
      );
      const previousHasSprites =
        previousItem?.sprites && previousItem.sprites.length > 0;
      const currentHasSprites = sprites && sprites.length > 0;
      const previousContainerId =
        previousItemIndex >= 0
          ? getCharacterContainerId(
              previousItem,
              previousItemIndex,
              previousDuplicateCharacterIds,
            )
          : undefined;

      const characterAnimationInstances = createAnimationInstances({
        animationsDef: item.animations,
        resources,
        previousResourceId: previousContainerId,
        currentResourceId: currentHasSprites
          ? getCharacterContainerId(item, i, duplicateCharacterIds)
          : undefined,
        previousTargetId: previousContainerId,
        currentTargetId: currentHasSprites
          ? getCharacterContainerId(item, i, duplicateCharacterIds)
          : undefined,
        animationPath: `character.items[${i}].animations`,
        idPrefix: "character",
      });

      if (
        item.animations &&
        !sprites &&
        !transformId &&
        previousHasSprites &&
        shouldEmitAnimationSelection({
          animationInstances: characterAnimationInstances,
          isLineCompleted,
          skipTransitionsAndAnimations,
          activePersistentAnimations,
        })
      ) {
        animations.push(...characterAnimationInstances);
        continue;
      }

      // Animation-only character diffs are valid for removals/updates.
      // They don't create a new container by themselves.
      if (item.animations && !sprites && !transformId) {
        continue;
      }

      // Skip items without required properties for creating containers
      if (!sprites || sprites.length === 0 || !transformId) {
        console.warn("Character item missing sprites or transformId:", item);
        continue;
      }

      const containerId = getCharacterContainerId(
        item,
        i,
        duplicateCharacterIds,
      );
      const transform = resources.transforms[transformId];
      if (!transform) {
        console.warn("Transform not found:", transformId);
        continue;
      }
      const characterContainer = {
        type: "container",
        id: containerId,
        ...getElementTransform(transform, item),
        ...getItemAppearance(item),
        children: [],
      };

      for (const sprite of sprites) {
        const spriteLayer = createCharacterSpriteLayerElement({
          id: `${containerId}-${sprite.id}`,
          item: sprite,
          resources,
        });
        if (!spriteLayer) {
          continue;
        }

        characterContainer.children.push(spriteLayer);
      }

      storyContainer.children.push(characterContainer);

      // Add animation support (except out, which is handled above)
      if (
        shouldEmitAnimationSelection({
          animationInstances: characterAnimationInstances,
          isLineCompleted,
          skipTransitionsAndAnimations,
          activePersistentAnimations,
        })
      ) {
        animations.push(...characterAnimationInstances);
      }
    }
  }
  return state;
};

const assertVisualLayer = (layer, path) => {
  if (!VISUAL_LAYER_VALUES.includes(layer)) {
    throw new Error(
      `${path} must be one of: ${VISUAL_LAYER_VALUES.join(", ")}.`,
    );
  }
};

const resolveVisualItemLayer = (item, previousItem) => {
  const hasCurrentSubject = !!item.resourceId || hasCompleteVisualText(item);
  const layer =
    item.layer ??
    (!hasCurrentSubject ? previousItem?.layer : undefined) ??
    DEFAULT_VISUAL_LAYER;

  assertVisualLayer(layer, `Visual item "${item.id}" layer`);

  return layer;
};

/**
 *
 * @param {Object} params
 */
export const addVisuals = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources,
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
    runtime,
    activePersistentAnimations,
    autoMode,
    skipMode,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    form,
    saveSlots = [],
    visualLayer,
  },
) => {
  const { elements, animations } = state;
  if (presentationState.visual && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.visual.items;
    const previousItems = previousPresentationState?.visual?.items || [];
    const visualTemplateData = createLayoutTemplateData({
      variables,
      runtime,
      saveSlots,
      dialogueState: presentationState.dialogue,
      isLineCompleted,
      autoMode,
      skipMode,
      isChoiceVisible,
      isFormVisible,
      canRollback,
      form,
      characters: resources.characters || {},
      skipTransitionsAndAnimations,
    });

    if (visualLayer !== undefined) {
      assertVisualLayer(visualLayer, "visualLayer");
    }

    for (const item of items) {
      const previousItem = previousItems.find((p) => p.id === item.id);
      const itemLayer = resolveVisualItemLayer(item, previousItem);

      if (visualLayer !== undefined && itemLayer !== visualLayer) {
        continue;
      }

      assertVisualTextConfig(item);

      if (item.text) {
        const transform = getRequiredVisualTransform(resources, item);
        const textElement = {
          ...structuredClone(item.text),
          id: `visual-${item.id}`,
          type: "text",
          ...getElementTransform(transform, item),
        };
        Object.assign(textElement, getItemAppearance(item));

        storyContainer.children.push(
          resolveLayoutResourceIds(
            parseAndRender(textElement, visualTemplateData, {
              functions: jemplFunctions,
            }),
            resources,
          ),
        );
      }

      if (item.resourceId) {
        const { images = {}, videos = {}, spritesheets = {} } = resources;

        const spritesheet = spritesheets[item.resourceId];
        if (spritesheet) {
          const transform = getRequiredVisualTransform(resources, item);
          const animationName = item.animationName;

          if (animationName) {
            const animationDef = spritesheet.animations?.[animationName];

            if (!animationDef) {
              throw new Error(
                `Animation '${animationName}' not found in spritesheet resource '${item.resourceId}'`,
              );
            }

            const itemAppearance = getItemAppearance(item);
            const element = {
              id: `visual-${item.id}`,
              type: "spritesheet-animation",
              ...getElementTransform(transform, item),
              width: item.width ?? spritesheet.width,
              height: item.height ?? spritesheet.height,
              alpha: itemAppearance.alpha ?? item.alpha ?? 1,
              src: spritesheet.fileId,
              atlas: spritesheet.jsonData,
              playback: {
                frames: animationDef.frames,
                animationSpeed:
                  item.animationSpeed ?? animationDef.animationSpeed ?? 0.5,
                loop: item.loop ?? animationDef.loop ?? true,
              },
            };
            if (itemAppearance.blur) {
              element.blur = itemAppearance.blur;
            }
            storyContainer.children.push(structuredClone(element));
          }
        } else {
          let resource = images[item.resourceId] || videos[item.resourceId];

          if (resource) {
            const isVideo = videos[item.resourceId] !== undefined;
            const transform = getRequiredVisualTransform(resources, item);
            const element = {
              id: `visual-${item.id}`,
              type: isVideo ? "video" : "sprite",
              src: resource.fileId,
              width: resource.width,
              height: resource.height,
              ...getElementTransform(transform, item),
            };
            Object.assign(element, getItemAppearance(item));

            if (isVideo) {
              element.loop = resource.loop ?? false;
              element.volume = resource.volume ?? 50;
            }

            storyContainer.children.push(element);
          }
        }
      }

      if (item.resourceId) {
        const { layouts = {} } = resources;
        let layout = layouts[item.resourceId];

        if (layout) {
          const transform = getRequiredVisualTransform(resources, item);
          const visualContainer = {
            id: `visual-${item.id}`,
            type: "container",
            children: structuredClone(layout.elements),
            ...getElementTransform(transform, item),
          };
          Object.assign(visualContainer, getItemAppearance(item));
          const processedContainer = parseAndRender(
            visualContainer,
            visualTemplateData,
            { functions: jemplFunctions },
          );
          storyContainer.children.push(
            resolveLayoutResourceIds(
              settleTextRevealIfCompleted(processedContainer, {
                isLineCompleted,
                skipMode,
                skipTransitionsAndAnimations,
              }),
              resources,
            ),
          );
        }
      }

      const previousVisualSubjectKey = getVisualSubjectKey(previousItem);
      const currentVisualSubjectKey = getVisualSubjectKey(item);
      const visualAnimationInstances = createAnimationInstances({
        animationsDef: item.animations,
        resources,
        previousResourceId: previousVisualSubjectKey,
        currentResourceId: currentVisualSubjectKey,
        previousTargetId: previousVisualSubjectKey
          ? `visual-${item.id}`
          : undefined,
        currentTargetId: currentVisualSubjectKey
          ? `visual-${item.id}`
          : undefined,
        animationPath: `visual.items[${item.id}].animations`,
        idPrefix: item.id,
      });

      if (
        shouldEmitAnimationSelection({
          animationInstances: visualAnimationInstances,
          isLineCompleted,
          skipTransitionsAndAnimations,
          activePersistentAnimations,
        })
      ) {
        animations.push(...visualAnimationInstances);
      }
    }
  }
  return state;
};

const DIALOGUE_CHARACTER_SPRITE_CONTAINER_ID = "dialogue-character-sprite";

const hasRenderableDialogueCharacterSprite = (sprite) =>
  !!sprite?.transformId &&
  Array.isArray(sprite.items) &&
  sprite.items.length > 0;

const addDialogueCharacterSprite = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources = {},
    isLineCompleted,
    skipTransitionsAndAnimations,
    activePersistentAnimations,
  },
) => {
  const { animations } = state;
  const storyContainer = getStoryContainer(state.elements);
  if (!storyContainer) {
    return state;
  }

  const sprite = presentationState.dialogue?.character?.sprite;
  const previousSprite = previousPresentationState?.dialogue?.character?.sprite;
  const hasCurrentSprite = hasRenderableDialogueCharacterSprite(sprite);
  const hasPreviousSprite =
    hasRenderableDialogueCharacterSprite(previousSprite);
  const spriteAnimationInstances = createAnimationInstances({
    animationsDef: sprite?.animations,
    resources,
    previousResourceId: hasPreviousSprite
      ? DIALOGUE_CHARACTER_SPRITE_CONTAINER_ID
      : undefined,
    currentResourceId: hasCurrentSprite
      ? DIALOGUE_CHARACTER_SPRITE_CONTAINER_ID
      : undefined,
    previousTargetId: hasPreviousSprite
      ? DIALOGUE_CHARACTER_SPRITE_CONTAINER_ID
      : undefined,
    currentTargetId: hasCurrentSprite
      ? DIALOGUE_CHARACTER_SPRITE_CONTAINER_ID
      : undefined,
    animationPath: "dialogue.character.sprite.animations",
    idPrefix: "dialogue-character-sprite",
  });

  if (!hasCurrentSprite) {
    if (
      sprite?.animations &&
      hasPreviousSprite &&
      shouldEmitAnimationSelection({
        animationInstances: spriteAnimationInstances,
        isLineCompleted,
        skipTransitionsAndAnimations,
        activePersistentAnimations,
      })
    ) {
      animations.push(...spriteAnimationInstances);
    }
    return state;
  }

  const transform = resources.transforms?.[sprite.transformId];
  if (!transform) {
    console.warn("Transform not found:", sprite.transformId);
    return state;
  }

  const spriteContainer = {
    type: "container",
    id: DIALOGUE_CHARACTER_SPRITE_CONTAINER_ID,
    ...getElementTransform(transform),
    children: [],
  };

  for (const item of sprite.items) {
    const spriteLayer = createCharacterSpriteLayerElement({
      id: `${DIALOGUE_CHARACTER_SPRITE_CONTAINER_ID}-${item.id}`,
      item,
      resources,
    });
    if (!spriteLayer) {
      continue;
    }

    spriteContainer.children.push(spriteLayer);
  }

  storyContainer.children.push(spriteContainer);

  if (
    shouldEmitAnimationSelection({
      animationInstances: spriteAnimationInstances,
      isLineCompleted,
      skipTransitionsAndAnimations,
      activePersistentAnimations,
    })
  ) {
    animations.push(...spriteAnimationInstances);
  }

  return state;
};

/**
 *
 * @param {Object} params
 */
export const addDialogue = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources = {},
    dialogueUIHidden,
    autoMode,
    skipMode,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    form,
    skipOnlyViewedLines,
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
    runtime,
    activePersistentAnimations,
    saveSlots = [],
  },
) => {
  const { elements, animations } = state;

  if (!presentationState.dialogue) {
    return state;
  }

  if (dialogueUIHidden) {
    return state;
  }

  // Find the story container
  const storyContainer = elements.find((el) => el.id === "story");
  if (!storyContainer) return state;

  // Handle dialogue UI elements from dialogue.ui.resourceId
  if (
    presentationState.dialogue.ui &&
    presentationState.dialogue.ui.resourceId
  ) {
    const { layouts = {} } = resources;
    const uiLayout = layouts[presentationState.dialogue.ui.resourceId];
    if (uiLayout) {
      const wrappedTemplate = { elements: uiLayout.elements };
      const templateData = createLayoutTemplateData({
        variables,
        runtime,
        saveSlots,
        dialogueState: presentationState.dialogue,
        includeInactiveAdvDialogue: true,
        isLineCompleted,
        autoMode,
        skipMode,
        isChoiceVisible,
        isFormVisible,
        canRollback,
        form,
        characters: resources.characters || {},
        dialogueUIHidden,
        skipOnlyViewedLines,
        skipTransitionsAndAnimations,
      });

      const renderOptions = { functions: jemplFunctions };
      const expandedTemplate = expandLoopTemplates(
        wrappedTemplate,
        templateData,
        renderOptions,
      );
      const result = parseAndRender(
        expandedTemplate,
        templateData,
        renderOptions,
      );
      const uiElements = resolveLayoutResourceIds(
        settleTextRevealIfCompleted(result?.elements, {
          isLineCompleted,
          skipMode,
          skipTransitionsAndAnimations,
        }),
        resources,
      );

      if (Array.isArray(uiElements)) {
        for (const element of uiElements) {
          storyContainer.children.push(element);
        }
      } else if (uiElements) {
        storyContainer.children.push(uiElements);
      }
    }
  }

  addDialogueCharacterSprite(state, {
    presentationState,
    previousPresentationState,
    resources,
    isLineCompleted,
    skipTransitionsAndAnimations,
    activePersistentAnimations,
  });

  const dialogueAnimationInstances = createAnimationInstances({
    animationsDef: presentationState.dialogue.ui?.animations,
    resources,
    previousResourceId: previousPresentationState?.dialogue?.ui?.resourceId,
    currentResourceId: presentationState.dialogue.ui?.resourceId,
    previousTargetId: previousPresentationState?.dialogue?.ui?.resourceId
      ? "dialogue-container"
      : undefined,
    currentTargetId: presentationState.dialogue.ui?.resourceId
      ? "dialogue-container"
      : undefined,
    animationPath: "dialogue.ui.animations",
    idPrefix: "dialogue-ui",
  });

  // Handle dialogue UI animations
  if (
    shouldEmitAnimationSelection({
      animationInstances: dialogueAnimationInstances,
      isLineCompleted,
      skipTransitionsAndAnimations,
      activePersistentAnimations,
    })
  ) {
    animations.push(...dialogueAnimationInstances);
  }

  return state;
};

/**
 *
 * @param {Object} params
 */
export const addChoices = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources,
    screen,
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
    runtime,
    autoMode,
    skipMode,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    form,
    activePersistentAnimations,
    saveSlots = [],
  },
) => {
  const { elements, animations } = state;
  if (presentationState.choice && resources) {
    // Find the story container
    const storyContainer = getStoryContainer(elements);
    if (!storyContainer) return state;

    const layout = resources?.layouts[presentationState.choice.resourceId];
    if (layout && layout.elements) {
      const wrappedTemplate = { elements: layout.elements };
      const result = parseAndRender(
        wrappedTemplate,
        {
          ...createLayoutTemplateData({
            variables,
            runtime,
            saveSlots,
            dialogueState: presentationState.dialogue,
            isLineCompleted,
            autoMode,
            skipMode,
            isChoiceVisible: isChoiceVisible ?? !!presentationState.choice,
            isFormVisible,
            canRollback,
            form,
            characters: resources.characters || {},
            skipTransitionsAndAnimations,
          }),
          choice: {
            items: presentationState.choice?.items ?? [],
          },
        },
        {
          functions: jemplFunctions,
        },
      );
      const choiceElements = tagBypassChoice(
        resolveLayoutResourceIds(
          settleTextRevealIfCompleted(result?.elements, {
            isLineCompleted,
            skipMode,
            skipTransitionsAndAnimations,
          }),
          resources,
        ),
      );

      if (Array.isArray(choiceElements)) {
        for (const element of choiceElements) {
          storyContainer.children.push(element);
        }
      } else if (choiceElements) {
        storyContainer.children.push(choiceElements);
      }
    }

    const choiceAnimationInstances = createAnimationInstances({
      animationsDef: presentationState.choice.animations,
      resources,
      previousResourceId: previousPresentationState?.choice?.resourceId,
      currentResourceId: presentationState.choice.resourceId,
      previousTargetId: previousPresentationState?.choice?.resourceId
        ? "choice-container"
        : undefined,
      currentTargetId: presentationState.choice.resourceId
        ? "choice-container"
        : undefined,
      animationPath: "choice.animations",
      idPrefix: "choice",
    });

    // Handle choice animations
    if (
      shouldEmitAnimationSelection({
        animationInstances: choiceAnimationInstances,
        isLineCompleted,
        skipTransitionsAndAnimations,
        activePersistentAnimations,
      })
    ) {
      animations.push(...choiceAnimationInstances);
    }
  }
  return state;
};

export const addForm = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources,
    screen,
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
    runtime,
    autoMode,
    skipMode,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    activePersistentAnimations,
    saveSlots = [],
    form,
  },
) => {
  const { elements, animations } = state;
  if (!form?.resourceId || !resources) {
    return state;
  }

  const storyContainer = getStoryContainer(elements);
  if (!storyContainer) {
    return state;
  }

  const layout = resources?.layouts?.[form.resourceId];
  if (!layout) {
    console.warn(`Form layout not found: ${form.resourceId}`);
    return state;
  }

  const formContainer = {
    id: "form-container",
    type: "container",
    x: 0,
    y: 0,
    children: layout.elements || [],
  };

  const templateData = {
    ...createLayoutTemplateData({
      variables,
      runtime,
      saveSlots,
      dialogueState: presentationState.dialogue,
      isLineCompleted,
      autoMode,
      skipMode,
      isChoiceVisible,
      isFormVisible,
      canRollback,
      characters: resources.characters || {},
      skipTransitionsAndAnimations,
      form,
    }),
    form,
  };

  const processedForm = parseAndRender(formContainer, templateData, {
    functions: jemplFunctions,
  });
  const formElements = tagFormInteractionSource(
    resolveLayoutResourceIds(
      settleTextRevealIfCompleted(enrichFormElements(processedForm, form), {
        isLineCompleted,
        skipMode,
        skipTransitionsAndAnimations,
      }),
      resources,
    ),
    form,
  );

  if (formElements) {
    storyContainer.children.push(formElements);
  }

  const formAnimationInstances = createAnimationInstances({
    animationsDef: form.animations,
    resources,
    previousResourceId: previousPresentationState?.form?.resourceId,
    currentResourceId: form.resourceId,
    previousTargetId: previousPresentationState?.form?.resourceId
      ? "form-container"
      : undefined,
    currentTargetId: form.resourceId ? "form-container" : undefined,
    animationPath: "form.animations",
    idPrefix: "form",
  });

  if (
    shouldEmitAnimationSelection({
      animationInstances: formAnimationInstances,
      isLineCompleted,
      skipTransitionsAndAnimations,
      activePersistentAnimations,
    })
  ) {
    animations.push(...formAnimationInstances);
  }

  return state;
};

export const addControl = (
  state,
  {
    presentationState,
    resources = {},
    variables,
    runtime,
    isLineCompleted,
    autoMode,
    skipMode,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    form,
    saveSlots = [],
    skipTransitionsAndAnimations,
  },
) => {
  if (!presentationState.control?.resourceId) {
    return state;
  }

  const control = resources.controls?.[presentationState.control.resourceId];
  if (!control) {
    return state;
  }

  const keyboardMapping = toRenderStateKeyboard(
    control.keyboard,
    control.keyup,
  );
  if (keyboardMapping && Object.keys(keyboardMapping).length > 0) {
    state.global.keyboard = keyboardMapping;
  }

  if (!Array.isArray(control.elements) || control.elements.length === 0) {
    return state;
  }

  const storyContainer = getStoryContainer(state.elements);
  if (!storyContainer) {
    return state;
  }

  const controlContainer = {
    id: `control-${presentationState.control.resourceId}`,
    type: "container",
    x: 0,
    y: 0,
    children: control.elements,
  };

  storyContainer.children.push(
    renderTemplatedLayoutContainer({
      container: controlContainer,
      resources,
      templateData: createLayoutTemplateData({
        variables,
        runtime,
        saveSlots,
        dialogueState: presentationState.dialogue,
        isLineCompleted,
        autoMode,
        skipMode,
        isChoiceVisible,
        isFormVisible,
        canRollback,
        form,
        characters: resources.characters || {},
        skipTransitionsAndAnimations,
      }),
      isLineCompleted,
      skipMode,
      skipTransitionsAndAnimations,
    }),
  );

  return state;
};

export const addBgm = (
  state,
  { presentationState, resources, runtime, variables },
) => {
  const { elements, audio } = state;
  if (presentationState.bgm && resources) {
    // Find the story container
    const storyContainer = getStoryContainer(elements);
    if (!storyContainer) return state;

    const audioResource = resources.sounds[presentationState.bgm.resourceId];
    if (!audioResource) return state;
    const resolvedRuntime = createLayoutTemplateData({
      variables,
      runtime,
    }).runtime;

    audio.push({
      id: "bgm",
      type: "sound",
      src: audioResource.fileId,
      loop: presentationState.bgm.loop ?? true,
      volume: getEffectiveMusicVolume(
        resolvedRuntime,
        presentationState.bgm.volume ??
          audioResource.volume ??
          DEFAULT_AUTHORED_AUDIO_VOLUME,
      ),
      startDelayMs: presentationState.bgm.startDelayMs ?? null,
    });
  }
  return state;
};

export const addSfx = (state, { presentationState, resources, runtime }) => {
  const { audio: audioElements } = state;

  if (presentationState.sfx && resources) {
    // Find the story container
    const items = presentationState.sfx.items;
    for (const [index, item] of items.entries()) {
      const audioResource = resources.sounds?.[item.resourceId];
      if (!audioResource) continue;

      audioElements.push({
        id: createScopedSfxRenderId({ item, index }),
        type: "sound",
        src: audioResource.fileId,
        loop: item.loop ?? audioResource.loop ?? false,
        volume: getEffectiveSoundVolume(
          runtime,
          item.volume ?? audioResource.volume ?? DEFAULT_AUTHORED_AUDIO_VOLUME,
        ),
        startDelayMs: item.startDelayMs ?? audioResource.startDelayMs ?? null,
      });
    }
  }

  return state;
};

const resolveVoiceResource = (resources, currentSceneId, resourceId) => {
  if (!currentSceneId || !resourceId) {
    return undefined;
  }

  return resources?.voices?.[currentSceneId]?.[resourceId];
};

const getEffectiveVoiceVolume = (voice = {}, resolvedRuntime = {}) => {
  if (resolvedRuntime.muteAll) {
    return 0;
  }

  return voice.volume ?? resolvedRuntime.soundVolume ?? 50;
};

export const addVoice = (
  state,
  { presentationState, resources, currentSceneId, runtime, variables },
) => {
  const { audio } = state;

  if (!presentationState?.voice) {
    return state;
  }

  const voice = presentationState.voice;
  const { resourceId, loop, startDelayMs } = voice;
  const voiceResource = resolveVoiceResource(
    resources,
    currentSceneId,
    resourceId,
  );

  if (!voiceResource) {
    return state;
  }

  const resolvedRuntime = createLayoutTemplateData({
    variables,
    runtime,
  }).runtime;

  audio.push({
    id: `voice-${currentSceneId}-${resourceId}`,
    type: "sound",
    src: voiceResource.fileId,
    volume: getEffectiveVoiceVolume(voice, resolvedRuntime),
    loop: loop ?? false,
    startDelayMs: startDelayMs ?? null,
  });

  return state;
};

/**
 * Adds layout elements from presentation to state
 * @param {Object} params
 */
export const addLayout = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources = {},
    variables,
    runtime,
    autoMode,
    skipMode,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    form,
    saveSlots = [],
    isLineCompleted,
    skipTransitionsAndAnimations,
    activePersistentAnimations,
  },
) => {
  const { elements, animations } = state;
  if (presentationState.layout) {
    // Find the story container
    const storyContainer = getStoryContainer(elements);
    if (!storyContainer) return state;

    const layout = resources.layouts[presentationState.layout.resourceId];

    if (!layout) {
      return state;
    }

    if (
      Array.isArray(layout.transitions) &&
      !isLineCompleted &&
      !skipTransitionsAndAnimations
    ) {
      pushNormalizedLayoutTransitions({
        animations,
        transitions: layout.transitions,
        defaultTargetId: `layout-${presentationState.layout.resourceId}`,
        idPrefix: `layout-${presentationState.layout.resourceId}`,
        animationPathPrefix: "layout",
      });
    }

    const layoutContainer = {
      id: `layout-${presentationState.layout.resourceId}`,
      type: "container",
      x: 0,
      y: 0,
      children: layout.elements || [],
    };

    storyContainer.children.push(
      renderTemplatedLayoutContainer({
        container: layoutContainer,
        resources,
        templateData: createLayoutTemplateData({
          variables,
          runtime,
          saveSlots,
          dialogueState: presentationState.dialogue,
          isLineCompleted,
          autoMode,
          skipMode,
          isChoiceVisible,
          isFormVisible,
          canRollback,
          form,
          characters: resources.characters || {},
          skipTransitionsAndAnimations,
        }),
        isLineCompleted,
        skipMode,
        skipTransitionsAndAnimations,
      }),
    );
  }

  const previousResourceId = previousPresentationState?.layout?.resourceId;
  const currentResourceId = presentationState.layout?.resourceId;
  const layoutAnimationInstances = createAnimationInstances({
    animationsDef: presentationState.layout?.animations,
    resources,
    previousResourceId,
    currentResourceId,
    previousTargetId: previousResourceId
      ? `layout-${previousResourceId}`
      : undefined,
    currentTargetId: currentResourceId
      ? `layout-${currentResourceId}`
      : undefined,
    animationPath: "layout.animations",
    idPrefix: "layout",
  });

  // Handle layout animations
  if (
    shouldEmitAnimationSelection({
      animationInstances: layoutAnimationInstances,
      isLineCompleted,
      skipTransitionsAndAnimations,
      activePersistentAnimations,
    })
  ) {
    animations.push(...layoutAnimationInstances);
  }

  return state;
};

export const addScreenTransition = (
  state,
  {
    currentLineActions,
    previousPresentationState,
    resources = {},
    isLineCompleted,
    skipTransitionsAndAnimations,
    activePersistentAnimations,
  },
) => {
  const { animations } = state;
  const screenAnimations = currentLineActions?.screen?.animations;

  if (!screenAnimations) {
    return state;
  }

  const hasPreviousStoryRender =
    previousPresentationState !== null &&
    previousPresentationState !== undefined;
  const screenAnimationInstances = createAnimationInstances({
    animationsDef: screenAnimations,
    resources,
    previousResourceId: hasPreviousStoryRender ? "story" : undefined,
    currentResourceId: "story",
    previousTargetId: hasPreviousStoryRender ? "story" : undefined,
    currentTargetId: "story",
    animationPath: "screen.animations",
    idPrefix: "screen",
  });

  if (
    shouldEmitAnimationSelection({
      animationInstances: screenAnimationInstances,
      isLineCompleted,
      skipTransitionsAndAnimations,
      activePersistentAnimations,
    })
  ) {
    animations.push(...screenAnimationInstances);
  }

  return state;
};

export const addScreenAppearance = (state, { presentationState }) => {
  const storyContainer = getStoryContainer(state.elements);

  if (!storyContainer || !presentationState?.screen) {
    return state;
  }

  Object.assign(storyContainer, getScreenAppearance(presentationState.screen));

  return state;
};

export const addOverlayStack = (
  state,
  {
    presentationState,
    resources = {},
    variables,
    runtime,
    autoMode,
    skipMode,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    form,
    overlayStack = [],
    dialogueHistory = [],
    saveSlots = [],
    screen,
    isLineCompleted,
    skipTransitionsAndAnimations,
  },
) => {
  const { elements, animations } = state;
  if (overlayStack && overlayStack.length > 0) {
    // Add each overlay from the stack above the base presentation.
    overlayStack.forEach((overlay, index) => {
      const layout = resources.layouts[overlay.resourceId];

      if (!layout) {
        console.warn(`Overlay layout not found: ${overlay.resourceId}`);
        return;
      }

      if (Array.isArray(layout.transitions)) {
        if (!skipTransitionsAndAnimations) {
          pushNormalizedLayoutTransitions({
            animations,
            transitions: layout.transitions,
            defaultTargetId: `overlayStack-${index}`,
            idPrefix: `overlayStack-${index}`,
            animationPathPrefix: `overlayStack[${index}]`,
          });
        }
      }

      // Create a container for this overlay
      const overlayContainer = {
        id: `overlayStack-${index}`,
        type: "container",
        x: 0,
        y: 0,
        children: [
          createFullscreenClickBlocker({
            id: `overlayStack-${index}-blocker`,
            screen,
          }),
          ...(layout.elements || []),
        ],
      };

      const historyDialogueWithNames = createHistoryDialogueTemplateData(
        dialogueHistory,
        resources.characters,
        variables,
      );

      const templateData = createLayoutTemplateData({
        variables,
        runtime,
        saveSlots,
        dialogueState: presentationState?.dialogue,
        isLineCompleted,
        autoMode,
        skipMode,
        isChoiceVisible,
        isFormVisible,
        canRollback,
        form,
        historyDialogue: historyDialogueWithNames,
        characters: resources.characters || {},
        skipTransitionsAndAnimations,
      });

      const processedOverlay = parseAndRender(overlayContainer, templateData, {
        functions: jemplFunctions,
      });

      const [blocker, ...layoutChildren] = processedOverlay.children || [];
      const resolvedOverlay = resolveLayoutResourceIds(
        settleTextRevealIfCompleted(
          {
            ...processedOverlay,
            children: layoutChildren,
          },
          {
            isLineCompleted,
            skipMode,
            skipTransitionsAndAnimations,
          },
        ),
        resources,
      );

      elements.push({
        ...resolvedOverlay,
        children: blocker
          ? [blocker, ...(resolvedOverlay.children || [])]
          : resolvedOverlay.children,
      });
    });
  }
  return state;
};

export const addConfirmDialog = (
  state,
  {
    presentationState,
    resources = {},
    variables,
    runtime,
    saveSlots = [],
    autoMode,
    skipMode,
    isChoiceVisible,
    isFormVisible,
    canRollback,
    form,
    confirmDialog,
    dialogueHistory = [],
    screen,
    isLineCompleted,
    skipTransitionsAndAnimations,
  },
) => {
  const { elements, animations } = state;

  if (!confirmDialog?.resourceId) {
    return state;
  }

  const layout = resources.layouts?.[confirmDialog.resourceId];
  if (!layout) {
    console.warn(`ConfirmDialog layout not found: ${confirmDialog.resourceId}`);
    return state;
  }

  if (Array.isArray(layout.transitions) && !skipTransitionsAndAnimations) {
    pushNormalizedLayoutTransitions({
      animations,
      transitions: layout.transitions,
      defaultTargetId: "confirmDialog",
      idPrefix: "confirmDialog",
      animationPathPrefix: "confirmDialog",
    });
  }

  const confirmDialogContainer = {
    id: "confirmDialog",
    type: "container",
    x: 0,
    y: 0,
    children: [
      createFullscreenClickBlocker({
        id: "confirmDialog-blocker",
        screen,
      }),
      ...(layout.elements || []),
    ],
  };

  const historyDialogueWithNames = createHistoryDialogueTemplateData(
    dialogueHistory,
    resources.characters,
    variables,
  );

  const processedConfirmDialog = parseAndRender(
    confirmDialogContainer,
    createLayoutTemplateData({
      variables,
      runtime,
      saveSlots,
      dialogueState: presentationState?.dialogue,
      isLineCompleted,
      autoMode,
      skipMode,
      isChoiceVisible,
      isFormVisible,
      canRollback,
      form,
      confirmDialog,
      historyDialogue: historyDialogueWithNames,
      characters: resources.characters || {},
      skipTransitionsAndAnimations,
    }),
    {
      functions: jemplFunctions,
    },
  );

  const [blocker, ...layoutChildren] = processedConfirmDialog.children || [];
  const resolvedConfirmDialog = resolveLayoutResourceIds(
    settleTextRevealIfCompleted(
      {
        ...processedConfirmDialog,
        children: layoutChildren,
      },
      {
        isLineCompleted,
        skipMode,
        skipTransitionsAndAnimations,
      },
    ),
    resources,
  );

  elements.push({
    ...resolvedConfirmDialog,
    children: blocker
      ? [blocker, ...(resolvedConfirmDialog.children || [])]
      : resolvedConfirmDialog.children,
  });

  return state;
};

const addVisualsForLayer = (layer) => (state, params) =>
  addVisuals(state, { ...params, visualLayer: layer });

const addVisualsBehindBackground = addVisualsForLayer(
  VISUAL_LAYER.BEHIND_BACKGROUND,
);
const addVisualsBehindCharacter = addVisualsForLayer(
  VISUAL_LAYER.BEHIND_CHARACTER,
);
const addVisualsBehindDialogue = addVisualsForLayer(
  VISUAL_LAYER.BEHIND_DIALOGUE,
);
const addVisualsBehindChoice = addVisualsForLayer(VISUAL_LAYER.BEHIND_CHOICE);
const addVisualsForeground = addVisualsForLayer(VISUAL_LAYER.FOREGROUND);

export const constructRenderState = (params) => {
  const actions = [
    addControl,
    addVisualsBehindBackground,
    addBackgroundOrCg,
    addVisualsBehindCharacter,
    addCharacters,
    addVisualsBehindDialogue,
    addDialogue,
    addVisualsBehindChoice,
    addChoices,
    addForm,
    addLayout,
    addVisualsForeground,
    addScreenAppearance,
    addScreenTransition,
    addBgm,
    addSfx,
    addVoice,
    addOverlayStack,
    addConfirmDialog,
  ];

  const executeActions = createSequentialActionsExecutor(
    createInitialState,
    actions,
  );

  return executeActions(params);
};
