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
  return createStore(
    createSystemInitialState({
      sectionId: initialIds.sectionId,
      lineId: initialIds.lineId,
      presetId: initialIds.presetId,
      autoNext: initialIds.autoNext,
      saveData: {},
      variables: {},
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
