import { describe, expect, it } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
  findRenderElement,
} from "./integration/helpers/createEngineIntegrationHarness.js";

const entryMediaActions = () => ({
  bgm: { resourceId: "theme", volume: 65 },
  sfx: {
    channels: [
      {
        id: "weather",
        applyMode: "persistent",
        volume: 70,
        sounds: [{ id: "rain", resourceId: "rain", loop: true }],
      },
    ],
  },
  background: { resourceId: "atmosphere", loop: true },
});

const createProjectData = ({
  destinationActions = {},
  withChoice = false,
} = {}) =>
  createIntegrationProject({
    initialSectionId: "source",
    resources: {
      layouts: withChoice
        ? {
            choiceLayout: {
              elements: [
                {
                  id: "choice-button",
                  type: "rect",
                  width: 300,
                  height: 80,
                  click: {
                    payload: {
                      actions: {
                        sectionTransition: { sectionId: "destination" },
                      },
                    },
                  },
                },
              ],
            },
          }
        : {},
      sounds: {
        theme: { fileId: "theme.mp3" },
        alternateTheme: { fileId: "alternate-theme.mp3" },
        rain: { fileId: "rain.ogg" },
        wind: { fileId: "wind.ogg" },
      },
      videos: {
        atmosphere: { fileId: "atmosphere.mp4", width: 1920, height: 1080 },
        ending: { fileId: "ending.mp4", width: 1920, height: 1080 },
      },
    },
    sections: {
      source: {
        lines: [
          {
            id: "source",
            actions: {
              ...entryMediaActions(),
              dialogue: {
                mode: "adv",
                content: [{ text: "Source dialogue" }],
              },
              ...(withChoice
                ? {
                    choice: {
                      resourceId: "choiceLayout",
                      items: [{ id: "continue", content: "Continue" }],
                    },
                  }
                : {}),
            },
          },
        ],
      },
      destination: {
        lines: [{ id: "destination", actions: destinationActions }],
      },
    },
  });

const createHarness = (options) =>
  createEngineIntegrationHarness({ projectData: createProjectData(options) });

const getAudioNode = (renderState, id) =>
  renderState.audio.find((node) => node.id === id);

const getVideoBackground = (renderState) =>
  renderState.elements[0].children.find((element) => element.type === "video");

const enterDestination = (harness, action = "sectionTransition") => {
  harness.engine.handleAction(action, { sectionId: "destination" });
  return harness.engine.selectRenderState();
};

const enterDestinationByChoice = async (harness) => {
  const button = findRenderElement(
    harness.renderStates.at(-1)?.elements,
    "choice-button",
  );

  await harness.eventHandler("click", button.click.payload);
  return harness.engine.selectRenderState();
};

const expectSameMediaRender = (actual, expected) => {
  expect(getAudioNode(actual, "channel:bgm")).toEqual(
    getAudioNode(expected, "channel:bgm"),
  );
  expect(getAudioNode(actual, "channel:sfx:weather")).toEqual(
    getAudioNode(expected, "channel:sfx:weather"),
  );
  expect(getVideoBackground(actual)).toEqual(getVideoBackground(expected));
};

const expectNoMedia = (renderState) => {
  expect(renderState.audio).toEqual([]);
  expect(getVideoBackground(renderState)).toBeUndefined();
};

describe("RouteEngine section presentation continuity", () => {
  it("continues identical entry media during a normal section transition", () => {
    const harness = createHarness({ destinationActions: entryMediaActions() });
    const before = harness.engine.selectRenderState();
    const after = enterDestination(harness);

    expectSameMediaRender(after, before);
    expect(after.dialogue).toBeUndefined();
  });

  it.each(["resetStoryAtSection", "choice click"])(
    "continues identical entry media through %s",
    async (entryPath) => {
      const harness = createHarness({
        destinationActions: entryMediaActions(),
        withChoice: entryPath === "choice click",
      });
      const before = harness.engine.selectRenderState();
      const after =
        entryPath === "choice click"
          ? await enterDestinationByChoice(harness)
          : enterDestination(harness, entryPath);

      expectSameMediaRender(after, before);
      expect(harness.getPointer()).toEqual({
        sectionId: "destination",
        lineId: "destination",
      });
    },
  );

  it.each(["sectionTransition", "resetStoryAtSection", "choice click"])(
    "stops source media omitted from the destination through %s",
    async (entryPath) => {
      const harness = createHarness({
        withChoice: entryPath === "choice click",
      });
      const after =
        entryPath === "choice click"
          ? await enterDestinationByChoice(harness)
          : enterDestination(harness, entryPath);

      expectNoMedia(after);
    },
  );

  it("switches to different BGM, persistent SFX, and video authored at entry", () => {
    const harness = createHarness({
      destinationActions: {
        bgm: { resourceId: "alternateTheme", volume: 65 },
        sfx: {
          channels: [
            {
              id: "weather",
              applyMode: "persistent",
              volume: 70,
              sounds: [{ id: "wind", resourceId: "wind", loop: true }],
            },
          ],
        },
        background: { resourceId: "ending", loop: true },
      },
    });

    const after = enterDestination(harness);

    expect(getAudioNode(after, "channel:bgm").children).toEqual([
      expect.objectContaining({
        id: "bgm:alternateTheme",
        src: "alternate-theme.mp3",
      }),
    ]);
    expect(getAudioNode(after, "channel:sfx:weather").children).toEqual([
      expect.objectContaining({ id: "sfx:weather:wind", src: "wind.ogg" }),
    ]);
    expect(getVideoBackground(after)).toMatchObject({ src: "ending.mp4" });
  });

  it("keeps authored BGM while omitted SFX channels and backgrounds stop", () => {
    const harness = createHarness({
      destinationActions: {
        bgm: { resourceId: "theme", volume: 65 },
        sfx: { channels: [] },
        background: {},
      },
    });
    const before = harness.engine.selectRenderState();

    const after = enterDestination(harness);

    expect(getAudioNode(after, "channel:bgm")).toEqual(
      getAudioNode(before, "channel:bgm"),
    );
    expect(getAudioNode(after, "channel:sfx:weather")).toBeUndefined();
    expect(getVideoBackground(after)).toBeUndefined();
  });

  it("retains identical authored media when loading a saved destination", () => {
    const harness = createHarness({ destinationActions: entryMediaActions() });
    const before = harness.engine.selectRenderState();

    enterDestination(harness);
    harness.engine.handleAction("saveSlot", { slotId: 1, savedAt: 1 });
    harness.engine.handleAction("sectionTransition", { sectionId: "source" });
    harness.engine.handleAction("loadSlot", { slotId: 1 });

    expectSameMediaRender(harness.engine.selectRenderState(), before);
    expect(harness.getPointer()).toMatchObject({
      sectionId: "destination",
      lineId: "destination",
    });
  });

  it("does not restore source media when loading a destination that omits it", () => {
    const harness = createHarness();

    enterDestination(harness);
    harness.engine.handleAction("saveSlot", { slotId: 1, savedAt: 1 });
    harness.engine.handleAction("sectionTransition", { sectionId: "source" });
    harness.engine.handleAction("loadSlot", { slotId: 1 });

    expectNoMedia(harness.engine.selectRenderState());
    expect(harness.getPointer()).toMatchObject({
      sectionId: "destination",
      lineId: "destination",
    });
  });
});
