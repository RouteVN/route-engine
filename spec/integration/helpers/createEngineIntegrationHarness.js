import { vi } from "vitest";
import createRouteEngine from "../../../src/RouteEngine.js";
import createEffectsHandler from "../../../src/createEffectsHandler.js";

export const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

export const createIntegrationTicker = () => {
  const callbacks = new Set();

  return {
    add: vi.fn((callback) => callbacks.add(callback)),
    remove: vi.fn((callback) => callbacks.delete(callback)),
    tick(deltaMS) {
      [...callbacks].forEach((callback) => callback({ deltaMS }));
    },
    get size() {
      return callbacks.size;
    },
  };
};

export const createIntegrationPersistence = () => ({
  saveSlots: vi.fn().mockResolvedValue(undefined),
  saveGlobalDeviceVariables: vi.fn().mockResolvedValue(undefined),
  saveGlobalAccountVariables: vi.fn().mockResolvedValue(undefined),
  saveGlobalRuntime: vi.fn().mockResolvedValue(undefined),
  applyScopedDataUpdates: vi.fn().mockResolvedValue(undefined),
});

export const createIntegrationResources = (overrides = {}) => ({
  layouts: {},
  sounds: {},
  images: {},
  videos: {},
  sprites: {},
  spritesheets: {},
  characters: {},
  variables: {},
  transforms: {},
  sectionTransitions: {},
  animations: {},
  fonts: {},
  colors: {},
  textStyles: {},
  controls: {},
  ...overrides,
});

export const createIntegrationProject = ({
  initialSectionId = "main",
  sections,
  resources = {},
  config,
}) => ({
  screen: { width: 1280, height: 720 },
  resources: createIntegrationResources(resources),
  story: {
    initialSceneId: "scene",
    scenes: {
      scene: {
        initialSectionId,
        sections,
      },
    },
  },
  ...(config === undefined ? {} : { config }),
});

export const findRenderElement = (elements, id) => {
  for (const element of elements ?? []) {
    if (element?.id === id) {
      return element;
    }
    const nested = findRenderElement(element?.children, id);
    if (nested) {
      return nested;
    }
  }
  return undefined;
};

export const createEngineIntegrationHarness = ({
  projectData,
  global,
  l10nData,
  preprocessPayload,
  handleUnhandledEffect,
} = {}) => {
  const ticker = createIntegrationTicker();
  const persistence = createIntegrationPersistence();
  const renderStates = [];
  const routeGraphics = {
    render: vi.fn((renderState) => {
      renderStates.push(structuredClone(renderState));
    }),
  };
  let engine;
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics,
    ticker,
    persistence,
    ...(handleUnhandledEffect
      ? {
          handleUnhandledEffect: (effect, dependencies) =>
            handleUnhandledEffect(effect, {
              ...dependencies,
              engine,
            }),
        }
      : {}),
  });
  const eventHandler = effectsHandler.createRouteGraphicsEventHandler({
    preprocessPayload,
  });
  engine = createRouteEngine({ handlePendingEffects: effectsHandler });

  const initialState = {
    ...(global === undefined ? {} : { global }),
    projectData,
    ...(l10nData === undefined ? {} : { l10nData }),
  };
  const init = () => {
    engine.init({
      namespace: "integration-test",
      initialState,
    });
  };
  init();

  return {
    engine,
    eventHandler,
    effectsHandler,
    persistence,
    renderStates,
    routeGraphics,
    ticker,
    completeLatestRender(payload = {}) {
      return effectsHandler.handleRouteGraphicsEvent("renderComplete", {
        id: renderStates.at(-1)?.id,
        aborted: false,
        ...payload,
      });
    },
    getPointer() {
      return engine.selectSystemState().contexts.at(-1).pointers.read;
    },
    getState() {
      return engine.selectSystemState();
    },
    reinitialize: init,
  };
};
