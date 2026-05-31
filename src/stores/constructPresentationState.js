import { current, isDraft } from "immer";
import { createSequentialActionsExecutor } from "../util.js";

const clonePresentationValue = (value) =>
  structuredClone(isDraft(value) ? current(value) : value);

const hasOwnProperty = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasPersistentAnimationSelection = (value) =>
  value?.animations?.playback?.continuity === "persistent";

const hasDefinedProperty = (value, key) =>
  hasOwnProperty(value ?? {}, key) && value[key] !== undefined;

/**
 * Helper to handle animations-only state when no resource is provided
 * @param {Object} presentation - The presentation object
 * @param {Function} hasResourceFn - Function to check if presentation has a resource
 * @returns {{ animationsOnly: boolean, state: Object|null }}
 */
const getAnimationsOnlyState = (presentation, hasResourceFn) => {
  if (!presentation) {
    return { animationsOnly: false, state: null };
  }

  if (!hasResourceFn(presentation) && presentation.animations) {
    return {
      animationsOnly: true,
      state: { animations: clonePresentationValue(presentation.animations) },
    };
  }

  return { animationsOnly: false, state: null };
};

/**
 * Processes items array to handle animations-only items
 * @param {Array} items - The items array
 * @param {Function} hasResourceFn - Function to check if item has a resource
 * @returns {{ hasValidItems: boolean, processedItems: Array }}
 */
const hasItemAppearance = (item) =>
  hasDefinedProperty(item, "opacity") || hasDefinedProperty(item, "blur");

const ITEM_TRANSFORM_FIELDS = [
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

const hasItemTransform = (item) =>
  ITEM_TRANSFORM_FIELDS.some((field) => hasDefinedProperty(item, field));

const hasCompleteVisualText = (item) =>
  item?.text &&
  hasDefinedProperty(item.text, "content") &&
  hasDefinedProperty(item.text, "textStyleId");

const hasVisualTextPatch = (item) => hasDefinedProperty(item, "text");

const hasVisualSubject = (item) =>
  !!item.resourceId || hasCompleteVisualText(item);

const mergeVisualItemPatch = (previousItem, item) => {
  const mergedItem = {
    ...clonePresentationValue(previousItem),
    ...item,
  };

  if (item.text && previousItem.text) {
    mergedItem.text = {
      ...clonePresentationValue(previousItem.text),
      ...clonePresentationValue(item.text),
    };
  }

  return mergedItem;
};

const assertVisualTextPatch = (item, previousItem) => {
  if (!hasVisualTextPatch(item)) {
    return;
  }

  if (item.resourceId) {
    throw new Error(
      `Visual item "${item.id}" cannot define both resourceId and text`,
    );
  }

  if (hasCompleteVisualText(item)) {
    return;
  }

  if (!previousItem?.text) {
    throw new Error(
      `Visual item "${item.id}" text requires content and textStyleId`,
    );
  }
};

const hasBackgroundTransform = (background) =>
  BACKGROUND_TRANSFORM_FIELDS.some((field) =>
    hasDefinedProperty(background, field),
  );

const applyPersistentBackgroundTransform = (
  background,
  previousBackground,
  { hasAuthoredTransformId = false } = {},
) => {
  if (!previousBackground) {
    return background;
  }

  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    if (
      !hasAuthoredTransformId &&
      !hasDefinedProperty(background, field) &&
      hasDefinedProperty(previousBackground, field)
    ) {
      background[field] = previousBackground[field];
    }

    if (hasOwnProperty(background, field) && background[field] === undefined) {
      delete background[field];
    }
  }

  return background;
};

const findPreviousItem = (previousItems, item, index) => {
  const previousAtIndex = previousItems[index];
  if (previousAtIndex?.id === item?.id) {
    return previousAtIndex;
  }

  return previousItems.find((previousItem) => previousItem.id === item?.id);
};

