import {
  createStore,
  getDefaultVariablesFromProjectData,
  validateVariableScope,
  validateVariableOperation,
  applyVariableOperation,
  filterVariablesByScope,
  diffPresentationState,
} from "../util.js";
import { constructPresentationState } from "./constructPresentationState.js";
import { constructRenderState } from "./constructRenderState.js";

export const createInitialState = (payload) => {
  const {
    global: {
      currentLocalizationPackageId,
      saveSlots = {},
      variables: loadedGlobalVariables = {},
    },
    // initialPointer,
    projectData,
  } = payload;

  const initialSceneId = projectData.story.initialSceneId;
  const initialScene = projectData.story.scenes[initialSceneId];
  const initialSectionId = initialScene.initialSectionId;
  const initialSection = initialScene.sections[initialSectionId];

  const initialPointer = {
    sceneId: initialSceneId,
    sectionId: initialSectionId,
    lineId: initialSection.initialLineId ?? initialSection.lines[0].id,
  };

  // Get default variables from project data
  const { contextVariableDefaultValues, globalVariablesDefaultValues } =
    getDefaultVariablesFromProjectData(projectData);

  // Merge with loaded globalVariablesDefaultValues from localStorage (if provided)
  const globalVariables = {
    ...globalVariablesDefaultValues,
    ...loadedGlobalVariables,
  };

  const state = {
    projectData,
    global: {
      isLineCompleted: false,
      pendingEffects: [],
      autoMode: false,
      skipMode: false,
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
      saveSlots,
      layeredViews: [],
      variables: globalVariables,
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
            sectionId: initialPointer.sectionId,
            initialState: { ...contextVariableDefaultValues },
            lines: [{ id: initialPointer.lineId }],
          },
        ],
        configuration: {},
        views: [],
        bgm: {
          resourceId: undefined,
        },
        variables: contextVariableDefaultValues,
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

export const selectAutoMode = ({ state }) => {
  return state.global.autoMode;
};

export const selectDialogueUIHidden = ({ state }) => {
  return state.global.dialogueUIHidden;
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

export const selectPresentationChanges = ({ state }) => {
  const previousPresentationState = selectPreviousPresentationState({ state });
  const currentLine = selectCurrentLine({ state });
  const currentLineActions = currentLine?.actions ?? {};

  const presentationStateAfterLineActions = constructPresentationState([
    previousPresentationState ?? {},
    currentLineActions,
  ]);

  return diffPresentationState(
    previousPresentationState ?? {},
    presentationStateAfterLineActions ?? {},
  );
};

export const selectSectionLineChanges = ({ state }, { sectionId }) => {
  const section = selectSection({ state }, { sectionId });
  if (!section?.lines) {
    return { lines: [] };
  }

  const linesWithChanges = [];
  let previousPresentationState = {};

  for (const line of section.lines) {
    const currentLineActions = line.actions || {};

    const presentationStateAfterLineActions = constructPresentationState([
      previousPresentationState,
      currentLineActions,
    ]);

    const changes = diffPresentationState(
      previousPresentationState,
      presentationStateAfterLineActions,
    );

    linesWithChanges.push({
      id: line.id,
      changes: changes,
    });

    previousPresentationState = presentationStateAfterLineActions;
  }

  return { lines: linesWithChanges };
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

/**
 * Selects the save slots to display on the current page based on loadPage variable
 * and page configuration. Returns a flat array of slots for the current page.
 *
 * @param {Object} params - The selector parameters
 * @param {Object} params.state - The full application state
 * @param {Object} [options] - Configuration options
 * @param {number} [options.slotsPerPage=6] - Number of slots per page
 * @returns {Object} Object containing saveSlots array
 * @returns {Array<Object>} returns.saveSlots - Flat array of slot data for the current page
 *
 * @description
 * This selector calculates which save slots should be displayed on the current page
 * based on the `loadPage` variable and slots per page configuration. It returns a
 * flat array of slots. The UI layer handles wrapping slots into rows using container
 * layout properties (width, gap, direction).
 *
 * Each slot object contains:
 * - slotNumber: The unique slot identifier (1, 2, 3, ...)
 * - date: Timestamp when the save was created (if saved)
 * - image: Base64 thumbnail image (if saved)
 * - state: Saved game state data (if saved)
 *
 * @example
 * // Default 6 slots per page
 * // Page 1: slots 1-6, Page 2: slots 7-12, etc.
 * const { saveSlots } = selectCurrentPageSlots({ state });
 * // Returns: [slot1, slot2, slot3, slot4, slot5, slot6]
 *
 * @example
 * // Custom 12 slots per page
 * const { saveSlots } = selectCurrentPageSlots({ state }, { slotsPerPage: 12 });
 * // Returns: [slot1, slot2, ..., slot12]
 *
 * @example
 * // Output data format example (Page 1, default 6 slots):
 * {
 *   saveSlots: [
 *     {
 *       slotNumber: 1,
 *       date: 1704556800000,
 *       image: "data:image/png;base64,iVBORw0KGgoAAAANS...",
 *       state: { contexts: [...], viewedRegistry: {...} }
 *     },
 *     { slotNumber: 2 },  // Empty slot (not saved)
 *     {
 *       slotNumber: 3,
 *       date: 1704643200000,
 *       image: "data:image/png;base64,iVBORw0KGgoAAAANS...",
 *       state: { contexts: [...], viewedRegistry: {...} }
 *     },
 *     { slotNumber: 4 },  // Empty slot
 *     { slotNumber: 5 },  // Empty slot
 *     {
 *       slotNumber: 6,
 *       date: 1704729600000,
 *       image: "data:image/png;base64,iVBORw0KGgoAAAANS...",
 *       state: { contexts: [...], viewedRegistry: {...} }
 *     }
 *   ]
 * }
 */
export const selectCurrentPageSlots = (
  { state },
  { slotsPerPage = 6 } = {},
) => {
  const allVariables = {
    ...state.global.variables,
    ...state.contexts[state.contexts.length - 1].variables,
  };
  const loadPage = allVariables.loadPage ?? 1;
  const startSlot = (loadPage - 1) * slotsPerPage + 1;

  const slots = [];

  for (let i = 0; i < slotsPerPage; i++) {
    const slotNumber = startSlot + i;
    const slotData =
      (state.global.saveSlots && state.global.saveSlots[slotNumber]) || {};
    slots.push({
      slotNumber,
      ...slotData,
    });
  }

  return { saveSlots: slots };
};

export const selectRenderState = ({ state }) => {
  const presentationState = selectPresentationState({ state });
  const previousPresentationState = selectPreviousPresentationState({ state });

  const allVariables = {
    ...state.global.variables,
    ...state.contexts[state.contexts.length - 1].variables,
  };

  const { saveSlots } = selectCurrentPageSlots({ state });

  const renderState = constructRenderState({
    presentationState,
    previousPresentationState,
    resources: state.projectData.resources,
    l10n: state.projectData.l10n.packages[
      state.global.currentLocalizationPackageId
    ],
    currentLocalizationPackageId: state.global.currentLocalizationPackageId,
    dialogueUIHidden: state.global.dialogueUIHidden,
    autoMode: state.global.autoMode,
    skipMode: state.global.skipMode,
    canRollback: selectCanRollback({ state }),
    skipOnlyViewedLines: !allVariables._skipUnseenText,
    isLineCompleted: state.global.isLineCompleted,
    layeredViews: state.global.layeredViews,
    dialogueHistory: selectDialogueHistory({ state }),
    saveSlots,
    variables: allVariables,
  });
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

  // Only start timer immediately if line is already completed
  // Otherwise, markLineCompleted will start it when renderComplete fires
  if (state.global.isLineCompleted) {
    const autoForwardTime = state.global.variables._autoForwardTime ?? 1000;
    state.global.pendingEffects.push({
      name: "startAutoNextTimer",
      payload: { delay: autoForwardTime },
    });
  }

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
  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   return state;
  // }

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
  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   const skipMode = selectSkipMode({ state });
  //   if (!skipMode) {
  //     return state;
  //   }
  // }

  const skipMode = selectSkipMode({ state });
  if (skipMode) {
    stopSkipMode({ state });
  } else {
    startSkipMode({ state });
  }
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
  const currentAutoEnabled = state.global.nextLineConfig.auto?.enabled;
  const newAutoEnabled = auto?.enabled;

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

  // If auto.enabled state has changed, dispatch timer effects
  if (newAutoEnabled === true && !currentAutoEnabled) {
    const trigger = state.global.nextLineConfig.auto?.trigger;

    // Event-based: only start timer immediately if trigger is "fromStart"
    // or if line is already completed (for "fromComplete" trigger)
    // Otherwise, markLineCompleted will start it when renderComplete fires
    if (trigger === "fromStart") {
      state.global.pendingEffects.push({
        name: "nextLineConfigTimer",
        payload: { delay: state.global.nextLineConfig.auto.delay },
      });
    } else if (state.global.isLineCompleted) {
      // trigger === "fromComplete" (or default) and line is already completed
      state.global.pendingEffects.push({
        name: "nextLineConfigTimer",
        payload: { delay: state.global.nextLineConfig.auto.delay },
      });
    }
  } else if (newAutoEnabled === false && currentAutoEnabled) {
    state.global.pendingEffects.push({
      name: "clearNextLineConfigTimer",
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Saves current game state to a slot
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {number} payload.slot - Save slot number
 * @param {string} payload.thumbnailImage - Base64 thumbnail image
 * @returns {Object} Updated state object
 */
export const saveSaveSlot = ({ state }, payload) => {
  const { slot, thumbnailImage } = payload;
  const slotKey = String(slot);

  const currentState = {
    contexts: [...state.contexts],
    viewedRegistry: state.global.viewedRegistry,
  };

  const saveData = {
    slotKey,
    date: Date.now(),
    image: thumbnailImage,
    state: currentState,
  };

  state.global.saveSlots[slotKey] = saveData;

  state.global.pendingEffects.push(
    {
      name: "saveSlots",
      payload: {
        saveSlots: { ...state.global.saveSlots },
      },
    },
    { name: "render" },
  );
  return state;
};

/**
 * Loads game state from a save slot
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {number} payload.slot - Save slot number
 * @returns {Object} Updated state object
 */
export const loadSaveSlot = ({ state }, payload) => {
  const { slot } = payload;
  const slotKey = String(slot);
  const slotData = state.global.saveSlots[slotKey];
  if (slotData) {
    state.global.viewedRegistry = slotData.state.viewedRegistry;
    state.contexts = slotData.state.contexts;
    state.global.pendingEffects.push({ name: "render" });
  }
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

  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   return state;
  // }

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

  // Add line to history for rollback support
  addLineToHistory({ state }, { lineId });

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
 * Adds a section entry to the historySequence of the last context.
 * Captures initialState (context variables snapshot) when entering the section.
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
    // Capture initialState: snapshot of all context variables at section entry
    const initialState = { ...lastContext.variables };

    lastContext.historySequence.push({
      sectionId: item.sectionId,
      initialState, // Captured ONCE when entering section
      lines: [], // Initialize empty lines array for line-level tracking
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Adds a line entry to the current section's history sequence.
 * Should be called when entering a new line, BEFORE actions execute.
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.lineId - The line ID to add
 * @returns {Object} Updated state object
 */
export const addLineToHistory = ({ state }, payload) => {
  const { lineId } = payload;
  const lastContext = state.contexts[state.contexts.length - 1];

  if (!lastContext?.historySequence) {
    return state;
  }

  const historySequence = lastContext.historySequence;
  if (historySequence.length === 0) {
    return state;
  }

  const currentSection = historySequence[historySequence.length - 1];
  if (!currentSection.lines) {
    currentSection.lines = [];
  }

  // Add new line entry (updateVariableIds will be added by updateVariable if executed)
  currentSection.lines.push({ id: lineId });

  return state;
};

export const nextLine = ({ state }) => {
  //const isAutoOrSkip = state.global.autoMode || state.global.skipMode;

  if (!state.global.nextLineConfig.manual.enabled) {
    return state;
  }

  // If line is not completed, complete it instantly instead of advancing
  if (!state.global.isLineCompleted) {
    state.global.isLineCompleted = true;
    // Clear any running nextLineConfigTimer to prevent auto-advance after manual click
    state.global.pendingEffects.push({ name: "clearNextLineConfigTimer" });

    // If auto mode is on, continue auto-advancing after the skip
    if (state.global.autoMode) {
      const autoForwardTime = state.global.variables._autoForwardTime ?? 1000;
      state.global.pendingEffects.push({
        name: "startAutoNextTimer",
        payload: { delay: autoForwardTime },
      });
    }

    // If scene mode (nextLineConfig.auto) is enabled with fromComplete trigger, restart the timer
    const nextLineConfig = state.global.nextLineConfig;
    if (nextLineConfig?.auto?.enabled) {
      const trigger = nextLineConfig.auto.trigger;
      // Default trigger is "fromComplete", so start timer if not explicitly "fromStart"
      if (trigger !== "fromStart") {
        state.global.pendingEffects.push({
          name: "nextLineConfigTimer",
          payload: { delay: nextLineConfig.auto.delay },
        });
      }
    }

    state.global.pendingEffects.push({ name: "render" });
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
    const skipOnlyViewedLines = !state.global.variables?._skipUnseenText;
    if (state.global.skipMode && skipOnlyViewedLines) {
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
        return state;
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

    // Add line to history for rollback support
    addLineToHistory({ state }, { lineId: nextLine.id });

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
  // Guard: if already completed, no action needed (prevents duplicate renders)
  if (state.global.isLineCompleted) {
    return state;
  }
  state.global.isLineCompleted = true;

  // If auto mode is on, start the delay timer to advance after completion
  if (state.global.autoMode) {
    const autoForwardTime = state.global.variables._autoForwardTime ?? 1000;
    state.global.pendingEffects.push({
      name: "startAutoNextTimer",
      payload: { delay: autoForwardTime },
    });
  }

  // If nextLineConfig.auto is enabled with fromComplete trigger, start the timer
  const nextLineConfig = state.global.nextLineConfig;
  if (nextLineConfig?.auto?.enabled) {
    const trigger = nextLineConfig.auto.trigger;
    // Default trigger is "fromComplete", so start timer if not explicitly "fromStart"
    if (trigger !== "fromStart") {
      state.global.pendingEffects.push({
        name: "nextLineConfigTimer",
        payload: { delay: nextLineConfig.auto.delay },
      });
    }
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

export const prevLine = ({ state }, payload) => {
  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   return state;
  // }
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

  // if (state.global.nextLineConfig.manual.enabled === false) {
  //   return state;
  // }
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

  // Stop auto/skip modes on section transition
  if (state.global.autoMode) {
    stopAutoMode({ state });
  }
  if (state.global.skipMode) {
    stopSkipMode({ state });
  }

  // Update current pointer to new section's first line
  const lastContext = state.contexts[state.contexts.length - 1];
  if (lastContext) {
    lastContext.pointers.read = {
      sectionId,
      lineId: firstLine.id,
    };

    // Add new section to historySequence for rollback support
    addToHistorySequence({ state }, { item: { sectionId } });

    // Add first line to history
    addLineToHistory({ state }, { lineId: firstLine.id });
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

export const nextLineFromSystem = ({ state }) => {
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
    const skipOnlyViewedLines = !state.global.variables?._skipUnseenText;
    if (state.global.skipMode && skipOnlyViewedLines) {
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
        return state;
      }
    }

    const lastContext = state.contexts[state.contexts.length - 1];

    if (lastContext) {
      lastContext.pointers.read = {
        sectionId,
        lineId: nextLine.id,
      };
    }

    state.global.isLineCompleted = false;

    // Add line to history for rollback support
    addLineToHistory({ state }, { lineId: nextLine.id });

    state.global.pendingEffects.push({
      name: "render",
    });

    state.global.pendingEffects.push({
      name: "handleLineActions",
    });

    // Only start timer immediately if trigger is "fromStart"
    // For "fromComplete" trigger, markLineCompleted will start it when renderComplete fires
    if (state.global.nextLineConfig.auto?.enabled) {
      const trigger = state.global.nextLineConfig.auto.trigger;
      if (trigger === "fromStart") {
        state.global.pendingEffects.push({
          name: "nextLineConfigTimer",
          payload: { delay: state.global.nextLineConfig.auto.delay },
        });
      }
    }
  } else {
    if (state.global.nextLineConfig.auto?.enabled) {
      state.global.nextLineConfig.auto.enabled = false;
      state.global.pendingEffects.push({
        name: "clearNextLineConfigTimer",
      });
    }
  }

  return state;
};

export const updateVariable = ({ state }, payload) => {
  const { id, operations = [] } = payload;

  // Validate required id field
  if (!id) {
    throw new Error("updateVariable requires an id field");
  }
  if (typeof id !== "string" || !/^[a-zA-Z0-9]+$/.test(id)) {
    throw new Error(`updateVariable id must be alphanumeric, got: "${id}"`);
  }

  const lastContext = state.contexts[state.contexts.length - 1];

  // Track which scopes are modified
  let contextVariableModified = false;
  let globalDeviceModified = false;
  let globalAccountModified = false;

  operations.forEach(({ variableId, op, value }) => {
    const variableConfig = state.projectData.resources?.variables?.[variableId];
    const scope = variableConfig?.scope;
    const type = variableConfig?.type;

    // Use pure helpers for validation
    validateVariableScope(scope, variableId);
    validateVariableOperation(type, op, variableId);

    const target =
      scope === "context" ? lastContext.variables : state.global.variables;

    // Track which scope was modified
    if (scope === "context") {
      contextVariableModified = true;
    } else if (scope === "global-device") {
      globalDeviceModified = true;
    } else if (scope === "global-account") {
      globalAccountModified = true;
    }

    // Use pure helper to apply operation
    target[variableId] = applyVariableOperation(target[variableId], op, value);
  });

  // Log updateVariableId to current line's history entry (EVENT SOURCING)
  // Only log if context variables were modified (global variables not tracked for rollback)
  if (contextVariableModified) {
    const historySequence = lastContext.historySequence;
    if (historySequence && historySequence.length > 0) {
      const currentSection = historySequence[historySequence.length - 1];
      if (currentSection.lines && currentSection.lines.length > 0) {
        const currentLineEntry =
          currentSection.lines[currentSection.lines.length - 1];
        // Initialize array if not present
        if (!currentLineEntry.updateVariableIds) {
          currentLineEntry.updateVariableIds = [];
        }
        // Log the action ID (not the state, not the operations - just the ID)
        currentLineEntry.updateVariableIds.push(id);
      }
    }
  }

  // Save global-device variables if any were modified
  if (globalDeviceModified) {
    const globalDeviceVars = filterVariablesByScope(
      state.global.variables,
      state.projectData.resources?.variables,
      "global-device",
    );
    state.global.pendingEffects.push({
      name: "saveGlobalDeviceVariables",
      payload: {
        globalDeviceVariables: globalDeviceVars,
      },
    });
  }

  // Save global-account variables if any were modified
  if (globalAccountModified) {
    const globalAccountVars = filterVariablesByScope(
      state.global.variables,
      state.projectData.resources?.variables,
      "global-account",
    );
    state.global.pendingEffects.push({
      name: "saveGlobalAccountVariables",
      payload: {
        globalAccountVariables: globalAccountVars,
      },
    });
  }

  state.global.pendingEffects.push({
    name: "render",
  });
  return state;
};

/**
 * Recursively traverses any object/array looking for updateVariable actions with matching ID.
 * This is a generic approach that works regardless of where actions are defined.
 * @param {any} obj - The object to search
 * @param {string} updateVariableId - The ID to find
 * @param {string} parentKey - The key that led to this object (used to detect updateVariable context)
 * @returns {Object|undefined} The action definition or undefined
 */
const findUpdateVariableRecursive = (obj, updateVariableId, parentKey = "") => {
  if (obj === null || obj === undefined) return undefined;

  // If this is an updateVariable object with matching ID, return it
  if (
    parentKey === "updateVariable" &&
    typeof obj === "object" &&
    obj.id === updateVariableId &&
    Array.isArray(obj.operations)
  ) {
    return obj;
  }

  // Recurse into arrays
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findUpdateVariableRecursive(
        item,
        updateVariableId,
        parentKey,
      );
      if (found) return found;
    }
    return undefined;
  }

  // Recurse into objects
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      const found = findUpdateVariableRecursive(
        obj[key],
        updateVariableId,
        key,
      );
      if (found) return found;
    }
  }

  return undefined;
};

/**
 * Selects a line ID by relative offset from current position in history.
 * Uses findLastIndex to handle duplicate line entries after rollback.
 *
 * @param {Object} state - Current state object
 * @param {Object} payload - Selector payload
 * @param {number} payload.offset - Relative offset (negative = back, positive = forward)
 * @returns {Object|null} { sectionId, lineId } or null if out of bounds
 *
 * @example
 * // Go back one line
 * const target = selectLineIdByOffset({ state }, { offset: -1 });
 * // target = { sectionId: "story", lineId: "line3" } or null if at first line
 */
export const selectLineIdByOffset = ({ state }, payload) => {
  const { offset } = payload;

  if (offset === undefined || typeof offset !== "number") {
    console.warn("selectLineIdByOffset requires a numeric offset");
    return null;
  }

  const lastContext = state.contexts[state.contexts.length - 1];
  if (!lastContext) {
    return null;
  }

  // Get current position from read pointer
  const currentSectionId = lastContext.pointers.read?.sectionId;
  const currentLineId = lastContext.pointers.read?.lineId;

  if (!currentSectionId || !currentLineId) {
    return null;
  }

  // Find section in history
  const historySequence = lastContext.historySequence;
  const sectionEntry = historySequence?.find(
    (entry) => entry.sectionId === currentSectionId,
  );

  if (!sectionEntry?.lines || sectionEntry.lines.length === 0) {
    return null;
  }

  // Use findLastIndex to handle duplicate entries after rollback
  // When user rolls back and moves forward again, same lineIds may appear multiple times
  const currentIndex = sectionEntry.lines.findLastIndex(
    (line) => line.id === currentLineId,
  );

  if (currentIndex === -1) {
    return null;
  }

  // Calculate target index
  const targetIndex = currentIndex + offset;

  // Check bounds (within section only, as per user requirement)
  if (targetIndex < 0 || targetIndex >= sectionEntry.lines.length) {
    return null;
  }

  const targetLine = sectionEntry.lines[targetIndex];
  return {
    sectionId: currentSectionId,
    lineId: targetLine.id,
  };
};

/**
 * Checks if rollback is possible (not at first line of history).
 * Used for UI to conditionally enable/disable back button.
 *
 * @param {Object} state - Current state object
 * @returns {boolean} True if rollback is possible, false otherwise
 */
export const selectCanRollback = ({ state }) => {
  const target = selectLineIdByOffset({ state }, { offset: -1 });
  return target !== null;
};

/**
 * Rolls back by a relative offset from current position.
 * Convenience action that combines selectLineIdByOffset with rollbackToLine.
 *
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {number} [payload.offset=-1] - Negative offset (defaults to -1)
 * @returns {Object} Updated state object (unchanged if out of bounds)
 * @throws {Error} If offset is not negative
 *
 * @example
 * // Go back one line (default)
 * engine.handleAction("rollbackByOffset", {});
 * // Go back two lines
 * engine.handleAction("rollbackByOffset", { offset: -2 });
 */
export const rollbackByOffset = ({ state }, payload) => {
  const { offset = -1 } = payload;

  if (offset >= 0) {
    throw new Error("rollbackByOffset requires a negative offset");
  }

  // Get target using the selector
  const target = selectLineIdByOffset({ state }, { offset });

  if (!target) {
    // Out of bounds or invalid - do nothing
    return state;
  }

  // Delegate to rollbackToLine for the actual rollback with variable reversion
  return rollbackToLine(
    { state },
    {
      sectionId: target.sectionId,
      lineId: target.lineId,
    },
  );
};

/**
 * Rolls back to a specific line using replay-forward algorithm.
 *
 * Algorithm:
 *   1. Get initialState from current section
 *   2. Reset context variables to initialState
 *   3. For each line in history BEFORE targetLineId:
 *      - For each updateVariableId in line:
 *        - Look up action definition in project data
 *        - Execute the action (apply operations)
 *   4. Set pointer to targetLineId
 *   5. Switch to read mode
 *
 * @param {Object} state - Current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.sectionId - The section ID to rollback within
 * @param {string} payload.lineId - The target line ID to rollback to
 * @returns {Object} Updated state object
 */
export const rollbackToLine = ({ state }, payload) => {
  const { sectionId, lineId } = payload;

  const lastContext = state.contexts[state.contexts.length - 1];
  if (!lastContext) {
    throw new Error("No context available for rollbackToLine");
  }

  // Find the section in history
  const historySequence = lastContext.historySequence;
  const sectionEntry = historySequence?.find(
    (entry) => entry.sectionId === sectionId,
  );

  if (!sectionEntry?.lines) {
    throw new Error(
      `Section ${sectionId} not found in history or has no lines`,
    );
  }

  // Find target line index by lineId
  const targetLineIndex = sectionEntry.lines.findIndex(
    (line) => line.id === lineId,
  );
  if (targetLineIndex === -1) {
    throw new Error(`Line ${lineId} not found in section ${sectionId} history`);
  }

  // Step 1: Reset context variables to initialState
  const initialState = sectionEntry.initialState || {};
  lastContext.variables = { ...initialState };

  // Step 2: Replay all actions BEFORE the target line
  // (We want state as it was BEFORE target line executed)
  for (let i = 0; i < targetLineIndex; i++) {
    const lineEntry = sectionEntry.lines[i];
    const updateVariableIds = lineEntry.updateVariableIds || [];

    for (const actionId of updateVariableIds) {
      // Look up action definition in project data
      const actionDef = findUpdateVariableRecursive(
        state.projectData,
        actionId,
      );

      if (!actionDef) {
        throw new Error(`Action definition not found for ID: ${actionId}`);
      }

      // Apply the action's operations
      const operations = actionDef.operations || [];
      for (const { variableId, op, value } of operations) {
        const variableConfig =
          state.projectData.resources?.variables?.[variableId];
        const scope = variableConfig?.scope;

        // Only apply context-scoped variables during rollback
        if (scope === "context") {
          lastContext.variables[variableId] = applyVariableOperation(
            lastContext.variables[variableId],
            op,
            value,
          );
        }
      }
    }
  }

  // Step 3: Truncate history to target line position
  // This removes entries at and after targetLineIndex
  sectionEntry.lines = sectionEntry.lines.slice(0, targetLineIndex);

  // Step 4: Add target line to history (fresh entry for rollback support)
  sectionEntry.lines.push({ id: lineId });

  // Step 5: Update pointer to target line
  lastContext.pointers.read = { sectionId, lineId };

  // Step 6: Switch to read mode (makes choices interactive)
  lastContext.currentPointerMode = "read";
  lastContext.pointers.history = {
    sectionId: null,
    lineId: null,
    historySequenceIndex: null,
  };

  // Skip animations when rolling back - set to true to disable animation
  state.global.isLineCompleted = true;

  // Queue render and line actions
  state.global.pendingEffects.push({ name: "render" });
  state.global.pendingEffects.push({ name: "handleLineActions" });

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
    selectPresentationChanges,
    selectSectionLineChanges,
    selectCurrentPageSlots,
    selectRenderState,
    selectLayeredViews,
    selectLineIdByOffset,
    selectCanRollback,

    // Actions
    startAutoMode,
    stopAutoMode,
    toggleAutoMode,
    startSkipMode,
    stopSkipMode,
    toggleSkipMode,
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
    saveSaveSlot,
    loadSaveSlot,
    updateProjectData,
    sectionTransition,
    jumpToLine,
    addToHistorySequence,
    addLineToHistory,
    nextLine,
    markLineCompleted,
    prevLine,
    rollbackToLine,
    rollbackByOffset,
    pushLayeredView,
    popLayeredView,
    replaceLastLayeredView,
    clearLayeredViews,
    updateVariable,
    nextLineFromSystem,
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
