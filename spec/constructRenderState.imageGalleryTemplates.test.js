import { describe, expect, it } from "vitest";
import { constructRenderState } from "../src/stores/constructRenderState.js";

const findElementById = (elements, id) => {
  for (const element of elements || []) {
    if (element?.id === id) {
      return element;
    }

    const nested = findElementById(element?.children, id);
    if (nested) {
      return nested;
    }
  }

  return null;
};

const galleryText = (id) => ({
  id,
  type: "text",
  content: "${imageGallery.selection.imageId}",
});

describe("constructRenderState image-gallery template data", () => {
  it("exposes one imageGallery projection to every templated render surface", () => {
    const imageGallery = {
      pageGroups: [
        {
          groupId: "festival",
          locked: false,
          variants: [
            {
              variantId: "day",
              imageId: "festivalDay",
              locked: false,
            },
          ],
        },
      ],
      selection: {
        groupId: "festival",
        variantId: "day",
        imageId: "festivalDay",
        canMoveToPreviousVariant: false,
        canMoveToNextVariant: false,
      },
      pagination: {
        pageIndex: 0,
        pageCount: 1,
        canMoveToPreviousPage: false,
        canMoveToNextPage: false,
      },
    };
    const originalProjection = structuredClone(imageGallery);
    const resources = {
      layouts: {
        backgroundTemplate: {
          elements: [galleryText("gallery-background")],
        },
        visualTemplate: {
          elements: [galleryText("gallery-visual")],
        },
        dialogueTemplate: {
          elements: [galleryText("gallery-dialogue")],
        },
        choiceTemplate: {
          elements: [galleryText("gallery-choice")],
        },
        formTemplate: {
          elements: [galleryText("gallery-form")],
        },
        layoutTemplate: {
          elements: [galleryText("gallery-layout")],
        },
        overlayTemplate: {
          elements: [galleryText("gallery-overlay")],
        },
        confirmTemplate: {
          elements: [galleryText("gallery-confirm")],
        },
      },
      controls: {
        controlTemplate: {
          elements: [galleryText("gallery-control")],
        },
      },
      transforms: {
        visualTransform: {
          x: 0,
          y: 0,
          anchorX: 0,
          anchorY: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      },
      characters: {},
    };

    const renderState = constructRenderState({
      presentationState: {
        background: {
          resourceId: "backgroundTemplate",
        },
        visual: {
          items: [
            {
              id: "gallery",
              resourceId: "visualTemplate",
              transformId: "visualTransform",
            },
          ],
        },
        dialogue: {
          mode: "adv",
          ui: {
            resourceId: "dialogueTemplate",
          },
          content: [{ text: "Dialogue" }],
        },
        choice: {
          resourceId: "choiceTemplate",
          items: [],
        },
        control: {
          resourceId: "controlTemplate",
        },
        layout: {
          resourceId: "layoutTemplate",
        },
      },
      previousPresentationState: {},
      resources,
      variables: {},
      runtime: {},
      imageGallery,
      form: {
        resourceId: "formTemplate",
        key: "gallery-form",
        fields: {},
        submitActions: {},
      },
      overlayStack: [{ resourceId: "overlayTemplate" }],
      confirmDialog: {
        resourceId: "confirmTemplate",
      },
      dialogueHistory: [],
      screen: {
        width: 1920,
        height: 1080,
      },
      isChoiceVisible: true,
      isFormVisible: true,
      isLineCompleted: false,
      skipTransitionsAndAnimations: false,
    });

    const templateElementIds = [
      "gallery-background",
      "gallery-visual",
      "gallery-dialogue",
      "gallery-choice",
      "gallery-form",
      "gallery-control",
      "gallery-layout",
      "gallery-overlay",
      "gallery-confirm",
    ];

    for (const id of templateElementIds) {
      expect(findElementById(renderState.elements, id), id).toMatchObject({
        content: "festivalDay",
      });
    }
    expect(imageGallery).toEqual(originalProjection);
  });
});
