import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import { load, loadAll } from "js-yaml";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const schemasRoot = path.join(repoRoot, "src", "schemas");
const schemaBaseUrl = "https://route-engine.test/schemas/";
const projectDataSchemaId = new URL(
  "projectData/projectData.yaml",
  schemaBaseUrl,
).href;
const presentationActionsSchemaId = new URL(
  "presentationActions.yaml",
  schemaBaseUrl,
).href;
const systemActionsSchemaId = new URL("systemActions.yaml", schemaBaseUrl).href;
const projectDataSchemaPaths = [
  path.join(schemasRoot, "projectData"),
  path.join(schemasRoot, "presentationActions.yaml"),
  path.join(schemasRoot, "systemActions.yaml"),
];

const collectYamlFiles = (dirPath) => {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      return collectYamlFiles(fullPath);
    }

    if (entry.isFile() && fullPath.endsWith(".yaml")) {
      return [fullPath];
    }

    return [];
  });
};

const rewriteSchemaRefs = (value, schemaId) => {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteSchemaRefs(item, schemaId));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (
        key === "$ref" &&
        typeof entryValue === "string" &&
        !entryValue.startsWith("#") &&
        !entryValue.includes("://")
      ) {
        return [
          key,
          new URL(
            path.posix.normalize(
              path.posix.join(path.posix.dirname(schemaId), entryValue),
            ),
            schemaBaseUrl,
          ).href,
        ];
      }

      return [key, rewriteSchemaRefs(entryValue, schemaId)];
    }),
  );
};

const loadSchemas = () => {
  const schemaPaths = projectDataSchemaPaths.flatMap((schemaPath) => {
    if (schemaPath.endsWith(".yaml")) {
      return [schemaPath];
    }

    return collectYamlFiles(schemaPath);
  });

  return schemaPaths.map((schemaPath) => {
    const schemaId = path
      .relative(schemasRoot, schemaPath)
      .split(path.sep)
      .join("/");
    const schema = load(readFileSync(schemaPath, "utf8"));
    const rewrittenSchema = rewriteSchemaRefs(schema, schemaId);
    return {
      ...rewrittenSchema,
      $id: new URL(schemaId, schemaBaseUrl).href,
    };
  });
};

const createValidator = (schemaId) => {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
  });

  for (const schema of loadSchemas()) {
    ajv.addSchema(schema);
  }

  const validate = ajv.getSchema(schemaId);
  if (!validate) {
    throw new Error(`Schema "${schemaId}" not found`);
  }

  return validate;
};

const validateProjectData = createValidator(projectDataSchemaId);
const validatePresentationActions = createValidator(
  presentationActionsSchemaId,
);
const validateSystemActions = createValidator(systemActionsSchemaId);

const createMinimalProjectData = (overrides = {}) => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: {},
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        name: "Scene 1",
        initialSectionId: "section1",
        sections: {
          section1: {
            name: "Section 1",
            lines: [
              {
                id: "line1",
                actions: {},
              },
            ],
          },
        },
      },
    },
  },
  ...overrides,
});

