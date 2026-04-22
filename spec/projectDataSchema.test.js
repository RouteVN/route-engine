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

  it("accepts background transformId in presentation actions", () => {
    expect(
      validatePresentationActions({
        background: {
          resourceId: "bg1",
          transformId: "centerStage",
        },
      }),
    ).toBe(true);
    expect(validatePresentationActions.errors).toBeNull();
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
});
