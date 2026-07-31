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

  it("accepts an active scene-replay context and rejects mismatched context kinds", () => {
    const projectData = createMinimalProjectData();
    projectData.resources = {
      images: {
        memory: {
          fileId: "memory.png",
          width: 320,
          height: 180,
        },
      },
      sceneReplay: {
        pageSize: 1,
        replays: [
          {
            sceneId: "scene1",
            title: "Memory",
            thumbnailImageId: "memory",
          },
        ],
      },
    };
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    engine.init({
      initialState: {
        projectData,
        global: {
          accountReplayRegistry: { sceneIds: ["scene1"] },
        },
      },
    });
    engine.handleAction("startSceneReplay", { sceneId: "scene1" });

    const systemState = toJsonSnapshot(engine.selectSystemState());
    expect(systemState.contexts).toHaveLength(2);
    expect(systemState.contexts[1]).toMatchObject({
      kind: "sceneReplay",
      sceneReplay: {
        sceneId: "scene1",
        entryId: 1,
        finishOnNextAdvance: false,
        exitOnLineCompleted: false,
      },
    });
    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();

    systemState.contexts[1].kind = "story";
    expect(validateSystemState(systemState)).toBe(false);
    expect(validateSystemState.errors).not.toBeNull();
  });

  it("accepts active music-room player and audio-command state", () => {
    const projectData = createMinimalProjectData();
    projectData.resources = {
      sounds: {
        theme: { fileId: "theme.ogg" },
      },
      musicRoom: {
        pageSize: 4,
        tracks: [{ id: "theme", soundId: "theme", title: "Theme" }],
      },
    };
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });
    engine.init({
      initialState: {
        projectData,
        global: {
          accountViewedRegistry: {
            sections: [],
            resources: [{ resourceId: "theme" }],
          },
        },
      },
    });
    engine.handleAction("playMusicRoomTrack", { trackId: "theme" });
    engine.handleInternalAction("musicRoomSoundReady", {
      id: "music-room:player",
      commandId: 2,
      positionMs: 0,
      durationMs: 10_000,
    });
    engine.handleAction("seekMusicRoom", { positionMs: 5_000 });

    const systemState = toJsonSnapshot(engine.selectSystemState());
    expect(systemState.global.musicRoomPlayer.seekFallback).toEqual({
      commandId: 3,
      status: "playing",
      positionMs: 0,
    });
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
    expect(
      systemState.global.saveSlots["1"].state.contexts[0].rollback
        .returnabilityVersion,
    ).toBe(1);
    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();
  });

  it.each([true, false])(
    "accepts optional rollback checkpoint returnable metadata set to %s",
    (returnable) => {
      const engine = createRouteEngine({
        handlePendingEffects: () => {},
      });

      engine.init({
        initialState: {
          projectData: createMinimalProjectData(),
        },
      });

      const systemState = toJsonSnapshot(engine.selectSystemState());
      systemState.contexts[0].rollback.timeline[0].returnable = returnable;

      expect(validateSystemState(systemState)).toBe(true);
      expect(validateSystemState.errors).toBeNull();
    },
  );

  it("rejects non-boolean rollback checkpoint eligibility metadata", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createMinimalProjectData(),
      },
    });

    const systemState = toJsonSnapshot(engine.selectSystemState());
    systemState.contexts[0].rollback.timeline[0].returnable = "false";

    expect(validateSystemState(systemState)).toBe(false);
    expect(validateSystemState.errors).not.toBeNull();
  });

  it("accepts numeric viewed resource IDs in account viewed state", () => {
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

    expect(systemState.global.accountViewedRegistry.resources).toEqual([
      { resourceId: 42 },
    ]);
    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();
  });

  it("accepts empty and selected image gallery navigation state", () => {
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    engine.init({
      initialState: {
        projectData: createMinimalProjectData(),
      },
    });

    const systemState = toJsonSnapshot(engine.selectSystemState());
    systemState.global.imageGalleryNavigation = {
      groupId: null,
      variantId: null,
      pageIndex: 0,
    };

    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();

    systemState.global.imageGalleryNavigation = {
      groupId: "festival",
      variantId: "night",
      pageIndex: 2,
    };

    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();
  });

  it.each([
    [
      "a missing field",
      {
        groupId: null,
        variantId: null,
      },
    ],
    [
      "a negative page index",
      {
        groupId: null,
        variantId: null,
        pageIndex: -1,
      },
    ],
    [
      "a fractional page index",
      {
        groupId: null,
        variantId: null,
        pageIndex: 1.5,
      },
    ],
    [
      "an unknown field",
      {
        groupId: null,
        variantId: null,
        pageIndex: 0,
        unknown: true,
      },
    ],
    [
      "only a group ID",
      {
        groupId: "festival",
        variantId: null,
        pageIndex: 0,
      },
    ],
    [
      "only a variant ID",
      {
        groupId: null,
        variantId: "night",
        pageIndex: 0,
      },
    ],
    [
      "an empty selected ID",
      {
        groupId: "festival",
        variantId: "",
        pageIndex: 0,
      },
    ],
  ])(
    "rejects image gallery navigation state with %s",
    (_label, imageGalleryNavigation) => {
      const engine = createRouteEngine({
        handlePendingEffects: () => {},
      });

      engine.init({
        initialState: {
          projectData: createMinimalProjectData(),
        },
      });

      const systemState = toJsonSnapshot(engine.selectSystemState());
      systemState.global.imageGalleryNavigation = imageGalleryNavigation;

      expect(validateSystemState(systemState)).toBe(false);
      expect(validateSystemState.errors).not.toBeNull();
    },
  );

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

  it("accepts achievement effects and rejects malformed achievement effects", () => {
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
        name: "completeAchievement",
        payload: { resourceId: "completeChapter" },
      },
      {
        name: "setAchievementProgress",
        payload: {
          resourceId: "findEndings",
          current: 3,
          target: 5,
          completed: false,
        },
      },
    ];

    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();

    systemState.global.pendingEffects = [
      {
        name: "setAchievementProgress",
        payload: {
          resourceId: "findEndings",
          current: 3,
          target: 5,
        },
      },
    ];
    expect(validateSystemState(systemState)).toBe(false);
    expect(validateSystemState.errors).not.toBeNull();
  });

  it("accepts replay-owned entered-line effects", () => {
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
        name: "handleLineActions",
        payload: { sceneReplaySceneId: "firstMeeting", entryId: 1 },
      },
    ];

    expect(validateSystemState(systemState)).toBe(true);
    expect(validateSystemState.errors).toBeNull();

    systemState.global.pendingEffects[0].payload.sceneReplaySceneId = "";
    expect(validateSystemState(systemState)).toBe(false);
    expect(validateSystemState.errors).not.toBeNull();
  });
});
