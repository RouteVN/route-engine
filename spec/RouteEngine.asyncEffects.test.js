import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const createProjectData = () => ({
  screen: {
    width: 1280,
    height: 720,
  },
  resources: {
    layouts: {},
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    characters: {},
    variables: {},
    transforms: {},
    sectionTransitions: {},
    animations: {},
    fonts: {},
    colors: {},
    textStyles: {},
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            lines: [{ id: "line1", actions: {} }],
          },
        },
      },
    },
  },
});

describe("RouteEngine asynchronous effect processing", () => {
  it("queues effect batches in order while an earlier batch is pending", async () => {
    const deferred = createDeferred();
    const handledBatches = [];
    let batchCount = 0;
    const handlePendingEffects = vi.fn((effects) => {
      handledBatches.push(effects.map((effect) => effect.name));
      batchCount += 1;
      if (batchCount === 1) {
        return deferred.promise;
      }
      return undefined;
    });
    const engine = createRouteEngine({ handlePendingEffects });

    const initResult = engine.init({
      initialState: { projectData: createProjectData() },
    });
    engine.handleAction("appendPendingEffect", { name: "secondBatch" });
    engine.handleAction("appendPendingEffect", { name: "thirdBatch" });

    expect(initResult).toBeInstanceOf(Promise);
    expect(handledBatches).toEqual([["handleLineActions"]]);
    expect(engine.isEffectProcessingBlocked()).toBe(true);

    deferred.resolve();
    await initResult;

    expect(handledBatches).toEqual([
      ["handleLineActions"],
      ["secondBatch"],
      ["thirdBatch"],
    ]);
    expect(engine.isEffectProcessingBlocked()).toBe(false);
  });

  it("stops queued progression and reports an asynchronous effect failure", async () => {
    const deferred = createDeferred();
    const error = new Error("blocking render failed");
    const handledBatches = [];
    const handleEffectError = vi.fn();
    const handlePendingEffects = vi.fn((effects) => {
      handledBatches.push(effects.map((effect) => effect.name));
      return deferred.promise;
    });
    const engine = createRouteEngine({
      handlePendingEffects,
      handleEffectError,
    });

    const initResult = engine.init({
      initialState: { projectData: createProjectData() },
    });
    engine.handleAction("appendPendingEffect", { name: "mustNotRun" });

    deferred.reject(error);
    await initResult;

    expect(handleEffectError).toHaveBeenCalledWith(error);
    expect(handledBatches).toEqual([["handleLineActions"]]);
    expect(engine.selectEffectProcessingError()).toBe(error);
    expect(engine.isEffectProcessingBlocked()).toBe(true);

    engine.handleAction("appendPendingEffect", { name: "stillMustNotRun" });
    expect(handlePendingEffects).toHaveBeenCalledTimes(1);
    expect(engine.selectSystemState().global.pendingEffects).toEqual([]);
  });
});
