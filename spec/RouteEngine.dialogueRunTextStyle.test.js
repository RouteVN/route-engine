import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const BODY_ID = "@layout/dialogue-container--body";

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
  return undefined;
};

const createProjectData = ({ content, bodyOverrides = {} } = {}) => ({
  screen: { width: 1920, height: 1080 },
  resources: {
    layouts: {
      advDialogue: {
        mode: "adv",
        elements: [
          {
            id: "body",
            type: "text-revealing",
            content: "${dialogue.content}",
            textStyleId: "body",
            ...bodyOverrides,
          },
        ],
      },
    },
    characters: {},
    variables: {},
    fonts: { fontMain: { fileId: "Arial" } },
    colors: { fg: { hex: "#FFFFFF" } },
    textStyles: {
      body: {
        fontId: "fontMain",
        colorId: "fg",
        fontSize: 40,
        fontWeight: "400",
        fontStyle: "normal",
        lineHeight: 1.2,
      },
    },
  },
  story: {
    initialSceneId: "scene",
    scenes: {
      scene: {
        initialSectionId: "section",
        sections: {
          section: {
            initialLineId: "line",
            lines: [
              {
                id: "line",
                actions: {
                  dialogue: {
                    mode: "adv",
                    ui: { resourceId: "advDialogue" },
                    content: content ?? [
                      { text: "Plain " },
                      { text: "bold ", textStyle: { fontWeight: "bold" } },
                      { text: "italic ", textStyle: { fontStyle: "italic" } },
                      {
                        text: "underline ",
                        textStyle: { textDecoration: "underline" },
                      },
                      { text: "accent", textStyle: { fill: "#b45309" } },
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
});

const createEngine = () =>
  createRouteEngine({
    handlePendingEffects: () => {},
  });

describe("RouteEngine dialogue run text styles", () => {
  it("hands the renderer each run's inline textStyle beside the element style", () => {
    const engine = createEngine();

    engine.init({ initialState: { projectData: createProjectData() } });

    const body = findElementById(engine.selectRenderState().elements, BODY_ID);

    expect(body.content).toEqual([
      { text: "Plain " },
      { text: "bold ", textStyle: { fontWeight: "bold" } },
      { text: "italic ", textStyle: { fontStyle: "italic" } },
      { text: "underline ", textStyle: { textDecoration: "underline" } },
      { text: "accent", textStyle: { fill: "#b45309" } },
    ]);
    // The renderer merges a run's textStyle over the element's textStyle, so
    // the element keeps the font, size, and colour a bold run inherits.
    expect(body.textStyle).toEqual({
      fontFamily: "Arial",
      fontSize: 40,
      fontWeight: "400",
      fontStyle: "normal",
      lineHeight: 1.2,
      fill: "#FFFFFF",
    });
  });

  it("does not change the authored project data", () => {
    const projectData = createProjectData();
    const snapshot = structuredClone(projectData);
    const engine = createEngine();

    engine.init({ initialState: { projectData } });
    engine.selectRenderState();

    expect(projectData).toEqual(snapshot);
    expect(engine.selectSystemState().projectData).toEqual(snapshot);
  });

  it("keeps styled runs when appended dialogue extends the same line", () => {
    const projectData = createProjectData({
      content: [{ text: "Held ", textStyle: { fontWeight: "bold" } }],
    });
    projectData.story.scenes.scene.sections.section.lines.push({
      id: "line-2",
      actions: {
        dialogue: {
          append: true,
          content: [{ text: "then", textStyle: { fontStyle: "italic" } }],
        },
      },
    });
    const engine = createEngine();
    engine.init({ initialState: { projectData } });

    engine.handleAction("markLineCompleted", {});
    engine.handleActions({ nextLine: {} });

    const body = findElementById(engine.selectRenderState().elements, BODY_ID);
    expect(body.content).toEqual([
      { text: "Held ", textStyle: { fontWeight: "bold" } },
      { text: "then", textStyle: { fontStyle: "italic" } },
    ]);
  });

  it("rejects a run textStyle field outside the allowlist", () => {
    const engine = createEngine();
    engine.init({
      initialState: {
        projectData: createProjectData({
          content: [{ text: "Large", textStyle: { fontSize: 80 } }],
        }),
      },
    });

    expect(() => engine.selectRenderState()).toThrow(
      'Inline textStyle.fontSize is not allowed in text content runs at "root[0].content[0]"',
    );
  });

  it("still rejects inline textStyle on the layout element", () => {
    const engine = createEngine();
    engine.init({
      initialState: {
        projectData: createProjectData({
          bodyOverrides: { textStyle: { fontSize: 24 } },
        }),
      },
    });

    expect(() => engine.selectRenderState()).toThrow(
      'Inline textStyle is not allowed in layout elements at "root[0]". Use textStyleId instead',
    );
  });

  it("still rejects inline hover textStyle on the layout element", () => {
    const engine = createEngine();
    engine.init({
      initialState: {
        projectData: createProjectData({
          bodyOverrides: { hover: { textStyle: { fill: "#FFFFFF" } } },
        }),
      },
    });

    expect(() => engine.selectRenderState()).toThrow(
      'Inline textStyle is not allowed in layout elements at "root[0].hover". Use textStyleId instead',
    );
  });
});

describe("RouteEngine dialogue run text styles with L10n", () => {
  const createL10nData = (content) => ({
    packages: {
      ja: {
        language: "Japanese",
        files: [],
        patches: [
          {
            type: "line.dialogue",
            lineId: "line",
            payload: { content },
          },
        ],
      },
    },
  });

  const initWithPackage = (l10nData, localizationPackageId) => {
    const engine = createEngine();
    engine.init({
      initialState: {
        projectData: createProjectData(),
        l10nData,
        global: { runtime: { localizationPackageId } },
      },
    });
    return engine;
  };

  it("keeps the canonical styled runs when the package has no patch for the line", () => {
    const engine = initWithPackage(
      { packages: { ja: { language: "Japanese", files: [], patches: [] } } },
      "ja",
    );

    const body = findElementById(engine.selectRenderState().elements, BODY_ID);
    expect(body.content[1]).toEqual({
      text: "bold ",
      textStyle: { fontWeight: "bold" },
    });
    expect(body.content).toHaveLength(5);
  });

  it("renders a package replacement exactly as the package authored it", () => {
    const engine = initWithPackage(
      createL10nData([{ text: "こんにちは。" }]),
      "ja",
    );

    const body = findElementById(engine.selectRenderState().elements, BODY_ID);
    expect(body.content).toEqual([{ text: "こんにちは。" }]);
  });

  it("restores the canonical styled runs when the package is cleared", () => {
    const engine = initWithPackage(
      createL10nData([{ text: "こんにちは。" }]),
      "ja",
    );

    engine.handleAction("updateLocalizationPackage", { l10nId: null });

    const body = findElementById(engine.selectRenderState().elements, BODY_ID);
    expect(body.content[1]).toEqual({
      text: "bold ",
      textStyle: { fontWeight: "bold" },
    });
  });
});
