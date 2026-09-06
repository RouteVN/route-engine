import { readFileSync } from "node:fs";
import { freeze, produce } from "immer";
import { loadAll } from "js-yaml";
import { describe, expect, it, vi } from "vitest";
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
    { rows: 512, warm: false },
    { rows: 2048, warm: false },
    { rows: 512, warm: true },
    { rows: 2048, warm: true },
  ])(
    "bounds NVL page finalization for a $rows-row jump (warm: $warm)",
    ({ rows, warm }) => {
      const data = freeze(
        project(
          Array.from({ length: rows + 1 }, (_, index) => ({
            id: String(index),
            actions: {
              dialogue: {
                mode: "nvl",
                content: [{ text: `NVL row ${index}` }],
              },
            },
          })),
        ),
        true,
      );
      const before = warm
        ? selectPresentationState({ state: at(data, "63") })
        : null;
      const expected = reference(data, rows - 1);
      const expectedPrevious = normalizePersistentPresentationState(
        reference(data, rows - 2),
      );

      // Each finalized NVL array copies/freezes its accumulated rows. Count that
      // work rather than timing it: one transaction per row costs N * (N + 1) / 2.
      const freezeObject = Object.freeze;
      let finalizedRows = 0;
      const freezeSpy = vi
        .spyOn(Object, "freeze")
        .mockImplementation((value) => {
          if (
            Array.isArray(value) &&
            value[0]?.content?.[0]?.text === "NVL row 0"
          ) {
            finalizedRows += value.length;
          }
          return freezeObject(value);
        });
      let actual;
      let previous;
      try {
        const state = at(data, String(rows - 1));
        actual = selectPresentationState({ state });
        previous = selectPreviousPresentationState({ state });
      } finally {
        freezeSpy.mockRestore();
      }

      expect(actual).toEqual(expected);
      expect(previous).toEqual(expectedPrevious);
      expect(finalizedRows).toBeGreaterThanOrEqual(rows);
      expect(finalizedRows).toBeLessThanOrEqual(rows * 4);
      if (before) expect(before.dialogue.lines).toHaveLength(64);
      expect(
        selectPresentationState({ state: at(data, String(rows)) }).dialogue
          .lines,
      ).toHaveLength(rows + 1);
      expect(actual.dialogue.lines).toHaveLength(rows);
    },
  );

  it.each([false, true])(
    "projects each history section once per query despite repeated eviction (frozen: %s)",
    (immutable) => {
      let reads = 0;
      const sections = Object.fromEntries(
        Array.from({ length: 9 }, (_, sectionIndex) => [
          `section-${sectionIndex}`,
          {
            lines: Array.from({ length: 100 }, (_, lineIndex) => {
              const actions = {
                dialogue: {
                  mode: "adv",
                  content: [
                    { text: `Section ${sectionIndex}, line ${lineIndex}` },
                  ],
                },
              };
              return {
                id: String(lineIndex),
                get actions() {
                  reads += 1;
                  return actions;
                },
              };
            }),
          },
        ]),
      );
      const data = {
        resources: {},
        story: { scenes: { scene: { sections } } },
      };
      if (immutable) freeze(data, true);
      const state = at(data, "99", "section-8");
      const entries = Array.from({ length: 25 }, () =>
        Object.keys(sections).map((sectionId) => ({ sectionId, lineId: "99" })),
      ).flat();
      state.contexts[0].dialogueHistory = {
        entries,
        currentLength: entries.length,
        checkpointLengths: [],
      };
      const expectedTexts = Array.from({ length: 25 }, () =>
        Array.from({ length: 9 }, (_, index) => `Section ${index}, line 99`),
      ).flat();

      for (const query of ["cold", "repeat"]) {
        reads = 0;
        expect(
          selectDialogueHistory({ state }).map((entry) => entry.text),
        ).toEqual(expectedTexts);
        // A repeated frozen query reuses the eight retained sections and only
        // rebuilds the ninth. Mutable input must be evaluated again each call.
        expect(reads, query).toBe(immutable && query === "repeat" ? 100 : 900);
      }

      // The persistent cache must still evict the oldest section between calls.
      state.contexts[0].dialogueHistory = {
        entries: [{ sectionId: "section-0", lineId: "99" }],
        currentLength: 1,
        checkpointLengths: [],
      };
      if (!immutable) {
        sections["section-0"].lines[99] = {
          id: "99",
          get actions() {
            reads += 1;
            return { dialogue: { content: [{ text: "Edited" }] } };
          },
        };
      }
      reads = 0;
      expect(selectDialogueHistory({ state })[0].text).toBe(
        immutable ? "Section 0, line 99" : "Edited",
      );
      expect(reads).toBe(100);
    },
  );

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
    // Start with a cold jump, then visit enough checkpoint boundaries to
    // exceed retention and read both sides of old and recent boundaries.
    for (const index of [
      1152,
      ...Array.from({ length: 18 }, (_, index) => (index + 1) * 64 - 1),
      0,
      63,
      64,
      62,
      65,
      1023,
      1024,
      1022,
      127,
      128,
      1151,
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
