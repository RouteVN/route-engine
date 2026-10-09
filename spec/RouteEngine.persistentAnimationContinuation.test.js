import { afterEach, describe, expect, it, vi } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import createEffectsHandler from "../src/createEffectsHandler.js";

const createTicker = () => ({
  add: vi.fn(),
  remove: vi.fn(),
});

const createPersistence = () => ({
  saveSlots: vi.fn().mockResolvedValue(undefined),
  saveGlobalDeviceVariables: vi.fn().mockResolvedValue(undefined),
  saveGlobalAccountVariables: vi.fn().mockResolvedValue(undefined),
  saveGlobalRuntime: vi.fn().mockResolvedValue(undefined),
  applyScopedDataUpdates: vi.fn().mockResolvedValue(undefined),
});

const bodyText = (text) => ({
  mode: "adv",
  ui: { resourceId: "advDialogue" },
  content: [{ text }],
});

const persistentBackgroundAction = {
  resourceId: "bgDoor",
  animations: {
    resourceId: "opening",
    playback: { continuity: "persistent" },
  },
};

const createResources = ({ animation }) => ({
  layouts: {
    advDialogue: {
      mode: "adv",
      elements: [
        {
          id: "dialogue-text",
          type: "text",
          content: "${dialogue.content[0].text}",
          textStyleId: "body",
        },
      ],
    },
  },
  sounds: {},
  images: {
    bgDoor: { fileId: "bg-door.png", width: 1920, height: 1080 },
  },
  videos: {},
  sprites: {},
  characters: {},
  variables: {},
  transforms: {},
  sectionTransitions: {},
  animations: { opening: animation },
  fonts: { bodyFont: { fileId: "Arial" } },
  colors: { bodyColor: { hex: "#FFFFFF" } },
  textStyles: {
    body: {
      fontId: "bodyFont",
      colorId: "bodyColor",
      fontSize: 24,
      fontWeight: "400",
      fontStyle: "normal",
      lineHeight: 1.2,
    },
  },
  controls: {},
});

// The background carries the persistent animation; later lines only change the
// dialogue so the continuation has to survive a plain line change.
const createLineProjectData = ({ animation }) => ({
  screen: { width: 1920, height: 1080 },
  resources: createResources({ animation }),
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            name: "Section 1",
            lines: [
              {
                id: "line1",
                actions: {
                  background: persistentBackgroundAction,
                  dialogue: bodyText("Line 1 starts the long-running opening."),
                },
              },
              {
                id: "line2",
                actions: {
                  dialogue: bodyText("Line 2 keeps the inherited background."),
                },
              },
            ],
          },
        },
      },
    },
  },
});

// Crossing a section resets presentation state, so the persistent selection is
// authored on the section-entry line instead of on the line before it.
const createSectionProjectData = ({ animation }) => ({
  screen: { width: 1920, height: 1080 },
  resources: createResources({ animation }),
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            name: "Section 1",
            lines: [
              {
                id: "line1",
                actions: {
                  dialogue: bodyText("Line 1 leaves the first section."),
                },
              },
              {
                id: "line2",
                actions: {
                  sectionTransition: { sectionId: "section2" },
                  dialogue: bodyText("Line 2 crosses into the next section."),
                },
              },
            ],
          },
          section2: {
            name: "Section 2",
            lines: [
              {
                id: "line3",
                actions: {
                  background: persistentBackgroundAction,
                  dialogue: bodyText("Line 3 enters with the opening."),
                },
              },
              {
                id: "line4",
                actions: {
                  dialogue: bodyText("Line 4 keeps the inherited background."),
                },
              },
            ],
          },
        },
      },
    },
  },
});

const activeHarnesses = [];
afterEach(() => {
  activeHarnesses.splice(0).forEach(({ engine }) => engine.dispose());
  vi.restoreAllMocks();
});

