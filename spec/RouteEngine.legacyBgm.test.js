import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const legacyBgm = (volume) => ({ resourceId: "theme", loop: true, volume });
const canonicalBgm = (volume) => ({
  loop: true,
  volume,
  sounds: [{ id: "theme", resourceId: "theme", loop: false, volume: 100 }],
});

const convertedLegacyBgm = (volume) => ({
  loop: true,
  volume,
  sounds: [{ id: "default", resourceId: "theme", loop: false, volume: 100 }],
});

const createEngine = (actions) => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects(effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions(effect.payload);
        }
      }
    },
  });
  engine.init({
    initialState: {
      projectData: {
        screen: { width: 640, height: 360 },
        resources: {
          sounds: {
            theme: { fileId: "theme.ogg" },
            other: { fileId: "other.ogg" },
            "theme:mix%": { fileId: "mix.ogg" },
            "theme%3Amix%": { fileId: "another-mix.ogg" },
          },
          audioEffects: {
            quieter: {
              type: "update",
              tween: { volume: { keyframes: [{ value: 35, duration: 250 }] } },
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
                  lines: actions.map((action, index) => ({
                    id: `line-${index}`,
                    actions: action,
                  })),
                },
              },
            },
          },
        },
      },
    },
  });
  engine.commitRenderState(engine.selectRenderState());
  return engine;
};

const nextLine = (engine) => {
  engine.handleAction("markLineCompleted", {});
  engine.handleAction("nextLine", {});
  const renderState = engine.selectRenderState();
  engine.commitRenderState(renderState);
  return renderState;
};

describe("legacy BGM playback identity", () => {
  it.each([
    ["legacy to legacy", legacyBgm, legacyBgm],
    ["legacy to canonical", legacyBgm, canonicalBgm],
    ["canonical to legacy", canonicalBgm, legacyBgm],
    ["canonical to canonical", canonicalBgm, canonicalBgm],
  ])("retains identity across %s volume changes", (_, before, after) => {
    const engine = createEngine([{ bgm: before(80) }, { bgm: after(35) }]);
    const projectBefore = structuredClone(
      engine.selectSystemState().projectData,
    );

    expect(engine.selectRenderState().audio[0].children[0]).toMatchObject({
      id: "bgm:theme",
      src: "theme.ogg",
      volume: 80,
    });
    expect(nextLine(engine).audio[0].children[0]).toMatchObject({
      id: "bgm:theme",
      src: "theme.ogg",
      volume: 35,
    });
    expect(engine.selectSystemState().projectData).toEqual(projectBefore);
    expect(engine.selectPresentationState().bgm).toEqual(after(35));
  });

  it.each([
    ["legacy to converted default", legacyBgm, convertedLegacyBgm],
    ["converted default to legacy", convertedLegacyBgm, legacyBgm],
  ])("preserves the existing %s handoff", (_, before, after) => {
    const engine = createEngine([{ bgm: before(80) }, { bgm: after(35) }]);
    const previousId = engine.selectRenderState().audio[0].children[0].id;
    expect(nextLine(engine).audio[0].children[0].id).toBe(previousId);
  });

  it("targets an update effect at the retained legacy sound", () => {
    const updated = canonicalBgm(35);
    updated.audioEffects = { resourceId: "quieter" };
    const engine = createEngine([{ bgm: legacyBgm(80) }, { bgm: updated }]);

    const renderState = nextLine(engine);
    expect(renderState.audioEffects).toHaveLength(1);
    expect(renderState.audioEffects[0]).toMatchObject({
      targetId: "bgm:theme",
      properties: {
        volume: {
          update: { keyframes: [expect.objectContaining({ value: 35 })] },
        },
      },
    });
  });

  it("keeps the fallback stable when BGM is omitted, stopped, and restored", () => {
    const engine = createEngine([
      { bgm: legacyBgm(80) },
      {},
      { bgm: { sounds: [] } },
      { bgm: legacyBgm(35) },
    ]);

    expect(nextLine(engine).audio[0].children[0].id).toBe("bgm:theme");
    expect(nextLine(engine).audio).toEqual([]);
    expect(nextLine(engine).audio[0].children[0].id).toBe("bgm:theme");
  });

  it("restores legacy identity through save/load and rollback", () => {
    const engine = createEngine([
      { bgm: legacyBgm(80) },
      { bgm: canonicalBgm(35) },
    ]);
    engine.handleAction("saveSlot", { slotId: "legacy", savedAt: 1 });
    nextLine(engine);
    engine.handleAction("loadSlot", { slotId: "legacy" });
    expect(engine.selectRenderState().audio[0].children[0]).toMatchObject({
      id: "bgm:theme",
      volume: 80,
    });
    expect(engine.selectPresentationState().bgm).toEqual(legacyBgm(80));
    engine.commitRenderState(engine.selectRenderState());
    nextLine(engine);
    engine.handleAction("rollbackToLine", {
      sectionId: "section",
      lineId: "line-0",
    });
    expect(engine.selectRenderState().audio[0].children[0]).toMatchObject({
      id: "bgm:theme",
      volume: 80,
    });
  });

  it("uses different identities for different resources", () => {
    const engine = createEngine([
      { bgm: legacyBgm(80) },
      { bgm: { resourceId: "other", volume: 80 } },
    ]);
    expect(nextLine(engine).audio[0].children[0]).toMatchObject({
      id: "bgm:other",
      src: "other.ogg",
    });
  });

  it("escapes legacy resource IDs without collisions", () => {
    const engine = createEngine([
      { bgm: { resourceId: "theme:mix%" } },
      { bgm: { sounds: [{ id: "theme:mix%", resourceId: "theme:mix%" }] } },
      { bgm: { resourceId: "theme%3Amix%" } },
    ]);
    expect(engine.selectRenderState().audio[0].children[0].id).toBe(
      "bgm:theme%3Amix%25",
    );
    expect(nextLine(engine).audio[0].children[0].id).toBe("bgm:theme%3Amix%25");
    expect(nextLine(engine).audio[0].children[0].id).toBe(
      "bgm:theme%253Amix%25",
    );
  });

  it("preserves explicit IDs and simultaneous occurrences of the same resource", () => {
    const ids = ["default", "custom", "theme", "theme-2"];
    const engine = createEngine([
      {
        bgm: { sounds: ids.map((id) => ({ id, resourceId: "theme" })) },
      },
    ]);
    expect(
      engine.selectRenderState().audio[0].children.map(({ id }) => id),
    ).toEqual(ids.map((id) => `bgm:${id}`));
  });
});
