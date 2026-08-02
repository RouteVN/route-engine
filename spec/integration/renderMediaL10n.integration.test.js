import { describe, expect, it, vi } from "vitest";
import {
  createEngineIntegrationHarness,
  createIntegrationProject,
  findRenderElement,
} from "./helpers/createEngineIntegrationHarness.js";

const createSingleLineProject = ({
  actions = {},
  resources = {},
  config,
} = {}) =>
  createIntegrationProject({
    resources,
    config,
    sections: {
      main: {
        lines: [{ id: "entry", actions }],
      },
    },
  });

const createL10nProject = () =>
  createSingleLineProject({
    resources: {
      images: {
        feature: {
          fileId: "source-feature.png",
          width: 160,
          height: 90,
        },
      },
      layouts: {
        sourceDialogue: {
          elements: [
            {
              id: "dialogue-body",
              type: "text",
              content: "${dialogue.content[0].text}",
              textStyleId: "body",
            },
          ],
        },
      },
      transforms: {
        featurePosition: { x: 320, y: 180 },
      },
      fonts: {
        bodyFont: { fileId: "Inter" },
      },
      colors: {
        bodyColor: { hex: "#FFFFFF" },
      },
      textStyles: {
        body: {
          fontId: "bodyFont",
          colorId: "bodyColor",
          fontSize: 24,
          lineHeight: 1.2,
        },
      },
    },
    actions: {
      visual: {
        items: [
          {
            id: "feature",
            resourceId: "feature",
            transformId: "featurePosition",
          },
        ],
      },
      dialogue: {
        mode: "adv",
        ui: { resourceId: "sourceDialogue" },
        content: [{ text: "Source dialogue" }],
      },
    },
  });

const createTranslatedPackage = () => ({
  language: "Translated",
  files: [{ fileId: "translated-feature.png", mimeType: "image/png" }],
  patches: [
    {
      type: "resource.image",
      resourceId: "feature",
      payload: {
        fileId: "translated-feature.png",
        width: 320,
        height: 180,
      },
    },
    {
      type: "resource.layout",
      operation: "add",
      resourceId: "translatedDialogue",
      payload: {
        elements: [
          {
            id: "dialogue-body",
            type: "text",
            content: "${dialogue.content[0].text}",
            textStyleId: "body",
          },
          {
            id: "use-source",
            type: "container",
            click: {
              payload: {
                actions: {
                  updateLocalizationPackage: { l10nId: null },
                },
              },
            },
          },
        ],
      },
    },
    {
      type: "line.action",
      lineId: "entry",
      actionType: "dialogue",
      ignoreFields: ["content"],
      payload: {
        mode: "adv",
        ui: { resourceId: "translatedDialogue" },
      },
    },
    {
      type: "line.dialogue",
      lineId: "entry",
      payload: { content: [{ text: "Translated dialogue" }] },
    },
    {
      type: "story.scene",
      mode: "patch",
      sceneId: "scene",
      payload: { name: "Translated scene" },
    },
  ],
});

