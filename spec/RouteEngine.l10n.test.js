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

const createEngine = () => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects: (effects) => {
      effects.forEach((effect) => {
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

  it("applies the active package without mutating canonical projectData", () => {
    const projectData = createProjectData();
    const canonicalSnapshot = structuredClone(projectData);
    const l10nData = {
      packages: {
        japanese: createJapanesePackage(),
      },
      activeL10nId: "japanese",
    };
    const l10nSnapshot = structuredClone(l10nData);
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData,
        l10nData,
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

  it("imports packages without applying one when activeL10nId is null", () => {
    const projectData = createProjectData();
    const engine = createEngine();

    engine.init({
      initialState: {
        projectData,
        l10nData: {
          packages: {
            japanese: createJapanesePackage(),
          },
          activeL10nId: null,
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
          activeL10nId: "japanese",
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
          activeL10nId: "canadianFrench",
        },
      },
    });

    expect(
      findElementById(engine.selectRenderState().elements, "dialogue-body"),
    ).toMatchObject({
      content: "Bonjour.",
    });
  });

  it("reapplies the active package when projectData is replaced", () => {
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
          activeL10nId: "japanese",
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
  });

  it("rejects an active package that was not imported", () => {
    const engine = createEngine();

    expect(() =>
      engine.init({
        initialState: {
          projectData: createProjectData(),
          l10nData: {
            packages: {},
            activeL10nId: "japanese",
          },
        },
      }),
    ).toThrow(/package "japanese" was not imported/);
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
            activeL10nId: "japanese",
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
            activeL10nId: "japanese",
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
            activeL10nId: "japanese",
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
            activeL10nId: "japanese",
          },
        },
      }),
    ).toThrow(/choice item IDs and events must remain identical/);
  });
});
