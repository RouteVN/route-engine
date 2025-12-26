import { createStore } from "../util.js";
import { constructPresentationState } from "./constructPresentationState.js";
import { constructRenderState } from "./constructRenderState.js";

export const createInitialState = (payload) => {
  const {
    global: { currentLocalizationPackageId },
    // initialPointer,
    projectData,
  } = payload;

  const initialPointer = {
    sceneId: projectData.story.initialSceneId,
    sectionId:
      projectData.story.scenes[projectData.story.initialSceneId]
        .initialSectionId,
    lineId:
      projectData.story.scenes[projectData.story.initialSceneId].sections[
        projectData.story.scenes[projectData.story.initialSceneId]
          .initialSectionId
      ].lines[0].id,
  };

  const state = {
    projectData,
    global: {
      autoplayDelay: 1000,
      isLineCompleted: false,
      pendingEffects: [],
      autoMode: false,
      skipMode: false,
      skipOnlyViewedLines: true,
      dialogueUIHidden: false,
      isDialogueHistoryShowing: false,
      currentLocalizationPackageId: currentLocalizationPackageId,
      viewedRegistry: {
        sections: [],
        resources: [],
      },
      nextLineConfig: {
        manual: {
          enabled: true,
          requireLineCompleted: false,
        },
        auto: {
          enabled: false,
          //delay: 1000,
        },
      },
      saveSlots: {},
      layeredViews: [],
    },
    contexts: [
      {
        currentPointerMode: "read",
        pointers: {
          read: initialPointer,
          history: {
            sectionId: undefined,
            lineId: undefined,
            historySequenceIndex: undefined,
          },
        },
        historySequence: [
          {
            sectionId: "...",
          },
        ],
        configuration: {},
        views: [],
        bgm: {
          resourceId: undefined,
        },
        variables: {},
      },
    ],
  };
  return state;
};

/**************************
 * Selectors
 *************************/
export const selectLayeredViews = ({ state }) => {
  return state.global.layeredViews || [];
};

export const selectPendingEffects = ({ state }) => {
  return state.global.pendingEffects;
};

export const selectSkipMode = ({ state }) => {
  return state.global.skipMode;
};

export const selectSkipOnlyViewedLines = ({ state }) => {
  return state.global.skipOnlyViewedLines;
};

export const selectAutoMode = ({ state }) => {
  return state.global.autoMode;
};

export const selectDialogueUIHidden = ({ state }) => {
  return state.global.dialogueUIHidden;
};

export const selectAutoplayDelay = ({ state }) => {
  return state.global.autoplayDelay;
};

export const selectDialogueHistory = ({ state }) => {
  const lastContext = state.contexts[state.contexts.length - 1];
  if (!lastContext) {
    return [];
  }

  const { sectionId, lineId } = lastContext.pointers.read;
  const section = selectSection({ state }, { sectionId });

  if (!section?.lines || !Array.isArray(section.lines)) {
    return [];
  }

  // Get all lines up to and including the current line
  const currentLineIndex = section.lines.findIndex(
    (line) => line.id === lineId,
  );
  const linesUpToCurrent = section.lines.slice(0, currentLineIndex + 1);

  // Filter for lines that have dialogue content
  const historyContent = linesUpToCurrent
    .filter((line) => line.actions?.dialogue)
    .map((line) => {
      const dialogue = line.actions.dialogue;
      let characterName = "";
      if (dialogue.characterId) {
        const character =
          state.projectData.resources?.characters?.[dialogue.characterId];
        characterName = character?.name || "";
      }
      return {
        content: dialogue.content,
        characterId: dialogue.characterId,
        characterName: characterName,
      };
    });

  return historyContent;
};

export const selectCurrentLocalizationPackageId = ({ state }) => {
  return state.global.currentLocalizationPackageId;
};

