import { describe, expect, it, vi } from "vitest";
import createEffectsHandler from "../src/createEffectsHandler.js";
import createRouteEngine from "../src/RouteEngine.js";

const createTicker = () => ({ add: vi.fn(), remove: vi.fn() });

const createHandler = (hostRender) => {
  let renderSequence = 0;
  const engine = {
    prepareRenderState: vi.fn(() => {
      renderSequence += 1;
      return { id: `render-${renderSequence}` };
    }),
    commitRenderState: vi.fn(),
  };
  const render = vi.fn(hostRender);
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics: { render },
    ticker: createTicker(),
  });
  const dispatchRender = () => {
    effectsHandler([{ name: "render" }]);
    return render.mock.calls.at(-1)[0];
  };
  const committedIds = () =>
    engine.commitRenderState.mock.calls.map(([renderState]) => renderState.id);

  return { engine, effectsHandler, dispatchRender, committedIds };
};

describe("createEffectsHandler held render states", () => {
  it.each([
    ["nothing", undefined],
    ["true", true],
    ["a truthy value", { drawn: true }],
  ])("commits a state at once when the host returns %s", (_label, result) => {
    const { effectsHandler, dispatchRender, committedIds } = createHandler(
      () => result,
    );

    const renderState = dispatchRender();

    expect(committedIds()).toEqual(["render-1"]);
    // A state that was not held cannot be committed a second time.
    expect(effectsHandler.commitRenderState(renderState)).toBe(false);
    expect(committedIds()).toEqual(["render-1"]);
  });

  it("leaves a state uncommitted when the host returns false, until the host reports it", () => {
    const { effectsHandler, dispatchRender, committedIds } = createHandler(
      () => false,
    );

    const renderState = dispatchRender();
    expect(committedIds()).toEqual([]);

    expect(effectsHandler.commitRenderState(renderState)).toBe(true);
    expect(committedIds()).toEqual(["render-1"]);
    expect(effectsHandler.commitRenderState(renderState)).toBe(false);
    expect(committedIds()).toEqual(["render-1"]);
  });

  it("never commits a held state the host skipped for a later one", () => {
    const { effectsHandler, dispatchRender, committedIds } = createHandler(
      () => false,
    );

    const skipped = dispatchRender();
    const shown = dispatchRender();

    expect(effectsHandler.commitRenderState(shown)).toBe(true);
    expect(effectsHandler.commitRenderState(skipped)).toBe(false);
    expect(committedIds()).toEqual(["render-2"]);
  });

  it("drops a held state once a later state is drawn at once", () => {
    let hold = true;
    const { effectsHandler, dispatchRender, committedIds } = createHandler(
      () => !hold,
    );

    const held = dispatchRender();
    hold = false;
    dispatchRender();

    expect(committedIds()).toEqual(["render-2"]);
    expect(effectsHandler.commitRenderState(held)).toBe(false);
    expect(committedIds()).toEqual(["render-2"]);
  });

  it("commits held states in order when the host draws each of them", () => {
    const { effectsHandler, dispatchRender, committedIds } = createHandler(
      () => false,
    );

    const first = dispatchRender();
    const second = dispatchRender();

    expect(effectsHandler.commitRenderState(first)).toBe(true);
    expect(effectsHandler.commitRenderState(second)).toBe(true);
    expect(committedIds()).toEqual(["render-1", "render-2"]);
  });

  it("ignores a state the handler never held", () => {
    const { effectsHandler, committedIds } = createHandler(() => false);

    expect(effectsHandler.commitRenderState({ id: "render-other" })).toBe(
      false,
    );
    expect(committedIds()).toEqual([]);
  });

  it.each(["reset", "dispose"])(
    "ignores a state held before %s",
    (lifecycleMethod) => {
      const { effectsHandler, dispatchRender, committedIds } = createHandler(
        () => false,
      );
      const renderState = dispatchRender();

      effectsHandler[lifecycleMethod]();

      expect(effectsHandler.commitRenderState(renderState)).toBe(false);
      expect(committedIds()).toEqual([]);
    },
  );
});

const createBgm = (soundId, audioEffects) => {
  const bgm = { volume: 75, sounds: [{ id: soundId, resourceId: soundId }] };
  if (audioEffects) {
    bgm.audioEffects = { resourceId: "fade" };
  }
  return bgm;
};

const createSection = (bgm) => ({
  lines: [
    { id: `${bgm.sounds[0].id}-line-one`, actions: { bgm } },
    { id: `${bgm.sounds[0].id}-line-two`, actions: {} },
  ],
});

