import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import { createSystemStore } from "../src/stores/system.store.js";

const createProjectData = (variables = {}, storyOverride = {}) => ({
  screen: {
    width: 1920,
    height: 1080,
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
    expect(runtime.autoForwardSpeed).toBe(50);
    expect(runtime.muteAll).toBe(false);
    expect(runtime.localizationPackageId).toBeNull();
    expect(runtime.saveLoadPagination).toBe(1);
    expect(state.global.dialogueTextSpeed).toBe(50);
    expect(state.global.autoForwardDelay).toBe(1000);
    expect(state.global.autoForwardSpeed).toBe(50);
    expect(state.global.muteAll).toBe(false);
    expect(state.global.localizationPackageId).toBeNull();
    expect(state.global.variables).toEqual({});
    expect(state.contexts[0].runtime).toBeUndefined();
  });

  it("uses project-configured defaults for every configurable device preference", () => {
    const projectData = createProjectData();
    projectData.config = {
      runtimeDefaults: {
        dialogueTextSpeed: 72,
        autoForwardDelay: 1800,
        autoForwardSpeed: 65,
        skipUnseenText: true,
        skipTransitionsAndAnimations: true,
        soundVolume: 40,
        musicVolume: 35,
        muteAll: true,
      },
    };

    const store = createSystemStore({ projectData });

    expect(store.selectRuntime()).toMatchObject({
      dialogueTextSpeed: 72,
      autoForwardDelay: 1800,
      autoForwardSpeed: 65,
      skipUnseenText: true,
      skipTransitionsAndAnimations: true,
      soundVolume: 40,
      musicVolume: 35,
      muteAll: true,
      localizationPackageId: null,
      autoMode: false,
      skipMode: false,
    });
  });

  it("lets persisted device preferences override project defaults field by field", () => {
    const projectData = createProjectData();
    projectData.config = {
      runtimeDefaults: {
        dialogueTextSpeed: 72,
        autoForwardDelay: 1800,
        soundVolume: 40,
        musicVolume: 35,
      },
    };

    const store = createSystemStore({
      global: {
        runtime: {
          dialogueTextSpeed: 91,
          musicVolume: 80,
          localizationPackageId: "saved-package",
        },
      },
      projectData,
    });

    expect(store.selectRuntime()).toMatchObject({
      dialogueTextSpeed: 91,
      autoForwardDelay: 1800,
      soundVolume: 40,
      musicVolume: 80,
      localizationPackageId: "saved-package",
    });
  });

  it("persists the effective project defaults when a device preference changes", () => {
    const projectData = createProjectData();
    projectData.config = {
      runtimeDefaults: {
        autoForwardDelay: 1800,
        autoForwardSpeed: 65,
        soundVolume: 40,
        musicVolume: 35,
      },
    };
    const store = createSystemStore({ projectData });

    store.setMusicVolume({ value: 60 });

    expect(store.selectPendingEffects()[0]).toEqual({
      name: "saveGlobalRuntime",
      payload: {
        globalRuntime: {
          dialogueTextSpeed: 50,
          autoForwardDelay: 1800,
          autoForwardSpeed: 65,
          skipUnseenText: false,
          skipTransitionsAndAnimations: false,
          soundVolume: 40,
          musicVolume: 60,
          muteAll: false,
          localizationPackageId: null,
        },
      },
    });
  });

  it("does not reapply project defaults when project data is updated", () => {
    const initialProjectData = createProjectData();
    initialProjectData.config = {
      runtimeDefaults: {
        musicVolume: 25,
        skipUnseenText: true,
      },
    };
    const store = createSystemStore({ projectData: initialProjectData });
    store.setMusicVolume({ value: 70 });

    const replacementProjectData = createProjectData();
    replacementProjectData.config = {
      runtimeDefaults: {
        musicVolume: 5,
        skipUnseenText: false,
      },
    };
    store.updateProjectData({ projectData: replacementProjectData });

    expect(store.selectRuntime()).toMatchObject({
      musicVolume: 70,
      skipUnseenText: true,
    });
  });

  it("rejects invalid defaults on project update without changing state", () => {
    const store = createSystemStore({
      projectData: createProjectData(),
    });
    const stateBefore = store.selectSystemState();
    const replacementProjectData = createProjectData();
    replacementProjectData.config = {
      runtimeDefaults: {
        musicVolume: -1,
      },
    };

    expect(() =>
      store.updateProjectData({ projectData: replacementProjectData }),
    ).toThrowError("musicVolume requires a value between 0 and 100");
    expect(store.selectSystemState()).toEqual(stateBefore);
  });

  it.each([
    ["a non-object config", null, "projectData.config must be an object"],
    [
      "an unsupported config field",
      { theme: "dark" },
      'projectData.config contains unsupported field "theme"',
    ],
    [
      "non-object runtime defaults",
      { runtimeDefaults: [] },
      "projectData.config.runtimeDefaults must be an object",
    ],
    [
      "an unsupported runtime default",
      { runtimeDefaults: { autoMode: true } },
      'projectData.config.runtimeDefaults contains unsupported field "autoMode"',
    ],
    [
      "an invalid runtime default type",
      { runtimeDefaults: { skipUnseenText: "yes" } },
      "skipUnseenText requires a boolean value",
    ],
    [
      "an out-of-range runtime default",
      { runtimeDefaults: { soundVolume: 101 } },
      "soundVolume requires a value between 0 and 100",
    ],
  ])("rejects %s", (_description, config, error) => {
    const projectData = createProjectData();
    projectData.config = config;

    expect(() => createSystemStore({ projectData })).toThrowError(error);
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
            autoForwardSpeed: 50,
            skipUnseenText: false,
            skipTransitionsAndAnimations: false,
            soundVolume: 50,
            musicVolume: 50,
            muteAll: false,
            localizationPackageId: null,
          },
        },
      },
      {
        name: "render",
      },
    ]);
  });

  it("updates and persists the auto-forward speed setting", () => {
    const store = createSystemStore({
      projectData: createProjectData(),
    });

    store.setAutoForwardSpeed({ value: 75 });

    expect(store.selectRuntime().autoForwardSpeed).toBe(75);
    expect(
      store.selectPendingEffects()[0].payload.globalRuntime.autoForwardSpeed,
    ).toBe(75);
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

  it("renders a project-default text speed into authored layout templates", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

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
    );
    projectData.config = {
      runtimeDefaults: {
        dialogueTextSpeed: 72,
      },
    };

    engine.init({
      initialState: {
        projectData,
      },
    });

    const updatedProjectData = engine.selectSystemState().projectData;
    updatedProjectData.resources.layouts.runtimeHud = {
      elements: [
        {
          id: "runtime-text",
          type: "text",
          content: "${runtime.dialogueTextSpeed}",
        },
      ],
    };

    engine.handleAction("updateProjectData", {
      projectData: updatedProjectData,
    });

    const renderState = engine.selectRenderState();
    const storyContainer = renderState.elements.find(
      (element) => element.id === "story",
    );
    const runtimeText = storyContainer.children.find(
      (element) => element.id === "layout-runtimeHud",
    );

    expect(runtimeText.children[0].content).toBe(72);
  });

  it("renders a project-default skip preference into authored action payloads", () => {
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
    projectData.config = {
      runtimeDefaults: {
        skipUnseenText: true,
      },
    };

    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
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
    ).toBe(false);

    engine.handleAction("setSkipUnseenText", { value: false });

    renderState = engine.selectRenderState();
    storyContainer = renderState.elements.find(
      (element) => element.id === "story",
    );
    layoutContainer = storyContainer.children.find(
      (element) => element.id === "layout-skipHud",
    );

    expect(
      layoutContainer.children[0].click.payload.actions.setSkipUnseenText.value,
    ).toBe(true);
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

  it.each([-1, 101])(
    "rejects out-of-range persisted auto-forward speed %s",
    (autoForwardSpeed) => {
      expect(() =>
        createSystemStore({
          global: {
            runtime: {
              autoForwardSpeed,
            },
          },
          projectData: createProjectData(),
        }),
      ).toThrowError("autoForwardSpeed requires a value between 0 and 100");
    },
  );
});
