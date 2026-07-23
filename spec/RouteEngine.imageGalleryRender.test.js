import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import createRouteEngine from "../src/RouteEngine.js";
import createEffectsHandler from "../src/createEffectsHandler.js";

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

const createProjectData = ({ includeImageGallery = true } = {}) => ({
  screen: {
    width: 1920,
    height: 1080,
  },
  resources: {
    images: {
      festivalDay: {
        fileId: "festival-day.jpg",
        width: 1920,
        height: 1080,
      },
    },
    ...(includeImageGallery
      ? {
          imageGallery: {
            pageSize: 8,
            groups: [
              {
                id: "festival",
                variants: [
                  {
                    id: "day",
                    imageId: "festivalDay",
                  },
                ],
              },
            ],
          },
        }
      : {}),
    layouts: {
      galleryHud: {
        elements: [
          {
            id: "gallery-group",
            type: "text",
            content: "${imageGallery.pageGroups[0].groupId}",
          },
        ],
      },
    },
  },
  story: {
    initialSceneId: "scene1",
    scenes: {
      scene1: {
        initialSectionId: "section1",
        sections: {
          section1: {
            initialLineId: "line1",
            lines: [
              {
                id: "line1",
                actions: {
                  layout: {
                    resourceId: "galleryHud",
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

const createEngine = (projectData, { viewedImageIds = [] } = {}) => {
  const engine = createRouteEngine({
    handlePendingEffects: () => {},
  });

  engine.init({
    initialState: {
      projectData,
      global: {
        accountViewedRegistry: {
          sections: [],
          resources: viewedImageIds.map((resourceId) => ({ resourceId })),
        },
      },
    },
  });

  return engine;
};

const dispatchRouteGraphicsClick = async (engine, element) => {
  const effectsHandler = createEffectsHandler({
    getEngine: () => engine,
    routeGraphics: {
      render: () => {},
    },
    ticker: {
      add: () => {},
      remove: () => {},
    },
  });
  const eventHandler = effectsHandler.createRouteGraphicsEventHandler();

  await eventHandler("click", {
    _event: {
      id: element.id,
    },
    ...structuredClone(element.click.payload),
  });
};

describe("RouteEngine image-gallery render API", () => {
  it("exposes the public selector projection to layout templates", () => {
    const engine = createEngine(createProjectData());

    expect(engine.selectImageGallery()).toEqual({
      pageGroups: [
        {
          groupId: "festival",
          locked: true,
          variants: [
            {
              variantId: "day",
              imageId: "festivalDay",
              locked: true,
            },
          ],
        },
      ],
      selection: null,
      pagination: {
        pageIndex: 0,
        pageCount: 1,
        canMoveToPreviousPage: false,
        canMoveToNextPage: false,
      },
    });

    const renderState = engine.selectRenderState();
    expect(
      findElementById(renderState.elements, "gallery-group"),
    ).toMatchObject({
      content: "festival",
    });
  });

  it("returns null when the project has no image gallery", () => {
    const engine = createEngine(
      createProjectData({
        includeImageGallery: false,
      }),
    );

    expect(engine.selectImageGallery()).toBeNull();
  });

  it("renders nested group and variant loops as selectable image elements", () => {
    const projectData = createProjectData();
    projectData.resources.images.festivalNight = {
      fileId: "festival-night.jpg",
      width: 1920,
      height: 1080,
    };
    projectData.resources.images.sunset = {
      fileId: "sunset.jpg",
      width: 1920,
      height: 1080,
    };
    projectData.resources.imageGallery = {
      pageSize: 2,
      groups: [
        {
          id: "festival",
          variants: [
            {
              id: "day",
              imageId: "festivalDay",
            },
            {
              id: "night",
              imageId: "festivalNight",
            },
          ],
        },
        {
          id: "sunset",
          variants: [
            {
              id: "default",
              imageId: "sunset",
            },
          ],
        },
      ],
    };
    projectData.resources.layouts.galleryHud.elements = [
      {
        id: "gallery-grid",
        type: "container",
        children: [
          {
            "$for group in imageGallery.pageGroups:": [
              {
                id: "gallery-group-${group.groupId}",
                type: "container",
                children: [
                  {
                    "$for variant in group.variants:": [
                      {
                        id: "gallery-variant-${group.groupId}-${variant.variantId}",
                        type: "sprite",
                        imageId: "${variant.imageId}",
                        click: {
                          payload: {
                            actions: {
                              showImageGalleryVariant: {
                                groupId: "${group.groupId}",
                                variantId: "${variant.variantId}",
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "gallery-selected-image",
            type: "sprite",
            imageId: "${imageGallery.selection.imageId}",
          },
        ],
      },
    ];
    const engine = createEngine(projectData, {
      viewedImageIds: ["festivalDay", "festivalNight", "sunset"],
    });

    const renderState = engine.selectRenderState();
    const nightVariant = findElementById(
      renderState.elements,
      "gallery-variant-festival-night",
    );

    expect(
      findElementById(renderState.elements, "gallery-group-festival"),
    ).not.toBeNull();
    expect(
      findElementById(renderState.elements, "gallery-variant-festival-day"),
    ).toMatchObject({ src: "festival-day.jpg" });
    expect(nightVariant).toMatchObject({
      src: "festival-night.jpg",
      click: {
        payload: {
          actions: {
            showImageGalleryVariant: {
              groupId: "festival",
              variantId: "night",
            },
          },
        },
      },
    });
    expect(
      findElementById(renderState.elements, "gallery-variant-sunset-default"),
    ).toMatchObject({ src: "sunset.jpg" });

    engine.handleActions(nightVariant.click.payload.actions);

    expect(engine.selectImageGallery().selection).toMatchObject({
      groupId: "festival",
      variantId: "night",
      imageId: "festivalNight",
    });
    expect(
      findElementById(
        engine.selectRenderState().elements,
        "gallery-selected-image",
      ),
    ).toMatchObject({
      src: "festival-night.jpg",
    });
  });

  it("preserves loop-produced gallery IDs on Route Graphics clicks", async () => {
    const templateToken = "${variables.redirect}";
    const projectData = createProjectData();
    projectData.resources.variables = {
      redirect: {
        type: "string",
        scope: "context",
        default: "wrong-target",
      },
    };
    projectData.resources.images = {
      [templateToken]: {
        fileId: "literal-token.jpg",
        width: 1920,
        height: 1080,
      },
      "wrong-target": {
        fileId: "wrong-target.jpg",
        width: 1920,
        height: 1080,
      },
    };
    projectData.resources.imageGallery = {
      pageSize: 1,
      groups: [
        {
          id: templateToken,
          variants: [
            {
              id: templateToken,
              imageId: templateToken,
            },
          ],
        },
        {
          id: "wrong-target",
          variants: [
            {
              id: "wrong-target",
              imageId: "wrong-target",
            },
          ],
        },
      ],
    };
    projectData.resources.layouts.galleryHud.elements = [
      {
        id: "gallery-grid",
        type: "container",
        children: [
          {
            "$for group in imageGallery.pageGroups:": [
              {
                id: "gallery-group-${group.groupId}",
                type: "container",
                children: [
                  {
                    "$for variant in group.variants:": [
                      {
                        id: "gallery-variant-${group.groupId}-${variant.variantId}",
                        type: "sprite",
                        imageId: "${variant.imageId}",
                        click: {
                          payload: {
                            actions: {
                              showImageGalleryVariant: {
                                groupId: "${group.groupId}",
                                variantId: "${variant.variantId}",
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const engine = createEngine(projectData, {
      viewedImageIds: [templateToken, "wrong-target"],
    });

    const renderState = engine.selectRenderState();
    const renderedGroupId = `gallery-group-${templateToken}`;
    const renderedVariantId = `gallery-variant-${templateToken}-${templateToken}`;
    const variant = findElementById(renderState.elements, renderedVariantId);

    expect(
      findElementById(renderState.elements, renderedGroupId),
    ).not.toBeNull();
    expect(variant).toMatchObject({
      src: "literal-token.jpg",
      click: {
        payload: {
          actions: {
            showImageGalleryVariant: {
              groupId: templateToken,
              variantId: templateToken,
            },
          },
        },
      },
    });
    expect(
      findElementById(
        renderState.elements,
        "gallery-variant-wrong-target-wrong-target",
      ),
    ).toBeNull();

    await dispatchRouteGraphicsClick(engine, variant);

    expect(engine.selectImageGallery().selection).toEqual({
      groupId: templateToken,
      variantId: templateToken,
      imageId: templateToken,
      canMoveToPreviousVariant: false,
      canMoveToNextVariant: false,
    });
  });

  it.each(["${missing()}", "_event.missing"])(
    "does not evaluate the declared gallery ID %s during click dispatch",
    async (templateToken) => {
      const projectData = createProjectData();
      projectData.resources.images = {
        [templateToken]: {
          fileId: "literal-token.jpg",
          width: 1920,
          height: 1080,
        },
      };
      projectData.resources.imageGallery = {
        pageSize: 1,
        groups: [
          {
            id: templateToken,
            variants: [
              {
                id: templateToken,
                imageId: templateToken,
              },
            ],
          },
        ],
      };
      const engine = createEngine(projectData, {
        viewedImageIds: [templateToken],
      });

      await dispatchRouteGraphicsClick(engine, {
        id: "literal-template-gallery-item",
        click: {
          payload: {
            actions: {
              showImageGalleryVariant: {
                groupId: templateToken,
                variantId: templateToken,
              },
            },
          },
        },
      });

      expect(engine.selectImageGallery().selection).toMatchObject({
        groupId: templateToken,
        variantId: templateToken,
        imageId: templateToken,
      });
    },
  );

  it("still resolves dynamic gallery targets without an exact literal match", async () => {
    const projectData = createProjectData();
    projectData.resources.variables = {
      targetGroup: {
        type: "string",
        scope: "context",
        default: "festival",
      },
      targetVariant: {
        type: "string",
        scope: "context",
        default: "day",
      },
    };
    const engine = createEngine(projectData, {
      viewedImageIds: ["festivalDay"],
    });

    await dispatchRouteGraphicsClick(engine, {
      id: "dynamic-gallery-item",
      click: {
        payload: {
          actions: {
            showImageGalleryVariant: {
              groupId: "${variables.targetGroup}",
              variantId: "${variables.targetVariant}",
            },
          },
        },
      },
    });

    expect(engine.selectImageGallery().selection).toMatchObject({
      groupId: "festival",
      variantId: "day",
      imageId: "festivalDay",
    });
  });

  it("renders an absent gallery as an empty loop without throwing", () => {
    const projectData = createProjectData({
      includeImageGallery: false,
    });
    projectData.resources.layouts.galleryHud.elements = [
      {
        id: "gallery-grid",
        type: "container",
        children: load(`
- $for group in imageGallery.pageGroups:
    - id: unexpected-\${group.groupId}
      type: text
      content: \${group.groupId}
`),
      },
    ];
    expect(
      Object.keys(
        projectData.resources.layouts.galleryHud.elements[0].children[0],
      ),
    ).toEqual(["$for group in imageGallery.pageGroups"]);
    const engine = createEngine(projectData);

    expect(engine.selectImageGallery()).toBeNull();
    expect(() => engine.selectRenderState()).not.toThrow();
    expect(
      findElementById(engine.selectRenderState().elements, "gallery-grid"),
    ).toMatchObject({
      children: [],
    });
  });
});