export const selectIsLineViewed = ({ state }, payload) => {
  const { sectionId, lineId } = payload;
  const section = state.global.viewedRegistry.sections.find(
    (section) => section.sectionId === sectionId,
  );

  if (!section) {
    return false;
  }

  // If section.lastLineId is undefined, it means the entire section is viewed
  if (section.lastLineId === undefined) {
    return true;
  }

  // If lineId is not provided, check if section exists (which it does at this point)
  if (lineId === undefined) {
    return true;
  }

  // If both section.lastLineId and lineId are present, compare them
  // Use selectSection to get the section data
  const foundSection = selectSection({ state }, { sectionId });

  if (
    !foundSection ||
    !foundSection.lines ||
    !Array.isArray(foundSection.lines)
  ) {
    // If we can't find the section or lines, fallback to original behavior
    return false;
  }

  // Find indices of both lines in the lines array
  const lastLineIndex = foundSection.lines.findIndex(
    (line) => line.id === section.lastLineId,
  );
  const currentLineIndex = foundSection.lines.findIndex(
    (line) => line.id === lineId,
  );

  // If we can't find either line in the array, fallback to simple comparison
  if (lastLineIndex === -1 || currentLineIndex === -1) {
    return section.lastLineId === lineId;
  }

  // Line is viewed if its index is < last viewed line index
  return currentLineIndex < lastLineIndex;
};

export const selectIsResourceViewed = ({ state }, payload) => {
  const { resourceId } = payload;
  const resource = state.global.viewedRegistry.resources.find(
    (resource) => resource.resourceId === resourceId,
  );

  return !!resource;
};

export const selectNextLineConfig = ({ state }) => {
  return state.global.nextLineConfig;
};

export const selectSaveSlots = ({ state }) => {
  return state.global.saveSlots;
};

export const selectSaveSlot = ({ state }, payload) => {
  const { slotKey } = payload;
  return state.global.saveSlots[slotKey];
};

/**
 * Selects the current pointer from the last context
 * @param {Object} state - Current state object
 * @returns {Object} Current pointer object with currentPointerMode and pointer properties
 * @returns {string} returns.currentPointerMode - The current pointer mode identifier
 * @returns {Object} returns.pointer - The pointer configuration for the current mode
 */
export const selectCurrentPointer = ({ state }) => {
  const lastContext = state.contexts[state.contexts.length - 1];

  if (!lastContext) {
    return undefined;
  }

  const pointer = lastContext.pointers?.[lastContext.currentPointerMode];

  return {
    currentPointerMode: lastContext.currentPointerMode,
    pointer,
  };
};

/**
 * Selects a section from the project data by sectionId
 * @param {Object} state - Current state object
 * @param {Object} initialState - Payload containing sectionId
 * @param {string} initialState.sectionId - The section ID to find
 * @returns {Object|undefined} The section object if found, undefined otherwise
 */
export const selectSection = ({ state }, payload) => {
  const { sectionId } = payload;
  const scenes = state.projectData?.story?.scenes || {};

  // Search through all scenes to find the section
  for (const sceneId in scenes) {
    const scene = scenes[sceneId];
    if (scene.sections && scene.sections[sectionId]) {
      return scene.sections[sectionId];
    }
  }

  return undefined;
};

/**
 * Selects the current line from the project data based on the current pointer
 * @param {Object} state - Current state object
 * @returns {Object|undefined} The current line object if found, undefined otherwise
 */
export const selectCurrentLine = ({ state }) => {
  const currentPointerData = selectCurrentPointer({ state });

  if (!currentPointerData?.pointer) {
    return undefined;
  }

  const { sectionId, lineId } = currentPointerData.pointer;
  const section = selectSection({ state }, { sectionId });

  if (!section?.lines || !Array.isArray(section.lines)) {
    return undefined;
  }

  return section.lines.find((line) => line.id === lineId);
};

export const selectPresentationState = ({ state }) => {
  const { sectionId, lineId } = selectCurrentPointer({ state }).pointer;
  const section = selectSection({ state }, { sectionId });

  // get all lines up to the current line index, inclusive
  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex((line) => line.id === lineId);

  // Return all lines up to and including the current line
  const currentLines = lines.slice(0, currentLineIndex + 1);

  console.log("currentLines", currentLines);

  // Create presentation state from unified actions
  const presentationActions = currentLines.map((line) => {
    const actions = line.actions || {};
    const presentationData = {};

    // Extract only presentation-related actions
    Object.keys(actions).forEach((actionType) => {
      presentationData[actionType] = actions[actionType];
    });

    return presentationData;
  });

  const presentationState = constructPresentationState(presentationActions);
  return presentationState;
};