// A menu whose choices lead to sections that each fade to their own music.
const createMusicProject = () => ({
  screen: { width: 1280, height: 720 },
  resources: {
    sounds: {
      "menu-music": { fileId: "menu-music.ogg" },
      "music-one": { fileId: "music-one.ogg" },
      "music-two": { fileId: "music-two.ogg" },
    },
    audioEffects: {
      fade: {
        type: "transition",
        prev: {
          volume: {
            keyframes: [{ value: 0, duration: 600, easing: "easeInSine" }],
          },
        },
        next: {
          volume: {
            initialValue: 0,
            keyframes: [{ value: 100, duration: 900, easing: "easeOutSine" }],
          },
        },
      },
    },
  },
  story: {
    initialSceneId: "scene",
    scenes: {
      scene: {
        initialSectionId: "menu",
        sections: {
          menu: createSection(createBgm("menu-music")),
          "section-one": createSection(createBgm("music-one", true)),
          "section-two": createSection(createBgm("music-two", true)),
        },
      },
    },
  },
});

const collectAudioNodeIds = (renderState) => {
  const ids = new Set();
  const visit = (nodes = []) => {
    for (const node of nodes) {
      ids.add(node.id);
      visit(node.children);
    }
  };
  visit(renderState?.audio);
  return ids;
};

// A renderer accepts a new audio effect only when its target is in the state
// it drew last or in the new one.
const findUnresolvedAudioEffects = (drawnStates) => {
  const unresolved = [];
  drawnStates.forEach((renderState, index) => {
    const previousIds = collectAudioNodeIds(drawnStates[index - 1]);
    const nextIds = collectAudioNodeIds(renderState);
    for (const effect of renderState.audioEffects ?? []) {
      if (!previousIds.has(effect.targetId) && !nextIds.has(effect.targetId)) {
        unresolved.push({ index, targetId: effect.targetId });
      }
    }
  });
  return unresolved;
};

// A host that draws a state only once its music is loaded, and draws only the
// latest state that was waiting.
const createLatestOnlyHost = ({ reportsHeldStates }) => {
  const loadedSounds = new Set(["bgm:menu-music"]);
  const drawnStates = [];
  let waitingState;
  let engine;
  let effectsHandler;

  const isLoaded = (renderState) =>
    [...collectAudioNodeIds(renderState)]
      .filter((id) => id.startsWith("bgm:"))
      .every((id) => loadedSounds.has(id));

  const render = (renderState) => {
    if (isLoaded(renderState)) {
      waitingState = undefined;
      drawnStates.push(renderState);
      return;
    }

    waitingState = renderState;
    return reportsHeldStates ? false : undefined;
  };

  effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics: { render },
    ticker: createTicker(),
    persistence: { applyScopedDataUpdates: () => {} },
  });
  engine = createRouteEngine({ handlePendingEffects: effectsHandler });
  engine.init({ initialState: { projectData: createMusicProject() } });

  return {
    drawnStates,
    choose: (sectionId) => {
      engine.handleActions({
        sectionTransition: { sceneId: "scene", sectionId },
      });
    },
    finishLoading: (soundId) => {
      loadedSounds.add(soundId);
      if (waitingState && isLoaded(waitingState)) {
        const renderState = waitingState;
        waitingState = undefined;
        drawnStates.push(renderState);
        effectsHandler.commitRenderState(renderState);
      }
    },
  };
};

describe("createEffectsHandler held render states with the engine", () => {
  it("builds the next music effects from the state on screen when the host reports held states", () => {
    const host = createLatestOnlyHost({ reportsHeldStates: true });

    host.choose("section-one");
    host.choose("section-two");
    host.finishLoading("bgm:music-one");
    host.finishLoading("bgm:music-two");

    const lastState = host.drawnStates.at(-1);
    expect([...collectAudioNodeIds(lastState)]).toContain("bgm:music-two");
    expect(lastState.audioEffects.map((effect) => effect.targetId)).toEqual([
      "bgm:menu-music",
      "bgm:music-two",
    ]);
    expect(findUnresolvedAudioEffects(host.drawnStates)).toEqual([]);
  });

  it("fades out music that was never drawn when such a host does not report held states", () => {
    const host = createLatestOnlyHost({ reportsHeldStates: false });

    host.choose("section-one");
    host.choose("section-two");
    host.finishLoading("bgm:music-one");
    host.finishLoading("bgm:music-two");

    expect(findUnresolvedAudioEffects(host.drawnStates)).toEqual([
      { index: 1, targetId: "bgm:music-one" },
    ]);
  });

  it("keeps a single held choice valid", () => {
    const host = createLatestOnlyHost({ reportsHeldStates: true });

    host.choose("section-one");
    host.finishLoading("bgm:music-one");

    expect(
      host.drawnStates.at(-1).audioEffects.map((effect) => effect.targetId),
    ).toEqual(["bgm:menu-music", "bgm:music-one"]);
    expect(findUnresolvedAudioEffects(host.drawnStates)).toEqual([]);
  });
});
