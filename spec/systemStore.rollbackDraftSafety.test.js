import { describe, expect, it, vi } from "vitest";
import { produce } from "immer";
import {
  loadSaveSlot,
  rollbackByOffset,
  saveSaveSlot,
} from "../src/stores/system.store.js";

const createProjectData = () => ({
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            lines: [
              { id: "1" },
              {
                id: "2",
                actions: {
                  setNextLineConfig: {
                    manual: {
                      enabled: false,
                      requireLineCompleted: true,
                    },
                  },
                  updateVariable: {
                    id: "set-score-10",
                    operations: [
                      {
                        variableId: "score",
                        op: "set",
                        value: 10,
                      },
                    ],
                  },
                },
              },
              { id: "3" },
            ],
          },
          section2: {
            lines: [{ id: "10" }],
          },
        },
      },
    },
  },
  resources: {
    variables: {
      score: {
        type: "number",
        scope: "context",
        default: 0,
      },
    },
  },
});

describe("system.store rollback/save draft safety", () => {
  it("saveSaveSlot does not throw when cloning live draft state", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    const baseState = {
      global: {
        saveSlots: {},
        viewedRegistry: {
          sections: [{ sectionId: "section1", lastLineId: "2" }],
          resources: [],
        },
        pendingEffects: [],
      },
      projectData: createProjectData(),
      contexts: [
        {
          pointers: {
            read: { sectionId: "section1", lineId: "2" },
          },
          variables: {
            score: 10,
          },
          rollback: {
            currentIndex: 1,
            isRestoring: false,
            replayStartIndex: 0,
            baselineVariables: {
              score: 0,
            },
            timeline: [
              {
                sectionId: "section1",
                lineId: "1",
                rollbackPolicy: "free",
              },
              {
                sectionId: "section1",
                lineId: "2",
                rollbackPolicy: "free",
              },
            ],
          },
        },
      ],
    };

    const nextState = produce(baseState, (draft) => {
      saveSaveSlot({ state: draft }, { slot: 1, thumbnailImage: null });
    });

    expect(nextState.global.saveSlots["1"]?.state?.contexts?.[0]?.rollback)
      .toEqual(baseState.contexts[0].rollback);
    vi.restoreAllMocks();
  });

  it("loadSaveSlot does not throw when restoring slot state from a live draft", () => {
    const savedRollback = {
      currentIndex: 2,
      isRestoring: false,
      replayStartIndex: 0,
      baselineVariables: {
        score: 0,
      },
      timeline: [
        {
          sectionId: "section1",
          lineId: "1",
          rollbackPolicy: "free",
        },
        {
          sectionId: "section1",
          lineId: "2",
          rollbackPolicy: "free",
        },
        {
          sectionId: "section2",
          lineId: "10",
          rollbackPolicy: "free",
        },
      ],
    };

    const baseState = {
      global: {
        saveSlots: {
          "1": {
            slotKey: "1",
            date: 1700000000000,
            image: null,
            state: {
              viewedRegistry: {
                sections: [{ sectionId: "section2", lastLineId: "10" }],
                resources: [],
              },
              contexts: [
                {
                  pointers: {
                    read: { sectionId: "section2", lineId: "10" },
                  },
                  variables: {
                    score: 15,
                  },
                  rollback: savedRollback,
                },
              ],
            },
          },
        },
        viewedRegistry: {
          sections: [],
          resources: [],
        },
        pendingEffects: [],
      },
      contexts: [
        {
          pointers: {
            read: { sectionId: "section1", lineId: "1" },
          },
          variables: {
            score: 0,
          },
        },
      ],
    };

    const nextState = produce(baseState, (draft) => {
      loadSaveSlot({ state: draft }, { slot: 1 });
    });

    expect(nextState.contexts[0].rollback).toEqual(savedRollback);
    expect(nextState.global.viewedRegistry.sections[0]).toEqual({
      sectionId: "section2",
      lastLineId: "10",
    });
  });

  it("rollbackByOffset restores variables and current-line system state from a live draft", () => {
    const baseState = {
      projectData: createProjectData(),
      global: {
        isLineCompleted: false,
        dialogueUIHidden: false,
        isDialogueHistoryShowing: false,
        nextLineConfig: {
          manual: {
            enabled: true,
            requireLineCompleted: false,
          },
          auto: {
            enabled: false,
          },
          applyMode: "persistent",
        },
        layeredViews: [],
        pendingEffects: [],
      },
      contexts: [
        {
          variables: {
            score: 10,
          },
          currentPointerMode: "history",
          pointers: {
            read: { sectionId: "section1", lineId: "3" },
            history: {
              sectionId: "section2",
              lineId: "10",
              historySequenceIndex: 0,
            },
          },
          rollback: {
            currentIndex: 2,
            isRestoring: false,
            replayStartIndex: 0,
            baselineVariables: {
              score: 0,
            },
            timeline: [
              {
                sectionId: "section1",
                lineId: "1",
                rollbackPolicy: "free",
              },
              {
                sectionId: "section1",
                lineId: "2",
                rollbackPolicy: "free",
              },
              {
                sectionId: "section1",
                lineId: "3",
                rollbackPolicy: "free",
              },
            ],
          },
        },
      ],
    };

    const nextState = produce(baseState, (draft) => {
      rollbackByOffset({ state: draft }, { offset: -1 });
    });

    expect(nextState.contexts[0].variables.score).toBe(10);
    expect(nextState.contexts[0].pointers.read).toEqual({
      sectionId: "section1",
      lineId: "2",
    });
    expect(nextState.contexts[0].currentPointerMode).toBe("read");
    expect(nextState.global.nextLineConfig).toEqual({
      manual: {
        enabled: false,
        requireLineCompleted: true,
      },
      auto: {
        enabled: false,
      },
      applyMode: "persistent",
    });
  });
});