export const selectPreviousPresentationState = ({ state }) => {
  const { sectionId, lineId } = selectCurrentPointer({ state }).pointer;
  const section = selectSection({ state }, { sectionId });

  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex((line) => line.id === lineId);

  // Return all lines before the current line (not including current)
  if (currentLineIndex <= 0) {
    return null;
  }

  const previousLines = lines.slice(0, currentLineIndex);

  const presentationActions = previousLines.map((line) => {
    const actions = line.actions || {};
    const presentationData = {};
    Object.keys(actions).forEach((actionType) => {
      presentationData[actionType] = actions[actionType];
    });
    return presentationData;
  });

  return constructPresentationState(presentationActions);
};

export const selectRenderState = ({ state }) => {
  const presentationState = selectPresentationState({ state });
  const previousPresentationState = selectPreviousPresentationState({ state });
  console.log("presentationState", presentationState);
  const renderState = constructRenderState({
    presentationState,
    previousPresentationState,
    resources: state.projectData.resources,
    l10n: state.projectData.l10n.packages[
      state.global.currentLocalizationPackageId
    ],
    dialogueUIHidden: state.global.dialogueUIHidden,
    autoMode: state.global.autoMode,
    skipMode: state.global.skipMode,
    skipOnlyViewedLines: state.global.skipOnlyViewedLines,
    layeredViews: state.global.layeredViews,
    dialogueHistory: selectDialogueHistory({ state }),
  });
  console.log("renderState", renderState);
  return renderState;
};

/**************************
 * Actions
 *************************/
export const pushLayeredView = ({ state }, payload) => {
  state.global.layeredViews.push(payload);
  state.global.pendingEffects.push({ name: "render" });
  return state;
};

export const popLayeredView = ({ state }) => {
  state.global.layeredViews.pop();
  state.global.pendingEffects.push({ name: "render" });
  return state;
};

export const replaceLastLayeredView = ({ state }, payload) => {
  if (state.global.layeredViews.length > 0) {
    state.global.layeredViews[state.global.layeredViews.length - 1] = payload;
  }
  state.global.pendingEffects.push({ name: "render" });
  return state;
};

export const clearLayeredViews = ({ state }) => {
  state.global.layeredViews = [];
  state.global.pendingEffects.push({ name: "render" });
  return state;
};

