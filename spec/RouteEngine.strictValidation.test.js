import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { load, loadAll } from "js-yaml";
import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";
import { AUTHORED_ACTION_TYPES } from "../src/strictValidation.js";
import { createIntegrationProject } from "./integration/helpers/createEngineIntegrationHarness.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const LINES = "/projectData/story/scenes/scene/sections/main/lines";

const createEngine = (options = {}) => {
  let engine;
  engine = createRouteEngine({
    ...options,
    handlePendingEffects: (effects) => {
      if (effects.some(({ name }) => name === "handleLineActions")) {
        engine.handleLineActions();
      }
    },
  });
  return engine;
};

const createProjectData = () => ({
  screen: { width: 1280, height: 720 },
  resources: {
    controls: {},
    layouts: {},
    variables: {},
  },
  story: {
    initialSceneId: "scene",
    scenes: {
      scene: {
        initialSectionId: "main",
        sections: {
          main: {
            lines: [
              { id: "one", actions: {} },
              { id: "two", actions: {} },
            ],
          },
        },
      },
    },
  },
});

const createInitialState = (mutate = () => {}) => {
  const projectData = createProjectData();
  const initialState = { projectData };
  mutate(projectData, initialState);
  return initialState;
};

const captureError = (callback) => {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error("expected the callback to throw");
};

const initialize = (engine, initialState) =>
  engine.init({ namespace: "strict-validation", initialState });

const selectPointer = (engine) =>
  engine.selectSystemState().contexts.at(-1).pointers.read;

const setLineActions = (projectData, index, actions) => {
  projectData.story.scenes.scene.sections.main.lines[index].actions = actions;
};

