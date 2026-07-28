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

const projectionTexts = (surface) => [
  galleryText(`gallery-${surface}`),
  {
    id: `music-${surface}`,
    type: "text",
    content: "${musicRoom.selection.trackId}",
  },
];

describe("constructRenderState feature projection template data", () => {
  it("exposes gallery and music-room projections to every templated render surface", () => {
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
    const musicRoom = {
      pageTracks: [],
      selection: {
        trackId: "opening",
      },
      playback: null,
      pagination: {
        pageIndex: 0,
        pageCount: 1,
        canMoveToPreviousPage: false,
        canMoveToNextPage: false,
      },
    };
    const originalMusicRoom = structuredClone(musicRoom);
    const resources = {
      layouts: {
        backgroundTemplate: {
          elements: projectionTexts("background"),
        },
        visualTemplate: {
          elements: projectionTexts("visual"),
        },
        dialogueTemplate: {
          elements: projectionTexts("dialogue"),
        },
        choiceTemplate: {
          elements: projectionTexts("choice"),
        },
        formTemplate: {
          elements: projectionTexts("form"),
        },
        layoutTemplate: {
          elements: projectionTexts("layout"),
        },
        overlayTemplate: {
          elements: projectionTexts("overlay"),
        },
        confirmTemplate: {
          elements: projectionTexts("confirm"),
        },
      },
      controls: {
        controlTemplate: {
          elements: projectionTexts("control"),
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
      musicRoom,
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
      const musicId = id.replace("gallery-", "music-");
      expect(
        findElementById(renderState.elements, musicId),
        musicId,
      ).toMatchObject({
        content: "opening",
      });
    }
    expect(imageGallery).toEqual(originalProjection);
    expect(musicRoom).toEqual(originalMusicRoom);
  });
});
