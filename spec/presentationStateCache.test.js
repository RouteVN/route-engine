import { readFileSync } from "node:fs";
import { freeze, produce } from "immer";
import { loadAll } from "js-yaml";
import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";
import {
  selectPresentationState,
  selectPreviousPresentationState,
  selectCurrentLine,
  selectIsChoiceVisible,
  selectDialogueHistory,
} from "../src/stores/system.store.js";
import { normalizePersistentPresentationState } from "../src/util.js";

const at = (projectData, sectionId, lineId) => ({
  projectData,
  contexts: [{ pointers: { read: { sectionId, lineId } } }],
});

describe("presentation projection reuse", () => {
  it("preserves projection of a present empty-string line ID", () => {
    const projectData = freeze(
      {
        resources: {},
        story: {
          scenes: {
            scene: {
              sections: {
                main: {
                  lines: [
                    {
                      id: "",
                      actions: { dialogue: { content: [{ text: "first" }] } },
                    },
                    { id: "next", actions: {} },
                  ],
                },
              },
            },
          },
        },
      },
      true,
    );
    expect(
      selectPresentationState({ state: at(projectData, "main", "") }).dialogue
        .content[0].text,
    ).toBe("first");
    expect(
      selectPreviousPresentationState({ state: at(projectData, "main", "") }),
    ).toBeNull();
    expect(
      selectPreviousPresentationState({
        state: at(projectData, "main", "next"),
      }).dialogue.content[0].text,
    ).toBe("first");
  });

  it("indexes frozen line IDs once and limits choice reads to the current continuation", () => {
    let idReads = 0;
    let actionReads = 0;
    const lines = Array.from({ length: 500 }, (_, index) => ({
      get id() {
        idReads += 1;
        return String(index);
      },
      get actions() {
        actionReads += 1;
        return index === 498
          ? { choice: { resourceId: "choice" } }
          : index === 499
            ? { choice: { animations: {} } }
            : {};
      },
    }));
    const projectData = freeze(
      {
        resources: {},
        story: { scenes: { scene: { sections: { main: { lines } } } } },
      },
      true,
    );
    idReads = 0;
    actionReads = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const state = at(projectData, "main", String(index));
      expect(selectCurrentLine({ state })).toBe(lines[index]);
      expect(selectIsChoiceVisible({ state })).toBe(index >= 498);
    }
    expect(idReads).toBeLessThanOrEqual(lines.length * 2);
    expect(actionReads).toBe(501);
  });

  it("updates line lookups after mutable edits, draft edits, and committed reordering", () => {
    const state = at(
      {
        resources: {},
        story: {
          scenes: {
            scene: {
              sections: {
                main: {
                  lines: [
                    { id: "one", actions: {} },
                    { id: "two", actions: {} },
                  ],
                },
              },
            },
          },
        },
      },
      "main",
      "two",
    );
    expect(selectCurrentLine({ state }).id).toBe("two");
    state.projectData.story.scenes.scene.sections.main.lines[1].id = "three";
    expect(selectCurrentLine({ state })).toBeUndefined();
    const committed = freeze(state, true);
    const updated = produce(committed, (draft) => {
      draft.projectData.story.scenes.scene.sections.main.lines[0].id = "two";
      expect(selectCurrentLine({ state: draft }).id).toBe("two");
      draft.projectData.story.scenes.scene.sections.main.lines.reverse();
    });
    expect(selectCurrentLine({ state: updated }).id).toBe("two");
    expect(selectCurrentLine({ state: committed })).toBeUndefined();
  });

  it.each([
    "dialogue/nvl-mode.yaml",
    "dialogue/append-reveal-continuation.yaml",
    "character/sprite-parts-update.yaml",
    "visual/subject-replacement.yaml",
    "background/playback-persistent-transition-continuity.yaml",
    "audioChannels/sound-boundary-effects.yaml",
    "bgm/basic.yaml",
  ])(
    "preserves full-prefix projection for %s in either direction",
    (fixture) => {
      const projectData = freeze(
        loadAll(
          readFileSync(
            new URL(`../vt/specs/${fixture}`, import.meta.url),
            "utf8",
          ),
        ).at(-1),
        true,
      );
      for (const scene of Object.values(projectData.story.scenes)) {
        for (const [sectionId, section] of Object.entries(scene.sections)) {
          const indexes = section.lines.map((_, index) => index);
          for (const index of [...indexes, ...indexes.toReversed()]) {
            const state = at(projectData, sectionId, section.lines[index].id);
            const expected = constructPresentationState(
              section.lines
                .slice(0, index + 1)
                .map((line) => line.actions || {}),
              { resources: projectData.resources },
            );
            const previous =
              index === 0
                ? null
                : normalizePersistentPresentationState(
                    constructPresentationState(
                      section.lines
                        .slice(0, index)
                        .map((line) => line.actions || {}),
                      { resources: projectData.resources },
                    ),
                  );
            expect(selectPresentationState({ state })).toEqual(expected);
            expect(selectPreviousPresentationState({ state })).toEqual(
              previous,
            );
            const historyState = { ...state, global: { variables: {} } };
            expect(selectDialogueHistory({ state: historyState })).toEqual(
              selectDialogueHistory({
                state: {
                  ...historyState,
                  projectData: structuredClone(projectData),
                },
              }),
            );
          }
        }
      }
    },
  );

  it("reads each authored action once while progressing and querying the previous line", () => {
    let reads = 0;
    const lines = Array.from({ length: 500 }, (_, index) => ({
      id: String(index),
      get actions() {
        reads += 1;
        return {
          dialogue: { mode: "adv", content: [{ text: String(index) }] },
        };
      },
    }));
    const projectData = freeze(
      {
        resources: {},
        story: { scenes: { scene: { sections: { main: { lines } } } } },
      },
      true,
    );
    reads = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const state = at(projectData, "main", String(index));
      expect(selectPresentationState({ state }).dialogue.content[0].text).toBe(
        String(index),
      );
      selectPreviousPresentationState({ state });
      selectPresentationState({ state });
    }
    expect(reads).toBe(500);

    // An older cursor outside the small recent-state window must still work.
    const old = at(projectData, "main", "300");
    expect(
      selectPresentationState({ state: old }).dialogue.content[0].text,
    ).toBe("300");
    expect(
      selectPreviousPresentationState({ state: old }).dialogue.content[0].text,
    ).toBe("299");
    expect(reads - 500).toBeLessThanOrEqual(64);
  });

  it("reuses authored backlog projections while advancing and after changing the cursor", () => {
    let reads = 0;
    const lines = Array.from({ length: 500 }, (_, index) => ({
      id: String(index),
      get actions() {
        reads += 1;
        return { dialogue: { content: [{ text: String(index) }] } };
      },
    }));
    const projectData = freeze(
      {
        resources: {},
        story: { scenes: { scene: { sections: { main: { lines } } } } },
      },
      true,
    );
    reads = 0;
    for (const index of [...lines.keys(), 20, 400, 499]) {
      const state = {
        ...at(projectData, "main", String(index)),
        global: { variables: {} },
      };
      const history = selectDialogueHistory({ state });
      expect(history).toHaveLength(index + 1);
      expect(history.at(-1).text).toBe(String(index));
    }
    expect(reads).toBe(500);
  });

  it("refreshes backlog names and project edits without leaking an aborted draft", () => {
    const state = freeze(
      {
        ...at(
          {
            resources: {
              characters: { hero: { nameVariableId: "name" } },
              variables: {
                name: { type: "string", scope: "context", default: "" },
              },
            },
            story: {
              scenes: {
                scene: {
                  sections: {
                    main: {
                      lines: [
                        {
                          id: "one",
                          actions: {
                            dialogue: {
                              characterId: "hero",
                              content: [{ text: "original" }],
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          "main",
          "one",
        ),
        global: { variables: { name: "Alpha" } },
      },
      true,
    );
    expect(selectDialogueHistory({ state })[0].characterName).toBe("Alpha");
    const renamed = produce(state, (draft) => {
      draft.global.variables.name = "Beta";
    });
    expect(renamed.projectData).toBe(state.projectData);
    expect(selectDialogueHistory({ state: renamed })[0].characterName).toBe(
      "Beta",
    );
    expect(() =>
      produce(state, (draft) => {
        draft.projectData.story.scenes.scene.sections.main.lines[0].actions.dialogue.content[0].text =
          "aborted";
        expect(selectDialogueHistory({ state: draft })[0].text).toBe("aborted");
        throw new Error("abort");
      }),
    ).toThrow("abort");
    expect(selectDialogueHistory({ state })[0].text).toBe("original");
    const updated = produce(state, (draft) => {
      draft.projectData.story.scenes.scene.sections.main.lines[0].actions.dialogue.content[0].text =
        "updated";
      delete draft.projectData.resources.characters.hero.nameVariableId;
      draft.projectData.resources.characters.hero.name = "Gamma";
    });
    expect(selectDialogueHistory({ state: updated })[0]).toMatchObject({
      text: "updated",
      characterName: "Gamma",
    });
  });

  it("does not cache mutable input or leak modified drafts into committed projections", () => {
    const projectData = {
      resources: {},
      story: {
        scenes: {
          scene: {
            sections: {
              main: {
                lines: [
                  {
                    id: "line",
                    actions: { dialogue: { content: [{ text: "original" }] } },
                  },
                ],
              },
            },
          },
        },
      },
    };
    const mutable = at(projectData, "main", "line");
    expect(
      selectPresentationState({ state: mutable }).dialogue.content[0].text,
    ).toBe("original");
    mutable.projectData.story.scenes.scene.sections.main.lines[0].actions = {
      dialogue: { content: [{ text: "updated" }] },
    };
    expect(
      selectPresentationState({ state: mutable }).dialogue.content[0].text,
    ).toBe("updated");

    const committed = freeze(mutable, true);
    expect(
      selectPresentationState({ state: committed }).dialogue.content[0].text,
    ).toBe("updated");
    expect(() =>
      produce(committed, (draft) => {
        draft.projectData.story.scenes.scene.sections.main.lines[0].actions.dialogue.content[0].text =
          "aborted";
        expect(
          selectPresentationState({ state: draft }).dialogue.content[0].text,
        ).toBe("aborted");
        throw new Error("abort update");
      }),
    ).toThrow("abort update");
    expect(
      selectPresentationState({ state: committed }).dialogue.content[0].text,
    ).toBe("updated");

    const replaced = produce(committed, (draft) => {
      draft.projectData.story.scenes.scene.sections.main.lines[0].actions.dialogue.content[0].text =
        "replacement";
    });
    expect(
      selectPresentationState({ state: replaced }).dialogue.content[0].text,
    ).toBe("replacement");
    expect(
      selectPresentationState({ state: committed }).dialogue.content[0].text,
    ).toBe("updated");
  });

  it("returns detached previous state and rebuilds evicted sections correctly", () => {
    const sections = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        String(index),
        {
          lines: [
            {
              id: "one",
              actions: {
                dialogue: { mode: "adv", content: [{ text: String(index) }] },
              },
            },
            {
              id: "two",
              actions: { dialogue: { content: [{ text: "second" }] } },
            },
          ],
        },
      ]),
    );
    const projectData = freeze(
      { resources: {}, story: { scenes: { scene: { sections } } } },
      true,
    );
    for (const sectionId of Object.keys(sections)) {
      const state = at(projectData, sectionId, "two");
      const previous = selectPreviousPresentationState({ state });
      previous.dialogue.content[0].text = "caller mutation";
      expect(
        selectPreviousPresentationState({ state }).dialogue.content[0].text,
      ).toBe(sectionId);
    }
    expect(
      selectPresentationState({ state: at(projectData, "0", "one") }).dialogue
        .content[0].text,
    ).toBe("0");
  });
});
