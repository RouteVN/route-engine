import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import { load } from "js-yaml";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const schemasRoot = path.join(repoRoot, "src", "schemas");
const schemaBaseUrl = "https://route-engine.runtime/schemas/";
const presentationActionsSchemaId = new URL(
  "presentationActions.yaml",
  schemaBaseUrl,
).href;
const resourcesSchemaId = new URL("projectData/resources.yaml", schemaBaseUrl)
  .href;
const generatedPath = path.join(
  repoRoot,
  "src",
  "generated",
  "l10nPayloadValidators.js",
);

const actionTypes = [
  "background",
  "bgm",
  "character",
  "choice",
  "cleanAll",
  "control",
  "dialogue",
  "form",
  "layout",
  "screen",
  "sfx",
  "visual",
  "voice",
];

const resourceCollections = {
  achievement: "achievements",
  animation: "animations",
  audioEffect: "audioEffects",
  character: "characters",
  color: "colors",
  control: "controls",
  font: "fonts",
  image: "images",
  layout: "layouts",
  particle: "particles",
  sound: "sounds",
  spritesheet: "spritesheets",
  textStyle: "textStyles",
  transform: "transforms",
  video: "videos",
};

const annotationKeys = new Set(["$schema", "default", "description", "title"]);
const schemaMapKeys = new Set([
  "$defs",
  "definitions",
  "patternProperties",
  "properties",
]);
const schemaValueKeys = new Set([
  "additionalProperties",
  "contains",
  "else",
  "if",
  "items",
  "not",
  "propertyNames",
  "then",
]);
const schemaArrayKeys = new Set(["allOf", "anyOf", "oneOf"]);

const collectYamlFiles = (dirPath) =>
  readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return collectYamlFiles(fullPath);
    }
    return entry.isFile() && fullPath.endsWith(".yaml") ? [fullPath] : [];
  });

const stripSchemaAnnotations = (schema) => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }

  return Object.fromEntries(
    Object.entries(schema).flatMap(([key, value]) => {
      if (annotationKeys.has(key)) {
        return [];
      }
      if (schemaMapKeys.has(key)) {
        return [
          [
            key,
            Object.fromEntries(
              Object.entries(value).map(([name, childSchema]) => [
                name,
                stripSchemaAnnotations(childSchema),
              ]),
            ),
          ],
        ];
      }
      if (schemaValueKeys.has(key) && value && typeof value === "object") {
        return [[key, stripSchemaAnnotations(value)]];
      }
      if (schemaArrayKeys.has(key)) {
        return [[key, value.map(stripSchemaAnnotations)]];
      }
      return [[key, value]];
    }),
  );
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

const loadSchemas = () =>
  collectYamlFiles(schemasRoot).map((schemaPath) => {
    const schemaId = path
      .relative(schemasRoot, schemaPath)
      .split(path.sep)
      .join("/");
    return {
      ...rewriteSchemaRefs(
        stripSchemaAnnotations(load(readFileSync(schemaPath, "utf8"))),
        schemaId,
      ),
      $id: new URL(schemaId, schemaBaseUrl).href,
    };
  });

const upperFirst = (value) => value[0].toUpperCase() + value.slice(1);

export const generateL10nPayloadValidators = async () => {
  const ajv = new Ajv({
    allErrors: true,
    inlineRefs: false,
    code: {
      esm: true,
      source: true,
    },
    strict: false,
  });
  loadSchemas().forEach((schema) => ajv.addSchema(schema));

  const validators = {};
  actionTypes.forEach((actionType) => {
    const validatorId = new URL(
      `runtime/action-${actionType}.json`,
      schemaBaseUrl,
    ).href;
    ajv.addSchema({
      $id: validatorId,
      $ref: `${presentationActionsSchemaId}#/properties/${actionType}`,
    });
    validators[`validateAction${upperFirst(actionType)}`] = validatorId;
  });
  Object.entries(resourceCollections).forEach(
    ([resourceType, collectionName]) => {
      const validatorId = new URL(
        `runtime/resource-${resourceType}.json`,
        schemaBaseUrl,
      ).href;
      ajv.addSchema({
        $id: validatorId,
        $ref: `${resourcesSchemaId}#/properties/${collectionName}/patternProperties/^.+$`,
      });
      validators[`validateResource${upperFirst(resourceType)}`] = validatorId;
    },
  );

  const source = standaloneCode(ajv, validators);
  return `// Generated by scripts/generate-l10n-payload-validators.js. Do not edit.\n${source}\n`;
};

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  mkdirSync(path.dirname(generatedPath), { recursive: true });
  writeFileSync(generatedPath, await generateL10nPayloadValidators());
}
