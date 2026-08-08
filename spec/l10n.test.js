import { describe, expect, it } from "vitest";
import {
  getLocalizationPackageOptions,
  resolveL10nProjectData,
} from "../src/l10n.js";

const createProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: {
    images: {
      sourceImage: {
        fileId: "source-image",
        width: 100,
        height: 100,
      },
    },
    layouts: {
      sourceDialogue: {
        elements: [],
      },
      sourceForm: {
        elements: [],
      },
    },
    controls: {
      sourceControl: {
        elements: [],
      },
    },
  },
  story: {
    initialSceneId: "chapter-one",
    scenes: {
      "chapter-one": {
        name: "Chapter One",
        initialSectionId: "introduction",
        sections: {
          introduction: {
            name: "Introduction",
            lines: [
              {
                id: "greeting",
                actions: {
                  background: {
                    resourceId: "sourceImage",
                    opacity: 0.5,
                  },
                  dialogue: {
                    mode: "adv",
                    ui: {
                      resourceId: "sourceDialogue",
                    },
                    characterId: "alice",
                    content: [{ text: "Hello." }],
                  },
                  form: {
                    id: "profile",
                    resourceId: "sourceForm",
                    fields: {
                      playerName: {
                        variableId: "playerName",
                        required: true,
                        placeholder: "Name",
                      },
                    },
                    submitActions: {
                      nextLine: {},
                    },
                  },
                  control: {
                    resourceId: "sourceControl",
                  },
                  voice: {
                    resourceId: "sourceVoice",
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
  language = "Japanese",
  files = [],
  patches = [],
} = {}) => ({
  language,
  files,
  patches,
});

const resolve = ({ projectData = createProjectData(), packages, l10nId }) =>
  resolveL10nProjectData({
    projectData,
    l10nData: {
      packages,
    },
    l10nId,
  });

const resourcePatchCases = [
  [
    "achievement",
    "achievements",
    {
      type: "boolean",
      name: "Localized achievement",
      description: "Localized description",
    },
  ],
  [
    "animation",
    "animations",
    {
      type: "update",
      tween: {
        alpha: {
          keyframes: [{ value: 1, duration: 100 }],
        },
      },
    },
  ],
  ["character", "characters", { name: "Localized character" }],
  ["color", "colors", { hex: "#ABCDEF" }],
  ["control", "controls", { elements: [] }],
  ["font", "fonts", { fileId: "localized-font" }],
  [
    "image",
    "images",
    {
      fileId: "localized-image",
      width: 640,
      height: 360,
    },
  ],
  ["layout", "layouts", { elements: [] }],
  [
    "particle",
    "particles",
    {
      width: 640,
      height: 360,
      modules: {
        emission: {},
        appearance: {},
      },
    },
  ],
  ["sound", "sounds", { fileId: "localized-sound" }],
  [
    "spritesheet",
    "spritesheets",
    {
      fileId: "localized-spritesheet",
      jsonData: {},
      width: 640,
      height: 360,
    },
  ],
  [
    "textStyle",
    "textStyles",
    {
      fontId: "localized-5",
      colorId: "localized-3",
      fontSize: 24,
      fontWeight: "400",
      fontStyle: "normal",
      lineHeight: 1,
    },
  ],
  [
    "transform",
    "transforms",
    { x: 120, y: 80, scaleX: 0.8, scaleY: 1.2, flipX: true, flipY: false },
  ],
  [
    "video",
    "videos",
    {
      fileId: "localized-video",
      width: 640,
      height: 360,
    },
  ],
  [
    "audioEffect",
    "audioEffects",
    {
      type: "transition",
      next: { fade: { duration: 500, easing: "easeOutSine" } },
    },
  ],
];

describe("resolveL10nProjectData", () => {
  it("exposes the canonical project and imported package languages", () => {
    expect(
      getLocalizationPackageOptions({
        projectData: createProjectData(),
        l10nData: {
          packages: {
            japanese: createPackage(),
            french: createPackage({ language: "French" }),
          },
        },
      }),
    ).toEqual([
      { l10nId: null, language: null },
      { l10nId: "japanese", language: "Japanese" },
      { l10nId: "french", language: "French" },
    ]);
  });

  it("adds every supported resource type and resolves package file references", () => {
    const files = [
      "localized-font",
      "localized-image",
      "localized-sound",
      "localized-spritesheet",
      "localized-video",
    ].map((fileId) => ({ fileId }));
    const patches = resourcePatchCases.map(
      ([resourceType, , payload], index) => ({
        type: `resource.${resourceType}`,
        operation: "add",
        resourceId: `localized-${index}`,
        payload,
      }),
    );

    const resolvedProjectData = resolve({
      packages: {
        japanese: createPackage({ files, patches }),
      },
      l10nId: "japanese",
    });

    resourcePatchCases.forEach(([, collectionName, payload], index) => {
      expect(
        resolvedProjectData.resources[collectionName][`localized-${index}`],
      ).toEqual(payload);
    });
  });

  it("defaults resource patches to whole-object replacement", () => {
    const resolvedProjectData = resolve({
      packages: {
        japanese: createPackage({
          files: [{ fileId: "replacement-image" }],
          patches: [
            {
              type: "resource.image",
              resourceId: "sourceImage",
              payload: {
                fileId: "replacement-image",
                width: 800,
                height: 450,
              },
            },
          ],
        }),
      },
      l10nId: "japanese",
    });

    expect(resolvedProjectData.resources.images.sourceImage).toEqual({
      fileId: "replacement-image",
      width: 800,
      height: 450,
    });
  });

  it.each([
    {
      name: "adding an existing resource",
      patch: {
        type: "resource.image",
        operation: "add",
        resourceId: "sourceImage",
        payload: {
          fileId: "source-image",
          width: 100,
          height: 100,
        },
      },
      error: /cannot add existing image resource/,
    },
    {
      name: "replacing a missing resource",
      patch: {
        type: "resource.image",
        resourceId: "missingImage",
        payload: {
          fileId: "source-image",
          width: 100,
          height: 100,
        },
      },
      error: /cannot replace missing image resource/,
    },
  ])("rejects $name", ({ patch, error }) => {
    expect(() =>
      resolve({
        packages: {
          japanese: createPackage({
            patches: [patch],
          }),
        },
        l10nId: "japanese",
      }),
    ).toThrow(error);
  });

  it("replaces presentation actions while preserving dialogue content separately", () => {
    const projectData = createProjectData();
    const sourceSnapshot = structuredClone(projectData);
    const resolvedProjectData = resolve({
      projectData,
      packages: {
        japanese: createPackage({
          patches: [
            {
              type: "line.action",
              lineId: "greeting",
              actionType: "background",
              payload: {
                colorId: "localizedColor",
              },
            },
            {
              type: "line.action",
              lineId: "greeting",
              actionType: "dialogue",
              ignoreFields: ["content"],
              payload: {
                mode: "nvl",
                ui: {
                  resourceId: "localizedDialogue",
                },
                persistCharacter: true,
              },
            },
            {
              type: "line.dialogue",
              lineId: "greeting",
              payload: {
                content: [{ text: "こんにちは。" }, { text: "ようこそ。" }],
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
          ],
        }),
      },
      l10nId: "japanese",
    });
    const line =
      resolvedProjectData.story.scenes["chapter-one"].sections.introduction
        .lines[0];

    expect(line.actions.background).toEqual({
      colorId: "localizedColor",
    });
    expect(line.actions.dialogue).toEqual({
      mode: "nvl",
      ui: {
        resourceId: "localizedDialogue",
      },
      persistCharacter: true,
      content: [{ text: "こんにちは。" }, { text: "ようこそ。" }],
    });
    expect(resolvedProjectData.story.scenes["chapter-one"].name).toBe("第一章");
    expect(projectData).toEqual(sourceSnapshot);
  });

  it("allows form presentation changes with preserved nested application data", () => {
    const projectData = createProjectData();
    const submitActions = {
      customApplicationAction: {
        value: { resourceId: "" },
      },
    };
    projectData.story.scenes[
      "chapter-one"
    ].sections.introduction.lines[0].actions.form.submitActions = submitActions;
    const resolvedProjectData = resolve({
      projectData,
      packages: {
        japanese: createPackage({
          patches: [
            {
              type: "line.action",
              lineId: "greeting",
              actionType: "form",
              payload: {
                id: "profile",
                resourceId: "localizedForm",
                fields: {
                  playerName: {
                    variableId: "playerName",
                    required: true,
                    placeholder: "名前",
                  },
                },
                submitActions: structuredClone(submitActions),
              },
            },
          ],
        }),
      },
      l10nId: "japanese",
    });

    expect(
      resolvedProjectData.story.scenes["chapter-one"].sections.introduction
        .lines[0].actions.form,
    ).toMatchObject({
      resourceId: "localizedForm",
      fields: {
        playerName: {
          placeholder: "名前",
        },
      },
      submitActions,
    });
  });

  it("rejects form behavior changes", () => {
    expect(() =>
      resolve({
        packages: {
          japanese: createPackage({
            patches: [
              {
                type: "line.action",
                lineId: "greeting",
                actionType: "form",
                payload: {
                  id: "profile",
                  resourceId: "localizedForm",
                  fields: {
                    playerName: {
                      variableId: "differentVariable",
                      required: true,
                      placeholder: "名前",
                    },
                  },
                  submitActions: {
                    nextLine: {},
                  },
                },
              },
            ],
          }),
        },
        l10nId: "japanese",
      }),
    ).toThrow(/form behavior must remain identical/);
  });

  it.each([
    {
      actionType: "control",
      payload: {},
    },
    {
      actionType: "voice",
      payload: {},
    },
    {
      actionType: "background",
      payload: {
        resourceId: "sourceImage",
        unsupported: true,
      },
    },
  ])(
    "rejects schema-invalid $actionType action replacements",
    ({ actionType, payload }) => {
      expect(() =>
        resolve({
          packages: {
            japanese: createPackage({
              patches: [
                {
                  type: "line.action",
                  lineId: "greeting",
                  actionType,
                  payload,
                },
              ],
            }),
          },
          l10nId: "japanese",
        }),
      ).toThrow(
        new RegExp(
          `does not match the ${actionType} presentation-action schema`,
        ),
      );
    },
  );

  it("accepts schema-valid control and voice action replacements", () => {
    const resolvedProjectData = resolve({
      packages: {
        japanese: createPackage({
          patches: [
            {
              type: "line.action",
              lineId: "greeting",
              actionType: "control",
              payload: {
                resourceId: "localizedControl",
              },
            },
            {
              type: "line.action",
              lineId: "greeting",
              actionType: "voice",
              payload: {
                resourceId: "localizedVoice",
                volume: 75,
              },
            },
          ],
        }),
      },
      l10nId: "japanese",
    });
    const actions =
      resolvedProjectData.story.scenes["chapter-one"].sections.introduction
        .lines[0].actions;

    expect(actions.control).toEqual({
      resourceId: "localizedControl",
    });
    expect(actions.voice).toEqual({
      resourceId: "localizedVoice",
      volume: 75,
    });
  });

  it("uses only the selected package and retains canonical content for missing patches", () => {
    const resolvedProjectData = resolve({
      packages: {
        french: createPackage({
          language: "French",
          patches: [
            {
              type: "story.scene",
              mode: "patch",
              sceneId: "chapter-one",
              payload: {
                name: "Chapitre un",
              },
            },
          ],
        }),
        canadianFrench: createPackage({
          language: "Canadian French",
          patches: [
            {
              type: "line.dialogue",
              lineId: "greeting",
              payload: {
                content: [{ text: "Allô." }],
              },
            },
          ],
        }),
      },
      l10nId: "canadianFrench",
    });

    expect(
      resolvedProjectData.story.scenes["chapter-one"].sections.introduction
        .lines[0].actions.dialogue.content,
    ).toEqual([{ text: "Allô." }]);
    expect(resolvedProjectData.story.scenes["chapter-one"].name).toBe(
      "Chapter One",
    );
  });

  it("rejects duplicate patch targets within one package", () => {
    expect(() =>
      resolve({
        packages: {
          japanese: createPackage({
            patches: [
              {
                type: "line.dialogue",
                lineId: "greeting",
                payload: {
                  content: [{ text: "一。" }],
                },
              },
              {
                type: "line.dialogue",
                lineId: "greeting",
                payload: {
                  content: [{ text: "二。" }],
                },
              },
            ],
          }),
        },
        l10nId: "japanese",
      }),
    ).toThrow(/duplicate patch target "line.dialogue:greeting"/);
  });

  it.each([
    {
      name: "duplicate IDs within one package",
      packages: {
        japanese: createPackage({
          files: [{ fileId: "localized-image" }, { fileId: "localized-image" }],
        }),
      },
      error: /duplicate fileId "localized-image"/,
    },
    {
      name: "IDs owned by the canonical project",
      packages: {
        japanese: createPackage({
          files: [{ fileId: "source-image" }],
        }),
      },
      error: /conflicts with a canonical project file/,
    },
    {
      name: "IDs owned by another package",
      packages: {
        japanese: createPackage({
          files: [{ fileId: "localized-image" }],
        }),
        french: createPackage({
          language: "French",
          files: [{ fileId: "localized-image" }],
        }),
      },
      error: /already declared by package "japanese"/,
    },
  ])("rejects package file $name", ({ packages, error }) => {
    expect(() =>
      resolve({
        packages,
        l10nId: Object.keys(packages)[0],
      }),
    ).toThrow(error);
  });

  it.each([
    {
      name: "unsafe file paths",
      files: [{ fileId: "../localized-image" }],
      patches: [],
      error: /must be a safe single filename/,
    },
    {
      name: "undeclared file references",
      files: [],
      patches: [
        {
          type: "resource.image",
          resourceId: "sourceImage",
          payload: {
            fileId: "undeclared-image",
            width: 640,
            height: 360,
          },
        },
      ],
      error: /fileId "undeclared-image" is not declared/,
    },
    {
      name: "dialogue content inside an action replacement",
      files: [],
      patches: [
        {
          type: "line.action",
          lineId: "greeting",
          actionType: "dialogue",
          ignoreFields: ["content"],
          payload: {
            content: [{ text: "Inline content." }],
          },
        },
      ],
      error: /must use a separate line.dialogue patch/,
    },
  ])("rejects $name", ({ files, patches, error }) => {
    expect(() =>
      resolve({
        packages: {
          japanese: createPackage({ files, patches }),
        },
        l10nId: "japanese",
      }),
    ).toThrow(error);
  });

  it.each([
    {
      name: "empty languages",
      packageData: createPackage({ language: "" }),
      error: /language: expected a non-empty string/,
    },
    {
      name: "empty file MIME types",
      packageData: createPackage({
        files: [{ fileId: "localized-image", mimeType: "" }],
      }),
      error: /mimeType: expected a non-empty string/,
    },
    {
      name: "unknown patch types",
      packageData: createPackage({
        patches: [
          {
            type: "project.title",
            payload: {
              title: "Localized title",
            },
          },
        ],
      }),
      error: /unsupported patch type "project.title"/,
    },
    {
      name: "unknown resource operations",
      packageData: createPackage({
        patches: [
          {
            type: "resource.image",
            operation: "remove",
            resourceId: "sourceImage",
            payload: {
              fileId: "source-image",
              width: 100,
              height: 100,
            },
          },
        ],
      }),
      error: /the only resource operation is "add"/,
    },
  ])("rejects manifest $name", ({ packageData, error }) => {
    expect(() =>
      resolve({
        packages: {
          japanese: packageData,
        },
        l10nId: "japanese",
      }),
    ).toThrow(error);
  });

  it.each([
    ["formatVersion", 1],
    ["locale", "ja-JP"],
    ["sourceLocale", "en-US"],
    ["sourceRevision", "source-revision-1"],
    ["fallbackLocales", ["en-US"]],
  ])("rejects the removed %s package field", (field, value) => {
    expect(() =>
      resolve({
        packages: {
          japanese: {
            ...createPackage(),
            [field]: value,
          },
        },
        l10nId: "japanese",
      }),
    ).toThrow(new RegExp(`${field}: unknown field`));
  });

  it.each([
    {
      name: "fractional image width",
      patch: {
        type: "resource.image",
        resourceId: "sourceImage",
        payload: {
          fileId: "source-image",
          width: 100.5,
          height: 100,
        },
      },
      error: /payload.width: expected an integer/,
    },
    {
      name: "missing image height",
      patch: {
        type: "resource.image",
        resourceId: "sourceImage",
        payload: {
          fileId: "source-image",
          width: 100,
        },
      },
      error: /payload.height: expected an integer/,
    },
    {
      name: "non-object spritesheet metadata",
      patch: {
        type: "resource.spritesheet",
        operation: "add",
        resourceId: "localizedSpritesheet",
        payload: {
          fileId: "source-image",
          jsonData: null,
          width: 100,
          height: 100,
        },
      },
      error: /payload.jsonData: expected an object/,
    },
    {
      name: "fractional spritesheet width",
      patch: {
        type: "resource.spritesheet",
        operation: "add",
        resourceId: "localizedSpritesheet",
        payload: {
          fileId: "source-image",
          jsonData: {},
          width: 100.5,
          height: 100,
        },
      },
      error: /payload.width: expected an integer/,
    },
    {
      name: "missing spritesheet height",
      patch: {
        type: "resource.spritesheet",
        operation: "add",
        resourceId: "localizedSpritesheet",
        payload: {
          fileId: "source-image",
          jsonData: {},
          width: 100,
        },
      },
      error: /payload.height: expected an integer/,
    },
    {
      name: "non-hex colors",
      patch: {
        type: "resource.color",
        operation: "add",
        resourceId: "localizedColor",
        payload: {
          hex: "orange",
        },
      },
      error: /expected an opaque #RGB or #RRGGBB color/,
    },
    {
      name: "unsupported resource types",
      patch: {
        type: "resource.variable",
        operation: "add",
        resourceId: "localizedVariable",
        payload: {},
      },
      error: /unsupported resource patch type "resource.variable"/,
    },
    {
      name: "resource patch mode",
      patch: {
        type: "resource.image",
        mode: "patch",
        resourceId: "sourceImage",
        payload: {
          fileId: "source-image",
          width: 100,
          height: 100,
        },
      },
      error: /resource patches support only "replace"/,
    },
  ])("rejects invalid resource payload $name", ({ patch, error }) => {
    expect(() =>
      resolve({
        packages: {
          japanese: createPackage({
            patches: [patch],
          }),
        },
        l10nId: "japanese",
      }),
    ).toThrow(error);
  });

  it.each([
    {
      resourceType: "achievement",
      payload: {
        type: "number",
        name: "Localized achievement",
        description: "Localized description",
      },
    },
    {
      resourceType: "animation",
      payload: {
        type: "update",
        tween: {},
      },
    },
    {
      resourceType: "particle",
      payload: {
        width: 640,
        height: 360,
        modules: {
          emission: {},
        },
      },
    },
    {
      resourceType: "textStyle",
      payload: {
        fontId: "localizedFont",
        colorId: "localizedColor",
      },
    },
    {
      resourceType: "image",
      payload: {
        fileId: "source-image",
        width: 100,
        height: 100,
        unsupported: true,
      },
    },
  ])(
    "rejects complete-schema violations for resource.$resourceType",
    ({ resourceType, payload }) => {
      expect(() =>
        resolve({
          packages: {
            japanese: createPackage({
              patches: [
                {
                  type: `resource.${resourceType}`,
                  operation: "add",
                  resourceId: `invalid-${resourceType}`,
                  payload,
                },
              ],
            }),
          },
          l10nId: "japanese",
        }),
      ).toThrow(
        new RegExp(`does not match the resource.${resourceType} schema`),
      );
    },
  );

  it.each([
    {
      name: "non-replacement line action mode",
      patch: {
        type: "line.action",
        mode: "patch",
        lineId: "greeting",
        actionType: "background",
        payload: {
          colorId: "localizedColor",
        },
      },
      error: /line.action supports only "replace"/,
    },
    {
      name: "action absent from the source line",
      patch: {
        type: "line.action",
        lineId: "greeting",
        actionType: "visual",
        payload: {
          items: [],
        },
      },
      error: /does not contain action "visual"/,
    },
    {
      name: "dialogue action without its content exception",
      patch: {
        type: "line.action",
        lineId: "greeting",
        actionType: "dialogue",
        payload: {
          mode: "adv",
        },
      },
      error: /requires exactly \["content"\]/,
    },
    {
      name: "content exceptions on non-dialogue actions",
      patch: {
        type: "line.action",
        lineId: "greeting",
        actionType: "background",
        ignoreFields: ["content"],
        payload: {
          colorId: "localizedColor",
        },
      },
      error: /supported only for dialogue actions/,
    },
    {
      name: "non-replacement dialogue-content mode",
      patch: {
        type: "line.dialogue",
        mode: "patch",
        lineId: "greeting",
        payload: {
          content: [{ text: "Localized." }],
        },
      },
      error: /line.dialogue supports only "replace"/,
    },
    {
      name: "non-patch scene mode",
      patch: {
        type: "story.scene",
        mode: "replace",
        sceneId: "chapter-one",
        payload: {
          name: "Localized chapter",
        },
      },
      error: /story.scene requires "patch"/,
    },
    {
      name: "unknown scenes",
      patch: {
        type: "story.scene",
        mode: "patch",
        sceneId: "missing-scene",
        payload: {
          name: "Localized chapter",
        },
      },
      error: /sceneId "missing-scene" does not exist/,
    },
  ])("rejects invalid line or scene patch $name", ({ patch, error }) => {
    expect(() =>
      resolve({
        packages: {
          japanese: createPackage({
            patches: [patch],
          }),
        },
        l10nId: "japanese",
      }),
    ).toThrow(error);
  });

  it("rejects dialogue patches on a line without dialogue", () => {
    const projectData = createProjectData();
    delete projectData.story.scenes["chapter-one"].sections.introduction
      .lines[0].actions.dialogue;

    expect(() =>
      resolve({
        projectData,
        packages: {
          japanese: createPackage({
            patches: [
              {
                type: "line.dialogue",
                lineId: "greeting",
                payload: {
                  content: [{ text: "Localized." }],
                },
              },
            ],
          }),
        },
        l10nId: "japanese",
      }),
    ).toThrow(/does not contain a dialogue action/);
  });
});
