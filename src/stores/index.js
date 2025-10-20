import { createStore, createSequentialActionsExecutor } from "../util.js";

import constructRenderStateActions, * as constructRenderStateStore from "./constructRenderState.js";
import constructPresentationStateActions, * as constructPresentationStateStore from "./constructPresentationState.js";
import * as systemStore from "./system.store";
import * as projectDataStore from "./projectData.store.js";

const { createInitialState: createConstructPresentationStateInitialState } =
  constructPresentationStateStore;

const { createInitialState: createConstructRenderStateInitialState } =
  constructRenderStateStore;

const {
  createInitialState: createSystemInitialState,
  ...systemStateSelectorsAndActions
} = systemStore;

const {
  createInitialState: createProjectDataInitialState,
  ...projectDataSelectorsAndActions
} = projectDataStore;

export const createProjectDataStore = (projectData) => {
  return createStore(projectData, projectDataSelectorsAndActions);
};

export const createSystemStore = (initialIds, projectDataStore) => {
  // Get variable definitions and initialize with defaults
  const variableDefinitions = projectDataStore.selectVariables();
  const initialVariables = {};
  Object.entries(variableDefinitions).forEach(([key, definition]) => {
    if (definition.hasOwnProperty("default")) {
      initialVariables[key] = definition.default;
    }
  });

  return createStore(
    createSystemInitialState({
      sectionId: initialIds.sectionId,
      lineId: initialIds.lineId,
      saveData: {},
      variables: initialVariables,
      projectDataStore,
    }),
    systemStateSelectorsAndActions,
    {
      transformActionFirstArgument: (state) => ({
        state,
        projectDataStore,
      }),
      transformSelectorFirstArgument: (state) => ({
        state,
        projectDataStore,
      }),
    },
  );
};

export const constructPresentationState = createSequentialActionsExecutor(
  createConstructPresentationStateInitialState,
  constructPresentationStateActions,
);

export const constructRenderState = createSequentialActionsExecutor(
  createConstructRenderStateInitialState,
  constructRenderStateActions,
);
