import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import { createSystemStore } from "../src/stores/system.store.js";

const createProjectData = (variables = {}, storyOverride = {}) => ({
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
    variables,
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
            lines: [{ id: "line1", actions: {} }],
          },
        },
      },
    },
    ...storyOverride,
  },
});

describe("RouteEngine runtime", () => {
  it("uses runtime defaults and keeps variables storage separate", () => {
    const store = createSystemStore({
      projectData: createProjectData(),
    });

    const runtime = store.selectRuntime();
    const state = store.selectSystemState();

    expect(runtime.dialogueTextSpeed).toBe(50);
    expect(runtime.autoForwardDelay).toBe(1000);
    expect(runtime.muteAll).toBe(false);
    expect(runtime.saveLoadPagination).toBe(1);
    expect(state.global.dialogueTextSpeed).toBe(50);
    expect(state.global.autoForwardDelay).toBe(1000);
    expect(state.global.muteAll).toBe(false);
    expect(state.global.variables).toEqual({});
    expect(state.contexts[0].runtime).toBeUndefined();
  });

  it("updates runtime through explicit actions and queues runtime persistence", () => {
    const store = createSystemStore({
      projectData: createProjectData(),
    });

    store.setDialogueTextSpeed({ value: 84 });

    expect(store.selectRuntime().dialogueTextSpeed).toBe(84);
    expect(store.selectPendingEffects()).toEqual([
      {
        name: "saveGlobalRuntime",
        payload: {
          globalRuntime: {
            dialogueTextSpeed: 84,
            autoForwardDelay: 1000,
            skipUnseenText: false,
            skipTransitionsAndAnimations: false,
            soundVolume: 50,
            musicVolume: 50,
            muteAll: false,
          },
        },
      },
      {
        name: "render",
      },
    ]);
  });

  it("does not route updateVariable operations into runtime values", () => {
    const store = createSystemStore({
      projectData: createProjectData({
        dialogueTextSpeed: {
          type: "number",
          scope: "device",
          default: 50,
        },
        saveLoadPagination: {
          type: "number",
          scope: "context",
          default: 1,
        },
      }),
    });

    store.updateVariable({
      id: "regularVariables",
      operations: [
        {
          variableId: "dialogueTextSpeed",
          op: "set",
          value: 92,
        },
        {
          variableId: "saveLoadPagination",
          op: "set",
          value: 4,
        },
      ],
    });

    expect(store.selectRuntime()).toMatchObject({
      dialogueTextSpeed: 50,
      saveLoadPagination: 1,
    });
    expect(store.selectAllVariables()).toMatchObject({
      dialogueTextSpeed: 92,
      saveLoadPagination: 4,
    });
    expect(store.selectSystemState().global.variables).toEqual({
      dialogueTextSpeed: 92,
    });
    expect(store.selectSystemState().contexts[0].variables).toEqual({
      saveLoadPagination: 4,
    });
  });

  it("rejects undeclared internal-style variable ids", () => {
    const store = createSystemStore({
      projectData: createProjectData(),
    });

    expect(() =>
      store.updateVariable({
        id: "undeclaredInternalVariable",
        operations: [
          {
            variableId: "_internalRuntimeValue",
            op: "set",
            value: 92,
          },
        ],
      }),
    ).toThrowError(
      "Variable scope is required for variable: _internalRuntimeValue",
    );
  });

  it("renders runtime values into authored layout templates", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        global: {
          runtime: {
            dialogueTextSpeed: 77,
          },
        },
        projectData: createProjectData(
          {},
          {
            scenes: {
              scene1: {
                initialSectionId: "section1",
                sections: {
                  section1: {
                    lines: [
                      {
                        id: "line1",
                        actions: {
                          layout: {
                            resourceId: "runtimeHud",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        ),
      },
    });

    const projectData = engine.selectSystemState().projectData;
    projectData.resources.layouts.runtimeHud = {
      elements: [
        {
          id: "runtime-text",
          type: "text",
          content: "${runtime.dialogueTextSpeed}",
        },
      ],
    };

    engine.handleAction("updateProjectData", {
      projectData,
    });

    const renderState = engine.selectRenderState();
    const storyContainer = renderState.elements.find(
      (element) => element.id === "story",
    );
    const runtimeText = storyContainer.children.find(
      (element) => element.id === "layout-runtimeHud",
    );

    expect(runtimeText.children[0].content).toBe(77);
  });

  it("renders runtime-driven boolean action payloads into authored layouts", () => {
    const projectData = createProjectData(
      {},
      {
        scenes: {
          scene1: {
            initialSectionId: "section1",
            sections: {
              section1: {
                lines: [
                  {
                    id: "line1",
                    actions: {
                      layout: {
                        resourceId: "skipHud",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    );

    projectData.resources.layouts.skipHud = {
      elements: [
        {
          id: "skip-all-button",
          type: "text",
          content: "Skip All",
          click: {
            payload: {
              actions: {
                setSkipUnseenText: {
                  value: {
                    "$if runtime.skipUnseenText": false,
                    $else: true,
                  },
                },
              },
            },
          },
        },
      ],
    };

    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        global: {
          runtime: {
            skipUnseenText: false,
          },
        },
        projectData,
      },
    });

    let renderState = engine.selectRenderState();
    let storyContainer = renderState.elements.find(
      (element) => element.id === "story",
    );
    let layoutContainer = storyContainer.children.find(
      (element) => element.id === "layout-skipHud",
    );

    expect(
      layoutContainer.children[0].click.payload.actions.setSkipUnseenText.value,
    ).toBe(true);

    engine.handleAction("setSkipUnseenText", { value: true });

    renderState = engine.selectRenderState();
    storyContainer = renderState.elements.find((element) => element.id === "story");
    layoutContainer = storyContainer.children.find(
      (element) => element.id === "layout-skipHud",
    );

    expect(
      layoutContainer.children[0].click.payload.actions.setSkipUnseenText.value,
    ).toBe(false);
  });

  it("does not expose duplicate top-level runtime fields to authored layouts", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        global: {
          runtime: {
            dialogueTextSpeed: 77,
          },
        },
        projectData: createProjectData(
          {},
          {
            scenes: {
              scene1: {
                initialSectionId: "section1",
                sections: {
                  section1: {
                    lines: [
                      {
                        id: "line1",
                        actions: {
                          layout: {
                            resourceId: "runtimeHud",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        ),
      },
    });

    const projectData = engine.selectSystemState().projectData;
    projectData.resources.layouts.runtimeHud = {
      elements: [
        {
          id: "runtime-text",
          type: "text",
          content: "${textSpeed}",
        },
      ],
    };

    engine.handleAction("updateProjectData", {
      projectData,
    });

    const renderState = engine.selectRenderState();
    const storyContainer = renderState.elements.find(
      (element) => element.id === "story",
    );
    const runtimeText = storyContainer.children.find(
      (element) => element.id === "layout-runtimeHud",
    );

    expect(runtimeText.children[0].content).toBeUndefined();
  });

  it("filters unknown persisted runtime keys during initialization", () => {
    const store = createSystemStore({
      global: {
        runtime: {
          dialogueTextSpeed: 90,
          legacyRuntimeKey: 123,
        },
      },
      projectData: createProjectData(),
    });

    const state = store.selectSystemState();
    expect(state.global.dialogueTextSpeed).toBe(90);
    expect(state.global.legacyRuntimeKey).toBeUndefined();
  });

  it("rejects invalid persisted runtime value types during initialization", () => {
    expect(() =>
      createSystemStore({
        global: {
          runtime: {
            dialogueTextSpeed: "fast",
          },
        },
        projectData: createProjectData(),
      }),
    ).toThrowError("dialogueTextSpeed requires a finite numeric value");
  });
});
