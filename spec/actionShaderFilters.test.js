import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";
import { constructRenderState } from "../src/stores/constructRenderState.js";

const createShaderFilter = () => ({
  id: "shade",
  type: "shader",
  time: true,
  parameters: {
    strength: 0.6,
    textStyle: 0.25,
    textStyleId: 0,
  },
  source: {
    webgl: {
      fragment: "void main() {}",
    },
    webgpu: {
      source: "@fragment fn mainFragment() {}",
    },
  },
});

const createResources = () => ({
  animations: {},
  characters: {},
  colors: {
    backdrop: { hex: "#101820" },
  },
  fonts: {},
  images: {
    background: {
      fileId: "background.png",
      width: 1920,
      height: 1080,
    },
    body: {
      fileId: "body.png",
      width: 400,
      height: 800,
    },
    fog: {
      fileId: "fog.png",
      width: 1920,
      height: 1080,
    },
  },
  layouts: {},
  particles: {},
  spritesheets: {
    glowSheet: {
      fileId: "glow-sheet.png",
      width: 64,
      height: 64,
      jsonData: { frames: {} },
      animations: {
        idle: {
          frames: [0],
          animationSpeed: 0.5,
          loop: true,
        },
      },
    },
  },
  textStyles: {},
  transforms: {
    center: {
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  },
  videos: {},
});

const findStoryChild = (renderState, id) =>
  renderState.elements
    .find((element) => element.id === "story")
    .children.find((element) => element.id === id);

describe("action shader filters", () => {
  it("forwards filters to background, composed character, and visual roots", () => {
    const backgroundFilter = createShaderFilter();
    const characterFilter = { ...createShaderFilter(), id: "character-shade" };
    const visualFilter = { ...createShaderFilter(), id: "visual-shade" };
    const presentationState = constructPresentationState([
      {
        background: {
          resourceId: "background",
          filters: [backgroundFilter],
        },
        character: {
          items: [
            {
              id: "lead",
              transformId: "center",
              sprites: [{ id: "body", resourceId: "body" }],
              filters: [characterFilter],
            },
          ],
        },
        visual: {
          items: [
            {
              id: "fog",
              resourceId: "fog",
              transformId: "center",
              filters: [visualFilter],
            },
          ],
        },
      },
    ]);
    const renderState = constructRenderState({
      presentationState,
      resources: createResources(),
    });

    expect(
      findStoryChild(renderState, "bg-cg-background-sprite").filters,
    ).toEqual([backgroundFilter]);

    const character = findStoryChild(renderState, "character-container-lead");
    expect(character.filters).toEqual([characterFilter]);
    expect(character.children[0]).not.toHaveProperty("filters");

    expect(findStoryChild(renderState, "visual-fog").filters).toEqual([
      visualFilter,
    ]);
  });

  it("treats filters as persistent appearance and clears them with an empty array", () => {
    const shaderFilter = createShaderFilter();
    const initialAction = {
      background: {
        resourceId: "background",
        filters: [shaderFilter],
      },
      character: {
        items: [
          {
            id: "lead",
            transformId: "center",
            sprites: [{ id: "body", resourceId: "body" }],
            filters: [shaderFilter],
          },
        ],
      },
      visual: {
        items: [
          {
            id: "fog",
            resourceId: "fog",
            transformId: "center",
            filters: [shaderFilter],
          },
        ],
      },
    };
    const appearanceOnlyAction = {
      background: { opacity: 0.8 },
      character: { items: [{ id: "lead", opacity: 0.8 }] },
      visual: { items: [{ id: "fog", opacity: 0.8 }] },
    };
    const clearFiltersAction = {
      background: { filters: [] },
      character: { items: [{ id: "lead", filters: [] }] },
      visual: { items: [{ id: "fog", filters: [] }] },
    };

    const persistedState = constructPresentationState([
      initialAction,
      appearanceOnlyAction,
    ]);
    expect(persistedState.background.filters).toEqual([shaderFilter]);
    expect(persistedState.character.items[0]).toMatchObject({
      sprites: [{ id: "body", resourceId: "body" }],
      filters: [shaderFilter],
    });
    expect(persistedState.visual.items[0]).toMatchObject({
      resourceId: "fog",
      filters: [shaderFilter],
    });

    const clearedState = constructPresentationState([
      initialAction,
      appearanceOnlyAction,
      clearFiltersAction,
    ]);
    expect(clearedState.background.filters).toEqual([]);
    expect(clearedState.character.items[0].filters).toEqual([]);
    expect(clearedState.visual.items[0].filters).toEqual([]);
  });

  it("applies filters to a color-only background target", () => {
    const shaderFilter = createShaderFilter();
    const renderState = constructRenderState({
      presentationState: {
        background: {
          colorId: "backdrop",
          filters: [shaderFilter],
        },
      },
      resources: createResources(),
      screen: { width: 1280, height: 720 },
    });

    expect(
      findStoryChild(renderState, "bg-cg-background-color").filters,
    ).toEqual([shaderFilter]);
  });

  it("forwards filters through the animated visual sprite path", () => {
    const shaderFilter = createShaderFilter();
    const renderState = constructRenderState({
      presentationState: {
        visual: {
          items: [
            {
              id: "glow",
              resourceId: "glowSheet",
              transformId: "center",
              filters: [shaderFilter],
            },
          ],
        },
      },
      resources: createResources(),
    });

    expect(findStoryChild(renderState, "visual-glow")).toMatchObject({
      type: "spritesheet-animation",
      filters: [shaderFilter],
    });
  });
});
