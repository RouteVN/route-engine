import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = () => ({
  screen: { width: 1280, height: 720 },
  resources: {
    sounds: {
      old: { fileId: "old.ogg" },
      next: { fileId: "next.ogg" },
    },
    audioEffects: {
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
                    audioEffects: { resourceId: "crossfade" },
                    sounds: [{ id: "main", resourceId: "next" }],
                  },
                },
              },
              {
                id: "old-again",
                actions: {
                  bgm: {
                    volume: 80,
                    audioEffects: { resourceId: "crossfade" },
                    sounds: [{ id: "main", resourceId: "old" }],
                  },
                },
              },
              {
                id: "volume-update",
                actions: {
                  bgm: {
                    volume: 30,
                    audioEffects: { resourceId: "smooth" },
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

const createEngine = ({ projectData = createProjectData(), global } = {}) => {
  let engine;
  const handlePendingEffects = (effects) => {
    for (const effect of effects) {
      if (effect.name === "handleLineActions") {
        engine.handleLineActions(effect.payload);
      }
    }
  };
  engine = createRouteEngine({ handlePendingEffects });
  engine.init({ initialState: { projectData, global } });
  const initialRender = engine.selectRenderState();
  engine.commitRenderState(initialRender);
  return engine;
};

const enterNextLine = (engine) => {
  engine.handleAction("markLineCompleted", {});
  engine.handleAction("nextLine", {});
};

describe("RouteEngine audioEffects occurrences", () => {
  it("retains one immutable handoff across retries and settings renders", () => {
    const engine = createEngine();
    enterNextLine(engine);

    const first = engine.prepareRenderState();
    const retry = engine.prepareRenderState();
    expect(first.audioEffects).toHaveLength(1);
    expect(retry.audioEffects).toEqual(first.audioEffects);
    expect(first.audioEffects[0]).toMatchObject({
      type: "audio-transition",
      targetId: "bgm:main",
      properties: {
        volume: {
          exit: { keyframes: [expect.objectContaining({ value: 0 })] },
          enter: { keyframes: [expect.objectContaining({ value: 60 })] },
        },
      },
    });
    expect(engine.selectPresentationState().bgm).not.toHaveProperty(
      "audioEffects",
    );

    engine.commitRenderState(first);
    engine.handleAction("setMusicVolume", { value: 25 });
    const settingsRender = engine.selectRenderState();
    expect(settingsRender.audioEffects).toEqual(first.audioEffects);
    expect(settingsRender.audio[0]).toMatchObject({
      id: "channel:bgm",
      volume: 25,
      children: [expect.objectContaining({ id: "bgm:main", volume: 60 })],
    });

    engine.commitRenderState(retry);
    expect(engine.selectRenderState().audioEffects).toEqual(first.audioEffects);
  });

  it("assigns a fresh effect occurrence when the authored selection runs again", () => {
    const engine = createEngine();
    enterNextLine(engine);
    const first = engine.selectRenderState();
    const firstEffectId = first.audioEffects[0].id;
    engine.commitRenderState(first);

    enterNextLine(engine);
    const revisit = engine.selectRenderState();
    expect(revisit.audioEffects[0].id).not.toBe(firstEffectId);
  });

  it("compiles retained updates and removes them to settle on skip", () => {
    const engine = createEngine();
    enterNextLine(engine);
    engine.commitRenderState(engine.selectRenderState());
    enterNextLine(engine);
    engine.commitRenderState(engine.selectRenderState());
    enterNextLine(engine);

    expect(engine.selectRenderState().audioEffects[0]).toMatchObject({
      type: "audio-transition",
      targetId: "bgm:main",
      properties: {
        volume: {
          update: {
            keyframes: [expect.objectContaining({ value: 30 })],
          },
        },
      },
    });

    engine.handleAction("setSkipTransitionsAndAnimations", { value: true });
    expect(engine.selectRenderState().audioEffects).toBeUndefined();
    engine.handleAction("setSkipTransitionsAndAnimations", { value: false });
    expect(engine.selectRenderState().audioEffects).toBeUndefined();
  });

  it("removes an active effect when an unanimated BGM action supersedes it", () => {
    const engine = createEngine();
    enterNextLine(engine);
    expect(engine.selectRenderState().audioEffects).toHaveLength(1);

    engine.handleAction("bgm", {
      volume: 100,
      sounds: [{ id: "main", resourceId: "old" }],
    });
    expect(engine.selectRenderState().audioEffects).toBeUndefined();
  });

  it("drops the prior occurrence on engine reinitialization", () => {
    const engine = createEngine();
    enterNextLine(engine);
    engine.commitRenderState(engine.selectRenderState());

    engine.init({ initialState: { projectData: createProjectData() } });
    expect(engine.selectRenderState().audioEffects).toBeUndefined();
  });

  it("resolves a non-linear update against the committed outgoing BGM", () => {
    const projectData = createProjectData();
    const lines = projectData.story.scenes.scene.sections.section.lines;
    lines.splice(3, 0, {
      id: "skipped-different-source",
      actions: {
        bgm: {
          volume: 50,
          sounds: [{ id: "main", resourceId: "next" }],
        },
      },
    });
    const engine = createEngine({ projectData });

    expect(() =>
      engine.handleAction("jumpToLine", {
        sectionId: "section",
        lineId: "volume-update",
      }),
    ).not.toThrow();
    expect(engine.selectRenderState().audioEffects?.[0]).toMatchObject({
      targetId: "bgm:main",
      properties: {
        volume: {
          update: {
            keyframes: [expect.objectContaining({ value: 30 })],
          },
        },
      },
    });
  });

  it("carries the committed outgoing BGM across a section transition", () => {
    const projectData = createProjectData();
    projectData.story.scenes.scene.sections.destination = {
      lines: [
        {
          id: "destination-update",
          actions: {
            bgm: {
              volume: 25,
              audioEffects: { resourceId: "smooth" },
              sounds: [{ id: "main", resourceId: "old" }],
            },
          },
        },
      ],
    };
    const engine = createEngine({ projectData });

    expect(() =>
      engine.handleAction("sectionTransition", {
        sectionId: "destination",
      }),
    ).not.toThrow();
    expect(engine.selectRenderState().audioEffects?.[0]).toMatchObject({
      targetId: "bgm:main",
      properties: {
        volume: {
          update: {
            keyframes: [expect.objectContaining({ value: 25 })],
          },
        },
      },
    });
  });

  it("resolves a rollback update against the committed outgoing BGM", () => {
    const projectData = createProjectData();
    const lines = projectData.story.scenes.scene.sections.section.lines;
    lines.splice(3, 0, {
      id: "authored-predecessor",
      actions: {
        bgm: {
          volume: 50,
          sounds: [{ id: "main", resourceId: "next" }],
        },
      },
    });
    lines.push({
      id: "after-update",
      actions: {
        bgm: {
          volume: 30,
          sounds: [{ id: "main", resourceId: "old" }],
        },
      },
    });
    const engine = createEngine({ projectData });
    engine.handleAction("jumpToLine", {
      sectionId: "section",
      lineId: "authored-predecessor",
    });
    expect(() => enterNextLine(engine)).not.toThrow();
    engine.commitRenderState(engine.selectRenderState());
    enterNextLine(engine);
    engine.commitRenderState(engine.selectRenderState());

    expect(() =>
      engine.handleAction("rollbackToLine", {
        sectionId: "section",
        lineId: "volume-update",
      }),
    ).not.toThrow();
    expect(engine.selectRenderState().audio[0].children[0]).toMatchObject({
      id: "bgm:main",
      src: "old.ogg",
      volume: 30,
    });
  });

  it("evaluates transition skipping after the complete line batch", () => {
    const projectData = createProjectData();
    projectData.story.scenes.scene.sections.section.lines[1].actions.setSkipTransitionsAndAnimations =
      { value: false };
    const engine = createEngine({
      projectData,
      global: {
        runtime: { skipTransitionsAndAnimations: true },
      },
    });

    enterNextLine(engine);

    expect(engine.selectRuntime().skipTransitionsAndAnimations).toBe(false);
    expect(engine.selectRenderState().audioEffects).toHaveLength(1);
  });

  it("uses the owning scene id in line-authored effect diagnostics", () => {
    const projectData = createProjectData();
    const scene = projectData.story.scenes.scene;
    projectData.story.initialSceneId = "actual-scene";
    projectData.story.scenes = { "actual-scene": scene };
    scene.sections.section.lines[0].actions.bgm.audioEffects = {
      resourceId: "missing",
    };

    expect(() => createEngine({ projectData })).toThrow(
      'story.scenes["actual-scene"].sections["section"].lines["old"].actions.bgm.audioEffects.resourceId',
    );
  });
});