export const startAutoMode = ({ state }) => {
  if (state.global.skipMode) {
    state.global.skipMode = false;
    state.global.pendingEffects.push({
      name: "clearSkipNextTimer",
    });
  }
  state.global.autoMode = true;
  state.global.pendingEffects.push({
    name: "clearAutoNextTimer",
  });
  state.global.pendingEffects.push({
    name: "startAutoNextTimer",
    payload: { delay: state.global.autoplayDelay },
  });
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const stopAutoMode = ({ state }) => {
  state.global.autoMode = false;
  state.global.pendingEffects.push({
    name: "clearAutoNextTimer",
  });
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const toggleAutoMode = ({ state }) => {
  const autoMode = state.global.autoMode;
  if (autoMode) {
    stopAutoMode({ state });
  } else {
    startAutoMode({ state });
  }
  return state;
};

export const startSkipMode = ({ state }) => {
  if (state.global.autoMode) {
    state.global.autoMode = false;
    state.global.pendingEffects.push({
      name: "clearAutoNextTimer",
    });
  }
  state.global.skipMode = true;
  state.global.pendingEffects.push({
    name: "clearSkipNextTimer",
  });
  state.global.pendingEffects.push({
    name: "startSkipNextTimer",
  });
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const stopSkipMode = ({ state }) => {
  state.global.skipMode = false;
  state.global.pendingEffects.push({
    name: "clearSkipNextTimer",
  });
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const toggleSkipMode = ({ state }) => {
  const skipMode = selectSkipMode({ state });
  if (skipMode) {
    stopSkipMode({ state });
  } else {
    startSkipMode({ state });
  }
  return state;
};

export const setSkipOnlyViewedLines = ({ state }, payload) => {
  const { skipOnlyViewedLines } = payload;
  state.global.skipOnlyViewedLines = skipOnlyViewedLines;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const toggleSkipOnlyViewedLines = ({ state }) => {
  state.global.skipOnlyViewedLines = !state.global.skipOnlyViewedLines;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const showDialogueUI = ({ state }) => {
  state.global.dialogueUIHidden = false;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const hideDialogueUI = ({ state }) => {
  state.global.dialogueUIHidden = true;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const toggleDialogueUI = ({ state }) => {
  const dialogueUIHidden = selectDialogueUIHidden({ state });
  if (dialogueUIHidden) {
    showDialogueUI({ state });
  } else {
    hideDialogueUI({ state });
  }
  return state;
};

export const showDialogueHistory = ({ state }) => {
  const dialogueHistory = selectDialogueHistory({ state });
  state.global.isDialogueHistoryShowing = true;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const hideDialogueHistory = ({ state }) => {
  state.global.isDialogueHistoryShowing = false;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const setCurrentLocalizationPackageId = ({ state }, payload) => {
  const { localizationPackageId } = payload;
  state.global.currentLocalizationPackageId = localizationPackageId;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const clearPendingEffects = ({ state }) => {
  state.global.pendingEffects = [];
  return state;
};

export const appendPendingEffect = ({ state }, payload) => {
  state.global.pendingEffects.push(payload);
  return state;
};

export const addViewedLine = ({ state }, payload) => {
  const { sectionId, lineId } = payload;
  const section = state.global.viewedRegistry.sections.find(
    (section) => section.sectionId === sectionId,
  );

  if (section) {
    // Update existing section only if new line is after the current lastLineId
    const foundSection = selectSection({ state }, { sectionId });
    if (foundSection?.lines && section.lastLineId !== undefined) {
      const lastLineIndex = foundSection.lines.findIndex(
        (line) => line.id === section.lastLineId,
      );
      const newLineIndex = foundSection.lines.findIndex(
        (line) => line.id === lineId,
      );

      // Update only if newLineIndex is greater (later in the section) or if lastLineId not found
      if (lastLineIndex === -1 || newLineIndex > lastLineIndex) {
        section.lastLineId = lineId;
      }
    } else {
      // Fallback: if we can't find the section or lastLineId is undefined, just update
      section.lastLineId = lineId;
    }
  } else {
    // Add new section
    state.global.viewedRegistry.sections.push({
      sectionId,
      lastLineId: lineId,
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const addViewedResource = ({ state }, payload) => {
  const { resourceId } = payload;
  const existingResource = state.global.viewedRegistry.resources.find(
    (resource) => resource.resourceId === resourceId,
  );

  if (!existingResource) {
    // Add new resource only if it doesn't already exist
    state.global.viewedRegistry.resources.push({
      resourceId,
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Sets the next line configuration for advancing to the next line
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {Object} [payload.manual] - Manual navigation configuration
 * @param {boolean} [payload.manual.enabled] - Whether manual navigation is enabled
 * @param {boolean} [payload.manual.requireLineCompleted] - Whether completion is required before advancing
 * @param {Object} [payload.auto] - Auto navigation configuration
 * @param {string} [payload.auto.trigger] - When auto navigation triggers ('fromStart' or 'fromComplete')
 * @param {number} [payload.auto.delay] - Delay in milliseconds before auto advancing
 * @returns {Object} Updated state object
 * @description
 * If both manual and auto configurations are provided, performs complete replacement.
 * If only one configuration is provided, performs partial merge with existing config.
 */
export const setNextLineConfig = ({ state }, payload) => {
  const { manual, auto } = payload;

  // If both manual and auto are provided, do complete replacement
  if (manual && auto) {
    state.global.nextLineConfig = {
      manual,
      auto,
    };
  } else {
    // Partial update - merge only provided sections
    if (manual) {
      state.global.nextLineConfig.manual = manual;
      // state.global.nextLineConfig.manual = {
      //   ...state.global.nextLineConfig.manual,
      //   ...manual
      // };
    }

    if (auto) {
      state.global.nextLineConfig.auto = auto;
    }
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const setAutoplayDelay = ({ state }, { delay }) => {
  state.global.autoplayDelay = delay;

  if (state.global.autoMode) {
    state.global.pendingEffects.push({ name: "clearAutoNextTimer" });
    state.global.pendingEffects.push({
      name: "startAutoNextTimer",
      payload: { delay: state.global.autoplayDelay },
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Replaces a save slot with new data
 * @param {Object} state - Current state object
 * @param {Object} initialState - Action payload
 * @param {string} initialState.slotKey - The key identifying the save slot
 * @param {number} initialState.date - Unix timestamp for when the save was created
 * @param {string} initialState.image - Base64 encoded save image/screenshot
 * @param {Object} initialState.state - The game state to be saved
 * @returns {Object} Updated state object
 */
export const replaceSaveSlot = ({ state }, payload) => {
  const { slotKey, date, image, state: slotState } = payload;

  state.global.saveSlots[slotKey] = {
    slotKey,
    date,
    image,
    state: slotState,
  };

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Updates the entire projectData with new data
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {Object} payload.projectData - The new project data to replace existing data
 * @returns {Object} Updated state object
 */
export const updateProjectData = ({ state }, payload) => {
  const { projectData } = payload;

  state.projectData = projectData;

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Jumps to a specific line within a section
 * @param {Object} param - Object containing state and dispatch functions
 * @param {Object} payload - Action payload
 * @param {string} payload.sectionId - The target section ID (optional, defaults to current section)
 * @param {string} payload.lineId - The target line ID to jump to
 * @returns {Object} Updated state object
 */
export const jumpToLine = ({ state }, payload) => {
  const { sectionId, lineId } = payload;

  if (!lineId) {
    console.warn("jumpToLine requires lineId parameter");
    return state;
  }

  const lastContext = state.contexts[state.contexts.length - 1];
  if (!lastContext) {
    console.warn("No context available for jumpToLine");
    return state;
  }

  // Use provided sectionId or current sectionId
  const targetSectionId = sectionId || lastContext.pointers.read?.sectionId;

  // Validate section exists (if sectionId is provided)
  if (sectionId) {
    const targetSection = selectSection({ state }, { sectionId });
    if (!targetSection) {
      console.warn(`Section not found: ${sectionId}`);
      return state;
    }
  }

  // Validate line exists in target section
  const targetSection = selectSection(
    { state },
    { sectionId: targetSectionId },
  );
  if (!targetSection?.lines || !Array.isArray(targetSection.lines)) {
    console.warn(`Section ${targetSectionId} has no lines`);
    return state;
  }

  const targetLine = targetSection.lines.find((line) => line.id === lineId);
  if (!targetLine) {
    console.warn(`Line not found: ${lineId} in section ${targetSectionId}`);
    return state;
  }

  // Update current pointer to new line
  lastContext.pointers.read = {
    sectionId: targetSectionId,
    lineId: lineId,
  };

  // Reset line completion state
  state.global.isLineCompleted = false;

  // Add appropriate pending effects
  state.global.pendingEffects.push({
    name: "render",
  });
  state.global.pendingEffects.push({
    name: "handleLineActions",
  });

  return state;
};

/**
 * Adds an item to the historySequence of the last context.
 * NOTE: This should only be called when transitioning to a new section.
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {Object} payload.item - The historySequence item to add
 * @param {string} payload.item.sectionId - The section ID for the history entry
 * @returns {Object} Updated state object
 */
export const addToHistorySequence = ({ state }, payload) => {
  const { item } = payload;

  // Get the last context (assuming we want to add to the most recent context)
  const lastContext = state.contexts[state.contexts.length - 1];

  if (lastContext && lastContext.historySequence) {
    lastContext.historySequence.push({ sectionId: item.sectionId });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Advances to the next line if auto navigation is configured to trigger from line completion
 * @param {Object} state - Current state object
 * @returns {Object} Updated state object
 * @description
 * Checks if auto navigation is enabled and configured to trigger from line completion.
 * If conditions are met, advances to the next line regardless of manual navigation settings.
 * After advancing, resets the auto navigation configuration to empty object.
 */
export const nextLineFromCompleted = ({ state }) => {
  // Check if auto navigation is enabled and configured to trigger from line completion
  if (
    state.global.nextLineConfig?.auto?.enabled !== true ||
    state.global.nextLineConfig?.auto?.trigger !== "fromComplete"
  ) {
    return state;
  }

  const pointer = selectCurrentPointer({ state })?.pointer;
  const sectionId = pointer?.sectionId;
  const section = selectSection({ state }, { sectionId });

  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex(
    (line) => line.id === pointer?.lineId,
  );
  const nextLineIndex = currentLineIndex + 1;

  if (nextLineIndex < lines.length) {
    const nextLine = lines[nextLineIndex];
    const lastContext = state.contexts[state.contexts.length - 1];

    if (lastContext) {
      lastContext.pointers.read = {
        sectionId,
        lineId: nextLine.id,
      };
    }

    state.global.isLineCompleted = false;

    // Reset auto navigation configuration after advancing
    state.global.nextLineConfig.auto = {};

    state.global.pendingEffects.push({
      name: "render",
    });
    state.global.pendingEffects.push({
      name: "handleLineActions",
    });
  }
  return state;
};

export const nextLine = ({ state }) => {
  if (!state.global.nextLineConfig.manual.enabled) {
    return state;
  }

  const pointer = selectCurrentPointer({ state })?.pointer;
  const sectionId = pointer?.sectionId;
  const section = selectSection({ state }, { sectionId });

  const lines = section?.lines || [];
  const currentLineIndex = lines.findIndex(
    (line) => line.id === pointer?.lineId,
  );
  const nextLineIndex = currentLineIndex + 1;

  if (nextLineIndex < lines.length) {
    const nextLine = lines[nextLineIndex];

    // Check if skip mode should stop at unviewed lines
    if (state.global.skipMode && state.global.skipOnlyViewedLines) {
      const isNextLineViewed = selectIsLineViewed(
        { state },
        {
          sectionId,
          lineId: nextLine.id,
        },
      );

      if (!isNextLineViewed) {
        // Stop skip mode when encountering an unviewed line
        stopSkipMode({ state });
      }
    }

    const lastContext = state.contexts[state.contexts.length - 1];

    if (lastContext) {
      // Mark current line as viewed before moving
      const currentLineId = lastContext.pointers.read.lineId;
      if (currentLineId && sectionId) {
        addViewedLine({ state }, { sectionId, lineId: currentLineId });
      }

      lastContext.pointers.read = {
        sectionId,
        lineId: nextLine.id,
      };
    }

    state.global.isLineCompleted = false;

    state.global.pendingEffects.push({
      name: "render",
    });
    state.global.pendingEffects.push({
      name: "handleLineActions",
    });
  } else {
    // Reached the end of section, stop auto/skip modes
    if (state.global.autoMode) {
      stopAutoMode({ state });
    }
    if (state.global.skipMode) {
      stopSkipMode({ state });
    }
  }

  console.log("state", state);
  return state;
};

/**
 * Navigate to the previous line using history pointer
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.sectionId - The section ID to navigate in
 * @returns {Object} Updated state object
 */
export const markLineCompleted = ({ state }) => {
  state.global.isLineCompleted = true;
  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const prevLine = ({ state }, payload) => {
  const { sectionId } = payload;
  const section = selectSection({ state }, { sectionId });

  // Return early if section doesn't exist
  if (!section || !section.lines || section.lines.length === 0) {
    return state;
  }

  const lines = section.lines;
  const lastContext = state.contexts[state.contexts.length - 1];

  if (!lastContext || !lastContext.pointers) {
    return state;
  }

  // Get current history pointer or use read pointer as fallback
  const currentPointer =
    lastContext.pointers.history || lastContext.pointers.read;

  // If we're already in history mode, keep history pointer and move it back
  // Otherwise, switch to history mode and initialize it (only if we have a valid currentPointer)
  if (
    lastContext.currentPointerMode !== "history" ||
    !lastContext.pointers.history
  ) {
    // Only switch to history mode if we have a valid current pointer to work with
    if (!currentPointer) {
      return state;
    }

    // Switch to history mode, initialize history pointer with current position
    lastContext.currentPointerMode = "history";
    lastContext.pointers.history = {
      sectionId,
      lineId: currentPointer?.lineId,
    };

    // Immediately move to previous line after switching to history mode
    const currentLineIndex = lines.findIndex(
      (line) => line.id === currentPointer.lineId,
    );
    const prevLineIndex = currentLineIndex - 1;

    if (prevLineIndex >= 0 && prevLineIndex < lines.length) {
      const prevLine = lines[prevLineIndex];
      lastContext.pointers.history = {
        sectionId,
        lineId: prevLine.id,
      };
    }

    // Add render effect for mode change
    state.global.pendingEffects.push({
      name: "render",
    });

    return state;
  }

  // Already in history mode, move history pointer to previous line
  const currentLineIndex = lines.findIndex(
    (line) => line.id === lastContext.pointers.history.lineId,
  );
  const prevLineIndex = currentLineIndex - 1;

  if (prevLineIndex >= 0 && prevLineIndex < lines.length) {
    const prevLine = lines[prevLineIndex];
    lastContext.pointers.history = {
      sectionId,
      lineId: prevLine.id,
    };

    state.global.pendingEffects.push({
      name: "render",
    });
  }

  return state;
};

/**
 * Transitions to a different section and positions at the first line
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.sectionId - The section ID to transition to
 * @returns {Object} Updated state object
 * @description
 * - Finds target section across all scenes
 * - Positions pointer at first line of target section
 * - Resets line completion state
 * - Triggers render and line action processing
 * - Logs warnings if section or lines not found
 */
export const sectionTransition = ({ state }, payload) => {
  const { sectionId } = payload;

  // Validate section exists
  const targetSection = selectSection({ state }, { sectionId });
  if (!targetSection) {
    console.warn(`Section not found: ${sectionId}`);
    return state;
  }

  // Get first line of target section
  const firstLine = targetSection.lines?.[0];
  if (!firstLine) {
    console.warn(`Section ${sectionId} has no lines`);
    return state;
  }

  // Update current pointer to new section's first line
  const lastContext = state.contexts[state.contexts.length - 1];
  if (lastContext) {
    lastContext.pointers.read = {
      sectionId,
      lineId: firstLine.id,
    };
  }

  // Reset line completion state
  state.global.isLineCompleted = false;

  // Add appropriate pending effects
  state.global.pendingEffects.push({
    name: "render",
  });
  state.global.pendingEffects.push({
    name: "handleLineActions",
  });

  return state;
};

/**************************
 * Store Export
 *************************/

// Export the store using createStore from util.js
export const createSystemStore = (initialState) => {
  const _initialState = createInitialState(initialState);

  // Gather all selectors and actions for the store
  const selectorsAndActions = {
    // Selectors
    selectPendingEffects,
    selectSkipMode,
    selectSkipOnlyViewedLines,
    selectAutoMode,
    selectDialogueUIHidden,
    selectDialogueHistory,
    selectCurrentLocalizationPackageId,
    selectIsLineViewed,
    selectIsResourceViewed,
    selectNextLineConfig,
    selectSaveSlots,
    selectSaveSlot,
    selectCurrentPointer,
    selectSection,
    selectCurrentLine,
    selectPresentationState,
    selectAutoplayDelay,
    selectRenderState,
    selectLayeredViews,

    // Actions
    startAutoMode,
    stopAutoMode,
    toggleAutoMode,
    startSkipMode,
    stopSkipMode,
    toggleSkipMode,
    setSkipOnlyViewedLines,
    toggleSkipOnlyViewedLines,
    showDialogueUI,
    hideDialogueUI,
    toggleDialogueUI,
    showDialogueHistory,
    hideDialogueHistory,
    setCurrentLocalizationPackageId,
    clearPendingEffects,
    appendPendingEffect,
    addViewedLine,
    addViewedResource,
    setNextLineConfig,
    replaceSaveSlot,
    setAutoplayDelay,
    updateProjectData,
    sectionTransition,
    jumpToLine,
    addToHistorySequence,
    nextLine,
    nextLineFromCompleted,
    markLineCompleted,
    prevLine,
    pushLayeredView,
    popLayeredView,
    replaceLastLayeredView,
    clearLayeredViews,
  };

  return createStore(_initialState, selectorsAndActions, {
    transformActionFirstArgument: (state) => {
      return { state };
    },
    transformSelectorFirstArgument: (state) => {
      return { state };
    },
  });
};
