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
            mixed: { fileId: "mixed.ogg", volume: 40, pan: 0.25 },
            "theme:mix%": { fileId: "mix.ogg" },
            "theme%3Amix%": { fileId: "another-mix.ogg" },
          },
          audioEffects: {
            quieter: {
              type: "update",
              tween: { volume: { keyframes: [{ value: 35, duration: 250 }] } },
            },
            mix: {
              type: "update",
              tween: {
                volume: { keyframes: [{ value: 35, duration: 250 }] },
                pan: { keyframes: [{ value: 0.3, duration: 250 }] },
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
    ["legacy to converted default", legacyBgm, convertedLegacyBgm],
    ["converted default to legacy", convertedLegacyBgm, legacyBgm],
    ["converted default to canonical", convertedLegacyBgm, canonicalBgm],
    ["canonical to converted default", canonicalBgm, convertedLegacyBgm],
    [
      "converted default to converted default",
      convertedLegacyBgm,
      convertedLegacyBgm,
    ],
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
    ["canonical", canonicalBgm],
    ["converted default", convertedLegacyBgm],
  ])(
    "targets a %s update effect at the retained legacy sound",
    (_, makeBgm) => {
      const updated = makeBgm(35);
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
    },
  );

  it.each([
    ["sound overrides", { volume: 50, pan: -0.1 }, 17.5, 0.2],
    ["resource defaults", {}, 14, 0.55],
  ])(
    "uses %s when resolving effects for the default alias",
    (_, overrides, volume, pan) => {
      const sound = { id: "default", resourceId: "mixed", ...overrides };
      const engine = createEngine([
        { bgm: { volume: 80, sounds: [sound] } },
        {
          bgm: {
            volume: 35,
            pan: 0.3,
            sounds: [sound],
            audioEffects: { resourceId: "mix" },
          },
        },
      ]);

      const renderState = nextLine(engine);
      const renderedSound = renderState.audio[0].children[0];
      expect(renderedSound.id).toBe("bgm:mixed");
      expect(renderedSound.volume).toBeCloseTo(volume);
      expect(renderedSound.pan).toBeCloseTo(pan);
      expect(renderState.audioEffects).toHaveLength(1);
      expect(renderState.audioEffects[0]).toMatchObject({
        targetId: "bgm:mixed",
        properties: {
          volume: {
            update: {
              keyframes: [
                expect.objectContaining({ value: renderedSound.volume }),
              ],
            },
          },
          pan: {
            update: {
              keyframes: [
                expect.objectContaining({ value: renderedSound.pan }),
              ],
            },
          },
        },
      });
    },
  );

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

  it.each([
    ["legacy", legacyBgm],
    ["converted default", convertedLegacyBgm],
  ])("restores %s identity through save/load and rollback", (_, makeBgm) => {
    const engine = createEngine([
      { bgm: makeBgm(80) },
      { bgm: canonicalBgm(35) },
    ]);
    engine.handleAction("saveSlot", { slotId: "legacy", savedAt: 1 });
    nextLine(engine);
    engine.handleAction("loadSlot", { slotId: "legacy" });
    expect(engine.selectRenderState().audio[0].children[0]).toMatchObject({
      id: "bgm:theme",
      volume: 80,
    });
    expect(engine.selectPresentationState().bgm).toEqual(makeBgm(80));
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
      { bgm: { sounds: [{ id: "default", resourceId: "theme:mix%" }] } },
      { bgm: { resourceId: "theme%3Amix%" } },
    ]);
    expect(engine.selectRenderState().audio[0].children[0].id).toBe(
      "bgm:theme%3Amix%25",
    );
    expect(nextLine(engine).audio[0].children[0].id).toBe("bgm:theme%3Amix%25");
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

  it("does not alias other explicit single-clip IDs", () => {
    const engine = createEngine([
      { bgm: legacyBgm(80) },
      { bgm: { sounds: [{ id: "custom", resourceId: "theme" }] } },
    ]);
    expect(nextLine(engine).audio[0].children[0].id).toBe("bgm:custom");
  });

  it.each(["ambience", "theme"])(
    "retains both clip identities when adding and removing %s",
    (id) => {
      const theme = { id: "default", resourceId: "theme" };
      const companion = { id, resourceId: "other" };
      const engine = createEngine([
        { bgm: { sounds: [theme] } },
        { bgm: { sounds: [companion, theme] } },
        { bgm: { sounds: [companion] } },
        { bgm: { sounds: [theme, companion] } },
        { bgm: { sounds: [theme] } },
      ]);
      const originalId = engine.selectRenderState().audio[0].children[0].id;
      const added = nextLine(engine).audio[0].children;
      expect(added[1].id).toBe(originalId);
      expect(added[0].id).not.toBe(originalId);
      expect(nextLine(engine).audio[0].children[0].id).toBe(added[0].id);
      const restored = nextLine(engine).audio[0].children;
      expect(restored[1].id).toBe(added[0].id);
      expect(nextLine(engine).audio[0].children[0].id).toBe(restored[0].id);
    },
  );

  it.each(["ambience", "theme"])(
    "retains an initially simultaneous default clip when removing %s",
    (id) => {
      const theme = { id: "default", resourceId: "theme" };
      const engine = createEngine([
        { bgm: { sounds: [theme, { id, resourceId: "other" }] } },
        { bgm: { sounds: [theme] } },
        {
          bgm: {
            sounds: [theme],
            volume: 35,
            audioEffects: { resourceId: "quieter" },
          },
        },
      ]);
      const originalId = engine.selectRenderState().audio[0].children[0].id;
      expect(nextLine(engine).audio[0].children[0].id).toBe(originalId);
      expect(nextLine(engine).audioEffects[0].targetId).toBe(originalId);
    },
  );

  it.each(["theme", "default"])(
    "reschedules delayed %s playback when handing a looping channel to legacy BGM",
    (id) => {
      const engine = createEngine([
        {
          bgm: {
            loop: true,
            sounds: [{ id, resourceId: "theme", startDelayMs: 100 }],
          },
        },
        { bgm: { resourceId: "theme", startDelayMs: 100 } },
        { bgm: { resourceId: "theme", startDelayMs: 100, volume: 35 } },
      ]);
      const original = engine.selectRenderState().audio[0].children[0];
      const handoff = nextLine(engine).audio[0];
      expect(handoff.loop).toBeUndefined();
      expect(handoff.children[0]).toMatchObject({
        src: original.src,
        startDelayMs: 100,
        loop: true,
      });
      expect(handoff.children[0].id).not.toBe(original.id);
      expect(nextLine(engine).audio[0].children[0].id).toBe(
        handoff.children[0].id,
      );
    },
  );

  it("targets the local mixes of aliased clips sharing a resource after reordering", () => {
    const theme = { id: "default", resourceId: "mixed", volume: 50 };
    const companion = { id: "mixed", resourceId: "mixed", volume: 20 };
    const missing = { id: "missing", resourceId: "missing" };
    const engine = createEngine([
      { bgm: { sounds: [theme] } },
      { bgm: { sounds: [missing, companion, theme] } },
      {
        bgm: {
          sounds: [theme, missing, companion],
          volume: 35,
          audioEffects: { resourceId: "quieter" },
        },
      },
    ]);
    const added = nextLine(engine).audio[0].children;
    const updated = nextLine(engine);
    expect(updated.audio[0].children.map(({ id }) => id)).toEqual([
      added[1].id,
      added[0].id,
    ]);
    expect(updated.audioEffects.map(({ targetId }) => targetId)).toEqual([
      added[1].id,
      added[0].id,
    ]);
    expect(
      updated.audioEffects.map(
        (effect) => effect.properties.volume.update.keyframes[0].value,
      ),
    ).toEqual([17.5, 7]);
  });

  it("uses the committed alias when an intermediate membership render is discarded", () => {
    const theme = { id: "default", resourceId: "theme" };
    const companion = { id: "theme", resourceId: "other" };
    const engine = createEngine([
      { bgm: { sounds: [theme, companion] } },
      { bgm: { sounds: [companion] } },
      { bgm: { sounds: [theme] } },
    ]);
    const original = engine.selectRenderState().audio[0].children[0];
    engine.handleAction("jumpToLine", {
      sectionId: "section",
      lineId: "line-1",
    });
    engine.prepareRenderState();
    engine.handleAction("jumpToLine", {
      sectionId: "section",
      lineId: "line-2",
    });
    expect(engine.selectRenderState().audio[0].children[0].id).toBe(
      original.id,
    );
  });

  it("keeps new IDs unique after compatibility handoffs retain fallback IDs", () => {
    const memberships = [
      [
        ["theme", "theme"],
        ["default", "other"],
      ],
      [
        ["other", "theme"],
        ["default", "theme"],
      ],
      [
        ["theme", "theme"],
        ["other", "other"],
      ],
      [
        ["theme", "theme"],
        ["default", "other"],
      ],
      [
        ["theme", "theme"],
        ["other", "theme"],
        ["default", "theme"],
      ],
    ];
    const engine = createEngine(
      memberships.map((sounds) => ({
        bgm: { sounds: sounds.map(([id, resourceId]) => ({ id, resourceId })) },
      })),
    );
    let previous = engine.selectRenderState().audio[0].children;
    for (let i = 1; i < memberships.length; i++) {
      const children = nextLine(engine).audio[0].children;
      expect(new Set(children.map(({ id }) => id)).size).toBe(children.length);
      memberships[i].forEach(([id], index) => {
        const previousIndex = memberships[i - 1].findIndex(
          ([priorId]) => priorId === id,
        );
        if (previousIndex >= 0)
          expect(children[index].id).toBe(previous[previousIndex].id);
      });
      previous = children;
    }
  });
});