// [name, mutate(projectData, initialState), expected strict failure]
const REJECTED_CASES = [
  [
    "a lone high surrogate in a string value",
    (p) => {
      p.resources.variables.playerName = {
        type: "string",
        scope: "context",
        default: "Ann\uD800",
      };
    },
    {
      code: "lone_surrogate",
      path: "/projectData/resources/variables/playerName/default",
    },
  ],
  [
    "a lone low surrogate in a line id",
    (p) => {
      p.story.scenes.scene.sections.main.lines[1].id = "two\uDC00";
    },
    { code: "lone_surrogate", path: `${LINES}/1/id` },
  ],
  [
    "a reversed surrogate pair",
    (p) => {
      p.story.scenes.scene.sections.main.lines[1].id = "\uDE00\uD83D";
    },
    { code: "lone_surrogate", path: `${LINES}/1/id` },
  ],
  [
    "a lone surrogate in an object key",
    (p) => {
      p.resources.variables["\uD83D"] = {
        type: "number",
        scope: "context",
        default: 0,
      };
    },
    { code: "lone_surrogate", path: "/projectData/resources/variables/\uD83D" },
  ],
  [
    "a lone surrogate below a key that needs JSON Pointer escaping",
    (p) => {
      p.resources.variables["a/b~c"] = {
        type: "string",
        scope: "context",
        default: "\uDFFF",
      };
    },
    {
      code: "lone_surrogate",
      path: "/projectData/resources/variables/a~1b~0c/default",
    },
  ],
  [
    "a lone surrogate in L10n data",
    (p, initialState) => {
      p.story.scenes.scene.sections.main.lines[0].actions = {
        dialogue: { content: [{ text: "Hello" }] },
      };
      initialState.l10nData = {
        packages: {
          ja: {
            language: "Japanese",
            files: [],
            patches: [
              {
                type: "line.dialogue",
                lineId: "one",
                payload: { content: [{ text: "\uD800" }] },
              },
            ],
          },
        },
      };
    },
    {
      code: "lone_surrogate",
      path: "/l10nData/packages/ja/patches/0/payload/content/0/text",
    },
  ],
  [
    "a __proto__ keyboard binding",
    (p) => {
      p.resources.controls.keys = {
        keyboard: JSON.parse('{"__proto__":{"actions":{"nextLine":{}}}}'),
      };
    },
    {
      code: "reserved_key",
      path: "/projectData/resources/controls/keys/keyboard/__proto__",
    },
  ],
  [
    "a constructor keyboard binding",
    (p) => {
      p.resources.controls.keys = {
        keyboard: { constructor: { actions: { nextLine: {} } } },
      };
    },
    {
      code: "reserved_key",
      path: "/projectData/resources/controls/keys/keyboard/constructor",
    },
  ],
  [
    "a prototype key in layout data",
    (p) => {
      p.resources.layouts.menu = { elements: [], prototype: {} };
    },
    {
      code: "reserved_key",
      path: "/projectData/resources/layouts/menu/prototype",
    },
  ],
  [
    "a __proto__ action name",
    (p) => setLineActions(p, 1, JSON.parse('{"__proto__":{}}')),
    { code: "reserved_key", path: `${LINES}/1/actions/__proto__` },
  ],
  [
    "an unknown top-level project key",
    (p) => {
      p.unknownKey = 1;
    },
    { code: "unknown_field", path: "/projectData/unknownKey" },
  ],
  [
    "a missing screen",
    (p) => {
      delete p.screen;
    },
    { code: "missing_field", path: "/projectData/screen" },
  ],
  [
    "a zero screen width",
    (p) => {
      p.screen.width = 0;
    },
    { code: "invalid_value", path: "/projectData/screen/width" },
  ],
  [
    "a fractional screen width",
    (p) => {
      p.screen.width = 1280.5;
    },
    { code: "invalid_value", path: "/projectData/screen/width" },
  ],
  [
    "a string screen width",
    (p) => {
      p.screen.width = "1280";
    },
    { code: "invalid_value", path: "/projectData/screen/width" },
  ],
  [
    "a non-finite screen height",
    (p) => {
      p.screen.height = Number.NaN;
    },
    { code: "invalid_value", path: "/projectData/screen/height" },
  ],
  [
    "an unknown screen field",
    (p) => {
      p.screen.depth = 32;
    },
    { code: "unknown_field", path: "/projectData/screen/depth" },
  ],
  [
    "a non-object resources value",
    (p) => {
      p.resources = "none";
    },
    { code: "invalid_value", path: "/projectData/resources" },
  ],
  [
    "an unknown initial line",
    (p) => {
      p.story.scenes.scene.sections.main.initialLineId = "ghost";
    },
    {
      code: "unknown_reference",
      path: "/projectData/story/scenes/scene/sections/main/initialLineId",
    },
  ],
  [
    "a line without an id",
    (p) => {
      p.story.scenes.scene.sections.main.lines.push({ actions: {} });
    },
    { code: "missing_field", path: `${LINES}/2/id` },
  ],
  [
    "a section without lines",
    (p) => {
      p.story.scenes.scene.sections.later = {};
    },
    {
      code: "missing_field",
      path: "/projectData/story/scenes/scene/sections/later/lines",
    },
  ],
  [
    "an unknown action name",
    (p) => setLineActions(p, 1, { teleport: {} }),
    { code: "unknown_action", path: `${LINES}/1/actions/teleport` },
  ],
  [
    "an inherited Object.prototype member as an action name",
    (p) => setLineActions(p, 1, { toString: {} }),
    { code: "unknown_action", path: `${LINES}/1/actions/toString` },
  ],
  [
    "a store selector as an action name",
    (p) => setLineActions(p, 1, { selectRenderState: {} }),
    { code: "unknown_action", path: `${LINES}/1/actions/selectRenderState` },
  ],
  [
    "an internal store action as an action name",
    (p) => setLineActions(p, 1, { appendPendingEffect: { name: "render" } }),
    { code: "unknown_action", path: `${LINES}/1/actions/appendPendingEffect` },
  ],
  [
    "an unknown action in a conditional branch",
    (p) =>
      setLineActions(p, 1, {
        conditional: { branches: [{ actions: { teleport: {} } }] },
      }),
    {
      code: "unknown_action",
      path: `${LINES}/1/actions/conditional/branches/0/actions/teleport`,
    },
  ],
  [
    "an unknown action in a weighted random outcome",
    (p) =>
      setLineActions(p, 1, {
        random: {
          distribution: {
            type: "weighted",
            outcomes: [{ weight: 1, actions: { teleport: {} } }],
          },
        },
      }),
    {
      code: "unknown_action",
      path: `${LINES}/1/actions/random/distribution/outcomes/0/actions/teleport`,
    },
  ],
  [
    "a null action payload",
    (p) => setLineActions(p, 1, { hideDialogueUI: null }),
    { code: "invalid_value", path: `${LINES}/1/actions/hideDialogueUI` },
  ],
  [
    "a string action payload",
    (p) => setLineActions(p, 1, { setMenuPage: "gallery" }),
    { code: "invalid_value", path: `${LINES}/1/actions/setMenuPage` },
  ],
  [
    "a null line actions map",
    (p) => setLineActions(p, 1, null),
    { code: "invalid_value", path: `${LINES}/1/actions` },
  ],
];

const readVtProjects = () => {
  const collect = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collect(fullPath);
      return entry.name.endsWith(".yaml") ? [fullPath] : [];
    });
  return collect(path.join(repoRoot, "vt", "specs"))
    .sort()
    .map((file) => {
      // VT specs keep L10n data next to the project, as vt/static/main.js does.
      const { l10nData, ...projectData } = loadAll(
        readFileSync(file, "utf8"),
      ).at(-1);
      return {
        name: path.relative(repoRoot, file),
        initialState:
          l10nData === undefined ? { projectData } : { projectData, l10nData },
      };
    });
};

