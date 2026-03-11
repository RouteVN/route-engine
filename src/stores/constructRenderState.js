import { parseAndRender } from "jempl";
import { createSequentialActionsExecutor, formatDate } from "../util.js";

const jemplFunctions = {
  objectValues: (obj) =>
    Object.entries(obj).map(([id, value]) => ({ id, ...value })),
  formatDate,
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
  if (alpha === 1) {
    return value;
  }

  const normalizedHexColor = normalizeHexColor(value, errorContext);
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

  return colorResource.hex;
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

export const resolveLayoutResourceIds = (node, resources = {}, path = "root") =>
  resolveImageIds(
    resolveColorIds(
      resolveTextStyleIds(node, resources, path),
      resources,
      path,
    ),
    resources,
    path,
  );

/**
 * Helper to push in/out/update animations based on previous and current state
 * @param {Object} params
 * @param {Array} params.animations - The animations array to push to
 * @param {Object} params.animationsDef - The animations definition (in/out/update)
 * @param {Object} params.resources - The resources object containing tweens
 * @param {string|undefined} params.previousResourceId - Previous resource ID
 * @param {string|undefined} params.currentResourceId - Current resource ID
 * @param {string} params.idPrefix - Prefix for animation IDs
 * @param {string} params.targetId - Target element ID for in/update animations
 * @param {string} params.outTargetId - Target element ID for out animation (defaults to targetId)
 */
const pushAnimations = ({
  animations,
  animationsDef,
  resources,
  previousResourceId,
  currentResourceId,
  idPrefix,
  targetId,
  outTargetId,
}) => {
  if (!animationsDef) return;

  if (animationsDef.in) {
    const tweenId = animationsDef.in.resourceId || animationsDef.in;
    const tween = resources?.tweens?.[tweenId];
    if (tween && !previousResourceId) {
      animations.push({
        id: `${idPrefix}-animation-in`,
        type: "tween",
        targetId,
        properties: structuredClone(tween.properties),
      });
    }
  }

  if (animationsDef.out) {
    const tweenId = animationsDef.out.resourceId || animationsDef.out;
    const tween = resources?.tweens?.[tweenId];
    if (
      tween &&
      previousResourceId &&
      previousResourceId !== currentResourceId
    ) {
      animations.push({
        id: `${idPrefix}-animation-out`,
        type: "tween",
        targetId: outTargetId || targetId,
        properties: structuredClone(tween.properties),
      });
    }
  }

  if (animationsDef.update) {
    const tweenId = animationsDef.update.resourceId || animationsDef.update;
    const tween = resources?.tweens?.[tweenId];
    if (
      tween &&
      previousResourceId &&
      previousResourceId === currentResourceId
    ) {
      animations.push({
        id: `${idPrefix}-animation-update`,
        type: "tween",
        targetId,
        properties: structuredClone(tween.properties),
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

/**
 * @param {Object} params
 */
export const addBase = (state, { presentationState, resources, variables }) => {
  const { elements } = state;
  if (presentationState.base) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) {
      return state;
    }

    if (presentationState.base.resourceId) {
      const layout = resources?.layouts[presentationState.base.resourceId];

      if (layout) {
        const baseContainer = {
          id: "base",
          type: "container",
          children: layout.elements,
        };

        const processedContainer = parseAndRender(
          baseContainer,
          { variables },
          { functions: jemplFunctions },
        );

        storyContainer.children.unshift(
          resolveLayoutResourceIds(processedContainer, resources),
        );
      }
    }
  }
  return state;
};

/**
 *
 * @param {Object} params
 */
export const addBackgroundOrCg = (
  state,
  {
    presentationState,
    previousPresentationState,
    resources = {},
    isLineCompleted,
    skipTransitionsAndAnimations,
    variables,
  },
) => {
  const { elements, animations } = state;
  if (presentationState.background) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) {
      return state;
    }

    if (presentationState.background.resourceId) {
      const { images = {}, videos = {} } = resources;
      const background =
        images[presentationState.background.resourceId] ||
        videos[presentationState.background.resourceId];
      if (background) {
        const isVideo =
          videos[presentationState.background.resourceId] !== undefined;
        const element = {
          id: `bg-cg-${presentationState.background.resourceId}`,
          type: isVideo ? "video" : "sprite",
          x: 0,
          y: 0,
          src: background.fileId,
          width: background.width,
          height: background.height,
        };

        if (isVideo) {
          element.loop = presentationState.background.loop ?? false;
          element.volume = background.volume ?? 500;
        }

        storyContainer.children.push(element);
      }
    }

    if (presentationState.background.resourceId) {
      const { layouts = {} } = resources;
      const layout = layouts[presentationState.background.resourceId];
      if (layout) {
        const bgContainer = {
          id: `bg-cg-${presentationState.background.resourceId}`,
          type: "container",
          children: layout.elements,
        };
        const processedContainer = parseAndRender(
          bgContainer,
          { variables },
          { functions: jemplFunctions },
        );
        storyContainer.children.push(
          resolveLayoutResourceIds(processedContainer, resources),
        );
      }
    }

    if (
      presentationState.background.animations &&
      !isLineCompleted &&
      !skipTransitionsAndAnimations
    ) {
      const previousResourceId =
        previousPresentationState?.background?.resourceId;
      const currentResourceId = presentationState.background.resourceId;

      pushAnimations({
        animations,
        animationsDef: presentationState.background.animations,
        resources,
        previousResourceId,
        currentResourceId,
        idPrefix: "bg-cg",
        targetId: `bg-cg-${currentResourceId}`,
        outTargetId: `bg-cg-${previousResourceId}`,
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

      // For out animations only, we don't need to create a container
      if (item.animations && item.animations.out && !sprites && !transformId) {
        // Just add the out animation transition, container should already exist
        if (!isLineCompleted && previousHasSprites) {
          const tweenId = item.animations.out.resourceId;
          const tween = resources?.tweens?.[tweenId];
          if (tween) {
            const outTransition = {
              id: `character-animation-out`,
              type: "tween",
              targetId: previousContainerId || `character-container-${item.id}`,
              properties: structuredClone(tween.properties),
            };
            animations.push(outTransition);
          }
        }
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
        // Use boolean flags as "resource IDs" for the helper
        // previousHasSprites/currentHasSprites work because helper checks truthiness and equality
        pushAnimations({
          animations,
          animationsDef: item.animations,
          resources,
          previousResourceId: previousHasSprites,
          currentResourceId: currentHasSprites,
          idPrefix: "character",
          targetId: containerId,
          outTargetId: previousContainerId,
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
            { variables },
            { functions: jemplFunctions },
          );
          storyContainer.children.push(
            resolveLayoutResourceIds(processedContainer, resources),
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
          idPrefix: item.id,
          targetId: `visual-${item.id}`,
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
    canRollback,
    skipOnlyViewedLines,
    isLineCompleted,
    skipTransitionsAndAnimations,
    l10n,
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

  // Handle GUI elements (dialogue layouts) from dialogue.gui.resourceId
  if (
    presentationState.dialogue.gui &&
    presentationState.dialogue.gui.resourceId
  ) {
    const { layouts = {} } = resources;
    const guiLayout = layouts[presentationState.dialogue.gui.resourceId];
    if (guiLayout) {
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

      const wrappedTemplate = { elements: guiLayout.elements };
      const dialogueContent =
        presentationState.dialogue?.content === undefined
          ? [{ text: "" }]
          : ensureDialogueContentItems(
              presentationState.dialogue.content,
              "dialogue.content",
            );

      const templateData = {
        variables,
        autoMode,
        skipMode,
        canRollback,
        skipOnlyViewedLines,
        isLineCompleted,
        saveSlots,
        effectiveSoundVolume: variables?._muteAll
          ? 0
          : (variables?._soundVolume ?? 500),
        textSpeed: variables?._textSpeed ?? 50,
        dialogue: {
          character: {
            name: character?.name || "",
          },
          content: dialogueContent.map((item) => ({
            ...item,
            text: interpolateDialogueText(item.text, { variables, l10n }),
          })),
          lines: (presentationState.dialogue?.lines || []).map(
            (line, index) => {
              const lineContent = ensureDialogueContentItems(
                line.content,
                `dialogue.lines[${index}].content`,
              );

              return {
                content: lineContent.map((item) => ({
                  ...item,
                  text: interpolateDialogueText(item.text, { variables, l10n }),
                })),
                characterName: line.characterId
                  ? resources.characters?.[line.characterId]?.name || ""
                  : "",
              };
            },
          ),
        },
        l10n,
      };

      let result = parseAndRender(wrappedTemplate, templateData, {
        functions: jemplFunctions,
      });
      result = parseAndRender(result, {
        l10n,
      });
      const guiElements = resolveLayoutResourceIds(result?.elements, resources);

      if (Array.isArray(guiElements)) {
        for (const element of guiElements) {
          storyContainer.children.push(element);
        }
      } else if (guiElements) {
        storyContainer.children.push(guiElements);
      }
    }
  }

  // Handle dialogue GUI animations
  if (
    presentationState.dialogue.gui?.animations &&
    !isLineCompleted &&
    !skipTransitionsAndAnimations
  ) {
    pushAnimations({
      animations,
      animationsDef: presentationState.dialogue.gui.animations,
      resources,
      previousResourceId: previousPresentationState?.dialogue?.gui?.resourceId,
      currentResourceId: presentationState.dialogue.gui?.resourceId,
      idPrefix: "dialogue-gui",
      targetId: "dialogue-container",
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
    isLineCompleted,
    skipTransitionsAndAnimations,
    screen,
  },
) => {
  const { elements, animations } = state;
  if (presentationState.choice && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
    if (!storyContainer) return state;

    storyContainer.children.push({
      id: "choice-blocker",
      type: "rect",
      fill: "transparent",
      width: screen.width,
      height: screen.height,
      x: 0,
      y: 0,
      click: {
        actionPayload: {
          actions: {},
        },
      },
    });

    const layout = resources?.layouts[presentationState.choice.resourceId];
    if (layout && layout.elements) {
      const wrappedTemplate = { elements: layout.elements };
      const result = parseAndRender(wrappedTemplate, {
        choice: {
          items: presentationState.choice?.items ?? [],
        },
      });
      const choiceElements = resolveLayoutResourceIds(
        result?.elements,
        resources,
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
        idPrefix: "choice",
        targetId: "choice-container",
      });
    }
  }
  return state;
};

export const addKeyboard = (state, { presentationState, resources }) => {
  if (presentationState.keyboard?.resourceId) {
    const keyboardMapping =
      resources?.keyboards?.[presentationState.keyboard.resourceId];
    if (keyboardMapping) {
      state.global.keyboard = keyboardMapping;
    }
  }
  return state;
};

export const addBgm = (state, { presentationState, resources, variables }) => {
  const { elements, audio } = state;
  if (presentationState.bgm && resources) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
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
        loop: item.loop ?? audioResource.loop ?? true,
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
    canRollback,
    currentLocalizationPackageId,
    saveSlots = [],
    isLineCompleted,
    skipTransitionsAndAnimations,
  },
) => {
  const { elements, animations } = state;
  if (presentationState.layout) {
    // Find the story container
    const storyContainer = elements.find((el) => el.id === "story");
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
      layout.transitions.forEach((transition) => {
        animations.push(transition);
      });
    }

    const layoutContainer = {
      id: `layout-${presentationState.layout.resourceId}`,
      type: "container",
      x: 0,
      y: 0,
      children: layout.elements || [],
    };

    const templateData = {
      variables,
      saveSlots,
      autoMode,
      skipMode,
      canRollback,
      currentLocalizationPackageId,
      effectiveSoundVolume: variables?._muteAll
        ? 0
        : (variables?._soundVolume ?? 500),
      textSpeed: variables?._textSpeed ?? 50,
    };

    let processedContainer = parseAndRender(layoutContainer, templateData, {
      functions: jemplFunctions,
    });
    processedContainer = parseAndRender(processedContainer, {
      i18n: {},
      // i18n: systemStore.selectCurrentLanguagePackKeys(),
    });

    // Push the processed container
    storyContainer.children.push(
      resolveLayoutResourceIds(processedContainer, resources),
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
      idPrefix: "layout",
      targetId: `layout-${currentResourceId}`,
      outTargetId: `layout-${previousResourceId}`,
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
    canRollback,
    currentLocalizationPackageId,
    layeredViews = [],
    dialogueHistory = [],
    saveSlots = [],
    l10n,
    screen,
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
        layout.transitions.forEach((transition) => {
          animations.push(transition);
        });
      }

      // Create a container for this layeredView
      const layeredViewContainer = {
        id: `layeredView-${index}`,
        type: "container",
        x: 0,
        y: 0,
        children: [
          {
            id: `layeredView-${index}-blocker`,
            type: "rect",
            fill: "transparent",
            width: screen.width,
            height: screen.height,
            x: 0,
            y: 0,
            click: {
              actionPayload: {
                actions: {},
              },
            },
          },
          ...(layout.elements || []),
        ],
      };

      const historyDialogueWithNames = dialogueHistory.map((item) => {
        const character = resources.characters?.[item.characterId];
        return {
          ...item,
          characterName: character?.name || "",
        };
      });

      const templateData = {
        variables,
        autoMode,
        skipMode,
        canRollback,
        currentLocalizationPackageId,
        saveSlots,
        effectiveSoundVolume: variables?._muteAll
          ? 0
          : (variables?._soundVolume ?? 500),
        textSpeed: variables?._textSpeed ?? 50,
        historyDialogue: historyDialogueWithNames,
        characters: resources.characters || {},
      };

      let processedLayeredView = parseAndRender(
        layeredViewContainer,
        templateData,
        {
          functions: jemplFunctions,
        },
      );
      processedLayeredView = parseAndRender(processedLayeredView, {
        i18n: {},
        l10n,
      });

      const [blocker, ...layoutChildren] = processedLayeredView.children || [];
      const resolvedLayeredView = resolveLayoutResourceIds(
        {
          ...processedLayeredView,
          children: layoutChildren,
        },
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

export const constructRenderState = (params) => {
  const actions = [
    addBase,
    addBackgroundOrCg,
    addCharacters,
    addVisuals,
    addDialogue,
    addChoices,
    addKeyboard,
    addLayout,
    addBgm,
    addSfx,
    addVoice,
    addLayeredViews,
  ];

  const executeActions = createSequentialActionsExecutor(
    createInitialState,
    actions,
  );

  return executeActions(params);
};