const applyPersistentItemTransform = (item, previousItem) => {
  if (!previousItem) {
    return item;
  }

  for (const field of ITEM_TRANSFORM_FIELDS) {
    if (
      !hasDefinedProperty(item, field) &&
      hasDefinedProperty(previousItem, field)
    ) {
      item[field] = previousItem[field];
    }

    if (hasOwnProperty(item, field) && item[field] === undefined) {
      delete item[field];
    }
  }

  return item;
};

const applyPersistentItemAppearance = (item, previousItem) => {
  if (!previousItem) {
    return item;
  }

  if (
    !hasDefinedProperty(item, "opacity") &&
    hasDefinedProperty(previousItem, "opacity")
  ) {
    item.opacity = previousItem.opacity;
  }

  if (
    !hasDefinedProperty(item, "blur") &&
    hasDefinedProperty(previousItem, "blur")
  ) {
    item.blur = clonePresentationValue(previousItem.blur);
  }

  if (hasOwnProperty(item, "opacity") && item.opacity === undefined) {
    delete item.opacity;
  }

  if (hasOwnProperty(item, "blur") && item.blur === undefined) {
    delete item.blur;
  }

  return item;
};

const processItemsWithAnimations = (
  items,
  hasResourceFn,
  previousItems = [],
  { hasPatchFn = () => false, mergeItemFn } = {},
) => {
  if (!items || items.length === 0) {
    return { hasValidItems: false, processedItems: [] };
  }

  const processedItems = items
    .map((item, index) => {
      const previousItem = findPreviousItem(previousItems, item, index);
      const hasResource = hasResourceFn(item);
      const hasAppearance = hasItemAppearance(item);
      const hasTransform = hasItemTransform(item);
      const hasPatch = hasPatchFn(item);
      const hasAnimations = hasOwnProperty(item, "animations");
      let processedItem = clonePresentationValue(item);

      if (
        !hasResource &&
        (hasAppearance || hasTransform || hasPatch) &&
        previousItem
      ) {
        processedItem = mergeItemFn
          ? mergeItemFn(previousItem, processedItem)
          : {
              ...clonePresentationValue(previousItem),
              ...processedItem,
            };

        if (!hasAnimations) {
          delete processedItem.animations;
        }
      }

      return applyPersistentItemAppearance(
        applyPersistentItemTransform(processedItem, previousItem),
        previousItem,
      );
    })
    .filter((item) => hasResourceFn(item) || item.animations);

  return {
    hasValidItems: processedItems.length > 0,
    processedItems,
  };
};

const resolveDialogueCharacterName = (dialogueAction) => {
  if (!dialogueAction) {
    return undefined;
  }

  if (
    dialogueAction.character &&
    hasOwnProperty(dialogueAction.character, "name")
  ) {
    return dialogueAction.character.name;
  }

  if (hasOwnProperty(dialogueAction, "characterName")) {
    return dialogueAction.characterName;
  }

  return undefined;
};

const hasDialogueCharacterSprite = (dialogueAction) =>
  !!dialogueAction?.character &&
  hasOwnProperty(dialogueAction.character, "sprite");

const resolveDialogueCharacterFields = (dialogueAction) => {
  const fields = {};
  let hasFields = false;
  const characterName = resolveDialogueCharacterName(dialogueAction);

  if (characterName !== undefined) {
    fields.name = characterName;
    hasFields = true;
  }

  if (hasDialogueCharacterSprite(dialogueAction)) {
    fields.sprite = clonePresentationValue(dialogueAction.character.sprite);
    hasFields = true;
  }

  return hasFields ? fields : undefined;
};

const clearDialogueCharacterSpriteAnimations = (dialogueState) => {
  if (dialogueState?.character?.sprite?.animations) {
    dialogueState.character.sprite.animations = {};
  }
};