describe("projectData schema", () => {
  it("accepts minimal valid projectData", () => {
    expect(validateProjectData(createMinimalProjectData())).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("accepts optional screen backgroundColor", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          screen: {
            width: 1920,
            height: 1080,
            backgroundColor: "#000000",
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("accepts resource character nameVariableId", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          resources: {
            variables: {
              playerName: {
                type: "string",
                scope: "context",
                default: "Guest",
              },
            },
            characters: {
              protagonist: {
                name: "Protagonist",
                nameVariableId: "playerName",
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("requires width and height on spritesheet resources", () => {
    const projectData = createMinimalProjectData({
      resources: {
        spritesheets: {
          animatedSky: {
            fileId: "animated-sky.png",
            jsonData: {
              frames: {},
            },
          },
        },
      },
    });

    expect(validateProjectData(projectData)).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/resources/spritesheets/animatedSky",
          keyword: "required",
          params: {
            missingProperty: "width",
          },
        }),
        expect.objectContaining({
          instancePath: "/resources/spritesheets/animatedSky",
          keyword: "required",
          params: {
            missingProperty: "height",
          },
        }),
      ]),
    );
  });

  it("rejects non-hex screen backgroundColor", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          screen: {
            width: 1920,
            height: 1080,
            backgroundColor: "black",
          },
        }),
      ),
    ).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/screen/backgroundColor",
          keyword: "pattern",
        }),
      ]),
    );
  });

  it("accepts background transformId and inline transform fields in presentation actions", () => {
    expect(
      validatePresentationActions({
        background: {
          resourceId: "bg1",
          transformId: "centerStage",
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();

    expect(
      validatePresentationActions({
        background: {
          resourceId: "bg1",
          x: 100,
          y: 120,
          anchorX: 0,
          anchorY: 1,
          scaleX: 1.2,
          scaleY: 0.8,
          rotation: -8,
          originX: 64,
          originY: 128,
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();

    expect(
      validatePresentationActions({
        character: {
          items: [
            {
              id: "lead",
              x: 920,
              y: 980,
              anchorX: 0.5,
              anchorY: 1,
              scaleX: 0.8,
              scaleY: 0.9,
              rotation: 12,
              originX: 64,
              originY: 128,
            },
          ],
        },
        visual: {
          items: [
            {
              id: "fog",
              x: 100,
              y: 120,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1.2,
              scaleY: 1.3,
              rotation: -8,
              originX: 20,
              originY: 40,
            },
          ],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts spritesheet playback fields in background actions", () => {
    expect(
      validatePresentationActions({
        background: {
          resourceId: "animatedSky",
          animationName: "storm",
          animationSpeed: 0.4,
          loop: true,
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts transform origins in resource transforms", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          resources: {
            transforms: {
              centerStage: {
                x: 960,
                y: 540,
                anchorX: 0.5,
                anchorY: 0.5,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                originX: 64,
                originY: 128,
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("accepts background colorId in presentation actions", () => {
    expect(
      validatePresentationActions({
        background: {
          colorId: "backdrop",
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();

    expect(
      validateProjectData(
        createMinimalProjectData({
          resources: {
            colors: {
              backdrop: {
                hex: "#101820",
              },
            },
          },
          story: {
            initialSceneId: "scene1",
            scenes: {
              scene1: {
                name: "Scene 1",
                initialSectionId: "section1",
                sections: {
                  section1: {
                    name: "Section 1",
                    lines: [
                      {
                        id: "line1",
                        actions: {
                          background: {
                            colorId: "backdrop",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("accepts background opacity and blur in presentation actions", () => {
    expect(
      validatePresentationActions({
        background: {
          opacity: 0.72,
          blur: {
            x: 6,
            y: 9,
            quality: 3,
            kernelSize: 9,
            repeatEdgePixels: true,
          },
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();

    expect(
      validatePresentationActions({
        background: {
          blur: null,
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts screen opacity and blur in presentation actions", () => {
    expect(
      validatePresentationActions({
        screen: {
          opacity: 0.72,
          blur: {
            x: 6,
            y: 9,
            quality: 3,
            kernelSize: 9,
            repeatEdgePixels: true,
          },
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();

    expect(
      validatePresentationActions({
        screen: {
          blur: null,
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts character and visual item transform overrides and appearance in presentation actions", () => {
    expect(
      validatePresentationActions({
        character: {
          items: [
            {
              id: "lead",
              transformId: "center",
              x: 920,
              y: 980,
              anchorX: 0.5,
              anchorY: 1,
              scaleX: 0.8,
              scaleY: 0.9,
              rotation: 12,
              originX: 64,
              originY: 128,
              opacity: 0.72,
              blur: {
                x: 6,
                y: 9,
                quality: 3,
                kernelSize: 9,
                repeatEdgePixels: true,
              },
              sprites: [
                {
                  id: "body",
                  resourceId: "leadBody",
                  animationName: "idle",
                  animationSpeed: 0.25,
                  loop: true,
                },
              ],
            },
          ],
        },
        visual: {
          items: [
            {
              id: "fog",
              resourceId: "fog",
              transformId: "fullscreen",
              x: 100,
              y: 120,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1.2,
              scaleY: 1.3,
              rotation: -8,
              originX: 20,
              originY: 40,
              opacity: 0.45,
              blur: null,
            },
          ],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts text-backed visual items with rich text content", () => {
    expect(
      validatePresentationActions({
        visual: {
          items: [
            {
              id: "title",
              text: {
                content: [
                  {
                    text: "Kanji",
                    furigana: {
                      text: "furigana",
                      textStyleId: "ruby",
                    },
                  },
                  {
                    text: " title",
                    textStyleId: "accent",
                  },
                ],
                textStyleId: "title",
                width: 640,
              },
              transformId: "titleTop",
              layer: 70,
              opacity: 0.9,
              animations: {
                resourceId: "fadeIn",
              },
            },
          ],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts partial text-backed visual item patches", () => {
    expect(
      validatePresentationActions({
        visual: {
          items: [
            {
              id: "title",
              text: {
                content: "Chapter 2",
              },
            },
            {
              id: "subtitle",
              text: {
                textStyleId: "subtitleMuted",
              },
            },
          ],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("rejects ambiguous text-backed visual items", () => {
    expect(
      validatePresentationActions({
        visual: {
          items: [
            {
              id: "title",
              resourceId: "titleImage",
              text: {
                content: "Chapter 1",
                textStyleId: "title",
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      validatePresentationActions({
        visual: {
          items: [
            {
              id: "title",
              text: {
                type: "text",
                content: "Chapter 1",
                textStyleId: "title",
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("requires transformId when character sprites are supplied", () => {
    expect(
      validatePresentationActions({
        character: {
          items: [
            {
              id: "lead",
              sprites: [
                {
                  id: "body",
                  resourceId: "leadBody",
                },
              ],
            },
          ],
        },
      }),
    ).toBe(false);
    expect(validatePresentationActions.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/character/items/0",
          keyword: "required",
          params: expect.objectContaining({
            missingProperty: "transformId",
          }),
        }),
      ]),
    );
  });

  it("accepts predefined visual layers in presentation actions", () => {
    expect(
      validatePresentationActions({
        visual: {
          items: [
            {
              id: "fog",
              resourceId: "fog",
              transformId: "fullscreen",
              layer: 30,
            },
            {
              id: "sparkle",
              resourceId: "sparkle",
              transformId: "fullscreen",
              layer: 70,
            },
            {
              id: "vignette",
              resourceId: "vignette",
              transformId: "fullscreen",
              layer: 90,
            },
          ],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("rejects non-visual layer values", () => {
    expect(
      validatePresentationActions({
        visual: {
          items: [
            {
              id: "fog",
              resourceId: "fog",
              layer: 20,
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      validatePresentationActions({
        visual: {
          items: [
            {
              id: "vignette",
              resourceId: "vignette",
              layer: 80,
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("accepts animation playback continuity in presentation action payloads", () => {
    expect(
      validatePresentationActions({
        background: {
          resourceId: "bg1",
          animations: {
            resourceId: "fadeIn",
            playback: {
              continuity: "persistent",
              speed: 2,
            },
          },
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts animation playback speed without explicit continuity", () => {
    expect(
      validatePresentationActions({
        character: {
          items: [
            {
              id: "hero",
              animations: {
                resourceId: "slide",
                playback: {
                  speed: 0.5,
                },
              },
            },
          ],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("rejects invalid animation playback speed in presentation actions", () => {
    expect(
      validatePresentationActions({
        visual: {
          items: [
            {
              id: "burst",
              animations: {
                resourceId: "pulse",
                playback: {
                  speed: 0,
                },
              },
            },
          ],
        },
      }),
    ).toBe(false);
    expect(validatePresentationActions.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/visual/items/0/animations/playback/speed",
          keyword: "exclusiveMinimum",
        }),
      ]),
    );
  });

  it("accepts whole-screen animation selections in presentation actions", () => {
    expect(
      validatePresentationActions({
        screen: {
          animations: {
            resourceId: "screenCrossFade",
          },
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();

    expect(
      validateProjectData(
        createMinimalProjectData({
          story: {
            initialSceneId: "scene1",
            scenes: {
              scene1: {
                name: "Scene 1",
                initialSectionId: "section1",
                sections: {
                  section1: {
                    name: "Section 1",
                    lines: [
                      {
                        id: "line1",
                        actions: {
                          screen: {
                            animations: {
                              resourceId: "screenCrossFade",
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("accepts whole-screen transition payloads on section navigation actions", () => {
    expect(
      validateSystemActions({
        sectionTransition: {
          sectionId: "chapter2",
          screen: {
            animations: {
              resourceId: "screenCrossFade",
            },
          },
        },
        resetStoryAtSection: {
          sectionId: "title",
          screen: {
            animations: {
              resourceId: "screenMaskReveal",
            },
          },
        },
      }),
    ).toBe(true);
    expect(validateSystemActions.errors).toBeNull();

    expect(
      validateProjectData(
        createMinimalProjectData({
          story: {
            initialSceneId: "scene1",
            scenes: {
              scene1: {
                name: "Scene 1",
                initialSectionId: "section1",
                sections: {
                  section1: {
                    name: "Section 1",
                    lines: [
                      {
                        id: "line1",
                        actions: {
                          sectionTransition: {
                            sectionId: "section2",
                            screen: {
                              animations: {
                                resourceId: "screenCrossFade",
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                  section2: {
                    name: "Section 2",
                    lines: [
                      {
                        id: "line1",
                        actions: {
                          resetStoryAtSection: {
                            sectionId: "section1",
                            screen: {
                              animations: {
                                resourceId: "screenMaskReveal",
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("accepts dialogue character override and persistCharacter in presentation actions", () => {
    expect(
      validatePresentationActions({
        dialogue: {
          characterId: "alice",
          character: {
            name: "Alias",
          },
          persistCharacter: true,
          content: [{ text: "Hello" }],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts dialogue textSpeed as a one-line reveal speed override", () => {
    expect(
      validatePresentationActions({
        dialogue: {
          textSpeed: 12,
          content: [{ text: "Hello" }],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("rejects non-numeric dialogue textSpeed overrides", () => {
    expect(
      validatePresentationActions({
        dialogue: {
          textSpeed: "slow",
          content: [{ text: "Hello" }],
        },
      }),
    ).toBe(false);
    expect(validatePresentationActions.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/dialogue/textSpeed",
          keyword: "type",
        }),
      ]),
    );
  });

  it("accepts layered dialogue character sprite groups in presentation actions", () => {
    expect(
      validatePresentationActions({
        dialogue: {
          characterId: "alice",
          character: {
            name: "Alias",
            sprite: {
              transformId: "dialoguePortraitLeft",
              items: [
                {
                  id: "base",
                  resourceId: "aliceBody",
                  animationName: "idle",
                  animationSpeed: 0.25,
                  loop: true,
                },
                { id: "face", resourceId: "aliceSmile" },
              ],
              animations: {
                resourceId: "portraitIn",
                playback: {
                  continuity: "render",
                },
              },
            },
          },
          content: [{ text: "Hello" }],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts dialogue characterName as a compatibility alias", () => {
    expect(
      validatePresentationActions({
        dialogue: {
          characterId: "alice",
          characterName: "Alias",
          content: [{ text: "Hello" }],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts BGM actions with authored volume", () => {
    expect(
      validatePresentationActions({
        bgm: {
          resourceId: "music_1",
          loop: true,
          volume: 75,
          startDelayMs: 120,
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("accepts multi-sound BGM and Voice channels and arbitrary SFX channels", () => {
    expect(
      validatePresentationActions({
        bgm: {
          volume: 80,
          muted: false,
          pan: -0.25,
          sounds: [
            {
              id: "theme",
              resourceId: "music_1",
              loop: true,
              muted: false,
              pan: -0.4,
              playbackRate: 1.25,
              startAt: 2,
              endAt: 12,
            },
            { id: "ambience", resourceId: "forest", volume: 40 },
          ],
        },
        voice: {
          volume: 90,
          sounds: [
            { id: "alice", resourceId: "alice_001" },
            {
              id: "narrator",
              resourceId: "narrator_001",
              startDelayMs: 200,
              endAt: null,
            },
          ],
        },
        sfx: {
          channels: [
            {
              id: "ui",
              volume: 80,
              sounds: [{ id: "click", resourceId: "click" }],
            },
            {
              id: "environment",
              pan: 0.5,
              sounds: [{ id: "rain", resourceId: "rain", loop: true }],
            },
          ],
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
  });

  it("rejects invalid sound output and playback controls", () => {
    const invalidSoundOverrides = [
      { muted: "yes" },
      { pan: 1.1 },
      { playbackRate: -0.1 },
      { startAt: -1 },
      { endAt: -1 },
    ];

    invalidSoundOverrides.forEach((override) => {
      expect(
        validatePresentationActions({
          sfx: {
            channels: [
              {
                id: "ui",
                sounds: [{ id: "invalid", resourceId: "invalid", ...override }],
              },
            ],
          },
        }),
      ).toBe(false);
    });
  });

  it("rejects legacy single-sound fields on canonical BGM and Voice actions", () => {
    const legacyFields = [
      ["resourceId", "legacy"],
      ["loop", false],
      ["startDelayMs", 500],
    ];

    ["bgm", "voice"].forEach((actionType) => {
      legacyFields.forEach(([field, value]) => {
        expect(
          validatePresentationActions({
            [actionType]: {
              sounds: [{ id: "canonical", resourceId: "canonical" }],
              [field]: value,
            },
          }),
        ).toBe(false);
      });
    });
  });

  it("rejects mixing legacy SFX items with channels", () => {
    expect(
      validatePresentationActions({
        sfx: {
          items: [{ id: "legacy", resourceId: "legacy" }],
          channels: [{ id: "ui", sounds: [] }],
        },
      }),
    ).toBe(false);
  });

  it("accepts sound defaults in global and scene-grouped voice resources", () => {
    expect(
      validatePresentationActions({
        voice: {
          resourceId: "alice_001",
          volume: 75,
          loop: false,
          startDelayMs: 120,
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();

    expect(
      validateProjectData(
        createMinimalProjectData({
          resources: {
            sounds: {
              music_1: {
                fileId: "audio/music_1.ogg",
                muted: false,
                pan: -0.25,
                playbackRate: 1.1,
                startAt: 2,
                endAt: null,
              },
            },
            voices: {
              scene1: {
                alice_001: {
                  fileId: "voices/scene1/alice_001.ogg",
                  loop: true,
                  volume: 80,
                  muted: false,
                  pan: 0.25,
                  startDelayMs: 120,
                  playbackRate: 0.9,
                  startAt: 1,
                  endAt: 4,
                },
              },
            },
          },
          story: {
            initialSceneId: "scene1",
            scenes: {
              scene1: {
                name: "Scene 1",
                initialSectionId: "section1",
                sections: {
                  section1: {
                    name: "Section 1",
                    lines: [
                      {
                        id: "line1",
                        actions: {
                          voice: {
                            resourceId: "alice_001",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("rejects raw fileId on voice presentation actions", () => {
    expect(
      validatePresentationActions({
        voice: {
          fileId: "voices/scene1/alice_001.ogg",
        },
      }),
    ).toBe(false);
    expect(validatePresentationActions.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "additionalProperties",
          params: expect.objectContaining({
            additionalProperty: "fileId",
          }),
        }),
      ]),
    );
  });

  it("rejects legacy audio delay fields", () => {
    expect(
      validatePresentationActions({
        bgm: {
          resourceId: "theme",
          delay: 100,
        },
      }),
    ).toBe(false);
    expect(validatePresentationActions.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "additionalProperties",
          params: expect.objectContaining({
            additionalProperty: "delay",
          }),
        }),
      ]),
    );

    expect(
      validatePresentationActions({
        sfx: {
          items: [
            {
              id: "click",
              resourceId: "click",
              delay: 100,
            },
          ],
        },
      }),
    ).toBe(false);
    expect(validatePresentationActions.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "additionalProperties",
          params: expect.objectContaining({
            additionalProperty: "delay",
          }),
        }),
      ]),
    );

    expect(
      validatePresentationActions({
        voice: {
          resourceId: "alice_001",
          delay: 100,
        },
      }),
    ).toBe(false);
    expect(validatePresentationActions.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "additionalProperties",
          params: expect.objectContaining({
            additionalProperty: "delay",
          }),
        }),
      ]),
    );
  });

  it("parses all VT YAML specs", () => {
    const vtSpecsRoot = path.join(repoRoot, "vt", "specs");
    const vtSpecPaths = collectYamlFiles(vtSpecsRoot);
    const parseFailures = [];

    for (const specPath of vtSpecPaths) {
      try {
        loadAll(readFileSync(specPath, "utf8")).filter(
          (document) => document !== undefined,
        );
      } catch (error) {
        parseFailures.push({
          specPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    expect(parseFailures).toEqual([]);
  });

  it("rejects non-hex color resources", () => {
    const projectData = createMinimalProjectData({
      resources: {
        colors: {
          colorPrimary: {
            hex: "white",
          },
        },
      },
    });

    expect(validateProjectData(projectData)).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/resources/colors/colorPrimary/hex",
        }),
      ]),
    );
  });

  it("rejects authored projectData.contexts", () => {
    const projectData = createMinimalProjectData({
      contexts: {
        replay: {},
      },
    });

    expect(validateProjectData(projectData)).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "additionalProperties",
          params: expect.objectContaining({
            additionalProperty: "contexts",
          }),
        }),
      ]),
    );
  });

  it("rejects legacy animations.in/out/update selection objects", () => {
    const projectData = createMinimalProjectData({
      story: {
        initialSceneId: "scene1",
        scenes: {
          scene1: {
            name: "Scene 1",
            initialSectionId: "section1",
            sections: {
              section1: {
                name: "Section 1",
                lines: [
                  {
                    id: "line1",
                    actions: {
                      background: {
                        resourceId: "bg1",
                        animations: {
                          in: {
                            resourceId: "fadeIn",
                          },
                        },
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

    expect(validateProjectData(projectData)).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath:
            "/story/scenes/scene1/sections/section1/lines/0/actions/background/animations",
        }),
      ]),
    );
  });

  it("rejects legacy animation resource types", () => {
    const projectData = createMinimalProjectData({
      resources: {
        animations: {
          fadeIn: {
            type: "live",
            tween: {
              alpha: {
                keyframes: [
                  {
                    duration: 500,
                    value: 1,
                  },
                ],
              },
            },
          },
          crossFade: {
            type: "replace",
            next: {
              tween: {
                alpha: {
                  keyframes: [
                    {
                      duration: 500,
                      value: 1,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    expect(validateProjectData(projectData)).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/resources/animations/fadeIn/type",
        }),
        expect.objectContaining({
          instancePath: "/resources/animations/crossFade/type",
        }),
      ]),
    );
  });

  it("rejects animation playback continuity authored on resources", () => {
    const projectData = createMinimalProjectData({
      resources: {
        animations: {
          fadeIn: {
            type: "transition",
            playback: {
              continuity: "persistent",
            },
            next: {
              tween: {
                alpha: {
                  keyframes: [
                    {
                      duration: 500,
                      value: 1,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    expect(validateProjectData(projectData)).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/resources/animations/fadeIn",
          keyword: "additionalProperties",
          params: expect.objectContaining({
            additionalProperty: "playback",
          }),
        }),
      ]),
    );
  });

  it("accepts templated save/load slot ids in system actions", () => {
    expect(
      validateSystemActions({
        saveSlot: {
          slotId: "${slot.slotId}",
        },
      }),
    ).toBe(true);
    expect(validateSystemActions.errors).toBeNull();

    expect(
      validateSystemActions({
        loadSlot: {
          slotId: "_event.slotId",
        },
      }),
    ).toBe(true);
    expect(validateSystemActions.errors).toBeNull();
  });

  it("accepts confirm dialog system actions", () => {
    expect(
      validateSystemActions({
        showConfirmDialog: {
          resourceId: "saveOverwriteConfirmLayout",
          confirmActions: {
            saveSlot: {
              slotId: "_event.slotId",
            },
          },
        },
      }),
    ).toBe(true);
    expect(validateSystemActions.errors).toBeNull();

    expect(
      validateSystemActions({
        hideConfirmDialog: {},
      }),
    ).toBe(true);
    expect(validateSystemActions.errors).toBeNull();
  });

  it("accepts conditional system actions", () => {
    expect(
      validateSystemActions({
        conditional: {
          branches: [
            {
              when: {
                gte: [{ var: "variables.trust" }, 70],
              },
              actions: {
                jumpToLine: {
                  lineId: "trustedRoute",
                },
              },
            },
            {
              actions: {
                jumpToLine: {
                  lineId: "fallbackRoute",
                },
              },
            },
          ],
        },
      }),
    ).toBe(true);
    expect(validateSystemActions.errors).toBeNull();
  });

  it("accepts conditional actions on story lines", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          story: {
            initialSceneId: "scene1",
            scenes: {
              scene1: {
                name: "Scene 1",
                initialSectionId: "section1",
                sections: {
                  section1: {
                    name: "Section 1",
                    lines: [
                      {
                        id: "line1",
                        actions: {
                          conditional: {
                            branches: [
                              {
                                when: {
                                  eq: [{ var: "variables.role" }, "admin"],
                                },
                                actions: {
                                  jumpToLine: {
                                    lineId: "adminRoute",
                                  },
                                },
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("accepts computed variable declarations", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          resources: {
            variables: {
              hp: {
                type: "number",
                scope: "context",
                default: 80,
              },
              maxHp: {
                type: "number",
                scope: "context",
                default: 100,
              },
              hpPercent: {
                type: "number",
                scope: "context",
                computed: {
                  branches: [
                    {
                      when: {
                        lte: [{ var: "variables.maxHp" }, 0],
                      },
                      expr: 0,
                    },
                  ],
                  default: {
                    expr: {
                      round: [
                        {
                          mul: [
                            {
                              div: [
                                { var: "variables.hp" },
                                { var: "variables.maxHp" },
                              ],
                            },
                            100,
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              hpBadge: {
                type: "object",
                scope: "context",
                computed: {
                  value: {
                    text: "OK",
                    colorId: "green",
                  },
                },
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("rejects computed variables with top-level defaults", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          resources: {
            variables: {
              hpPercent: {
                type: "number",
                scope: "context",
                default: 0,
                computed: {
                  expr: 80,
                },
              },
            },
          },
        }),
      ),
    ).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/resources/variables/hpPercent",
          keyword: "not",
        }),
      ]),
    );
  });

  it("rejects string expression computed branch conditions", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          resources: {
            variables: {
              trustState: {
                type: "string",
                scope: "context",
                computed: {
                  branches: [
                    {
                      when: "variables.trust >= 70",
                      expr: "trusted",
                    },
                  ],
                  default: {
                    expr: "guarded",
                  },
                },
              },
            },
          },
        }),
      ),
    ).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath:
            "/resources/variables/trustState/computed/branches/0/when",
          keyword: "not",
        }),
      ]),
    );
  });

  it("rejects computed branches without explicit defaults", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          resources: {
            variables: {
              hpState: {
                type: "string",
                scope: "context",
                computed: {
                  branches: [
                    {
                      when: {
                        lte: [{ var: "variables.hp" }, 0],
                      },
                      expr: "down",
                    },
                  ],
                },
              },
            },
          },
        }),
      ),
    ).toBe(false);
    expect(validateProjectData.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/resources/variables/hpState/computed",
        }),
      ]),
    );
  });

  it("accepts boolean and number achievement resources", () => {
    expect(
      validateProjectData(
        createMinimalProjectData({
          resources: {
            achievements: {
              completeChapter: {
                type: "boolean",
                name: "Chapter Complete",
                description: "Complete the chapter.",
              },
              findEndings: {
                type: "number",
                target: 5,
                name: "Every Ending",
                description: "Find every ending.",
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(validateProjectData.errors).toBeNull();
  });

  it("enforces achievement target rules", () => {
    const numberWithoutTarget = createMinimalProjectData({
      resources: {
        achievements: {
          findEndings: {
            type: "number",
            name: "Every Ending",
            description: "Find every ending.",
          },
        },
      },
    });
    const booleanWithTarget = createMinimalProjectData({
      resources: {
        achievements: {
          completeChapter: {
            type: "boolean",
            target: 1,
            name: "Chapter Complete",
            description: "Complete the chapter.",
          },
        },
      },
    });

    expect(validateProjectData(numberWithoutTarget)).toBe(false);
    expect(validateProjectData(booleanWithTarget)).toBe(false);
  });

  it("accepts achievement authored actions", () => {
    expect(
      validateSystemActions({
        completeAchievement: {
          resourceId: "completeChapter",
        },
        setAchievementProgress: {
          resourceId: "findEndings",
          current: "${variables.endingsFound}",
        },
        showAchievements: {},
      }),
    ).toBe(true);
    expect(validateSystemActions.errors).toBeNull();
  });
});
