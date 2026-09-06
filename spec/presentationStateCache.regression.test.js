import { readFileSync } from "node:fs";
import { freeze, produce } from "immer";
import { loadAll } from "js-yaml";
import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";
import {
  selectPresentationState,
  selectPreviousPresentationState,
  selectDialogueHistory,
  selectIsChoiceVisible,
} from "../src/stores/system.store.js";
import { normalizePersistentPresentationState } from "../src/util.js";

const load = (name) =>
  loadAll(
    readFileSync(new URL(`../vt/specs/${name}.yaml`, import.meta.url), "utf8"),
  ).at(-1);
const at = (projectData, lineId, sectionId = "main") => ({
  projectData,
  global: { variables: {} },
  contexts: [{ pointers: { read: { sectionId, lineId } }, variables: {} }],
});
const project = (lines, resources = {}) => ({
  resources,
  story: { scenes: { scene: { sections: { main: { lines } } } } },
});
const reference = (projectData, index) =>
  constructPresentationState(
    projectData.story.scenes.scene.sections.main.lines
      .slice(0, index + 1)
      .map((line) => line.actions),
    { resources: projectData.resources },
  );
const random = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};

describe("presentation cache regression boundaries", () => {
  it.each([
    "dialogue/append-reveal-continuation",
    "dialogue/nvl-mode",
    "background/playback-persistent-transition-continuity",
    "audioChannels/sound-boundary-effects",
  ])("preserves %s across cold jumps and checkpoint eviction", (name) => {
    const fixture = load(name);
    const authored = Object.values(fixture.story.scenes).flatMap((scene) =>
      Object.values(scene.sections).flatMap((section) => section.lines),
    );
    const lines = Array.from({ length: 1153 }, (_, index) => ({
      id: String(index),
      actions: structuredClone(authored[index % authored.length].actions),
    }));
    const data = freeze(project(lines, fixture.resources), true);
    // Fill past the checkpoint retention window, then read both sides of old
    // and recent boundaries, including a cold jump to the end of the section.
    for (const index of [
      1152, 0, 63, 64, 62, 65, 1023, 1024, 1022, 127, 128, 1151,
    ]) {
      const state = at(data, String(index));
      expect(selectPresentationState({ state }), `current ${index}`).toEqual(
        reference(data, index),
      );
      expect(
        selectPreviousPresentationState({ state }),
        `previous ${index}`,
      ).toEqual(
        index === 0
          ? null
          : normalizePersistentPresentationState(reference(data, index - 1)),
      );
    }
  });

  it.each([7, 41, 20260906])(
    "matches a fresh projection for mixed actions and shuffled reads (seed %i)",
    (seed) => {
      const next = random(seed);
      const actions = [
        {},
        { cleanAll: true },
        { dialogue: { mode: "adv", content: [{ text: "ADV" }] } },
        { dialogue: { append: true, content: [{ text: " + tail" }] } },
        { dialogue: { mode: "nvl", content: [{ text: "NVL" }] } },
        { dialogue: { clearPage: true, content: [{ text: "Fresh page" }] } },
        { choice: { resourceId: "choice" } },
        { choice: { animations: {} } },
        { choice: {} },
        { background: { colorId: "background", opacity: 0.5 } },
      ];
      const data = freeze(
        project(
          Array.from({ length: 192 }, (_, index) => ({
            id: String(index),
            actions: structuredClone(actions[next() % actions.length]),
          })),
        ),
        true,
      );
      for (let iteration = 0; iteration < 35; iteration += 1) {
        const index = next() % 192;
        const state = at(data, String(index));
        expect(selectPresentationState({ state })).toEqual(
          reference(data, index),
        );
        expect(selectIsChoiceVisible({ state })).toBe(
          !!reference(data, index).choice?.resourceId,
        );
      }
    },
  );

  it("invalidates audio endpoints after a resource-only edit with the same story object", () => {
    const data = freeze(
      project(
        [
          {
            id: "start",
            actions: {
              bgm: {
                volume: 80,
                sounds: [{ id: "main", resourceId: "theme" }],
              },
            },
          },
          {
            id: "end",
            actions: {
              bgm: {
                audioEffects: { resourceId: "quieter" },
                sounds: [{ id: "main", resourceId: "theme" }],
              },
            },
          },
        ],
        {
          sounds: { theme: { fileId: "theme.ogg" } },
          audioEffects: {
            quieter: {
              type: "update",
              tween: { volume: { keyframes: [{ value: 20, duration: 100 }] } },
            },
          },
        },
      ),
      true,
    );
    const before = selectPresentationState({ state: at(data, "end") });
    const updated = produce(data, (draft) => {
      draft.resources.audioEffects.quieter.tween.volume.keyframes[0].value = 45;
    });
    expect(updated.story).toBe(data.story);
    const after = selectPresentationState({ state: at(updated, "end") });
    expect(after).toEqual(reference(updated, 1));
    expect(after.bgm).not.toEqual(before.bgm);
    expect(selectPresentationState({ state: at(data, "end") })).toEqual(before);
  });

  it("rebuilds out-of-order durable history after more than eight section caches are used", () => {
    const sections = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `section-${index}`,
        {
          lines: [
            {
              id: "start",
              actions: {
                dialogue: {
                  mode: "adv",
                  content: [{ text: `Section ${index}` }],
                },
              },
            },
            {
              id: "append",
              actions: {
                dialogue: { append: true, content: [{ text: " + tail" }] },
              },
            },
          ],
        },
      ]),
    );
    const data = freeze(
      { resources: {}, story: { scenes: { scene: { sections } } } },
      true,
    );
    const state = at(data, "append", "section-0");
    state.contexts[0].dialogueHistory = {
      entries: [
        ...Object.keys(sections)
          .toReversed()
          .flatMap((sectionId) => [
            { sectionId, lineId: "start" },
            { sectionId, lineId: "append", appendToPrevious: true },
          ]),
        { sectionId: "section-0", lineId: "append", appendToPrevious: false },
      ],
      currentLength: 25,
      checkpointLengths: [],
    };
    for (const length of [25, 3, 24, 1, 25]) {
      state.contexts[0].dialogueHistory.currentLength = length;
      const actual = selectDialogueHistory({ state });
      expect(actual).toEqual(
        selectDialogueHistory({
          state: { ...state, projectData: structuredClone(data) },
        }),
      );
      if (length === 25) {
        expect(actual).toHaveLength(13);
        expect(actual[0].text).toBe("Section 11 + tail");
        expect(actual.at(-1).text).toBe("Section 0 + tail");
      }
    }
  });

  it("keeps separate frozen projects with identical line IDs isolated", () => {
    const first = freeze(
      project([
        {
          id: "same",
          actions: { dialogue: { content: [{ text: "First project" }] } },
        },
      ]),
      true,
    );
    const second = freeze(
      project([
        {
          id: "same",
          actions: { dialogue: { content: [{ text: "Second project" }] } },
        },
      ]),
      true,
    );
    for (let iteration = 0; iteration < 4; iteration += 1) {
      expect(
        selectPresentationState({ state: at(first, "same") }).dialogue
          .content[0].text,
      ).toBe("First project");
      expect(selectDialogueHistory({ state: at(second, "same") })[0].text).toBe(
        "Second project",
      );
      expect(
        selectPresentationState({ state: at(second, "same") }).dialogue
          .content[0].text,
      ).toBe("Second project");
      expect(selectDialogueHistory({ state: at(first, "same") })[0].text).toBe(
        "First project",
      );
    }
  });
});
