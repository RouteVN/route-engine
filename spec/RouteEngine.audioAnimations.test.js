import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = () => ({
  screen: { width: 1280, height: 720 },
  resources: {
    sounds: {
      old: { fileId: "old.ogg" },
      next: { fileId: "next.ogg" },
    },
    audioAnimations: {
      crossfade: {
        type: "transition",
        prev: { fade: { duration: 600, easing: "easeInSine" } },
        next: { fade: { duration: 900, easing: "easeOutSine" } },
      },
      smooth: {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: "target", duration: 1000, easing: "linear" }],
          },
        },
      },
    },
  },
  story: {
    initialSceneId: "scene",
    scenes: {
      scene: {
        initialSectionId: "section",
        sections: {
          section: {
            lines: [
              {
                id: "old",
                actions: {
                  bgm: {
                    volume: 80,
                    sounds: [{ id: "main", resourceId: "old" }],
                  },
                },
              },
              {
                id: "next",
                actions: {
                  bgm: {
                    volume: 60,
                    animations: { resourceId: "crossfade" },
                    sounds: [{ id: "main", resourceId: "next" }],
                  },
                },
              },
              {
                id: "old-again",
                actions: {
                  bgm: {
                    volume: 80,
                    animations: { resourceId: "crossfade" },
                    sounds: [{ id: "main", resourceId: "old" }],
                  },
                },
              },
              {
                id: "volume-update",
                actions: {
                  bgm: {
                    volume: 30,
                    animations: { resourceId: "smooth" },
                    sounds: [{ id: "main", resourceId: "old" }],
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
});

const createEngine = () => {
  let engine;
  const handlePendingEffects = (effects) => {
    for (const effect of effects) {
      if (effect.name === "handleLineActions") {
        engine.handleLineActions(effect.payload);
      }
    }
  };
  engine = createRouteEngine({ handlePendingEffects });
  engine.init({ initialState: { projectData: createProjectData() } });
  const initialRender = engine.selectRenderState();
  engine.commitRenderState(initialRender);
  return engine;
};

const enterSecondLine = (engine) => {
  engine.handleAction("markLineCompleted", {});
  engine.handleAction("nextLine", {});
};

describe("RouteEngine audio animation occurrences", () => {
  it("prepares one immutable handoff until commit and does not replay it on settings renders", () => {
    const engine = createEngine();
    enterSecondLine(engine);

    const first = engine.prepareRenderState();
    const retry = engine.prepareRenderState();
    expect(first.audioAnimations).toHaveLength(1);
    expect(retry.audioAnimations).toEqual(first.audioAnimations);
    expect(first.audioAnimations[0]).toMatchObject({
      type: "transition",
      targetId: "channel:bgm",
      prev: { channel: { volume: 80 } },
      next: { channel: { volume: 60 } },
    });
    expect(engine.selectPresentationState().bgm).not.toHaveProperty(
      "animations",
    );

    engine.commitRenderState(first);
    engine.handleAction("setMusicVolume", { value: 25 });
    const settingsRender = engine.selectRenderState();
    expect(settingsRender.audioAnimations).toBeUndefined();
    expect(settingsRender.audio[0].volume).toBe(60);
    expect(settingsRender.audioMasters).toEqual([
      { id: "channel:bgm", volume: 25, muted: false },
    ]);

    engine.commitRenderState(retry);
    expect(engine.selectRenderState().audioAnimations).toBeUndefined();
  });

  it("assigns a fresh occurrence when the same authored selection is accepted again", () => {
    const engine = createEngine();
    enterSecondLine(engine);
    const first = engine.selectRenderState();
    const firstOccurrenceId = first.audioAnimations[0].occurrenceId;
    engine.commitRenderState(first);

    enterSecondLine(engine);
    const revisit = engine.selectRenderState();
    expect(revisit.audioAnimations[0].occurrenceId).not.toBe(firstOccurrenceId);
  });

  it("emits monotonic settlement under skip and consumes a skipped pending update", () => {
    const engine = createEngine();
    enterSecondLine(engine);
    engine.commitRenderState(engine.selectRenderState());
    enterSecondLine(engine);
    engine.commitRenderState(engine.selectRenderState());
    enterSecondLine(engine);
    expect(engine.selectRenderState().audioAnimations[0]).toMatchObject({
      type: "update",
      tween: {
        volume: {
          keyframes: [expect.objectContaining({ value: 30 })],
        },
      },
    });

    engine.handleAction("setSkipTransitionsAndAnimations", { value: true });
    const skipped = engine.selectRenderState();
    expect(skipped.audioAnimations).toBeUndefined();
    expect(skipped.audioAnimationControl).toEqual({
      commandId: 1,
      operation: "settle",
    });
    engine.commitRenderState(skipped);

    const nextSkipped = engine.selectRenderState();
    expect(nextSkipped.audioAnimationControl.commandId).toBe(2);
    engine.handleAction("setSkipTransitionsAndAnimations", { value: false });
    expect(engine.selectRenderState().audioAnimations).toBeUndefined();
  });

  it("settles once when an unanimated BGM action supersedes automation", () => {
    const engine = createEngine();
    enterSecondLine(engine);
    const animated = engine.selectRenderState();
    expect(animated.audioAnimations).toHaveLength(1);
    engine.commitRenderState(animated);

    engine.handleAction("bgm", {
      volume: 100,
      sounds: [{ id: "main", resourceId: "old" }],
    });
    const superseding = engine.selectRenderState();
    const supersedingRetry = engine.selectRenderState();
    expect(superseding.audioAnimations).toBeUndefined();
    expect(superseding.audioAnimationControl).toEqual({
      commandId: 1,
      operation: "settle",
    });
    expect(supersedingRetry.audioAnimationControl).toEqual(
      superseding.audioAnimationControl,
    );

    engine.commitRenderState(superseding);
    expect(engine.selectRenderState().audioAnimationControl).toBeUndefined();
  });

  it("settles once on engine reinitialization without replaying the initial line", () => {
    const engine = createEngine();
    enterSecondLine(engine);
    engine.commitRenderState(engine.selectRenderState());

    engine.init({ initialState: { projectData: createProjectData() } });
    const restored = engine.selectRenderState();
    expect(restored.audioAnimations).toBeUndefined();
    expect(restored.audioAnimationControl).toEqual({
      commandId: 1,
      operation: "settle",
    });

    engine.commitRenderState(restored);
    expect(engine.selectRenderState().audioAnimationControl).toBeUndefined();
  });
});