describe("RouteEngine validation option", () => {
  it.each([undefined, "default", "strict"])("accepts %s", (validation) => {
    const engine = createEngine(validation === undefined ? {} : { validation });
    initialize(engine, createInitialState());
    expect(selectPointer(engine)).toMatchObject({
      sectionId: "main",
      lineId: "one",
    });
  });

  it.each(["Strict", "lenient", true, null, 1])(
    "rejects %s at engine creation",
    (validation) => {
      expect(() => createEngine({ validation })).toThrow(TypeError);
      expect(() => createEngine({ validation })).toThrow(
        'RouteEngine validation must be "default" or "strict" when provided',
      );
    },
  );
});

describe("strict validation at initialization", () => {
  it.each(REJECTED_CASES)("rejects %s", (_name, mutate, expected) => {
    const engine = createEngine({ validation: "strict" });
    const error = captureError(() =>
      initialize(engine, createInitialState(mutate)),
    );
    expect(error).toBeInstanceOf(Error);
    expect({ code: error.code, path: error.path }).toEqual(expected);
    expect(error.message).toContain(`(${expected.code})`);
    expect(engine.getNamespace()).toBeNull();
  });

  it.each(REJECTED_CASES)(
    "keeps accepting %s in the default mode",
    (_name, mutate) => {
      const engine = createEngine();
      initialize(engine, createInitialState(mutate));
      expect(selectPointer(engine).sectionId).toBe("main");
    },
  );

  it("shows the default-mode fallbacks that strict mode rejects", () => {
    const missingScreen = createEngine();
    initialize(
      missingScreen,
      createInitialState((p) => {
        delete p.screen;
        p.resources.colors = { black: { hex: "#000000" } };
        setLineActions(p, 0, { background: { colorId: "black" } });
      }),
    );
    const [backgroundColor] =
      missingScreen.selectRenderState().elements[0].children;
    expect(backgroundColor).toMatchObject({
      type: "rect",
      width: 1920,
      height: 1080,
    });

    const unknownInitialLine = createEngine();
    initialize(
      unknownInitialLine,
      createInitialState((p) => {
        p.story.scenes.scene.sections.main.initialLineId = "ghost";
      }),
    );
    expect(selectPointer(unknownInitialLine).lineId).toBe("ghost");

    const unknownAction = createEngine();
    initialize(
      unknownAction,
      createInitialState((p) => setLineActions(p, 1, { teleport: {} })),
    );
    unknownAction.handleAction("jumpToLine", { lineId: "two" });
    expect(selectPointer(unknownAction).lineId).toBe("two");
  });

  it("gives an unknown initial scene a code in strict mode", () => {
    const mutate = (p) => {
      p.story.initialSceneId = "ghost";
    };
    expect(() =>
      initialize(createEngine(), createInitialState(mutate)),
    ).toThrow(TypeError);
    const error = captureError(() =>
      initialize(
        createEngine({ validation: "strict" }),
        createInitialState(mutate),
      ),
    );
    expect({ code: error.code, path: error.path }).toEqual({
      code: "unknown_reference",
      path: "/projectData/story/initialSceneId",
    });
  });

  it("gives a cyclic reference a code and accepts shared references", () => {
    const cyclic = (p) => {
      p.resources.layouts.menu = { elements: [] };
      p.resources.layouts.menu.self = p.resources.layouts.menu;
    };
    expect(() =>
      initialize(createEngine(), createInitialState(cyclic)),
    ).toThrow(/circular/);
    const error = captureError(() =>
      initialize(
        createEngine({ validation: "strict" }),
        createInitialState(cyclic),
      ),
    );
    expect({ code: error.code, path: error.path }).toEqual({
      code: "invalid_value",
      path: "/projectData/resources/layouts/menu/self",
    });

    const engine = createEngine({ validation: "strict" });
    initialize(
      engine,
      createInitialState((p) => {
        const black = { hex: "#000000" };
        p.resources.colors = { black, shadow: black };
      }),
    );
    expect(selectPointer(engine).lineId).toBe("one");
  });

  it("accepts well-formed surrogate pairs and look-alike keys", () => {
    const engine = createEngine({ validation: "strict" });
    initialize(
      engine,
      createInitialState((p) => {
        p.resources.variables.emoji = {
          type: "string",
          scope: "context",
          default: "\u{1F680} rocket",
        };
        p.resources.controls.keys = {
          keyboard: {
            Constructor: { actions: { nextLine: {} } },
            toString: { actions: { nextLine: {} } },
          },
        };
      }),
    );
    expect(selectPointer(engine).lineId).toBe("one");
  });

  it("keeps the previous generation when a strict reinitialization fails", () => {
    const engine = createEngine({ validation: "strict" });
    initialize(engine, createInitialState());
    engine.handleAction("jumpToLine", { lineId: "two" });
    const before = engine.selectSystemState();

    const error = captureError(() =>
      initialize(
        engine,
        createInitialState((p) => {
          p.screen.width = -1;
        }),
      ),
    );

    expect(error.code).toBe("invalid_value");
    expect(engine.selectSystemState()).toEqual(before);
    engine.handleAction("jumpToLine", { lineId: "one" });
    expect(selectPointer(engine).lineId).toBe("one");
  });
});