// Date.now is controlled from before init so persistent sessions always start
// at t=0 and the assertions exercise the accounted duration, not wall time.
const createEngineAtTimeZero = (projectData) => {
  const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(0);
  const routeGraphics = { render: vi.fn() };
  let engine;
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics,
    ticker: createTicker(),
    persistence: createPersistence(),
  });
  engine = createRouteEngine({ handlePendingEffects: effectsHandler });
  engine.init({ initialState: { projectData } });
  const harness = {
    engine,
    effectsHandler,
    routeGraphics,
    setNow: (ms) => dateNowSpy.mockReturnValue(ms),
    lastRender: () => routeGraphics.render.mock.calls.at(-1)?.[0],
  };
  activeHarnesses.push(harness);
  return harness;
};

// A dialogue line needs one nextLine to complete and one to advance, matching
// the audit reproduction that exposed the dropped continuation.
const advanceLine = (harness) => {
  harness.engine.handleActions({ nextLine: {} });
  harness.engine.handleActions({ nextLine: {} });
};

describe("RouteEngine persistent animation continuation", () => {
  it.each([
    [
      "an auto-timed tween",
      "bg-cg-animation-update",
      {
        type: "update",
        tween: { alpha: { auto: { duration: 10000, delay: 500 } } },
      },
    ],
    [
      "a delayed keyframe tween",
      "bg-cg-animation-update",
      {
        type: "update",
        tween: {
          alpha: {
            keyframes: [
              { startValue: 0, value: 1, delay: 500, duration: 9500 },
            ],
          },
        },
      },
    ],
    [
      "a mask array transition",
      "bg-cg-animation-transition",
      {
        type: "transition",
        mask: [
          {
            kind: "single",
            texture: "mask-diagonal",
            progress: {
              keyframes: [{ value: 1, duration: 10000 }],
            },
          },
          {
            kind: "single",
            texture: "mask-diagonal",
            progress: {
              keyframes: [{ value: 1, delay: 250, duration: 9250 }],
            },
          },
        ],
      },
    ],
  ])(
    "continues %s 100ms after a line transition",
    (_label, expectedInstanceId, animation) => {
      const harness = createEngineAtTimeZero(
        createLineProjectData({ animation }),
      );

      expect(harness.lastRender().animations).toEqual([
        expect.objectContaining({ id: expectedInstanceId }),
      ]);

      harness.setNow(100);
      advanceLine(harness);

      expect(
        harness.engine.selectSystemState().contexts.at(-1).pointers.read.lineId,
      ).toBe("line2");
      expect(harness.lastRender().animations).toEqual([
        expect.objectContaining({
          playback: { continuity: "persistent" },
        }),
      ]);
    },
  );

  it("continues an auto-timed tween 100ms after a section transition", () => {
    const harness = createEngineAtTimeZero(
      createSectionProjectData({
        animation: {
          type: "update",
          tween: { alpha: { auto: { duration: 10000 } } },
        },
      }),
    );

    advanceLine(harness);
    expect(
      harness.engine.selectSystemState().contexts.at(-1).pointers.read,
    ).toEqual({ sectionId: "section2", lineId: "line3" });
    expect(harness.lastRender().animations).toEqual([
      expect.objectContaining({ id: "bg-cg-animation-update" }),
    ]);

    harness.setNow(100);
    advanceLine(harness);

    expect(
      harness.engine.selectSystemState().contexts.at(-1).pointers.read,
    ).toEqual({ sectionId: "section2", lineId: "line4" });
    expect(harness.lastRender().animations).toEqual([
      expect.objectContaining({
        id: "bg-cg-animation-update",
        playback: { continuity: "persistent" },
      }),
    ]);
  });

  it("drops the persistent animation once its accounted duration elapses", () => {
    const harness = createEngineAtTimeZero(
      createLineProjectData({
        animation: {
          type: "update",
          tween: { alpha: { auto: { duration: 10000, delay: 500 } } },
        },
      }),
    );

    harness.setNow(100);
    advanceLine(harness);
    expect(harness.lastRender().animations).toHaveLength(1);

    harness.setNow(10500);
    harness.engine.handleActions({ nextLine: {} });

    expect(harness.engine.selectRuntime().isLineCompleted).toBe(true);
    expect(harness.lastRender().animations).toEqual([]);
  });

  it("rejects a selected empty transition instead of reaching the renderer", () => {
    expect(() =>
      createEngineAtTimeZero(
        createLineProjectData({ animation: { type: "transition" } }),
      ),
    ).toThrow('of type "transition" must define prev, next, or mask.');
  });
});
