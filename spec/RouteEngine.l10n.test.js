import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const findElementById = (elements, id) => {
  for (const element of elements ?? []) {
    if (element?.id === id) {
      return element;
    }
    const nested = findElementById(element?.children, id);
    if (nested) {
      return nested;
    }
  }
  return null;
};

const createProjectData = ({
  dialogueText = "Hello.",
  sceneName = "Chapter One",
} = {}) => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: {
    images: {
      stationSign: {
        fileId: "station-sign-source-file",
        fileType: "image/png",
        width: 640,
        height: 320,
      },
    },
    layouts: {
      sourceDialogue: {
        elements: [
          {
            id: "dialogue-body",
            type: "text",
            content: "${dialogue.content[0].text}",
          },
        ],
      },
    },
    characters: {
      alice: {
        name: "Alice",
      },
    },
    variables: {},
  },
  story: {
    initialSceneId: "chapter-one",
    scenes: {
      "chapter-one": {
        name: sceneName,
        initialSectionId: "introduction",
        sections: {
          introduction: {
            name: "Introduction",
            initialLineId: "greeting",
            lines: [
              {
                id: "greeting",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "sourceDialogue",
                    },
                    characterId: "alice",
                    textSpeed: 30,
                    content: [{ text: dialogueText }],
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
});

const createPackage = ({
  locale = "ja-JP",
  fallbackLocales = [],
  files = [],
  patches = [],
} = {}) => ({
  formatVersion: 1,
  locale,
  sourceLocale: "en-US",
  sourceRevision: "source-revision-1",
  fallbackLocales,
  files,
  patches,
});

const createJapanesePackage = () =>
  createPackage({
    files: [
      {
        fileId: "station-sign-ja-file",
        mimeType: "image/png",
      },
    ],
    patches: [
      {
        type: "resource.layout",
        operation: "add",
        resourceId: "japaneseDialogue",
        payload: {
          elements: [
            {
              id: "dialogue-body",
              type: "text",
              content: "${dialogue.content[0].text}",
            },
          ],
        },
      },
      {
        type: "resource.image",
        resourceId: "stationSign",
        payload: {
          fileId: "station-sign-ja-file",
          fileType: "image/png",
          width: 1024,
          height: 512,
        },
      },
      {
        type: "story.scene",
        mode: "patch",
        sceneId: "chapter-one",
        payload: {
          name: "第一章",
        },
      },
      {
        type: "line.action",
        lineId: "greeting",
        actionType: "dialogue",
        ignoreFields: ["content"],
        payload: {
          mode: "adv",
          ui: {
            resourceId: "japaneseDialogue",
          },
          characterId: "alice",
          persistCharacter: true,
        },
      },
      {
        type: "line.dialogue",
        lineId: "greeting",
        payload: {
          content: [{ text: "こんにちは。" }],
        },
      },
    ],
  });

const addLocalizationMenu = (projectData) => {
  projectData.resources.layouts.localizationMenu = {
    elements: [
      {
        "$for package in localizationPackages:": [
          {
            id: "locale-${package.locale}",
            type: "text",
            content: "${package.locale}",
            click: {
              payload: {
                actions: {
                  updateLocalizationPackage: {
                    l10nId: "${package.l10nId}",
                  },
                },
              },
            },
          },
        ],
      },
      {
        id: "selected-locale",
        type: "text",
        content: "${localizationPackageId}",
      },
    ],
  };
  projectData.story.scenes[
    "chapter-one"
  ].sections.introduction.lines[0].actions.layout = {
    resourceId: "localizationMenu",
  };
  return projectData;
};

const createEngine = ({ onEffect } = {}) => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects: (effects) => {
      effects.forEach((effect) => {
        onEffect?.(effect);
        if (effect.name === "handleLineActions") {
          engine.handleLineActions();
        }
      });
    },
  });
  return engine;
};

describe("RouteEngine L10n initialization", () => {
  it("runs the canonical project when l10nData is omitted", () => {
    const projectData = createProjectData();
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData,
      },
    });

    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "Hello.",
    });
    expect(engine.selectSystemState().projectData).toEqual(projectData);
  });

  it("restores a persisted package without mutating canonical projectData", () => {
    const projectData = createProjectData();
    const canonicalSnapshot = structuredClone(projectData);
    const l10nData = {
      packages: {
        japanese: createJapanesePackage(),
      },
    };
    const l10nSnapshot = structuredClone(l10nData);
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData,
        l10nData,
        global: {
          runtime: {
            localizationPackageId: "japanese",
          },
        },
      },
    });

    const resolvedProjectData = engine.selectSystemState().projectData;
    const resolvedDialogue =
      resolvedProjectData.story.scenes["chapter-one"].sections.introduction
        .lines[0].actions.dialogue;

    expect(projectData).toEqual(canonicalSnapshot);
    expect(l10nData).toEqual(l10nSnapshot);
    expect(resolvedProjectData.story.scenes["chapter-one"].name).toBe("第一章");
    expect(resolvedProjectData.resources.images.stationSign).toEqual({
      fileId: "station-sign-ja-file",
      fileType: "image/png",
      width: 1024,
      height: 512,
    });
    expect(
      resolvedProjectData.resources.layouts.japaneseDialogue,
    ).toBeDefined();
    expect(resolvedDialogue).toEqual({
      mode: "adv",
      ui: {
        resourceId: "japaneseDialogue",
      },
      characterId: "alice",
      persistCharacter: true,
      content: [{ text: "こんにちは。" }],
    });
    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "こんにちは。",
    });
  });

  it("imports packages while defaulting to the canonical project", () => {
    const projectData = createProjectData();
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData,
        l10nData: {
          packages: {
            japanese: createJapanesePackage(),
          },
        },
      },
    });

    expect(engine.selectSystemState().projectData).toEqual(projectData);
    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "Hello.",
    });
  });

  it("exposes package choices and current selection to authored layouts", () => {
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData: addLocalizationMenu(createProjectData()),
        l10nData: {
          packages: {
            japanese: createJapanesePackage(),
            french: createPackage({ locale: "fr-FR" }),
          },
        },
      },
    });

    const renderState = engine.selectRenderState();
    const sourceOption = findElementById(renderState.elements, "locale-en-US");
    const japaneseOption = findElementById(
      renderState.elements,
      "locale-ja-JP",
    );
    const frenchOption = findElementById(renderState.elements, "locale-fr-FR");

    expect(sourceOption.click.payload.actions).toEqual({
      updateLocalizationPackage: {
        l10nId: null,
      },
    });
    expect(japaneseOption.click.payload.actions).toEqual({
      updateLocalizationPackage: {
        l10nId: "japanese",
      },
    });
    expect(frenchOption).toBeDefined();
    expect(
      findElementById(renderState.elements, "selected-locale").content,
    ).toBeNull();
    expect(engine.selectRuntime().localizationPackageId).toBeNull();
  });

  it("switches from layout actions, persists the device setting, and returns to source", () => {
    const effects = [];
    const engine = createEngine({
      onEffect: (effect) => effects.push(structuredClone(effect)),
    });

    engine.init({
      initialState: {
        projectData: addLocalizationMenu(createProjectData()),
        l10nData: {
          packages: {
            japanese: createJapanesePackage(),
          },
        },
      },
    });
    effects.length = 0;

    const japaneseOption = findElementById(
      engine.selectRenderState().elements,
      "locale-ja-JP",
    );
    engine.handleActions(japaneseOption.click.payload.actions);

    expect(engine.selectRuntime().localizationPackageId).toBe("japanese");
    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "こんにちは。",
    });
    expect(
      findElementById(engine.selectRenderState().elements, "selected-locale")
        .content,
    ).toBe("japanese");
    expect(effects).toContainEqual({
      name: "saveGlobalRuntime",
      payload: {
        globalRuntime: expect.objectContaining({
          localizationPackageId: "japanese",
        }),
      },
    });
    expect(effects).toContainEqual({ name: "clearAutoNextTimer" });
    expect(effects).toContainEqual({ name: "render" });

    effects.length = 0;
    const sourceOption = findElementById(
      engine.selectRenderState().elements,
      "locale-en-US",
    );
    engine.handleActions(sourceOption.click.payload.actions);

    expect(engine.selectRuntime().localizationPackageId).toBeNull();
    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "Hello.",
    });
    expect(effects).toContainEqual({
      name: "saveGlobalRuntime",
      payload: {
        globalRuntime: expect.objectContaining({
          localizationPackageId: null,
        }),
      },
    });
  });

  it("rejects unavailable runtime package selections without changing state", () => {
    const engine = createEngine();
    engine.init({
      initialState: {
        projectData: createProjectData(),
        l10nData: {
          packages: {
            japanese: createJapanesePackage(),
          },
        },
      },
    });

    expect(() =>
      engine.handleActions({
        updateLocalizationPackage: {
          l10nId: "missing",
        },
      }),
    ).toThrow(/package "missing" was not imported/);
    expect(engine.selectRuntime().localizationPackageId).toBeNull();
    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "Hello.",
    });
  });

  it("reschedules active auto mode from the localized dialogue length", () => {
    const effects = [];
    const engine = createEngine({
      onEffect: (effect) => effects.push(structuredClone(effect)),
    });
    engine.init({
      initialState: {
        projectData: createProjectData({
          dialogueText:
            "This canonical source sentence intentionally takes longer to read.",
        }),
        l10nData: {
          packages: {
            japanese: createPackage({
              patches: [
                {
                  type: "line.dialogue",
                  lineId: "greeting",
                  payload: {
                    content: [{ text: "短い。" }],
                  },
                },
              ],
            }),
          },
        },
      },
    });

    engine.handleActions({
      startAutoMode: {},
      markLineCompleted: {},
    });
    const canonicalDelay = effects.find(
      (effect) => effect.name === "startAutoNextTimer",
    ).payload.delay;

    effects.length = 0;
    engine.handleActions({
      updateLocalizationPackage: {
        l10nId: "japanese",
      },
    });
    const localizedDelay = effects.find(
      (effect) => effect.name === "startAutoNextTimer",
    ).payload.delay;

    expect(effects.map(({ name }) => name).slice(-3)).toEqual([
      "clearAutoNextTimer",
      "startAutoNextTimer",
      "render",
    ]);
    expect(localizedDelay).toBeLessThan(canonicalDelay);
  });

  it("does not replay gameplay actions while switching presentation data", () => {
    const projectData = createProjectData();
    projectData.resources.variables.score = {
      type: "number",
      scope: "context",
      default: 0,
    };
    projectData.story.scenes[
      "chapter-one"
    ].sections.introduction.lines[0].actions.updateVariable = {
      id: "incrementScoreOnEntry",
      operations: [
        {
          variableId: "score",
          op: "increment",
          value: 1,
        },
      ],
    };
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData,
        l10nData: {
          packages: {
            japanese: createPackage({
              patches: [
                {
                  type: "line.dialogue",
                  lineId: "greeting",
                  payload: {
                    content: [{ text: "こんにちは。" }],
                  },
                },
              ],
            }),
          },
        },
      },
    });
    expect(engine.selectSystemState().contexts.at(-1).variables.score).toBe(1);

    engine.handleActions({
      updateLocalizationPackage: {
        l10nId: "japanese",
      },
    });

    expect(engine.selectSystemState().contexts.at(-1).variables.score).toBe(1);
  });

  it("preserves canonical dialogue content during dialogue action replacement", () => {
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData: createProjectData(),
        l10nData: {
          packages: {
            japanese: createPackage({
              patches: [
                {
                  type: "resource.layout",
                  operation: "add",
                  resourceId: "japaneseDialogue",
                  payload: {
                    elements: [],
                  },
                },
                {
                  type: "line.action",
                  lineId: "greeting",
                  actionType: "dialogue",
                  ignoreFields: ["content"],
                  payload: {
                    mode: "adv",
                    ui: {
                      resourceId: "japaneseDialogue",
                    },
                  },
                },
              ],
            }),
          },
        },
        global: {
          runtime: {
            localizationPackageId: "japanese",
          },
        },
      },
    });

    expect(
      engine.selectSystemState().projectData.story.scenes["chapter-one"]
        .sections.introduction.lines[0].actions.dialogue,
    ).toEqual({
      mode: "adv",
      ui: {
        resourceId: "japaneseDialogue",
      },
      content: [{ text: "Hello." }],
    });
  });

  it("uses imported fallback packages before canonical source content", () => {
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData: createProjectData(),
        l10nData: {
          packages: {
            french: createPackage({
              locale: "fr-FR",
              patches: [
                {
                  type: "line.dialogue",
                  lineId: "greeting",
                  payload: {
                    content: [{ text: "Bonjour." }],
                  },
                },
              ],
            }),
            canadianFrench: createPackage({
              locale: "fr-CA",
              fallbackLocales: ["fr-FR", "en-US"],
            }),
          },
        },
        global: {
          runtime: {
            localizationPackageId: "canadianFrench",
          },
        },
      },
    });

    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "Bonjour.",
    });
  });

  it("reapplies the selected package when projectData is replaced", () => {
    const engine = createEngine();
    const packageData = createPackage({
      patches: [
        {
          type: "line.dialogue",
          lineId: "greeting",
          payload: {
            content: [{ text: "こんにちは。" }],
          },
        },
      ],
    });

    engine.init({
      initialState: {
        projectData: createProjectData(),
        l10nData: {
          packages: {
            japanese: packageData,
          },
        },
        global: {
          runtime: {
            localizationPackageId: "japanese",
          },
        },
      },
    });

    engine.handleActions({
      updateProjectData: {
        projectData: createProjectData({
          dialogueText: "Updated source.",
          sceneName: "Updated Chapter",
        }),
      },
    });

    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "こんにちは。",
    });
    expect(
      engine.selectSystemState().projectData.story.scenes["chapter-one"].name,
    ).toBe("Updated Chapter");

    engine.handleActions({
      updateLocalizationPackage: {
        l10nId: null,
      },
    });
    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "Updated source.",
    });
  });

  it("falls back to the canonical project when a persisted package is unavailable", () => {
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData: createProjectData(),
        l10nData: {
          packages: {},
        },
        global: {
          runtime: {
            localizationPackageId: "japanese",
          },
        },
      },
    });

    expect(engine.selectRuntime().localizationPackageId).toBeNull();
    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "Hello.",
    });
  });

  it("rejects malformed persisted localization package IDs", () => {
    const engine = createEngine();

    expect(() =>
      engine.init({
        initialState: {
          projectData: createProjectData(),
          l10nData: {
            packages: {
              japanese: createJapanesePackage(),
            },
          },
          global: {
            runtime: {
              localizationPackageId: 1,
            },
          },
        },
      }),
    ).toThrow(/localizationPackageId requires a string or null value/);
  });

  it("rejects undeclared locale files", () => {
    const engine = createEngine();

    expect(() =>
      engine.init({
        initialState: {
          projectData: createProjectData(),
          l10nData: {
            packages: {
              japanese: createPackage({
                patches: [
                  {
                    type: "resource.image",
                    resourceId: "stationSign",
                    payload: {
                      fileId: "missing-ja-file",
                      width: 640,
                      height: 320,
                    },
                  },
                ],
              }),
            },
          },
        },
      }),
    ).toThrow(/fileId "missing-ja-file" is not declared/);
  });

  it("rejects ambiguous line IDs used by line patches", () => {
    const projectData = createProjectData();
    projectData.story.scenes["chapter-one"].sections.second = {
      name: "Second",
      lines: [
        {
          id: "greeting",
          actions: {
            dialogue: {
              content: [{ text: "Another greeting." }],
            },
          },
        },
      ],
    };
    const engine = createEngine();

    expect(() =>
      engine.init({
        initialState: {
          projectData,
          l10nData: {
            packages: {
              japanese: createPackage({
                patches: [
                  {
                    type: "line.dialogue",
                    lineId: "greeting",
                    payload: {
                      content: [{ text: "こんにちは。" }],
                    },
                  },
                ],
              }),
            },
          },
        },
      }),
    ).toThrow(/lineId "greeting" is not globally unique/);
  });

  it("rejects system actions as localization targets", () => {
    const projectData = createProjectData();
    projectData.story.scenes[
      "chapter-one"
    ].sections.introduction.lines[0].actions.nextLine = {};
    const engine = createEngine();

    expect(() =>
      engine.init({
        initialState: {
          projectData,
          l10nData: {
            packages: {
              japanese: createPackage({
                patches: [
                  {
                    type: "line.action",
                    lineId: "greeting",
                    actionType: "nextLine",
                    payload: {},
                  },
                ],
              }),
            },
          },
        },
      }),
    ).toThrow(/not a localizable presentation action/);
  });

  it("rejects localization changes to protected choice behavior", () => {
    const projectData = createProjectData();
    const line =
      projectData.story.scenes["chapter-one"].sections.introduction.lines[0];
    line.actions.choice = {
      resourceId: "sourceDialogue",
      items: [
        {
          id: "accept",
          content: "Accept",
          events: {
            click: {
              actions: {
                nextLine: {},
              },
            },
          },
        },
      ],
    };
    const engine = createEngine();

    expect(() =>
      engine.init({
        initialState: {
          projectData,
          l10nData: {
            packages: {
              japanese: createPackage({
                patches: [
                  {
                    type: "line.action",
                    lineId: "greeting",
                    actionType: "choice",
                    payload: {
                      resourceId: "sourceDialogue",
                      items: [
                        {
                          id: "accept",
                          content: "承認",
                          events: {
                            click: {
                              actions: {
                                stopAutoMode: {},
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              }),
            },
          },
        },
      }),
    ).toThrow(/choice item IDs and events must remain identical/);
  });

  it("rejects schema-invalid presentation actions during engine initialization", () => {
    const projectData = createProjectData();
    projectData.story.scenes[
      "chapter-one"
    ].sections.introduction.lines[0].actions.control = {
      resourceId: "sourceControl",
    };
    const engine = createEngine();

    expect(() =>
      engine.init({
        initialState: {
          projectData,
          l10nData: {
            packages: {
              japanese: createPackage({
                patches: [
                  {
                    type: "line.action",
                    lineId: "greeting",
                    actionType: "control",
                    payload: {},
                  },
                ],
              }),
            },
          },
        },
      }),
    ).toThrow(/does not match the control presentation-action schema/);
  });

  it("rejects incomplete resource payloads during engine initialization", () => {
    const engine = createEngine();

    expect(() =>
      engine.init({
        initialState: {
          projectData: createProjectData(),
          l10nData: {
            packages: {
              japanese: createPackage({
                patches: [
                  {
                    type: "resource.achievement",
                    operation: "add",
                    resourceId: "localizedProgress",
                    payload: {
                      type: "number",
                      name: "Localized progress",
                      description: "Localized progress description",
                    },
                  },
                ],
              }),
            },
          },
        },
      }),
    ).toThrow(/does not match the resource.achievement schema/);
  });
});