const applyDialogueContent = ({ dialogueState, content, append = false }) => {
  if (!append || !Array.isArray(content)) {
    dialogueState.content = content;
    delete dialogueState.initialRevealedContent;
    return;
  }

  const previousContent = Array.isArray(dialogueState.content)
    ? dialogueState.content
    : [];

  if (previousContent.length > 0) {
    dialogueState.initialRevealedContent = previousContent.map((item) =>
      clonePresentationValue(item),
    );
  } else {
    delete dialogueState.initialRevealedContent;
  }

  dialogueState.content = [...previousContent, ...content];
};

/**
 * Creates the initial presentation state
 * @returns {Object} Empty initial state object
 */
export const createInitialState = () => {
  return {};
};

/**
 *
 * Applies whole-screen static appearance from presentation to state.
 * Screen animations remain transient and are read directly from line actions.
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const screen = (state, presentation) => {
  if (!presentation.screen) {
    return;
  }

  const hasOpacity = hasDefinedProperty(presentation.screen, "opacity");
  const hasBlur = hasDefinedProperty(presentation.screen, "blur");
  const hasAnimations = hasOwnProperty(presentation.screen, "animations");

  if (!hasOpacity && !hasBlur) {
    if (!hasAnimations) {
      delete state.screen;
    }
    return;
  }

  const previousScreen = state.screen;
  const nextScreen = {};

  if (hasOpacity) {
    nextScreen.opacity = presentation.screen.opacity;
  } else if (hasDefinedProperty(previousScreen, "opacity")) {
    nextScreen.opacity = previousScreen.opacity;
  }

  if (hasBlur) {
    nextScreen.blur = clonePresentationValue(presentation.screen.blur);
  } else if (hasDefinedProperty(previousScreen, "blur")) {
    nextScreen.blur = clonePresentationValue(previousScreen.blur);
  }

  if (
    hasOwnProperty(nextScreen, "opacity") &&
    nextScreen.opacity === undefined
  ) {
    delete nextScreen.opacity;
  }

  if (hasOwnProperty(nextScreen, "blur") && nextScreen.blur === undefined) {
    delete nextScreen.blur;
  }

  if (Object.keys(nextScreen).length === 0) {
    delete state.screen;
    return;
  }

  state.screen = nextScreen;
};

/**
 *
 * Applies background from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const background = (state, presentation) => {
  if (presentation.background) {
    const hasResourceId = hasDefinedProperty(
      presentation.background,
      "resourceId",
    );
    const hasColorId = hasDefinedProperty(presentation.background, "colorId");
    const hasOpacity = hasDefinedProperty(presentation.background, "opacity");
    const hasBlur = hasDefinedProperty(presentation.background, "blur");
    const hasTransformId = hasDefinedProperty(
      presentation.background,
      "transformId",
    );
    const hasTransform = hasBackgroundTransform(presentation.background);

    const { animationsOnly, state: animState } = getAnimationsOnlyState(
      presentation.background,
      (p) =>
        hasDefinedProperty(p, "resourceId") ||
        hasDefinedProperty(p, "colorId") ||
        hasDefinedProperty(p, "opacity") ||
        hasDefinedProperty(p, "blur") ||
        hasDefinedProperty(p, "transformId") ||
        hasBackgroundTransform(p),
    );

    if (animationsOnly) {
      state.background = state.background
        ? {
            ...clonePresentationValue(state.background),
            ...animState,
          }
        : animState;
      return;
    }

    if (
      !hasResourceId &&
      !hasColorId &&
      !hasOpacity &&
      !hasBlur &&
      !hasTransformId &&
      !hasTransform
    ) {
      delete state.background;
      return;
    }

    const previousBackground = state.background;
    const nextBackground = clonePresentationValue(presentation.background);

    if (!hasResourceId && previousBackground?.resourceId) {
      nextBackground.resourceId = previousBackground.resourceId;
      if (
        !hasOwnProperty(nextBackground, "transformId") &&
        previousBackground.transformId
      ) {
        nextBackground.transformId = previousBackground.transformId;
      }
    }

    applyPersistentBackgroundTransform(nextBackground, previousBackground, {
      hasAuthoredTransformId: hasTransformId,
    });

    if (!hasColorId && previousBackground?.colorId) {
      nextBackground.colorId = previousBackground.colorId;
    }

    if (!hasOpacity && hasDefinedProperty(previousBackground, "opacity")) {
      nextBackground.opacity = previousBackground.opacity;
    }

    if (!hasBlur && hasDefinedProperty(previousBackground, "blur")) {
      nextBackground.blur = clonePresentationValue(previousBackground.blur);
    }

    if (
      hasOwnProperty(nextBackground, "resourceId") &&
      nextBackground.resourceId === undefined
    ) {
      delete nextBackground.resourceId;
    }

    if (
      hasOwnProperty(nextBackground, "colorId") &&
      nextBackground.colorId === undefined
    ) {
      delete nextBackground.colorId;
    }

    if (
      hasOwnProperty(nextBackground, "animations") &&
      nextBackground.animations === undefined
    ) {
      delete nextBackground.animations;
    }

    if (
      hasOwnProperty(nextBackground, "transformId") &&
      nextBackground.transformId === undefined
    ) {
      delete nextBackground.transformId;
    }

    if (
      hasOwnProperty(nextBackground, "opacity") &&
      nextBackground.opacity === undefined
    ) {
      delete nextBackground.opacity;
    }

    if (
      hasOwnProperty(nextBackground, "blur") &&
      nextBackground.blur === undefined
    ) {
      delete nextBackground.blur;
    }

    if (!nextBackground.resourceId && !nextBackground.colorId) {
      delete state.background;
      return;
    }

    if (
      previousBackground?.resourceId === nextBackground.resourceId &&
      previousBackground?.transformId === nextBackground.transformId &&
      !hasOwnProperty(nextBackground, "animations") &&
      hasPersistentAnimationSelection(previousBackground)
    ) {
      nextBackground.animations = clonePresentationValue(
        previousBackground.animations,
      );
    }

    state.background = nextBackground;
  } else {
    // Only clear transient animation selections when the background persists.
    if (
      state.background?.animations &&
      !hasPersistentAnimationSelection(state.background)
    ) {
      state.background.animations = {};
    }
  }
};

/**
 * Applies dialogue from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const dialogue = (state, presentation) => {
  if (!presentation.dialogue) {
    if (state.dialogue) {
      clearDialogueCharacterSpriteAnimations(state.dialogue);

      if (state.dialogue.mode === "adv") {
        state.dialogue.content = undefined;
        delete state.dialogue.initialRevealedContent;
        if (state.dialogue.persistCharacter !== true) {
          delete state.dialogue.characterId;
          delete state.dialogue.character;
        }
      }
    }
    return;
  }

  // Start with existing dialogue or empty object
  if (!state.dialogue) {
    state.dialogue = {};
  }
  const previousDialogueMode = state.dialogue.mode;

  // Copy all dialogue properties including ui
  if (presentation.dialogue.ui) {
    const { animationsOnly, state: animState } = getAnimationsOnlyState(
      presentation.dialogue.ui,
      (p) => !!p.resourceId,
    );

    if (animationsOnly) {
      state.dialogue.ui = {
        ...state.dialogue.ui,
        ...animState,
      };
    } else {
      state.dialogue.ui = { ...presentation.dialogue.ui };
    }
  } else if (state.dialogue?.ui?.animations) {
    // Clear animations if no ui in presentation
    state.dialogue.ui.animations = {};
  }

  // Handle mode-specific initialization
  if (presentation.dialogue.mode === "adv") {
    state.dialogue.content = state.dialogue.content || undefined;
    state.dialogue.characterId = state.dialogue.characterId || undefined;
    state.dialogue.mode = "adv";
  }

  if (presentation.dialogue.mode === "nvl") {
    if (state.dialogue?.mode !== "nvl") {
      state.dialogue.lines = [];
    }
    state.dialogue.mode = "nvl";
  }

  const isAppendingAdvDialogueContent =
    presentation.dialogue.append === true &&
    previousDialogueMode !== "nvl" &&
    state.dialogue?.mode !== "nvl" &&
    Array.isArray(presentation.dialogue.content);

  // Update content and character
  if (presentation.dialogue.content !== undefined) {
    applyDialogueContent({
      dialogueState: state.dialogue,
      content: presentation.dialogue.content,
      append: isAppendingAdvDialogueContent,
    });
  }

  const persistCharacter = hasOwnProperty(
    presentation.dialogue,
    "persistCharacter",
  )
    ? presentation.dialogue.persistCharacter === true
    : state.dialogue.persistCharacter === true;

  if (persistCharacter) {
    state.dialogue.persistCharacter = true;
  } else {
    delete state.dialogue.persistCharacter;
  }

  const hasCharacterId = hasOwnProperty(presentation.dialogue, "characterId");
  const characterFields = resolveDialogueCharacterFields(presentation.dialogue);
  const hasCharacterFields = characterFields !== undefined;
  const hasCharacterSprite = hasDialogueCharacterSprite(presentation.dialogue);

  if (hasCharacterId) {
    if (presentation.dialogue.characterId) {
      state.dialogue.characterId = presentation.dialogue.characterId;
    } else {
      delete state.dialogue.characterId;
    }
  } else if (!persistCharacter && !isAppendingAdvDialogueContent) {
    delete state.dialogue.characterId;
  }

  if (hasCharacterFields) {
    state.dialogue.character =
      !hasCharacterId && persistCharacter && state.dialogue.character
        ? {
            ...clonePresentationValue(state.dialogue.character),
            ...characterFields,
          }
        : characterFields;
  } else if (
    hasCharacterId ||
    (!persistCharacter && !isAppendingAdvDialogueContent)
  ) {
    delete state.dialogue.character;
  }

  if (!hasCharacterSprite) {
    clearDialogueCharacterSpriteAnimations(state.dialogue);
  }

  // Handle clear action
  if (presentation.dialogue.clear) {
    delete state.dialogue;
    return;
  }

  // Handle NVL page clear (before adding new content)
  if (presentation.dialogue?.clearPage && state.dialogue?.mode === "nvl") {
    state.dialogue.lines = [];
  }

  // Handle NVL mode content addition
  if (
    state.dialogue?.mode === "nvl" &&
    presentation.dialogue.content !== undefined
  ) {
    const dialogueLine = {
      content: presentation.dialogue.content,
      characterId: state.dialogue.characterId ?? null,
    };

    if (state.dialogue.character) {
      dialogueLine.character = clonePresentationValue(state.dialogue.character);
    }

    state.dialogue.lines.push(dialogueLine);
  }
};

/**
 * Applies sound effects from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const sfx = (state, presentation) => {
  if (presentation.sfx) {
    if (!presentation.sfx.items || presentation.sfx.items.length === 0) {
      delete state.sfx;
      return;
    }
    state.sfx = presentation.sfx;
  } else if (state.sfx) {
    delete state.sfx;
  }
};

/**
 * Applies background music from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const bgm = (state, presentation) => {
  if (presentation.bgm) {
    if (!presentation.bgm.resourceId) {
      state.bgm = undefined;
      return;
    }

    state.bgm = {
      ...presentation.bgm,
      loop: presentation.bgm.loop || presentation.bgm.loop === undefined,
    };
  }
};

/**
 * Applies visual items from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const visual = (state, presentation) => {
  if (presentation.visual) {
    const previousItems = state.visual?.items || [];

    presentation.visual.items?.forEach((item, index) => {
      assertVisualTextPatch(item, findPreviousItem(previousItems, item, index));
    });

    const { hasValidItems, processedItems } = processItemsWithAnimations(
      presentation.visual.items,
      hasVisualSubject,
      previousItems,
      {
        hasPatchFn: hasVisualTextPatch,
        mergeItemFn: mergeVisualItemPatch,
      },
    );

    if (hasValidItems) {
      state.visual = { items: processedItems };
    } else {
      delete state.visual;
    }
  } else {
    // Only clear animations from items that have them
    if (state.visual?.items) {
      state.visual.items = state.visual.items.map((item) => {
        if (item.animations) {
          return { ...item, animations: {} };
        }
        return item;
      });
    }
  }
};

/**
 * Applies character from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const character = (state, presentation) => {
  if (!presentation.character) {
    // Only clear animations from items that have them
    if (state.character?.items) {
      state.character.items = state.character.items.map((item) => {
        if (item.animations) {
          return { ...item, animations: {} };
        }
        return item;
      });
    }
    return;
  }

  const { hasValidItems, processedItems } = processItemsWithAnimations(
    presentation.character.items,
    (item) =>
      (item.sprites && item.sprites.length > 0) ||
      item.transformId ||
      item.resourceId,
    state.character?.items || [],
  );

  if (hasValidItems) {
    state.character = { items: processedItems };
  } else {
    delete state.character;
  }
};

/**
 * Applies animation from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const animation = (state, presentation) => {
  if (presentation.animation) {
    state.animation = presentation.animation;
  } else if (state.animation) {
    delete state.animation;
  }
};

/**
 * Applies layout from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const layout = (state, presentation) => {
  if (presentation.layout) {
    const { animationsOnly, state: animState } = getAnimationsOnlyState(
      presentation.layout,
      (p) => !!p.resourceId,
    );

    if (animationsOnly) {
      state.layout = animState;
      return;
    }

    if (!presentation.layout.resourceId) {
      delete state.layout;
      return;
    }

    state.layout = presentation.layout;
  } else if (state.layout) {
    delete state.layout;
  }
};

/**
 * Applies choice from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const choice = (state, presentation) => {
  if (presentation.choice) {
    const { animationsOnly, state: animState } = getAnimationsOnlyState(
      presentation.choice,
      (p) => !!p.resourceId,
    );

    if (animationsOnly) {
      state.choice = {
        ...state.choice,
        ...animState,
      };
      return;
    }

    if (!presentation.choice.resourceId) {
      delete state.choice;
      return;
    }

    state.choice = presentation.choice;
  } else if (state.choice) {
    delete state.choice;
  }
};

/**
 * Applies form from presentation to state
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const form = (state, presentation) => {
  if (presentation.form) {
    const { animationsOnly, state: animState } = getAnimationsOnlyState(
      presentation.form,
      (p) => !!p.resourceId,
    );

    if (animationsOnly) {
      state.form = {
        ...state.form,
        ...animState,
      };
      return;
    }

    if (!presentation.form.resourceId) {
      delete state.form;
      return;
    }

    state.form = clonePresentationValue(presentation.form);
  } else if (state.form) {
    delete state.form;
  }
};

export const control = (state, presentation) => {
  if (presentation.control) {
    if (!presentation.control.resourceId) {
      delete state.control;
      return;
    }

    state.control = presentation.control;
  }
};

export const voice = (state, presentation) => {
  if (presentation.voice) {
    state.voice = presentation.voice;
  } else if (state.voice) {
    delete state.voice;
  }
};

/**
 * Cleans all state if cleanAll is provided
 * @param {Object} state - The current state of the system
 * @param {Object} presentation - The presentation to apply
 */
export const cleanAll = (state, presentation) => {
  if (presentation.cleanAll) {
    // Clear all properties
    Object.keys(state).forEach((key) => {
      delete state[key];
    });
  }
};

/**
 * Constructs presentation state by applying all presentation actions to initial state
 * @param {Array} presentations - Array of presentation objects to apply
 * @returns {Object} Final presentation state
 */
export const constructPresentationState = (presentations) => {
  const actions = [
    cleanAll,
    screen,
    background,
    sfx,
    bgm,
    visual,
    dialogue,
    character,
    animation,
    layout,
    choice,
    form,
    control,
    voice,
  ];

  const executeActions = createSequentialActionsExecutor(
    createInitialState,
    actions,
  );

  return executeActions(presentations);
};