describe("render, media, and animation contracts through engine effects", () => {
  it("projects image, video, and named spritesheet visuals to renderer nodes", () => {
    const projectData = createSingleLineProject({
      resources: {
        images: {
          portrait: { fileId: "portrait.png", width: 240, height: 360 },
        },
        videos: {
          cutscene: {
            fileId: "cutscene.mp4",
            width: 640,
            height: 360,
            loop: true,
            volume: 25,
          },
        },
        spritesheets: {
          actor: {
            fileId: "actor.png",
            width: 96,
            height: 128,
            jsonData: { frames: {}, meta: {} },
            animations: {
              idle: { frames: [0, 1], animationSpeed: 0.2, loop: true },
            },
          },
        },
        transforms: {
          portraitPosition: { x: 100, y: 200 },
          videoPosition: { x: 400, y: 200 },
          actorPosition: { x: 700, y: 200 },
        },
      },
      actions: {
        visual: {
          items: [
            {
              id: "portrait",
              resourceId: "portrait",
              transformId: "portraitPosition",
            },
            {
              id: "cutscene",
              resourceId: "cutscene",
              transformId: "videoPosition",
            },
            {
              id: "actor",
              resourceId: "actor",
              animationName: "idle",
              animationSpeed: 0.8,
              loop: false,
              transformId: "actorPosition",
            },
          ],
        },
      },
    });

    const harness = createEngineIntegrationHarness({ projectData });
    const elements = harness.renderStates.at(-1).elements;

    expect(findRenderElement(elements, "visual-portrait")).toMatchObject({
      type: "sprite",
      src: "portrait.png",
      width: 240,
      height: 360,
      x: 100,
      y: 200,
    });
    expect(findRenderElement(elements, "visual-cutscene")).toMatchObject({
      type: "video",
      src: "cutscene.mp4",
      loop: true,
      volume: 25,
    });
    expect(findRenderElement(elements, "visual-actor")).toMatchObject({
      type: "spritesheet-animation",
      src: "actor.png",
      playback: {
        frames: [0, 1],
        animationSpeed: 0.8,
        loop: false,
      },
    });
  });

  it("resolves particle image textures before dispatching a renderer node", () => {
    const projectData = createSingleLineProject({
      resources: {
        images: {
          spark: { fileId: "spark.png", width: 16, height: 16 },
        },
        particles: {
          sparks: {
            width: 320,
            height: 180,
            modules: {
              emission: {
                mode: "burst",
                burstCount: 4,
                particleLifetime: 60,
              },
              appearance: {
                texture: { imageId: "spark" },
              },
            },
          },
        },
        transforms: {
          emitterPosition: { x: 640, y: 360 },
        },
      },
      actions: {
        visual: {
          items: [
            {
              id: "sparks",
              resourceId: "sparks",
              transformId: "emitterPosition",
            },
          ],
        },
      },
    });

    const harness = createEngineIntegrationHarness({ projectData });
    const particleNode = findRenderElement(
      harness.renderStates.at(-1).elements,
      "visual-sparks-particles",
    );

    expect(particleNode).toMatchObject({
      type: "particles",
      modules: {
        appearance: {
          texture: "spark.png",
        },
      },
    });
  });

  it("resolves visual-layout templates and dispatches their click actions", async () => {
    const projectData = createSingleLineProject({
      resources: {
        images: {
          badge: { fileId: "badge.png", width: 32, height: 32 },
        },
        variables: {
          score: { type: "number", scope: "context", default: 2 },
        },
        layouts: {
          statusCard: {
            elements: [
              {
                id: "badge",
                type: "sprite",
                imageId: "badge",
                width: 32,
                height: 32,
              },
              {
                id: "score",
                type: "text",
                content: "Score ${variables.score}",
                textStyleId: "body",
              },
              {
                id: "increment",
                type: "container",
                click: {
                  payload: {
                    actions: {
                      updateVariable: {
                        id: "incrementScore",
                        operations: [
                          {
                            variableId: "score",
                            op: "increment",
                            value: 1,
                          },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        transforms: {
          cardPosition: { x: 400, y: 200 },
        },
        fonts: {
          bodyFont: { fileId: "Inter" },
        },
        colors: {
          bodyColor: { hex: "#FFFFFF" },
        },
        textStyles: {
          body: {
            fontId: "bodyFont",
            colorId: "bodyColor",
            fontSize: 24,
            lineHeight: 1.2,
          },
        },
      },
      actions: {
        visual: {
          items: [
            {
              id: "status",
              resourceId: "statusCard",
              transformId: "cardPosition",
            },
          ],
        },
      },
    });

    const harness = createEngineIntegrationHarness({ projectData });
    const firstRender = harness.renderStates.at(-1);
    const badge = findRenderElement(firstRender.elements, "badge");
    const score = findRenderElement(firstRender.elements, "score");
    const increment = findRenderElement(firstRender.elements, "increment");

    expect(badge).toMatchObject({ type: "sprite", src: "badge.png" });
    expect(score).toMatchObject({
      content: "Score 2",
      textStyle: expect.objectContaining({
        fontFamily: "Inter",
        fill: "#FFFFFF",
      }),
    });

    await harness.eventHandler("click", increment.click.payload);

    expect(harness.getState().contexts.at(-1).variables.score).toBe(3);
    expect(
      findRenderElement(harness.renderStates.at(-1).elements, "score").content,
    ).toBe("Score 3");
  });

  it("layers runtime audio volume and escapes authored channel IDs", () => {
    const projectData = createSingleLineProject({
      resources: {
        sounds: {
          theme: { fileId: "theme.ogg" },
          click: { fileId: "click.wav" },
        },
        voices: {
          scene: {
            narrator: { fileId: "narrator.ogg" },
          },
        },
      },
      actions: {
        bgm: {
          volume: 80,
          sounds: [{ id: "main:theme", resourceId: "theme", volume: 25 }],
        },
        sfx: {
          channels: [
            {
              id: "ui:primary%",
              volume: 50,
              sounds: [{ id: "button:click", resourceId: "click" }],
            },
          ],
        },
        voice: {
          volume: 60,
          sounds: [{ id: "lead%voice", resourceId: "narrator" }],
        },
      },
    });

    const harness = createEngineIntegrationHarness({
      projectData,
      global: {
        runtime: {
          musicVolume: 50,
          soundVolume: 40,
        },
      },
    });

    expect(harness.renderStates.at(-1).audio).toEqual([
      expect.objectContaining({
        id: "channel:bgm",
        volume: 40,
        children: [
          expect.objectContaining({ id: "bgm:main%3Atheme", volume: 25 }),
        ],
      }),
      expect.objectContaining({
        id: "channel:sfx:ui%3Aprimary%25",
        volume: 20,
        children: [
          expect.objectContaining({
            id: "sfx:ui%3Aprimary%25:button%3Aclick",
          }),
        ],
      }),
      expect.objectContaining({
        id: "channel:voice",
        volume: 24,
        children: [expect.objectContaining({ id: "voice:scene:lead%25voice" })],
      }),
    ]);
  });

  it("targets a visual animation and suppresses it when skipping is enabled", () => {
    const projectData = createSingleLineProject({
      resources: {
        images: {
          marker: { fileId: "marker.png", width: 32, height: 32 },
        },
        transforms: {
          markerPosition: { x: 100, y: 100 },
        },
        animations: {
          drift: {
            type: "update",
            tween: {
              x: {
                initialValue: 100,
                keyframes: [{ duration: 500, value: 300 }],
              },
            },
          },
        },
      },
      actions: {
        visual: {
          items: [
            {
              id: "marker",
              resourceId: "marker",
              transformId: "markerPosition",
              animations: { resourceId: "drift" },
            },
          ],
        },
      },
    });

    const harness = createEngineIntegrationHarness({ projectData });
    expect(harness.renderStates.at(-1).animations).toEqual([
      expect.objectContaining({
        id: "marker-animation-update",
        targetId: "visual-marker",
      }),
    ]);

    harness.engine.handleAction("setSkipTransitionsAndAnimations", {
      value: true,
    });

    expect(harness.renderStates.at(-1).animations).toEqual([]);
  });

  it("omits unresolved optional media while keeping valid siblings renderable", () => {
    const projectData = createSingleLineProject({
      resources: {
        images: {
          valid: { fileId: "valid.png", width: 64, height: 64 },
        },
        transforms: {
          position: { x: 100, y: 100 },
        },
      },
      actions: {
        visual: {
          items: [
            {
              id: "missing",
              resourceId: "does-not-exist",
              transformId: "position",
            },
            {
              id: "valid",
              resourceId: "valid",
              transformId: "position",
            },
          ],
        },
        sfx: {
          items: [{ id: "missing-sound", resourceId: "does-not-exist" }],
        },
      },
    });

    const harness = createEngineIntegrationHarness({ projectData });
    const renderState = harness.renderStates.at(-1);

    expect(findRenderElement(renderState.elements, "visual-missing")).toBe(
      undefined,
    );
    expect(
      findRenderElement(renderState.elements, "visual-valid"),
    ).toMatchObject({ type: "sprite", src: "valid.png" });
    expect(renderState.audio).toEqual([]);
  });
});

describe("L10n packages through initialization, rendering, and actions", () => {
  it("applies resource, line, and scene patches to the active package", () => {
    const projectData = createL10nProject();
    const l10nData = {
      packages: { translated: createTranslatedPackage() },
    };
    const harness = createEngineIntegrationHarness({
      projectData,
      l10nData,
      global: { runtime: { localizationPackageId: "translated" } },
    });
    const renderState = harness.renderStates.at(-1);

    expect(
      findRenderElement(renderState.elements, "visual-feature"),
    ).toMatchObject({
      src: "translated-feature.png",
      width: 320,
      height: 180,
    });
    expect(
      findRenderElement(renderState.elements, "dialogue-body"),
    ).toMatchObject({ content: "Translated dialogue" });
    expect(harness.getState().projectData.story.scenes.scene.name).toBe(
      "Translated scene",
    );
  });

  it("switches back to the canonical project from a rendered package action", async () => {
    const harness = createEngineIntegrationHarness({
      projectData: createL10nProject(),
      l10nData: {
        packages: { translated: createTranslatedPackage() },
      },
      global: { runtime: { localizationPackageId: "translated" } },
    });
    const sourceButton = findRenderElement(
      harness.renderStates.at(-1).elements,
      "use-source",
    );

    await harness.eventHandler("click", sourceButton.click.payload);

    expect(harness.engine.selectRuntime().localizationPackageId).toBeNull();
    expect(
      findRenderElement(harness.renderStates.at(-1).elements, "visual-feature"),
    ).toMatchObject({ src: "source-feature.png", width: 160, height: 90 });
    expect(
      findRenderElement(harness.renderStates.at(-1).elements, "dialogue-body"),
    ).toMatchObject({ content: "Source dialogue" });
    await vi.waitFor(() => {
      expect(harness.persistence.saveGlobalRuntime).toHaveBeenCalledWith(
        expect.objectContaining({ localizationPackageId: null }),
      );
    });
  });

  it("does not mutate canonical project or package inputs while switching", () => {
    const projectData = createL10nProject();
    const l10nData = {
      packages: { translated: createTranslatedPackage() },
    };
    const projectSnapshot = structuredClone(projectData);
    const packageSnapshot = structuredClone(l10nData);
    const harness = createEngineIntegrationHarness({ projectData, l10nData });

    harness.engine.handleAction("updateLocalizationPackage", {
      l10nId: "translated",
    });
    harness.engine.handleAction("updateLocalizationPackage", { l10nId: null });

    expect(projectData).toEqual(projectSnapshot);
    expect(l10nData).toEqual(packageSnapshot);
  });

  it("rejects schema-invalid localized presentation actions at init", () => {
    const projectData = createSingleLineProject({
      resources: {
        controls: { sourceControl: { elements: [] } },
      },
      actions: { control: { resourceId: "sourceControl" } },
    });
    const l10nData = {
      packages: {
        invalid: {
          language: "Invalid",
          files: [],
          patches: [
            {
              type: "line.action",
              lineId: "entry",
              actionType: "control",
              payload: {},
            },
          ],
        },
      },
    };

    expect(() =>
      createEngineIntegrationHarness({ projectData, l10nData }),
    ).toThrow(/control presentation-action schema/);
  });

  it("rejects schema-invalid localized resource replacements at init", () => {
    const projectData = createSingleLineProject({
      resources: {
        achievements: {
          ending: {
            type: "number",
            target: 10,
            name: "Ending",
            description: "Reach the ending",
          },
        },
      },
    });
    const l10nData = {
      packages: {
        invalid: {
          language: "Invalid",
          files: [],
          patches: [
            {
              type: "resource.achievement",
              resourceId: "ending",
              payload: {
                type: "number",
                name: "Localized ending",
                description: "Localized description",
              },
            },
          ],
        },
      },
    };

    expect(() =>
      createEngineIntegrationHarness({ projectData, l10nData }),
    ).toThrow(/resource\.achievement schema/);
  });

  it("rejects localized file references absent from package and project files", () => {
    const projectData = createL10nProject();
    const localizedPackage = createTranslatedPackage();
    localizedPackage.files = [];
    const l10nData = { packages: { invalid: localizedPackage } };

    expect(() =>
      createEngineIntegrationHarness({ projectData, l10nData }),
    ).toThrow(/fileId "translated-feature\.png" is not declared/);
  });

  it("validates localized references before installing the package", () => {
    const projectData = createL10nProject();
    projectData.resources.textStyles.body = {
      fontId: "bodyFont",
      colorId: "bodyColor",
      fontSize: 24,
      lineHeight: 1.2,
      fontWeight: "400",
      fontStyle: "normal",
    };
    const l10nData = {
      packages: {
        brokenReferences: {
          language: "Broken references",
          files: [],
          patches: [
            {
              type: "resource.textStyle",
              resourceId: "body",
              payload: {
                fontId: "missingFont",
                colorId: "missingColor",
                fontSize: 24,
                lineHeight: 1.2,
                fontWeight: "400",
                fontStyle: "normal",
              },
            },
          ],
        },
      },
    };

    let initializationError;
    try {
      createEngineIntegrationHarness({ projectData, l10nData });
    } catch (error) {
      initializationError = error;
    }
    expect(initializationError?.message ?? "").toMatch(
      /missingFont|missingColor|not found/,
    );
  });

  it("rejects a localized choice with an empty layout resource ID", () => {
    const projectData = createSingleLineProject({
      resources: {
        layouts: { choiceLayout: { elements: [] } },
      },
      actions: {
        choice: {
          resourceId: "choiceLayout",
          items: [
            {
              id: "continue",
              events: { click: { actions: { nextLine: {} } } },
            },
          ],
        },
      },
    });
    const l10nData = {
      packages: {
        invalidChoice: {
          language: "Invalid choice",
          files: [],
          patches: [
            {
              type: "line.action",
              lineId: "entry",
              actionType: "choice",
              payload: {
                resourceId: "",
                items: [
                  {
                    id: "continue",
                    events: { click: { actions: { nextLine: {} } } },
                  },
                ],
              },
            },
          ],
        },
      },
    };

    let initializationError;
    try {
      createEngineIntegrationHarness({ projectData, l10nData });
    } catch (error) {
      initializationError = error;
    }
    expect(initializationError?.message ?? "").toMatch(/resourceId|non-empty/);
  });

  it("allows empty resourceId keys inside preserved choice application data", () => {
    const preservedEvents = {
      click: {
        actions: { nextLine: {} },
        value: { resourceId: "" },
      },
    };
    const projectData = createSingleLineProject({
      resources: {
        layouts: { choiceLayout: { elements: [] } },
      },
      actions: {
        choice: {
          resourceId: "choiceLayout",
          items: [
            {
              id: "continue",
              events: preservedEvents,
            },
          ],
        },
      },
    });
    const l10nData = {
      packages: {
        validChoice: {
          language: "Valid choice",
          files: [],
          patches: [
            {
              type: "line.action",
              lineId: "entry",
              actionType: "choice",
              payload: {
                resourceId: "choiceLayout",
                items: [
                  {
                    id: "continue",
                    content: "Continue",
                    events: structuredClone(preservedEvents),
                  },
                ],
              },
            },
          ],
        },
      },
    };

    expect(() =>
      createEngineIntegrationHarness({ projectData, l10nData }),
    ).not.toThrow();
  });
});

describe("renderer resilience for schema-optional resource collections", () => {
  it("does not leak a TypeError when the layouts collection is absent", () => {
    const projectData = createSingleLineProject({
      actions: { layout: { resourceId: "missing" } },
    });
    delete projectData.resources.layouts;

    let initializationError;
    try {
      createEngineIntegrationHarness({ projectData });
    } catch (error) {
      initializationError = error;
    }
    expect(initializationError).toBeUndefined();
  });
});
