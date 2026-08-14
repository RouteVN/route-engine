import { describe, expect, it } from "vitest";
import { constructPresentationState } from "../src/stores/constructPresentationState.js";

const blur = {
  x: 6,
  y: 9,
  quality: 3,
  kernelSize: 9,
  repeatEdgePixels: true,
};

const grade = {
  id: "grade",
  type: "shader",
  parameters: {
    brightness: 1.2,
    contrast: 0.8,
    saturation: 0.5,
  },
};

const persistentAnimation = {
  resourceId: "persistent-motion",
  playback: {
    continuity: "persistent",
    loop: true,
  },
};

const createBackground = () => ({
  resourceId: "forest",
  animationName: "idle",
  animationSpeed: 0.5,
  loop: false,
  colorId: "backdrop",
  transformId: "fullscreen",
  x: 120,
  y: 80,
  anchorX: 0.5,
  anchorY: 0.5,
  scaleX: 1.2,
  scaleY: 1.1,
  rotation: 4,
  originX: 960,
  originY: 540,
  opacity: 0.6,
  blur,
  filters: [grade],
  animations: persistentAnimation,
});

const createCharacter = () => ({
  id: "lead",
  transformId: "center",
  x: 120,
  y: 980,
  anchorX: 0.5,
  anchorY: 1,
  scaleX: 0.9,
  scaleY: 0.9,
  rotation: 4,
  originX: 20,
  originY: 40,
  opacity: 0.6,
  blur,
  filters: [grade],
  animations: persistentAnimation,
  sprites: [
    {
      id: "body",
      resourceId: "lead-body",
      animationName: "idle",
      animationSpeed: 0.5,
      loop: false,
    },
  ],
});

const createVisual = () => ({
  id: "fog",
  resourceId: "fog-heavy",
  animationName: "idle",
  animationSpeed: 0.5,
  transformId: "fullscreen",
  x: 120,
  y: 80,
  anchorX: 0.5,
  anchorY: 0.5,
  scaleX: 1.2,
  scaleY: 1.1,
  rotation: 4,
  originX: 20,
  originY: 40,
  layer: 70,
  opacity: 0.6,
  blur,
  filters: [grade],
  animations: persistentAnimation,
});

describe("presentation subject replacement", () => {
  describe("background", () => {
    it.each([
      ["same", "forest"],
      ["different", "street"],
    ])(
      "resets every omitted field when the %s resource is authored",
      (_, resourceId) => {
        const state = constructPresentationState([
          {
            screen: { opacity: 0.9 },
            background: createBackground(),
          },
          { background: { resourceId } },
        ]);

        expect(state.background).toEqual({ resourceId });
        expect(state.screen).toEqual({ opacity: 0.9 });
      },
    );

    it("preserves omitted fields for a continuation patch", () => {
      const initialBackground = createBackground();
      const state = constructPresentationState([
        { background: initialBackground },
        { background: { blur: null } },
      ]);

      expect(state.background).toEqual({
        ...initialBackground,
        blur: null,
      });
    });

    it("uses only fields explicitly authored on a replacement", () => {
      const state = constructPresentationState([
        { background: createBackground() },
        {
          background: {
            resourceId: "street",
            transformId: "street-fit",
            alpha: 0.8,
          },
        },
      ]);

      expect(state.background).toEqual({
        resourceId: "street",
        transformId: "street-fit",
        opacity: 0.8,
      });
    });
  });

  describe("character items", () => {
    it.each([
      ["same", "lead-body"],
      ["different", "lead-alt"],
    ])(
      "resets every omitted field when the %s sprite composition is authored",
      (_, resourceId) => {
        const sprites = [{ id: "body", resourceId }];
        const state = constructPresentationState([
          { character: { items: [createCharacter()] } },
          {
            character: {
              items: [{ id: "lead", transformId: "right", sprites }],
            },
          },
        ]);

        expect(state.character.items[0]).toEqual({
          id: "lead",
          transformId: "right",
          sprites,
        });
      },
    );

    it("preserves the current composition and omitted fields for a continuation patch", () => {
      const initialCharacter = createCharacter();
      const state = constructPresentationState([
        { character: { items: [initialCharacter] } },
        {
          character: {
            items: [{ id: "lead", transformId: "right", opacity: 0.75 }],
          },
        },
      ]);

      expect(state.character.items[0]).toEqual({
        ...initialCharacter,
        transformId: "right",
        opacity: 0.75,
      });
    });
  });

  describe("visual items", () => {
    it.each([
      ["same", "fog-heavy"],
      ["different", "fog-light"],
    ])(
      "resets every omitted field when the %s resource is authored",
      (_, resourceId) => {
        const state = constructPresentationState([
          { visual: { items: [createVisual()] } },
          { visual: { items: [{ id: "fog", resourceId }] } },
        ]);

        expect(state.visual.items[0]).toEqual({ id: "fog", resourceId });
      },
    );

    it("preserves omitted fields for a continuation patch", () => {
      const initialVisual = createVisual();
      const state = constructPresentationState([
        { visual: { items: [initialVisual] } },
        { visual: { items: [{ id: "fog", opacity: 0.75 }] } },
      ]);

      expect(state.visual.items[0]).toEqual({
        ...initialVisual,
        opacity: 0.75,
      });
    });

    it("treats a complete text value as a fresh subject", () => {
      const state = constructPresentationState([
        {
          visual: {
            items: [
              {
                id: "fog",
                text: { content: "Chapter 1", textStyleId: "title" },
                transformId: "title-top",
                layer: 70,
                opacity: 0.6,
                filters: [grade],
                animations: persistentAnimation,
              },
            ],
          },
        },
        {
          visual: {
            items: [
              {
                id: "fog",
                text: { content: "Chapter 2", textStyleId: "accent" },
              },
            ],
          },
        },
      ]);

      expect(state.visual.items[0]).toEqual({
        id: "fog",
        text: { content: "Chapter 2", textStyleId: "accent" },
      });
    });

    it("preserves omitted fields for a partial text patch", () => {
      const state = constructPresentationState([
        {
          visual: {
            items: [
              {
                id: "title",
                text: { content: "Chapter 1", textStyleId: "title" },
                transformId: "title-top",
                layer: 70,
                opacity: 0.6,
                filters: [grade],
              },
            ],
          },
        },
        {
          visual: {
            items: [{ id: "title", text: { content: "Chapter 2" } }],
          },
        },
      ]);

      expect(state.visual.items[0]).toEqual({
        id: "title",
        text: { content: "Chapter 2", textStyleId: "title" },
        transformId: "title-top",
        layer: 70,
        opacity: 0.6,
        filters: [grade],
      });
    });

    it("treats a complete inline layout as a fresh subject", () => {
      const nextLayout = {
        elements: [{ id: "title", type: "text", content: "Chapter 2" }],
      };
      const state = constructPresentationState([
        {
          visual: {
            items: [
              {
                id: "title",
                layout: {
                  elements: [
                    { id: "title", type: "text", content: "Chapter 1" },
                  ],
                },
                transformId: "title-top",
                layer: 70,
                opacity: 0.6,
                filters: [grade],
              },
            ],
          },
        },
        { visual: { items: [{ id: "title", layout: nextLayout }] } },
      ]);

      expect(state.visual.items[0]).toEqual({
        id: "title",
        layout: nextLayout,
      });
    });
  });
});