describe("strict validation of updateProjectData", () => {
  const replaceProject = (engine, mutate) => {
    const projectData = createProjectData();
    mutate(projectData);
    engine.handleAction("updateProjectData", { projectData });
  };

  it.each([
    [
      "an unknown action",
      (p) => setLineActions(p, 0, { teleport: {} }),
      { code: "unknown_action", path: `${LINES}/0/actions/teleport` },
    ],
    [
      "a string screen height",
      (p) => {
        p.screen.height = "720";
      },
      { code: "invalid_value", path: "/projectData/screen/height" },
    ],
    [
      "a reserved resource id",
      (p) => {
        p.resources.layouts = JSON.parse('{"__proto__":{"elements":[]}}');
      },
      {
        code: "reserved_key",
        path: "/projectData/resources/layouts/__proto__",
      },
    ],
  ])("rejects %s without replacing state", (_name, mutate, expected) => {
    const engine = createEngine({ validation: "strict" });
    initialize(engine, createInitialState());
    const before = engine.selectSystemState();

    const error = captureError(() => replaceProject(engine, mutate));

    expect({ code: error.code, path: error.path }).toEqual(expected);
    expect(engine.selectSystemState()).toEqual(before);

    const defaultEngine = createEngine();
    initialize(defaultEngine, createInitialState());
    replaceProject(defaultEngine, mutate);
  });

  it("accepts a valid replacement", () => {
    const engine = createEngine({ validation: "strict" });
    initialize(engine, createInitialState());
    replaceProject(engine, (p) => {
      p.screen.width = 1920;
    });
    expect(engine.selectSystemState().projectData.screen.width).toBe(1920);
  });
});

describe("strict validation against existing fixtures", () => {
  it("authors the schema actions plus the documented public actions", () => {
    const schemaActionTypes = [
      "src/schemas/presentationActions.yaml",
      "src/schemas/systemActions.yaml",
    ].flatMap((file) =>
      Object.keys(
        load(readFileSync(path.join(repoRoot, file), "utf8")).properties,
      ),
    );
    const story = load(
      readFileSync(
        path.join(repoRoot, "src/schemas/projectData/story.yaml"),
        "utf8",
      ),
    );
    const lineActionTypes = Object.keys(
      story.properties.scenes.patternProperties["^.+$"].properties.sections
        .patternProperties["^.+$"].properties.lines.items.properties.actions
        .properties,
    );

    expect(new Set(lineActionTypes)).toEqual(new Set(schemaActionTypes));
    expect(new Set(AUTHORED_ACTION_TYPES)).toEqual(
      new Set([
        ...schemaActionTypes,
        "addViewedLine",
        "addViewedResource",
        "updateProjectData",
      ]),
    );
    expect(AUTHORED_ACTION_TYPES).toHaveLength(
      new Set(AUTHORED_ACTION_TYPES).size,
    );
  });

  it("accepts every VT project the default mode accepts", () => {
    // complete/one.yaml still authors `nextConfig`, an action removed in the
    // v0.1.0 rewrite that the default mode silently skips.
    const expectedRejections = {
      "vt/specs/complete/one.yaml": {
        code: "unknown_action",
        path: "/projectData/story/scenes/39kd932/sections/2dk302s/lines/0/actions/nextConfig",
      },
    };
    const projects = readVtProjects();
    const rejections = {};

    for (const { name, initialState } of projects) {
      initialize(
        createRouteEngine({ handlePendingEffects: () => {} }),
        structuredClone(initialState),
      );
      try {
        initialize(
          createRouteEngine({
            validation: "strict",
            handlePendingEffects: () => {},
          }),
          structuredClone(initialState),
        );
      } catch (error) {
        rejections[name] = { code: error.code, path: error.path };
      }
    }

    expect(projects.length).toBeGreaterThan(200);
    expect(rejections).toEqual(expectedRejections);
  });

  it("accepts the integration harness project shape", () => {
    const projectData = createIntegrationProject({
      sections: {
        main: {
          lines: [
            {
              id: "start",
              actions: {
                addViewedLine: { sectionId: "main", lineId: "start" },
              },
            },
            { id: "next" },
          ],
        },
      },
    });
    const engine = createEngine({ validation: "strict" });
    initialize(engine, { projectData });
    expect(selectPointer(engine).lineId).toBe("start");
  });
});
