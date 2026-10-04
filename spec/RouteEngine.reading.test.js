import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const createProject = () => ({
  screen: { width: 1280, height: 720 },
  resources: {
    layouts: {
      dialogue: {
        elements: [
          {
            id: "body",
            type: "text-revealing",
            content: "${dialogue.content}",
            reading: "${dialogue.reading}",
            initialRevealedCharacters: "${dialogue.initialRevealedCharacters}",
          },
        ],
      },
    },
    characters: { hero: { name: "Hero", nameVariableId: "speaker" } },
    variables: {
      speaker: { type: "string", scope: "context", default: "結衣" },
      destination: { type: "string", scope: "context", default: "学校" },
    },
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    transforms: {},
    sectionTransitions: {},
    animations: {},
    fonts: {},
    colors: {},
    textStyles: {},
    controls: {},
  },
  story: {
    initialSceneId: "scene",
    scenes: {
      scene: {
        initialSectionId: "section",
        sections: {
          section: {
            lines: ["first", "second"].map((id) => ({
              id,
              actions: {
                dialogue: {
                  mode: "adv",
                  ui: { resourceId: "dialogue" },
                  characterId: "hero",
                  content: [
                    { text: "${variables.destination}", furigana: "がっこう" },
                    { text: "へ\n行く。" },
                  ],
                },
              },
            })),
          },
        },
      },
    },
  },
});

const createEngine = (projectData = createProject()) => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects(effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions")
          engine.handleLineActions(effect.payload);
      }
    },
  });
  engine.init({ initialState: { projectData } });
  return engine;
};

const readBody = (engine) =>
  engine
    .selectRenderState()
    .elements.find((element) => element.id === "story")
    .children.find((element) => element.id === "body");

describe("RouteEngine renderer reading metadata", () => {
  it("resolves exact styled base text and speaker through the authored reading template", () => {
    const engine = createEngine();
    const first = readBody(engine);
    expect(first.reading).toEqual({
      version: 1,
      occurrenceId: expect.any(String),
      sourceRevision: 0,
      role: "dialogue",
      speaker: "結衣",
      text: "学校へ\n行く。",
    });
    expect(first.content.map((part) => part.text).join("")).toBe(
      first.reading.text,
    );
    expect(first.content[0].furigana).toBe("がっこう");
    expect(readBody(engine).reading).toEqual(first.reading);
    engine.handleAction("markLineCompleted", {});
    expect(readBody(engine).reading).toEqual(first.reading);
    expect(engine.selectPresentationState().dialogue.reading).toBeUndefined();
  });

  it("revises sources when variables or speakers change without inventing new occurrences", () => {
    const engine = createEngine();
    const first = readBody(engine).reading;
    const replaceVariable = (variableId, value) =>
      engine.handleActions({
        updateVariable: {
          id: "replace",
          operations: [{ variableId, op: "set", value }],
        },
      });
    replaceVariable("destination", "図書館");
    const replacement = readBody(engine).reading;
    expect(replacement).toMatchObject({
      occurrenceId: first.occurrenceId,
      sourceRevision: 1,
      text: "図書館へ\n行く。",
    });
    replaceVariable("speaker", "葵");
    expect(readBody(engine).reading).toMatchObject({
      occurrenceId: first.occurrenceId,
      sourceRevision: 2,
      speaker: "葵",
    });
    replaceVariable("speaker", "");
    expect(readBody(engine).reading).toMatchObject({
      sourceRevision: 3,
      role: "narration",
      speaker: "",
    });
    expect(readBody(engine).reading.sourceRevision).toBe(3);
    expect(() => {
      replacement.text = "caller mutation";
    }).toThrow(TypeError);
    expect(readBody(engine).reading.text).toBe("図書館へ\n行く。");
  });

  it("distinguishes repeated identical playback and restored or restarted occurrences", () => {
    const projectData = createProject();
    const engine = createEngine(projectData);
    const occurrences = [readBody(engine).reading.occurrenceId];
    engine.handleAction("saveSlot", { slotId: 1, savedAt: 10 });
    engine.handleAction("markLineCompleted", {});
    engine.handleAction("nextLine", {});
    occurrences.push(readBody(engine).reading.occurrenceId);
    engine.handleAction("rollbackByOffset", { offset: -1 });
    occurrences.push(readBody(engine).reading.occurrenceId);
    engine.handleAction("loadSlot", { slotId: 1 });
    occurrences.push(readBody(engine).reading.occurrenceId);
    engine.handleAction("jumpToLine", { lineId: "first" });
    occurrences.push(readBody(engine).reading.occurrenceId);
    engine.handleAction("resetStoryAtSection", { sectionId: "section" });
    occurrences.push(readBody(engine).reading.occurrenceId);
    engine.init({ initialState: { projectData } });
    occurrences.push(readBody(engine).reading.occurrenceId);
    engine.dispose();
    engine.init({ initialState: { projectData } });
    occurrences.push(readBody(engine).reading.occurrenceId);
    occurrences.push(readBody(createEngine(projectData)).reading.occurrenceId);
    expect(new Set(occurrences).size).toBe(occurrences.length);
    expect(readBody(engine).reading).toMatchObject({
      sourceRevision: 0,
      text: "学校へ\n行く。",
    });
  });

  it.each(["empty", "oversized", "speaker", "nvl"])(
    "omits unsupported %s source instead of truncating authoritative text",
    (kind) => {
      const projectData = createProject();
      const dialogue =
        projectData.story.scenes.scene.sections.section.lines[0].actions
          .dialogue;
      if (kind === "empty") dialogue.content = [{ text: "" }];
      if (kind === "oversized")
        dialogue.content = [{ text: "字".repeat(4097) }];
      if (kind === "speaker")
        projectData.resources.variables.speaker.default = "名".repeat(241);
      if (kind === "nvl") dialogue.mode = "nvl";
      expect(readBody(createEngine(projectData)).reading).toBeUndefined();
    },
  );
});
