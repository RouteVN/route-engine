import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import { load } from "js-yaml";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import createRouteEngine from "../src/RouteEngine.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const schemasRoot = path.join(repoRoot, "src", "schemas");
const schemaBaseUrl = "https://route-engine.test/schemas/";
const systemStateSchemaId = new URL(
  "systemState/systemState.yaml",
  schemaBaseUrl,
).href;
const schemaRoots = [
  path.join(schemasRoot, "projectData"),
  path.join(schemasRoot, "presentationActions.yaml"),
  path.join(schemasRoot, "systemActions.yaml"),
  path.join(schemasRoot, "systemState"),
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
  const schemaPaths = schemaRoots.flatMap((schemaPath) => {
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

const validateSystemState = createValidator(systemStateSchemaId);

const toJsonSnapshot = (value) => JSON.parse(JSON.stringify(value));

const createMinimalProjectData = () => ({
  screen: {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
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
});

describe("systemState schema", () => {
  it("accepts the initial engine state snapshot", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createMinimalProjectData(),
      },
    });

    const systemState = toJsonSnapshot(engine.selectSystemState());

    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();
  });

  it("accepts saved slot entries with an explicit formatVersion", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createMinimalProjectData(),
      },
    });

    engine.handleAction("saveSlot", {
      slotId: 1,
      thumbnailImage: null,
      savedAt: 1701234567890,
    });

    const systemState = toJsonSnapshot(engine.selectSystemState());

    expect(systemState.global.saveSlots["1"].formatVersion).toBe(1);
    expect(systemState.global.saveSlots["1"].state.viewedRegistry).toBeUndefined();
    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();
  });

  it("accepts numeric viewed resource IDs in runtime state", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createMinimalProjectData(),
      },
    });

    engine.handleAction("addViewedResource", {
      resourceId: 42,
    });

    const systemState = toJsonSnapshot(engine.selectSystemState());

    expect(systemState.global.viewedRegistry.resources).toEqual([
      { resourceId: 42 },
    ]);
    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();
  });

  it("rejects malformed built-in pending effects", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createMinimalProjectData(),
      },
    });

    const systemState = toJsonSnapshot(engine.selectSystemState());
    systemState.global.pendingEffects = [
      {
        name: "render",
        payload: { oops: true },
      },
    ];

    expect(validateSystemState(systemState)).toBe(false);
    expect(validateSystemState.errors).not.toBeNull();
  });
});
