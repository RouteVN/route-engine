import { parseAndRender } from "jempl";
import { createSequentialActionsExecutor, formatDate } from "../util.js";

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
  animationPath = "animation",
}) => {
  const normalized = structuredClone(animation);
  assertSupportedAnimationType({
    animationType: normalized.type,
    animationId: id,
    animationPath,
  });
  delete normalized.name;
  normalized.id = id;
  normalized.targetId = targetId;
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

const pushAnimationInstance = ({
  animations,
  resources,
  animationId,
  instanceId,
  targetId,
  animationPath = "animation",
}) => {
  if (!animationId || !targetId) {
    return false;
  }

  const animation = resources?.animations?.[animationId];
  if (!animation) {
    return false;
  }

  animations.push(
    createAnimationInstance({
      id: instanceId,
      targetId,
      animation,
      animationPath,
    }),
  );

  return true;
};

const getAnimationLifecycle = ({
  hasPrevious,
  hasCurrent,
  previousResourceId,
  currentResourceId,
  sharedTarget,
}) => {
  if (!hasPrevious && hasCurrent) {
    return "enter";
  }

  if (hasPrevious && !hasCurrent) {
    return "exit";
  }

  if (hasPrevious && hasCurrent) {
    if (previousResourceId === currentResourceId && sharedTarget) {
      return "update";
    }

    return "replace";
  }

  return "none";
};

const assertUpdateAnimationLifecycle = ({
  animationType,
  animationId,
  animationPath,
  lifecycle,
}) => {
  if (animationType !== "update" || lifecycle === "update") {
    return;
  }

  throw new Error(
    `[${animationPath}] Animation "${animationId}" has type "update", but update animations can only be used when the same target persists across the state change. Use type "transition" for enter, exit, and replace.`,
  );
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

/**
 * Interpolates dialogue text using jempl parseAndRender.
 * @param {string} text - The text containing ${...} patterns
 * @param {Object} data - Data object to resolve variables from
 * @returns {string} - Interpolated text
 */
const interpolateDialogueText = (text, data) => {
  if (!text || typeof text !== "string") return text;
  if (!text.includes("${")) return text;

  const rendered = parseAndRender(text, data);
  // Avoid rendering object values as "[object Object]" in text nodes.
  if (rendered && typeof rendered === "object") return text;
  return rendered;
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

const getCharacterContainerId = (item, index = 0) => {
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

const getTextStyleResources = (resources = {}) => resources.textStyles || {};
const getImageResources = (resources = {}) => resources.images || {};
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

const createLayoutTemplateData = ({
  variables,
  saveSlots = [],
  isLineCompleted,
  autoMode,
  skipMode,
  isChoiceVisible,
  canRollback,
  confirmDialog,
  historyDialogue = [],
  characters = {},
} = {}) => {
  return {
    variables,
    saveSlots,
    isLineCompleted,
    autoMode,
    skipMode,
    isChoiceVisible,
    canRollback,
    confirmDialog,
    historyDialogue,
    characters,
    effectiveSoundVolume: variables?._muteAll
      ? 0
      : (variables?._soundVolume ?? 500),
    textSpeed: variables?._textSpeed ?? 50,
  };
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

const tagChoiceInteractionSource = (node) => {
  if (Array.isArray(node)) {
    return node.map(tagChoiceInteractionSource);
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const taggedNode = {};
  for (const [key, value] of Object.entries(node)) {
    taggedNode[key] = tagChoiceInteractionSource(value);
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
          _interactionSource: "choice",
        }
      : undefined;

  return {
    ...taggedNode,
    click: {
      ...taggedNode.click,
      payload: {
        ...clickPayload,
        _interactionSource: "choice",
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

const createHistoryDialogueTemplateData = (
  dialogueHistory = [],
  characters = {},
) => {
  return dialogueHistory.map((item) => {
    const character = characters?.[item.characterId];
    const text =
      typeof item.text === "string"
        ? item.text
        : Array.isArray(item.content)
          ? item.content.map((part) => part?.text ?? "").join("")
          : "";

    return {
      ...item,
      text,
      characterName: character?.name || "",
    };
  });
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

const toRenderStateKeyboard = (keyboard = {}) => {
  if (!keyboard || typeof keyboard !== "object" || Array.isArray(keyboard)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(keyboard).map(([key, value]) => [
      key,
      {
        payload: {
          actions: structuredClone(value?.actions || {}),
        },
      },
    ]),
  );
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
const pushAnimations = ({
  animations,
  animationsDef,
  resources,
  previousResourceId,
  currentResourceId,
  previousTargetId,
  currentTargetId,
  animationPath,
  idPrefix,
  allowIncomingUpdateFallback = false,
}) => {
  if (!animationsDef) return;

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
  const lifecycle = getAnimationLifecycle({
    hasPrevious,
    hasCurrent,
    previousResourceId,
    currentResourceId,
    sharedTarget,
  });

  assertNoLegacyAnimationLifecycleConfig(animationsDef, animationPath);

  const animationId = resolveAnimationResourceId(animationsDef);
  const animation = resources?.animations?.[animationId];
  const animationType = getAnimationType(animation, {
    animationId,
    animationPath,
  });
  const canFallbackIncomingUpdate =
    allowIncomingUpdateFallback &&
    animationType === "update" &&
    lifecycle !== "update" &&
    hasCurrent &&
    currentTargetId;

  if (!canFallbackIncomingUpdate) {
    assertUpdateAnimationLifecycle({
      animationType,
      animationId,
      animationPath,
      lifecycle,
    });
  }

  if (animationType === "update") {
    if (
      hasPrevious &&
      hasCurrent &&
      previousResourceId === currentResourceId &&
      sharedTarget
    ) {
      pushAnimationInstance({
        animations,
        resources,
        animationId,
        instanceId: `${idPrefix}-animation-update`,
        targetId: currentTargetId,
        animationPath,
      });
    } else if (canFallbackIncomingUpdate) {
      pushAnimationInstance({
        animations,
        resources,
        animationId,
        instanceId: `${idPrefix}-animation-update`,
        targetId: currentTargetId,
        animationPath,
      });
    }

    return;
  }

  if (animationType === "transition") {
    if (hasPrevious && hasCurrent && sharedTarget) {
      pushAnimationInstance({
        animations,
        resources,
        animationId,
        instanceId: `${idPrefix}-animation-transition`,
        targetId: currentTargetId,
        animationPath,
      });

      return;
    }

    if (hasPrevious) {
      pushAnimationInstance({
        animations,
        resources,
        animationId,
        instanceId: `${idPrefix}-animation-out`,
        targetId: previousTargetId,
        animationPath,
      });
    }

    if (hasCurrent) {
      pushAnimationInstance({
        animations,
        resources,
        animationId,
        instanceId: `${idPrefix}-animation-in`,
        targetId: currentTargetId,
        animationPath,
      });
    }
  }
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
    resources = {},
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
    autoMode,
    skipMode,
    isChoiceVisible,
    canRollback,
    saveSlots = [],
  },
) => {
  const { elements, animations } = state;
  if (presentationState.background) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) {
      return state;
    }

    const previousBackgroundResourceId =
      previousPresentationState?.background?.resourceId;
    const currentBackgroundResourceId =
      presentationState.background.resourceId ??
      (presentationState.background.animations
        ? previousBackgroundResourceId
        : undefined);

    if (currentBackgroundResourceId) {
      const { images = {}, videos = {} } = resources;
      const background =
        images[currentBackgroundResourceId] ||
        videos[currentBackgroundResourceId];
      if (background) {
        const isVideo = videos[currentBackgroundResourceId] !== undefined;
        const element = {
          id: `bg-cg-${currentBackgroundResourceId}`,
          type: isVideo ? "video" : "sprite",
          x: 0,
          y: 0,
          src: background.fileId,
          width: background.width,
          height: background.height,
          alpha: 1,
          anchorX: 0,
          anchorY: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        };

        if (isVideo) {
          element.loop = presentationState.background.loop ?? false;
          element.volume = background.volume ?? 500;
        }

        storyContainer.children.push(element);
      }
    }

    if (currentBackgroundResourceId) {
      const { layouts = {} } = resources;
      const layout = layouts[currentBackgroundResourceId];
      if (layout) {
        const bgContainer = {
          id: `bg-cg-${currentBackgroundResourceId}`,
          type: "container",
          children: layout.elements,
        };
        const processedContainer = parseAndRender(
          bgContainer,
          createLayoutTemplateData({
            variables,
            saveSlots,
            isLineCompleted,
            autoMode,
            skipMode,
            isChoiceVisible,
            canRollback,
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

    if (
      presentationState.background.animations &&
      !isLineCompleted &&
      !skipTransitionsAndAnimations
    ) {
      pushAnimations({
        animations,
        animationsDef: presentationState.background.animations,
        resources,
        previousResourceId: previousBackgroundResourceId,
        currentResourceId: currentBackgroundResourceId,
        previousTargetId: previousBackgroundResourceId
          ? `bg-cg-${previousBackgroundResourceId}`
          : undefined,
        currentTargetId: currentBackgroundResourceId
          ? `bg-cg-${currentBackgroundResourceId}`
          : undefined,
        animationPath: "background.animations",
        idPrefix: "bg-cg",
        allowIncomingUpdateFallback: true,
      });
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
  },
) => {
  const { elements, animations } = state;
  if (presentationState.character && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.character.items || [];
    const previousItems = previousPresentationState?.character?.items || [];

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
          ? getCharacterContainerId(previousItem, previousItemIndex)
          : undefined;

      if (
        item.animations &&
        !sprites &&
        !transformId &&
        previousHasSprites &&
        !isLineCompleted &&
        !skipTransitionsAndAnimations
      ) {
        pushAnimations({
          animations,
          animationsDef: item.animations,
          resources,
          previousResourceId: previousContainerId,
          currentResourceId: undefined,
          previousTargetId: previousContainerId,
          currentTargetId: undefined,
          animationPath: `character.items[${i}].animations`,
          idPrefix: "character",
        });
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

      const containerId = getCharacterContainerId(item, i);
      const transform = resources.transforms[transformId];
      if (!transform) {
        console.warn("Transform not found:", transformId);
        continue;
      }
      const characterContainer = {
        type: "container",
        id: containerId,
        x: item.x ?? transform.x,
        y: item.y ?? transform.y,
        anchorX: transform.anchorX,
        anchorY: transform.anchorY,
        rotation: transform.rotation,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        children: [],
      };

      for (const sprite of sprites) {
        const imageResource = resources.images[sprite.resourceId];
        if (!imageResource) {
          console.warn(`Image resource not found: ${sprite.resourceId}`);
          continue;
        }

        characterContainer.children.push({
          type: "sprite",
          id: `${containerId}-${sprite.id}`,
          src: imageResource.fileId,
          width: imageResource.width,
          height: imageResource.height,
          x: 0,
          y: 0,
        });
      }

      storyContainer.children.push(characterContainer);

      // Add animation support (except out, which is handled above)
      if (
        item.animations &&
        !isLineCompleted &&
        !skipTransitionsAndAnimations
      ) {
        pushAnimations({
          animations,
          animationsDef: item.animations,
          resources,
          previousResourceId: previousContainerId,
          currentResourceId: containerId,
          previousTargetId: previousContainerId,
          currentTargetId: containerId,
          animationPath: `character.items[${i}].animations`,
          idPrefix: "character",
        });
      }
    }
  }
  return state;
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
    autoMode,
    skipMode,
    isChoiceVisible,
    canRollback,
    saveSlots = [],
  },
) => {
  const { elements, animations } = state;
  if (presentationState.visual && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    const items = presentationState.visual.items;
    for (const item of items) {
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

            const element = {
              id: `visual-${item.id}`,
              type: "animated-sprite",
              x: item.x ?? transform.x,
              y: item.y ?? transform.y,
              width: item.width ?? spritesheet.width,
              height: item.height ?? spritesheet.height,
              alpha: item.alpha ?? 1,
              anchorX: transform.anchorX,
              anchorY: transform.anchorY,
              rotation: transform.rotation,
              scaleX: transform.scaleX,
              scaleY: transform.scaleY,
              spritesheetSrc: spritesheet.fileId,
              spritesheetData: spritesheet.jsonData,
              animation: {
                frames: animationDef.frames,
                animationSpeed:
                  item.animationSpeed ?? animationDef.animationSpeed ?? 0.5,
                loop: item.loop ?? animationDef.loop ?? true,
              },
            };
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
              x: transform.x,
              y: transform.y,
              anchorX: transform.anchorX,
              anchorY: transform.anchorY,
              rotation: transform.rotation,
              scaleX: transform.scaleX,
              scaleY: transform.scaleY,
            };

            if (isVideo) {
              element.loop = resource.loop ?? false;
              element.volume = resource.volume ?? 500;
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
            x: transform.x,
            y: transform.y,
            anchorX: transform.anchorX,
            anchorY: transform.anchorY,
            rotation: transform.rotation,
            scaleX: transform.scaleX,
            scaleY: transform.scaleY,
          };
          const processedContainer = parseAndRender(
            visualContainer,
            createLayoutTemplateData({
              variables,
              saveSlots,
              isLineCompleted,
              autoMode,
              skipMode,
              isChoiceVisible,
              canRollback,
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

      if (
        item.animations &&
        !isLineCompleted &&
        !skipTransitionsAndAnimations
      ) {
        const previousItems = previousPresentationState?.visual?.items || [];
        const previousItem = previousItems.find((p) => p.id === item.id);

        pushAnimations({
          animations,
          animationsDef: item.animations,
          resources,
          previousResourceId: previousItem?.resourceId,
          currentResourceId: item.resourceId,
          previousTargetId: previousItem?.resourceId
            ? `visual-${item.id}`
            : undefined,
          currentTargetId: item.resourceId ? `visual-${item.id}` : undefined,
          animationPath: `visual.items[${item.id}].animations`,
          idPrefix: item.id,
        });
      }
    }
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
    canRollback,
    skipOnlyViewedLines,
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
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
      let character;
      if (presentationState.dialogue.characterId) {
        character =
          resources.characters[presentationState.dialogue.characterId];
      }

      // Check if there's a character object override
      if (presentationState.dialogue.character) {
        character = {
          ...character,
          name: presentationState.dialogue.character.name,
        };
      }

      const wrappedTemplate = { elements: uiLayout.elements };
      const dialogueContent =
        presentationState.dialogue?.content === undefined
          ? [{ text: "" }]
          : ensureDialogueContentItems(
              presentationState.dialogue.content,
              "dialogue.content",
            );
      const dialogueLines = (presentationState.dialogue?.lines || []).map(
        (line, index) => {
          const lineContent = ensureDialogueContentItems(
            line.content,
            `dialogue.lines[${index}].content`,
          );

          return {
            content: lineContent.map((item) => ({
              ...item,
              text: interpolateDialogueText(item.text, { variables }),
            })),
            characterName: line.characterId
              ? resources.characters?.[line.characterId]?.name || ""
              : "",
          };
        },
      );

      const templateData = {
        variables,
        autoMode,
        skipMode,
        isChoiceVisible,
        canRollback,
        skipOnlyViewedLines,
        isLineCompleted,
        saveSlots,
        effectiveSoundVolume: variables?._muteAll
          ? 0
          : (variables?._soundVolume ?? 500),
        textSpeed: variables?._textSpeed ?? 50,
        dialogueLines,
        dialogue: {
          character: {
            name: character?.name || "",
          },
          content: dialogueContent.map((item) => ({
            ...item,
            text: interpolateDialogueText(item.text, { variables }),
          })),
          lines: dialogueLines,
        },
      };

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

  // Handle dialogue UI animations
  if (
    presentationState.dialogue.ui?.animations &&
    !isLineCompleted &&
    !skipTransitionsAndAnimations
  ) {
    pushAnimations({
      animations,
      animationsDef: presentationState.dialogue.ui.animations,
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
    autoMode,
    skipMode,
    isChoiceVisible,
    canRollback,
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
            saveSlots,
            isLineCompleted,
            autoMode,
            skipMode,
            isChoiceVisible: isChoiceVisible ?? !!presentationState.choice,
            canRollback,
          }),
          choice: {
            items: presentationState.choice?.items ?? [],
          },
        },
        {
          functions: jemplFunctions,
        },
      );
      const choiceElements = tagChoiceInteractionSource(
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

    // Handle choice animations
    if (
      presentationState.choice.animations &&
      !isLineCompleted &&
      !skipTransitionsAndAnimations
    ) {
      pushAnimations({
        animations,
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
    }
  }
  return state;
};

export const addControl = (
  state,
  {
    presentationState,
    resources = {},
    variables,
    isLineCompleted,
    autoMode,
    skipMode,
    isChoiceVisible,
    canRollback,
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

  const keyboardMapping = toRenderStateKeyboard(control.keyboard);
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
        saveSlots,
        isLineCompleted,
        autoMode,
        skipMode,
        isChoiceVisible,
        canRollback,
      }),
      isLineCompleted,
      skipMode,
      skipTransitionsAndAnimations,
    }),
  );

  return state;
};

export const addBgm = (state, { presentationState, resources, variables }) => {
  const { elements, audio } = state;
  if (presentationState.bgm && resources) {
    // Find the story container
    const storyContainer = getStoryContainer(elements);
    if (!storyContainer) return state;

    const audioResource = resources.sounds[presentationState.bgm.resourceId];
    if (!audioResource) return state;

    // Calculate effective music volume respecting _muteAll and _musicVolume
    const effectiveMusicVolume = variables?._muteAll
      ? 0
      : (variables?._musicVolume ?? 500);

    audio.push({
      id: "bgm",
      type: "sound",
      src: audioResource.fileId,
      loop: presentationState.bgm.loop ?? true,
      volume: effectiveMusicVolume,
      delay: presentationState.bgm.delay ?? null,
    });
  }
  return state;
};

export const addSfx = (state, { presentationState, resources }) => {
  const { audio: audioElements } = state;

  if (presentationState.sfx && resources) {
    // Find the story container
    const items = presentationState.sfx.items;
    for (const item of items) {
      const audioResource = resources.sounds?.[item.resourceId];
      if (!audioResource) continue;

      audioElements.push({
        id: item.id,
        type: "sound",
        src: audioResource.fileId,
        loop: item.loop ?? audioResource.loop ?? false,
        volume: item.volume ?? audioResource.volume ?? 500,
        delay: item.delay ?? audioResource.delay ?? null,
      });
    }
  }

  return state;
};

export const addVoice = (state, { presentationState, resources }) => {
  const { audio } = state;

  if (!presentationState?.voice) {
    return state;
  }

  const { fileId, volume, loop } = presentationState.voice;

  audio.push({
    id: `voice-${fileId}`,
    type: "sound",
    src: fileId,
    volume: volume ?? 500,
    loop: loop ?? false,
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
    autoMode,
    skipMode,
    isChoiceVisible,
    canRollback,
    saveSlots = [],
    isLineCompleted,
    skipTransitionsAndAnimations,
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
          saveSlots,
          isLineCompleted,
          autoMode,
          skipMode,
          isChoiceVisible,
          canRollback,
        }),
        isLineCompleted,
        skipMode,
        skipTransitionsAndAnimations,
      }),
    );
  }

  // Handle layout animations
  if (
    presentationState.layout?.animations &&
    !isLineCompleted &&
    !skipTransitionsAndAnimations
  ) {
    const previousResourceId = previousPresentationState?.layout?.resourceId;
    const currentResourceId = presentationState.layout?.resourceId;

    pushAnimations({
      animations,
      animationsDef: presentationState.layout.animations,
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
  }

  return state;
};

export const addLayeredViews = (
  state,
  {
    resources = {},
    variables,
    autoMode,
    skipMode,
    isChoiceVisible,
    canRollback,
    layeredViews = [],
    dialogueHistory = [],
    saveSlots = [],
    screen,
    isLineCompleted,
    skipTransitionsAndAnimations,
  },
) => {
  const { elements, animations } = state;
  if (layeredViews && layeredViews.length > 0) {
    // Add each layeredView as an overlay
    layeredViews.forEach((layeredView, index) => {
      const layout = resources.layouts[layeredView.resourceId];

      if (!layout) {
        console.warn(`LayeredView layout not found: ${layeredView.resourceId}`);
        return;
      }

      if (Array.isArray(layout.transitions)) {
        if (!skipTransitionsAndAnimations) {
          pushNormalizedLayoutTransitions({
            animations,
            transitions: layout.transitions,
            defaultTargetId: `layeredView-${index}`,
            idPrefix: `layeredView-${index}`,
            animationPathPrefix: `layeredViews[${index}]`,
          });
        }
      }

      // Create a container for this layeredView
      const layeredViewContainer = {
        id: `layeredView-${index}`,
        type: "container",
        x: 0,
        y: 0,
        children: [
          createFullscreenClickBlocker({
            id: `layeredView-${index}-blocker`,
            screen,
          }),
          ...(layout.elements || []),
        ],
      };

      const historyDialogueWithNames = createHistoryDialogueTemplateData(
        dialogueHistory,
        resources.characters,
      );

      const templateData = createLayoutTemplateData({
        variables,
        saveSlots,
        isLineCompleted,
        autoMode,
        skipMode,
        isChoiceVisible,
        canRollback,
        historyDialogue: historyDialogueWithNames,
        characters: resources.characters || {},
      });

      const processedLayeredView = parseAndRender(
        layeredViewContainer,
        templateData,
        {
          functions: jemplFunctions,
        },
      );

      const [blocker, ...layoutChildren] = processedLayeredView.children || [];
      const resolvedLayeredView = resolveLayoutResourceIds(
        settleTextRevealIfCompleted(
          {
            ...processedLayeredView,
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
        ...resolvedLayeredView,
        children: blocker
          ? [blocker, ...(resolvedLayeredView.children || [])]
          : resolvedLayeredView.children,
      });
    });
  }
  return state;
};

export const addConfirmDialog = (
  state,
  {
    resources = {},
    variables,
    saveSlots = [],
    autoMode,
    skipMode,
    isChoiceVisible,
    canRollback,
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
  );

  const processedConfirmDialog = parseAndRender(
    confirmDialogContainer,
    createLayoutTemplateData({
      variables,
      saveSlots,
      isLineCompleted,
      autoMode,
      skipMode,
      isChoiceVisible,
      canRollback,
      confirmDialog,
      historyDialogue: historyDialogueWithNames,
      characters: resources.characters || {},
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

export const constructRenderState = (params) => {
  const actions = [
    addControl,
    addBackgroundOrCg,
    addCharacters,
    addVisuals,
    addDialogue,
    addChoices,
    addLayout,
    addBgm,
    addSfx,
    addVoice,
    addLayeredViews,
    addConfirmDialog,
  ];

  const executeActions = createSequentialActionsExecutor(
    createInitialState,
    actions,
  );

  return executeActions(params);
};
