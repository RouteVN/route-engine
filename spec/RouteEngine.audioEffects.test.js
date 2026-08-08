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
  it("treats the initial BGM as an entry-only transition", () => {
    const projectData = createProjectData();
    projectData.story.scenes.scene.sections.section.lines[0].actions.bgm.audioEffects =
      { resourceId: "crossfade" };

    const effect = createEngine({ projectData }).selectRenderState()
      .audioEffects?.[0];

    expect(effect).toMatchObject({
      targetId: "bgm:main",
      properties: {
        volume: {
          enter: {
            initialValue: 0,
            keyframes: [expect.objectContaining({ value: 80 })],
          },
        },
      },
    });
    expect(effect.properties.volume).not.toHaveProperty("exit");
  });

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

  it("exposes immutable render snapshots for active effects", () => {
    const engine = createEngine();
    enterNextLine(engine);
    const callerOwnedRender = engine.selectRenderState();

    expect(() => {
      callerOwnedRender.audioEffects[0].properties.volume.enter.keyframes[0].value = 999;
    }).toThrow(TypeError);
    expect(() =>
      callerOwnedRender.audioEffects[0].properties.volume.exit.keyframes.push({
        value: 999,
        duration: 999,
      }),
    ).toThrow(TypeError);

    const retry = engine.selectRenderState();

    expect(
      retry.audioEffects[0].properties.volume.enter.keyframes[0].value,
    ).toBe(60);
    expect(retry.audioEffects[0].properties.volume.exit.keyframes).toHaveLength(
      1,
    );
  });

  it("reuses the accepted occurrence when the same line actions are delivered twice", () => {
    const engine = createEngine();
    enterNextLine(engine);
    const firstEffect = engine.selectRenderState().audioEffects[0];

    engine.handleLineActions();

    expect(engine.selectRenderState().audioEffects).toEqual([firstEffect]);
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

  it("ignores an uncommitted intermediate BGM when resolving the next line", () => {
    const projectData = createProjectData();
    const lines = projectData.story.scenes.scene.sections.section.lines;
    lines.splice(3, 0, {
      id: "uncommitted-source",
      actions: {
        bgm: {
          volume: 50,
          sounds: [{ id: "main", resourceId: "next" }],
        },
      },
    });
    const engine = createEngine({ projectData });
    engine.handleAction("jumpToLine", {
      sectionId: "section",
      lineId: "uncommitted-source",
    });

    expect(() => enterNextLine(engine)).not.toThrow();
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

  it("clones the committed BGM graph before retaining it as the handoff", () => {
    const engine = createEngine();
    const committedRender = structuredClone(engine.selectRenderState());
    engine.commitRenderState(committedRender);
    committedRender.audio[0].children[0].src = "caller-mutated.ogg";

    expect(() =>
      engine.handleAction("jumpToLine", {
        sectionId: "section",
        lineId: "volume-update",
      }),
    ).not.toThrow();
    expect(engine.selectRenderState().audioEffects?.[0]).toMatchObject({
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

  it("carries the committed outgoing BGM into a loaded effect-bearing line", () => {
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
      id: "away",
      actions: {
        bgm: {
          volume: 80,
          sounds: [{ id: "main", resourceId: "old" }],
        },
      },
    });
    const engine = createEngine({ projectData });
    engine.handleAction("jumpToLine", {
      sectionId: "section",
      lineId: "volume-update",
    });
    engine.commitRenderState(engine.selectRenderState());
    engine.handleAction("saveSlot", { slotId: "effect-line", savedAt: 1 });
    engine.handleAction("jumpToLine", {
      sectionId: "section",
      lineId: "away",
    });
    engine.commitRenderState(engine.selectRenderState());

    expect(() =>
      engine.handleAction("loadSlot", { slotId: "effect-line" }),
    ).not.toThrow();
    expect(engine.selectRenderState().audio[0].children[0]).toMatchObject({
      id: "bgm:main",
      src: "old.ogg",
      volume: 30,
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

  it("settles an effect when the complete line batch enables skipping", () => {
    const projectData = createProjectData();
    projectData.story.scenes.scene.sections.section.lines[1].actions.setSkipTransitionsAndAnimations =
      { value: true };
    const engine = createEngine({ projectData });

    enterNextLine(engine);

    expect(engine.selectRuntime().skipTransitionsAndAnimations).toBe(true);
    expect(engine.selectRenderState().audioEffects).toBeUndefined();
    engine.handleAction("setSkipTransitionsAndAnimations", { value: false });
    expect(engine.selectRenderState().audioEffects).toBeUndefined();
  });

  it("does not revive an effect skipped by the settled pre-existing runtime", () => {
    const engine = createEngine({
      global: {
        runtime: { skipTransitionsAndAnimations: true },
      },
    });

    enterNextLine(engine);
    expect(engine.selectRenderState().audioEffects).toBeUndefined();

    engine.handleAction("setSkipTransitionsAndAnimations", { value: false });
    expect(engine.selectRenderState().audioEffects).toBeUndefined();
  });

  it("recovers after a rejected line batch without leaking runtime or occurrence state", () => {
    const projectData = createProjectData();
    projectData.story.scenes.scene.sections.section.lines[1] = {
      id: "invalid-update",
      actions: {
        bgm: {
          volume: 30,
          audioEffects: { resourceId: "crossfade" },
          sounds: [{ id: "main", resourceId: "old" }],
        },
        setMusicVolume: { value: 25 },
      },
    };
    projectData.story.scenes.scene.sections.recovery = {
      lines: [
        {
          id: "valid-update",
          actions: {
            bgm: {
              volume: 30,
              audioEffects: { resourceId: "smooth" },
              sounds: [{ id: "main", resourceId: "old" }],
            },
          },
        },
      ],
    };
    const engine = createEngine({ projectData });

    expect(() => enterNextLine(engine)).toThrow(
      "only updates a retained sound",
    );
    expect(engine.selectRuntime().musicVolume).toBe(50);
    expect(engine.selectRenderState().audioEffects).toBeUndefined();

    expect(() =>
      engine.handleAction("sectionTransition", { sectionId: "recovery" }),
    ).not.toThrow();
    const recoveredEffect = engine.selectRenderState().audioEffects?.[0];
    expect(recoveredEffect?.id).toMatch(/:audio2$/);
    expect(recoveredEffect).toMatchObject({
      properties: {
        volume: {
          update: {
            keyframes: [expect.objectContaining({ value: 30 })],
          },
        },
      },
    });
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
