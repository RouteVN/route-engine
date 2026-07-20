import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: {
    images: {
      chapterIcon: {
        fileId: "achievements/chapter.png",
        width: 512,
        height: 512,
      },
      endingsIcon: {
        fileId: "achievements/endings.png",
        width: 512,
        height: 512,
      },
    },
    achievements: {
      chapterComplete: {
        type: "boolean",
        name: "A New Beginning",
        description: "Complete the first chapter.",
        iconImageId: "chapterIcon",
      },
      discoverAllEndings: {
        type: "number",
        target: 5,
        name: "Every Road Travelled",
        description: "Discover every ending.",
        iconImageId: "endingsIcon",
      },
    },
    variables: {
      endingsFound: {
        type: "number",
        scope: "context",
        default: 3,
      },
    },
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

const createEngine = () => {
  const effects = [];
  const engine = createRouteEngine({
    handlePendingEffects: (pendingEffects) => {
      effects.push(...structuredClone(pendingEffects));
    },
  });

  engine.init({
    initialState: {
      projectData: createProjectData(),
    },
  });
  effects.length = 0;

  return { effects, engine };
};

describe("RouteEngine achievements", () => {
  it("returns cloned achievement definitions", () => {
    const { engine } = createEngine();

    const achievements = engine.selectAchievements();
    const achievement = engine.selectAchievement({
      resourceId: "chapterComplete",
    });

    achievements.chapterComplete.name = "Changed";
    achievement.description = "Changed";

    expect(engine.selectAchievement({ resourceId: "chapterComplete" })).toEqual(
      {
        type: "boolean",
        name: "A New Beginning",
        description: "Complete the first chapter.",
        iconImageId: "chapterIcon",
      },
    );
    expect(engine.selectAchievement({ resourceId: "missing" })).toBeUndefined();
  });

  it("emits ordered external effects without storing player state", () => {
    const { effects, engine } = createEngine();

    engine.handleActions({
      completeAchievement: {
        resourceId: "chapterComplete",
      },
      setAchievementProgress: {
        resourceId: "discoverAllEndings",
        current: 2,
      },
      showAchievements: {},
    });

    expect(effects).toEqual([
      {
        name: "completeAchievement",
        payload: { resourceId: "chapterComplete" },
      },
      {
        name: "setAchievementProgress",
        payload: {
          resourceId: "discoverAllEndings",
          current: 2,
          target: 5,
          completed: false,
        },
      },
      { name: "showAchievements" },
    ]);
    expect(engine.selectSystemState().global.achievements).toBeUndefined();
  });

  it("resolves authored progress templates", () => {
    const { effects, engine } = createEngine();

    engine.handleActions({
      setAchievementProgress: {
        resourceId: "discoverAllEndings",
        current: "${variables.endingsFound}",
      },
    });

    expect(effects).toEqual([
      {
        name: "setAchievementProgress",
        payload: {
          resourceId: "discoverAllEndings",
          current: 3,
          target: 5,
          completed: false,
        },
      },
    ]);
  });

  it("clamps progress at the target and marks it complete", () => {
    const { effects, engine } = createEngine();

    engine.handleAction("setAchievementProgress", {
      resourceId: "discoverAllEndings",
      current: 8,
    });

    expect(effects).toEqual([
      {
        name: "setAchievementProgress",
        payload: {
          resourceId: "discoverAllEndings",
          current: 5,
          target: 5,
          completed: true,
        },
      },
    ]);
  });

  it("rejects invalid achievement actions before emitting an effect", () => {
    const { effects, engine } = createEngine();

    expect(() =>
      engine.handleAction("completeAchievement", {
        resourceId: "missing",
      }),
    ).toThrow('Achievement resource "missing" not found');
    expect(() =>
      engine.handleAction("setAchievementProgress", {
        resourceId: "chapterComplete",
        current: 1,
      }),
    ).toThrow(
      'Achievement resource "chapterComplete" does not support numeric progress',
    );
    expect(() =>
      engine.handleAction("setAchievementProgress", {
        resourceId: "discoverAllEndings",
        current: 1.5,
      }),
    ).toThrow(
      'Achievement progress for "discoverAllEndings" must be a non-negative integer',
    );
    expect(effects).toEqual([]);
  });

  it("validates achievement image references during initialization", () => {
    const projectData = createProjectData();
    projectData.resources.achievements.chapterComplete.iconImageId = "missing";
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    expect(() =>
      engine.init({
        initialState: { projectData },
      }),
    ).toThrow(
      'Achievement "chapterComplete" has invalid iconImageId reference "missing"',
    );
  });
});
