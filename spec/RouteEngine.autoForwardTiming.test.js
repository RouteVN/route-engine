import { describe, expect, it } from "vitest";
import { createSystemStore } from "../src/stores/system.store.js";

const createProjectData = (lines, variables = {}) => ({
  screen: {
    width: 1280,
    height: 720,
  },
  resources: {
    variables,
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            lines,
          },
        },
      },
    },
  },
});

const createStore = ({ lines, global } = {}) =>
  createSystemStore({
    global,
    projectData: createProjectData(
      lines ?? [
        {
          id: "line1",
          actions: {
            dialogue: {
              content: [{ text: "abcd" }],
            },
          },
        },
      ],
    ),
  });

const expectAutoTimerDelay = (store, delay) => {
  expect(store.selectPendingEffects()).toContainEqual({
    name: "startAutoNextTimer",
    payload: { delay },
  });
};

describe("RouteEngine auto-forward timing", () => {
  it("measures the current line after variable interpolation", () => {
    const store = createStore({
      global: {
        variables: {
          playerName: "Ada",
        },
      },
      lines: [
        {
          id: "line1",
          actions: {
            dialogue: {
              content: [{ text: "Hi ${variables.playerName}" }],
            },
          },
        },
      ],
    });

    // "Hi Ada" = 5 visible non-whitespace graphemes + 0.5 whitespace.
    expect(store.selectAutoForwardTimerDelay()).toBe(1330);
  });

  it("measures only content introduced by the current ADV append line", () => {
    const store = createStore({
      lines: [
        {
          id: "line1",
          actions: {
            dialogue: {
              mode: "adv",
              content: [{ text: "This earlier content must not be counted." }],
            },
          },
        },
        {
          id: "line2",
          actions: {
            dialogue: {
              append: true,
              content: [{ text: "Yo" }],
            },
          },
        },
      ],
    });

    store.markLineCompleted({});
    store.clearPendingEffects({});
    store.nextLine({});

    expect(store.selectAutoForwardTimerDelay()).toBe(1120);
  });

  it("measures only the dialogue introduced by the current NVL line", () => {
    const store = createStore({
      lines: [
        {
          id: "line1",
          actions: {
            dialogue: {
              mode: "nvl",
              content: [{ text: "An earlier NVL line is not counted." }],
            },
          },
        },
        {
          id: "line2",
          actions: {
            dialogue: {
              mode: "nvl",
              content: [{ text: "新" }],
            },
          },
        },
      ],
    });

    store.markLineCompleted({});
    store.clearPendingEffects({});
    store.nextLine({});

    expect(store.selectAutoForwardTimerDelay()).toBe(1180);
  });

  it("uses the base delay when the current line has no dialogue", () => {
    const store = createStore({
      lines: [
        {
          id: "line1",
          actions: {
            background: {
              colorId: "black",
            },
          },
        },
      ],
    });

    expect(store.selectAutoForwardTimerDelay()).toBe(1000);
  });

  it("uses weighted CJK timing", () => {
    const store = createStore({
      lines: [
        {
          id: "line1",
          actions: {
            dialogue: {
              content: [{ text: "你好世界" }],
            },
          },
        },
      ],
    });

    expect(store.selectAutoForwardTimerDelay()).toBe(1720);
  });

  it("uses the estimator after natural line completion", () => {
    const store = createStore();

    store.startAutoMode({});
    store.clearPendingEffects({});
    store.markLineCompleted({});

    expectAutoTimerDelay(store, 1240);
  });

  it("uses the estimator after manually completing a revealing line", () => {
    const store = createStore();

    store.startAutoMode({});
    store.clearPendingEffects({});
    store.nextLine({});

    expect(store.selectSystemState().global.isLineCompleted).toBe(true);
    expectAutoTimerDelay(store, 1240);
  });

  it("uses the estimator when auto starts on an already completed line", () => {
    const store = createStore();

    store.markLineCompleted({});
    store.clearPendingEffects({});
    store.startAutoMode({});

    expectAutoTimerDelay(store, 1240);
  });
});
