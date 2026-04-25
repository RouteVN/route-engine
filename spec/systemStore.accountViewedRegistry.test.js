import { describe, expect, it } from "vitest";
import {
  createInitialState,
  loadSlot,
  markLineCompleted,
  nextLine,
} from "../src/stores/system.store.js";

const createProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  },
  resources: {
    layouts: {},
    sounds: {},
    images: {},
    videos: {},
    sprites: {},
    spritesheets: {},
    characters: {},
    variables: {},
    transforms: {},
    sectionTransitions: {},
    animations: {},
    fonts: {},
    colors: {},
    textStyles: {},
    controls: {},
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            lines: [
              { id: "line1", actions: {} },
              { id: "line2", actions: {} },
              { id: "line3", actions: {} },
            ],
          },
        },
      },
    },
  },
});

const createReadySkipState = (global = {}) => {
  const state = createInitialState({
    projectData: createProjectData(),
    global,
  });
  state.global.isLineCompleted = true;
  state.global.skipMode = true;
  return state;
};

describe("account viewed registry", () => {
  it("uses account viewed state for skip-unseen gating", () => {
    const state = createReadySkipState({
      accountViewedRegistry: {
        sections: [{ sectionId: "section1", lastLineId: "line2" }],
        resources: [],
      },
    });
    state.global.viewedRegistry = {
      sections: [],
      resources: [],
    };

    nextLine({ state }, {});

    expect(state.contexts[0].pointers.read).toMatchObject({
      sectionId: "section1",
      lineId: "line2",
    });
    expect(state.global.skipMode).toBe(true);
  });

  it("does not let slot viewed state bypass skip-unseen gating", () => {
    const state = createReadySkipState({
      accountViewedRegistry: {
        sections: [],
        resources: [],
      },
    });
    state.global.viewedRegistry = {
      sections: [{ sectionId: "section1", lastLineId: "line2" }],
      resources: [],
    };

    nextLine({ state }, {});

    expect(state.contexts[0].pointers.read).toMatchObject({
      sectionId: "section1",
      lineId: "line1",
    });
    expect(state.global.skipMode).toBe(false);
  });

  it("persists account viewed updates when a line is completed", () => {
    const state = createInitialState({
      projectData: createProjectData(),
    });

    markLineCompleted({ state });

    expect(state.global.accountViewedRegistry).toEqual({
      sections: [{ sectionId: "section1", lastLineId: "line1" }],
      resources: [],
    });
    expect(state.global.pendingEffects).toContainEqual({
      name: "applyScopedDataUpdates",
      payload: {
        updates: [
          {
            scope: "account",
            path: "viewedRegistry",
            op: "markViewed",
            value: {
              sections: [{ sectionId: "section1", lineId: "line1" }],
              resources: [],
            },
          },
        ],
      },
    });
  });

  it("queues incremental account viewed updates", () => {
    const state = createInitialState({
      projectData: createProjectData(),
      global: {
        accountViewedRegistry: {
          sections: [{ sectionId: "section1", lastLineId: "line1" }],
          resources: [],
        },
      },
    });
    state.global.isLineCompleted = true;
    state.contexts[0].pointers.read = {
      sectionId: "section1",
      lineId: "line2",
    };

    nextLine({ state }, {});

    expect(state.global.accountViewedRegistry).toEqual({
      sections: [{ sectionId: "section1", lastLineId: "line2" }],
      resources: [],
    });
    expect(state.global.pendingEffects).toContainEqual({
      name: "applyScopedDataUpdates",
      payload: {
        updates: [
          {
            scope: "account",
            path: "viewedRegistry",
            op: "markViewed",
            value: {
              sections: [{ sectionId: "section1", lineId: "line2" }],
              resources: [],
            },
          },
        ],
      },
    });
  });

  it("drops obsolete slot viewed state instead of merging it into account viewed state", () => {
    const state = createInitialState({
      projectData: createProjectData(),
      global: {
        accountViewedRegistry: {
          sections: [{ sectionId: "section1", lastLineId: "line3" }],
          resources: [{ resourceId: "account-cg" }],
        },
        saveSlots: {
          1: {
            formatVersion: 1,
            slotId: 1,
            savedAt: 1700000000000,
            state: {
              viewedRegistry: {
                sections: [{ sectionId: "section1", lastLineId: "line1" }],
                resources: [{ resourceId: "slot-cg" }],
              },
              contexts: [
                {
                  currentPointerMode: "read",
                  pointers: {
                    read: {
                      sectionId: "section1",
                      lineId: "line2",
                    },
                  },
                  configuration: {},
                  views: [],
                  bgm: {},
                  variables: {},
                  rollback: {
                    currentIndex: 1,
                    isRestoring: false,
                    replayStartIndex: 0,
                    timeline: [
                      {
                        sectionId: "section1",
                        lineId: "line1",
                        rollbackPolicy: "free",
                      },
                      {
                        sectionId: "section1",
                        lineId: "line2",
                        rollbackPolicy: "free",
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    });

    loadSlot({ state }, { slotId: 1 });

    expect(state.global.accountViewedRegistry).toEqual({
      sections: [{ sectionId: "section1", lastLineId: "line3" }],
      resources: [{ resourceId: "account-cg" }],
    });
    expect(state.global.viewedRegistry).toEqual({
      sections: [],
      resources: [],
    });
    expect(state.global.saveSlots["1"].state.viewedRegistry).toBeUndefined();
    expect(state.global.pendingEffects).not.toContainEqual(
      expect.objectContaining({ name: "applyScopedDataUpdates" }),
    );
  });
});
