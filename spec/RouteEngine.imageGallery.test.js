import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const ABSENT_GALLERY = Symbol("absent-gallery");

const createImageResource = (imageId) => ({
  fileId: `${imageId}.png`,
  width: 1920,
  height: 1080,
});

const collectImageIds = (imageGallery) =>
  imageGallery?.groups?.flatMap((group) =>
    group.variants.map((variant) => variant.imageId),
  ) ?? [];

const createProjectData = ({
  imageGallery = ABSENT_GALLERY,
  imageIds,
} = {}) => {
  const resolvedImageIds =
    imageIds ??
    (imageGallery === ABSENT_GALLERY
      ? []
      : Array.from(new Set(collectImageIds(imageGallery))));
  const resources = {
    images: Object.fromEntries(
      resolvedImageIds.map((imageId) => [
        imageId,
        createImageResource(imageId),
      ]),
    ),
  };

  if (imageGallery !== ABSENT_GALLERY) {
    resources.imageGallery = imageGallery;
  }

  return {
    screen: {
      width: 1920,
      height: 1080,
    },
    resources,
    story: {
      initialSceneId: "scene1",
      scenes: {
        scene1: {
          initialSectionId: "section1",
          sections: {
            section1: {
              lines: [{ id: "line1", actions: {} }],
            },
          },
        },
      },
    },
  };
};

const createGallery = ({ groups = [], pageSize = 2 } = {}) => ({
  pageSize,
  groups,
});

const createGroup = (id, imageIds) => ({
  id,
  variants: imageIds.map((imageId, index) => ({
    id: index === 0 ? "default" : `variant-${index + 1}`,
    imageId,
  })),
});

const createEngine = ({
  imageGallery = ABSENT_GALLERY,
  projectData,
  viewedImageIds = [],
} = {}) => {
  const effects = [];
  const engine = createRouteEngine({
    handlePendingEffects: (pendingEffects) => {
      effects.push(...structuredClone(pendingEffects));
    },
  });

  engine.init({
    initialState: {
      projectData: projectData ?? createProjectData({ imageGallery }),
      global: {
        accountViewedRegistry: {
          sections: [],
          resources: viewedImageIds.map((resourceId) => ({ resourceId })),
        },
      },
    },
  });
  effects.length = 0;

  return { effects, engine };
};

const expectOnlyRenderEffect = (effects) => {
  expect(effects).toEqual([{ name: "render" }]);
};

describe("RouteEngine image gallery projection", () => {
  it("returns null without a gallery and treats all well-formed actions as no-ops", () => {
    const { effects, engine } = createEngine();

    expect(engine.selectImageGallery()).toBeNull();

    engine.handleActions({
      showImageGalleryVariant: { groupId: "missing" },
      moveToPreviousImageGalleryVariant: {},
      moveToNextImageGalleryVariant: {},
      clearImageGallerySelection: {},
      moveToImageGalleryPage: { pageIndex: 0 },
      moveToNextImageGalleryPage: {},
      moveToPreviousImageGalleryPage: {},
    });

    expect(engine.selectImageGallery()).toBeNull();
    expect(effects).toEqual([]);
  });

  it("still rejects malformed actions when the optional gallery is absent", () => {
    const { effects, engine } = createEngine();
    const before = engine.selectSystemState();

    expect(() =>
      engine.handleAction("showImageGalleryVariant", {
        groupId: "",
      }),
    ).toThrow("showImageGalleryVariant requires a non-empty groupId");

    expect(engine.selectSystemState()).toEqual(before);
    expect(effects).toEqual([]);
  });

  it("returns the canonical empty projection for an empty gallery", () => {
    const { effects, engine } = createEngine({
      imageGallery: createGallery({ groups: [], pageSize: 8 }),
    });

    expect(engine.selectImageGallery()).toEqual({
      pageGroups: [],
      selection: null,
      pagination: {
        pageIndex: 0,
        pageCount: 0,
        canMoveToPreviousPage: false,
        canMoveToNextPage: false,
      },
    });

    engine.handleActions({
      showImageGalleryVariant: { groupId: "missing" },
      moveToPreviousImageGalleryVariant: {},
      moveToNextImageGalleryVariant: {},
      moveToImageGalleryPage: { pageIndex: 0 },
      moveToNextImageGalleryPage: {},
      moveToPreviousImageGalleryPage: {},
      clearImageGallerySelection: {},
    });

    expect(effects).toEqual([]);
  });

  it("derives locks from the resourceId-only viewed registry and shares repeated image IDs", () => {
    const imageGallery = createGallery({
      groups: [
        {
          id: "shared-a",
          variants: [
            { id: "default", imageId: "shared-resource-id" },
            { id: "alternate", imageId: "shared-resource-id" },
          ],
        },
        {
          id: "shared-b",
          variants: [{ id: "default", imageId: "shared-resource-id" }],
        },
        {
          id: "unseen",
          variants: [{ id: "default", imageId: "not-viewed" }],
        },
      ],
      pageSize: 4,
    });
    const projectData = createProjectData({ imageGallery });
    projectData.resources.sounds = {
      "shared-resource-id": {
        fileId: "shared-resource-id.ogg",
      },
    };
    const { engine } = createEngine({
      projectData,
      viewedImageIds: ["shared-resource-id"],
    });

    expect(engine.selectImageGallery().pageGroups).toEqual([
      {
        groupId: "shared-a",
        locked: false,
        variants: [
          {
            variantId: "default",
            imageId: "shared-resource-id",
            locked: false,
          },
          {
            variantId: "alternate",
            imageId: "shared-resource-id",
            locked: false,
          },
        ],
      },
      {
        groupId: "shared-b",
        locked: false,
        variants: [
          {
            variantId: "default",
            imageId: "shared-resource-id",
            locked: false,
          },
        ],
      },
      {
        groupId: "unseen",
        locked: true,
        variants: [
          {
            variantId: "default",
            imageId: "not-viewed",
            locked: true,
          },
        ],
      },
    ]);
  });

  it("returns a fresh projection that cannot mutate later reads or engine state", () => {
    const imageGallery = createGallery({
      groups: [createGroup("festival", ["festival-day"])],
    });
    const { engine } = createEngine({
      imageGallery,
      viewedImageIds: ["festival-day"],
    });
    engine.handleAction("showImageGalleryVariant", {
      groupId: "festival",
    });

    const expected = engine.selectImageGallery();
    const mutated = engine.selectImageGallery();
    mutated.pageGroups[0].groupId = "changed";
    mutated.pageGroups[0].variants[0].locked = true;
    mutated.selection.imageId = "changed";
    mutated.pagination.pageIndex = 999;

    const next = engine.selectImageGallery();
    expect(next).toEqual(expected);
    expect(next).not.toBe(mutated);
    expect(next.pageGroups).not.toBe(mutated.pageGroups);
    expect(next.selection).not.toBe(mutated.selection);
    expect(next.pagination).not.toBe(mutated.pagination);
  });
});

describe("RouteEngine image gallery selection", () => {
  it("defaults to the first variant and permits an explicit unlocked later variant when it is locked", () => {
    const imageGallery = createGallery({
      groups: [
        createGroup("defaultable", ["first", "second"]),
        createGroup("canonical-locked", ["locked-first", "unlocked-later"]),
      ],
    });
    const { effects, engine } = createEngine({
      imageGallery,
      viewedImageIds: ["first", "second", "unlocked-later"],
    });

    expect(
      engine
        .selectImageGallery()
        .pageGroups.find((group) => group.groupId === "canonical-locked"),
    ).toMatchObject({
      locked: true,
      variants: [{ locked: true }, { locked: false }],
    });

    engine.handleAction("showImageGalleryVariant", {
      groupId: "defaultable",
    });

    expect(engine.selectImageGallery().selection).toEqual({
      groupId: "defaultable",
      variantId: "default",
      imageId: "first",
      canMoveToPreviousVariant: false,
      canMoveToNextVariant: true,
    });
    expectOnlyRenderEffect(effects);

    effects.length = 0;
    engine.handleAction("showImageGalleryVariant", {
      groupId: "defaultable",
    });
    expect(engine.selectImageGallery().selection.variantId).toBe("default");
    expect(effects).toEqual([]);

    engine.handleAction("clearImageGallerySelection", {});
    effects.length = 0;
    engine.handleAction("showImageGalleryVariant", {
      groupId: "canonical-locked",
    });

    expect(engine.selectImageGallery().selection).toBeNull();
    expect(effects).toEqual([]);

    engine.handleAction("showImageGalleryVariant", {
      groupId: "canonical-locked",
      variantId: "variant-2",
    });

    expect(engine.selectImageGallery().selection).toEqual({
      groupId: "canonical-locked",
      variantId: "variant-2",
      imageId: "unlocked-later",
      canMoveToPreviousVariant: false,
      canMoveToNextVariant: false,
    });
    expectOnlyRenderEffect(effects);
  });

  it("skips locked variants in authored order and never wraps", () => {
    const imageGallery = createGallery({
      groups: [
        {
          id: "sequence",
          variants: [
            { id: "a", imageId: "a-image" },
            { id: "b-locked", imageId: "b-image" },
            { id: "c", imageId: "c-image" },
            { id: "d-locked", imageId: "d-image" },
          ],
        },
      ],
    });
    const { effects, engine } = createEngine({
      imageGallery,
      viewedImageIds: ["a-image", "c-image"],
    });

    engine.handleAction("showImageGalleryVariant", {
      groupId: "sequence",
      variantId: "a",
    });
    effects.length = 0;

    expect(engine.selectImageGallery().selection).toMatchObject({
      variantId: "a",
      canMoveToPreviousVariant: false,
      canMoveToNextVariant: true,
    });

    engine.handleAction("moveToNextImageGalleryVariant", {});

    expect(engine.selectImageGallery().selection).toMatchObject({
      variantId: "c",
      imageId: "c-image",
      canMoveToPreviousVariant: true,
      canMoveToNextVariant: false,
    });
    expectOnlyRenderEffect(effects);

    effects.length = 0;
    engine.handleAction("moveToNextImageGalleryVariant", {});
    expect(engine.selectImageGallery().selection.variantId).toBe("c");
    expect(effects).toEqual([]);

    engine.handleAction("showImageGalleryVariant", {
      groupId: "sequence",
      variantId: "d-locked",
    });
    expect(engine.selectImageGallery().selection.variantId).toBe("c");
    expect(effects).toEqual([]);

    engine.handleAction("moveToPreviousImageGalleryVariant", {});
    expect(engine.selectImageGallery().selection.variantId).toBe("a");
    expectOnlyRenderEffect(effects);

    effects.length = 0;
    engine.handleAction("moveToPreviousImageGalleryVariant", {});
    expect(engine.selectImageGallery().selection.variantId).toBe("a");
    expect(effects).toEqual([]);
  });

  it("clears selection without changing the page and does nothing when already clear", () => {
    const imageGallery = createGallery({
      groups: [
        createGroup("first", ["first-image"]),
        createGroup("second", ["second-image"]),
      ],
      pageSize: 1,
    });
    const { effects, engine } = createEngine({
      imageGallery,
      viewedImageIds: ["first-image", "second-image"],
    });

    engine.handleAction("showImageGalleryVariant", { groupId: "second" });
    effects.length = 0;
    engine.handleAction("clearImageGallerySelection", {});

    expect(engine.selectImageGallery()).toMatchObject({
      selection: null,
      pagination: { pageIndex: 1 },
    });
    expectOnlyRenderEffect(effects);

    effects.length = 0;
    engine.handleAction("clearImageGallerySelection", {});
    expect(engine.selectImageGallery().pagination.pageIndex).toBe(1);
    expect(effects).toEqual([]);
  });
});

describe("RouteEngine image gallery pagination", () => {
  it("couples selection to its page, preserves selection on the same page, and clears it on a page change", () => {
    const imageGallery = createGallery({
      groups: Array.from({ length: 5 }, (_, index) =>
        createGroup(`group-${index + 1}`, [`image-${index + 1}`]),
      ),
      pageSize: 2,
    });
    const viewedImageIds = Array.from(
      { length: 5 },
      (_, index) => `image-${index + 1}`,
    );
    const { effects, engine } = createEngine({
      imageGallery,
      viewedImageIds,
    });

    expect(engine.selectImageGallery()).toMatchObject({
      pageGroups: [{ groupId: "group-1" }, { groupId: "group-2" }],
      pagination: {
        pageIndex: 0,
        pageCount: 3,
        canMoveToPreviousPage: false,
        canMoveToNextPage: true,
      },
    });

    engine.handleAction("showImageGalleryVariant", { groupId: "group-4" });

    expect(engine.selectImageGallery()).toMatchObject({
      pageGroups: [{ groupId: "group-3" }, { groupId: "group-4" }],
      selection: { groupId: "group-4", imageId: "image-4" },
      pagination: {
        pageIndex: 1,
        pageCount: 3,
        canMoveToPreviousPage: true,
        canMoveToNextPage: true,
      },
    });
    expectOnlyRenderEffect(effects);

    effects.length = 0;
    engine.handleAction("moveToImageGalleryPage", { pageIndex: 1 });
    expect(engine.selectImageGallery()).toMatchObject({
      selection: { groupId: "group-4" },
      pagination: { pageIndex: 1 },
    });
    expect(effects).toEqual([]);

    engine.handleAction("moveToNextImageGalleryPage", {});
    expect(engine.selectImageGallery()).toMatchObject({
      pageGroups: [{ groupId: "group-5" }],
      selection: null,
      pagination: {
        pageIndex: 2,
        canMoveToPreviousPage: true,
        canMoveToNextPage: false,
      },
    });
    expectOnlyRenderEffect(effects);
  });

  it("treats boundary and out-of-range page requests as no-ops and never wraps", () => {
    const imageGallery = createGallery({
      groups: [
        createGroup("first", ["first-image"]),
        createGroup("second", ["second-image"]),
        createGroup("third", ["third-image"]),
      ],
      pageSize: 1,
    });
    const { effects, engine } = createEngine({
      imageGallery,
      viewedImageIds: ["first-image", "second-image", "third-image"],
    });

    engine.handleAction("moveToPreviousImageGalleryPage", {});
    engine.handleAction("moveToImageGalleryPage", { pageIndex: 3 });
    expect(engine.selectImageGallery().pagination.pageIndex).toBe(0);
    expect(effects).toEqual([]);

    engine.handleAction("moveToImageGalleryPage", { pageIndex: 2 });
    expect(engine.selectImageGallery().pagination.pageIndex).toBe(2);
    expectOnlyRenderEffect(effects);

    effects.length = 0;
    engine.handleAction("moveToNextImageGalleryPage", {});
    engine.handleAction("moveToImageGalleryPage", { pageIndex: 3 });
    expect(engine.selectImageGallery().pagination.pageIndex).toBe(2);
    expect(effects).toEqual([]);

    engine.handleAction("moveToPreviousImageGalleryPage", {});
    expect(engine.selectImageGallery().pagination.pageIndex).toBe(1);
    expectOnlyRenderEffect(effects);
  });
});

describe("RouteEngine image gallery action validation", () => {
  const malformedActions = [
    ["show payload must be an object", "showImageGalleryVariant", undefined],
    [
      "show requires groupId",
      "showImageGalleryVariant",
      { variantId: "default" },
    ],
    [
      "show rejects an empty groupId",
      "showImageGalleryVariant",
      { groupId: "" },
    ],
    [
      "show rejects an empty variantId",
      "showImageGalleryVariant",
      { groupId: "valid", variantId: "" },
    ],
    [
      "show rejects unknown properties",
      "showImageGalleryVariant",
      { groupId: "valid", unexpected: true },
    ],
    ["page requires pageIndex", "moveToImageGalleryPage", {}],
    [
      "page rejects a negative index",
      "moveToImageGalleryPage",
      { pageIndex: -1 },
    ],
    [
      "page rejects a fractional index",
      "moveToImageGalleryPage",
      { pageIndex: 0.5 },
    ],
    [
      "page rejects a string index",
      "moveToImageGalleryPage",
      { pageIndex: "0" },
    ],
    ["page rejects NaN", "moveToImageGalleryPage", { pageIndex: Number.NaN }],
    [
      "page rejects infinity",
      "moveToImageGalleryPage",
      { pageIndex: Number.POSITIVE_INFINITY },
    ],
    [
      "page rejects unknown properties",
      "moveToImageGalleryPage",
      { pageIndex: 0, unexpected: true },
    ],
    [
      "parameterless actions require an object",
      "moveToNextImageGalleryVariant",
      undefined,
    ],
    [
      "parameterless actions require an empty object",
      "clearImageGallerySelection",
      { unexpected: true },
    ],
  ];

  it.each(malformedActions)(
    "%s and preserves state without effects",
    (_description, actionType, payload) => {
      const imageGallery = createGallery({
        groups: [createGroup("valid", ["valid-image"])],
      });
      const { effects, engine } = createEngine({
        imageGallery,
        viewedImageIds: ["valid-image"],
      });
      engine.handleAction("showImageGalleryVariant", { groupId: "valid" });
      effects.length = 0;
      const before = engine.selectImageGallery();

      expect(() => engine.handleAction(actionType, payload)).toThrow();

      expect(engine.selectImageGallery()).toEqual(before);
      expect(effects).toEqual([]);
    },
  );

  it("treats well-formed unknown, locked, and unavailable targets as no-ops", () => {
    const imageGallery = createGallery({
      groups: [
        createGroup("valid", ["valid-image", "locked-image"]),
        createGroup("second", ["second-image"]),
      ],
      pageSize: 1,
    });
    const { effects, engine } = createEngine({
      imageGallery,
      viewedImageIds: ["valid-image", "second-image"],
    });
    engine.handleAction("showImageGalleryVariant", { groupId: "valid" });
    effects.length = 0;
    const before = engine.selectImageGallery();

    engine.handleAction("showImageGalleryVariant", { groupId: "unknown" });
    engine.handleAction("showImageGalleryVariant", {
      groupId: "valid",
      variantId: "unknown",
    });
    engine.handleAction("showImageGalleryVariant", {
      groupId: "valid",
      variantId: "variant-2",
    });
    engine.handleAction("moveToPreviousImageGalleryVariant", {});
    engine.handleAction("moveToImageGalleryPage", { pageIndex: 2 });

    expect(engine.selectImageGallery()).toEqual(before);
    expect(effects).toEqual([]);
  });
});

describe("RouteEngine image gallery action batches", () => {
  it("resolves whole-payload and numeric event bindings before strict action validation", () => {
    const imageGallery = createGallery({
      groups: [
        createGroup("first", ["first-image"]),
        createGroup("second", ["second-image"]),
        createGroup("third", ["third-image"]),
      ],
      pageSize: 1,
    });
    const { effects, engine } = createEngine({
      imageGallery,
      viewedImageIds: ["first-image", "second-image", "third-image"],
    });

    engine.handleActions(
      {
        moveToImageGalleryPage: {
          pageIndex: "_event.pageIndex",
        },
      },
      {
        _event: {
          pageIndex: 2,
        },
      },
    );

    expect(engine.selectImageGallery()).toMatchObject({
      pageGroups: [{ groupId: "third" }],
      selection: null,
      pagination: { pageIndex: 2 },
    });
    expectOnlyRenderEffect(effects);

    effects.length = 0;
    engine.handleActions(
      {
        showImageGalleryVariant: "_event.selection",
      },
      {
        _event: {
          selection: {
            groupId: "second",
          },
        },
      },
    );

    expect(engine.selectImageGallery()).toMatchObject({
      pageGroups: [{ groupId: "second" }],
      selection: {
        groupId: "second",
        variantId: "default",
        imageId: "second-image",
      },
      pagination: { pageIndex: 1 },
    });
    expectOnlyRenderEffect(effects);
  });

  it("resolves a selected conditional branch from action-time variables without touching inactive bindings", () => {
    const imageGallery = createGallery({
      groups: [
        createGroup("first", ["first-image"]),
        createGroup("second", ["second-image"]),
      ],
    });
    const projectData = createProjectData({ imageGallery });
    projectData.resources.variables = {
      targetGalleryGroup: {
        type: "string",
        scope: "context",
        default: "first",
      },
    };
    const { engine } = createEngine({
      projectData,
      viewedImageIds: ["first-image", "second-image"],
    });

    expect(() =>
      engine.handleActions(
        {
          updateVariable: {
            id: "changeGalleryTarget",
            operations: [
              {
                variableId: "targetGalleryGroup",
                op: "set",
                value: "second",
              },
            ],
          },
          conditional: {
            branches: [
              {
                when: true,
                actions: {
                  showImageGalleryVariant: {
                    groupId: "${variables.targetGalleryGroup}",
                  },
                },
              },
              {
                actions: {
                  showImageGalleryVariant: "_event.missingSelection",
                },
              },
            ],
          },
        },
        {
          _event: {},
        },
      ),
    ).not.toThrow();

    expect(engine.selectImageGallery().selection).toMatchObject({
      groupId: "second",
      imageId: "second-image",
    });
  });

  it("observes addViewedResource before selecting the newly unlocked image", () => {
    const imageGallery = createGallery({
      groups: [createGroup("newly-viewed", ["newly-viewed-image"])],
    });
    const { effects, engine } = createEngine({ imageGallery });

    expect(engine.selectImageGallery().pageGroups[0].locked).toBe(true);

    engine.handleActions({
      addViewedResource: { resourceId: "newly-viewed-image" },
      showImageGalleryVariant: { groupId: "newly-viewed" },
    });

    expect(engine.selectImageGallery()).toMatchObject({
      pageGroups: [{ groupId: "newly-viewed", locked: false }],
      selection: {
        groupId: "newly-viewed",
        imageId: "newly-viewed-image",
      },
    });
    expect(effects.map((effect) => effect.name)).toEqual([
      "applyScopedDataUpdates",
      "render",
      "render",
    ]);
  });

  it("rolls back preceding gallery and viewed-state mutations when a later action is malformed", () => {
    const imageGallery = createGallery({
      groups: [createGroup("target", ["target-image"])],
    });
    const { effects, engine } = createEngine({ imageGallery });
    const before = engine.selectImageGallery();

    expect(() =>
      engine.handleActions({
        addViewedResource: { resourceId: "target-image" },
        showImageGalleryVariant: { groupId: "" },
      }),
    ).toThrow();

    expect(engine.selectImageGallery()).toEqual(before);
    expect(
      engine.selectSystemState().global.accountViewedRegistry.resources,
    ).toEqual([]);
    expect(effects).toEqual([]);
  });

  it("rolls back an earlier valid selection when a later page action is malformed", () => {
    const imageGallery = createGallery({
      groups: [createGroup("target", ["target-image"])],
    });
    const { effects, engine } = createEngine({
      imageGallery,
      viewedImageIds: ["target-image"],
    });

    expect(() =>
      engine.handleActions({
        showImageGalleryVariant: { groupId: "target" },
        moveToImageGalleryPage: { pageIndex: -1 },
      }),
    ).toThrow();

    expect(engine.selectImageGallery().selection).toBeNull();
    expect(effects).toEqual([]);
  });

  it("rolls back preceding mutations when an event-resolved replacement gallery is invalid", () => {
    const imageGallery = createGallery({
      groups: [createGroup("old", ["old-image"])],
    });
    const { effects, engine } = createEngine({
      imageGallery,
      viewedImageIds: ["old-image"],
    });
    const before = engine.selectSystemState();
    const invalidReplacement = createProjectData({
      imageGallery: createGallery({
        groups: [createGroup("invalid", ["missing-image"])],
      }),
      imageIds: [],
    });

    expect(() =>
      engine.handleActions(
        {
          addViewedResource: {
            resourceId: "newly-viewed-before-invalid-update",
          },
          showImageGalleryVariant: {
            groupId: "old",
          },
          updateProjectData: "_event.update",
        },
        {
          _event: {
            update: {
              projectData: invalidReplacement,
            },
          },
        },
      ),
    ).toThrow('references unknown image "missing-image"');

    expect(engine.selectSystemState()).toEqual(before);
    expect(engine.selectImageGallery().selection).toBeNull();
    expect(effects).toEqual([]);
  });
});

describe("RouteEngine image gallery project replacement", () => {
  it.each([
    ["a valid project without imageGallery", createProjectData()],
    ["an empty object", {}],
    ["null", null],
  ])(
    "remains safely absent after replacing projectData with %s",
    (_description, projectData) => {
      const { effects, engine } = createEngine({
        imageGallery: createGallery({
          groups: [createGroup("old", ["old-image"])],
        }),
        viewedImageIds: ["old-image"],
      });
      engine.handleAction("showImageGalleryVariant", {
        groupId: "old",
      });
      engine.handleAction("updateProjectData", {
        projectData,
      });
      effects.length = 0;

      expect(engine.selectImageGallery()).toBeNull();

      engine.handleAction("showImageGalleryVariant", {
        groupId: "missing",
      });
      engine.handleAction("moveToPreviousImageGalleryVariant", {});
      engine.handleAction("moveToNextImageGalleryVariant", {});
      engine.handleAction("clearImageGallerySelection", {});
      engine.handleAction("moveToImageGalleryPage", { pageIndex: 0 });
      engine.handleAction("moveToNextImageGalleryPage", {});
      engine.handleAction("moveToPreviousImageGalleryPage", {});

      expect(engine.selectImageGallery()).toBeNull();
      expect(effects).toEqual([]);
    },
  );

  it("resets navigation after a valid project replacement", () => {
    const originalGallery = createGallery({
      groups: [
        createGroup("old-first", ["old-first-image"]),
        createGroup("old-second", ["old-second-image"]),
      ],
      pageSize: 1,
    });
    const { effects, engine } = createEngine({
      imageGallery: originalGallery,
      viewedImageIds: [
        "old-first-image",
        "old-second-image",
        "replacement-image",
      ],
    });
    engine.handleAction("showImageGalleryVariant", {
      groupId: "old-second",
    });
    effects.length = 0;

    const replacementProject = createProjectData({
      imageGallery: createGallery({
        groups: [createGroup("replacement", ["replacement-image"])],
        pageSize: 1,
      }),
    });
    engine.handleAction("updateProjectData", {
      projectData: replacementProject,
    });

    expect(engine.selectImageGallery()).toMatchObject({
      pageGroups: [{ groupId: "replacement" }],
      selection: null,
      pagination: { pageIndex: 0, pageCount: 1 },
    });
    expectOnlyRenderEffect(effects);
  });

  it("lets later actions in a batch resolve against the replacement gallery", () => {
    const { effects, engine } = createEngine({
      imageGallery: createGallery({
        groups: [createGroup("old", ["old-image"])],
      }),
      viewedImageIds: ["old-image", "new-image"],
    });
    const replacementProject = createProjectData({
      imageGallery: createGallery({
        groups: [createGroup("new", ["new-image"])],
      }),
    });

    engine.handleActions({
      updateProjectData: { projectData: replacementProject },
      showImageGalleryVariant: { groupId: "new" },
    });

    expect(engine.selectImageGallery().selection).toMatchObject({
      groupId: "new",
      imageId: "new-image",
    });
    expect(effects).toEqual([{ name: "render" }, { name: "render" }]);
  });

  it("rejects an invalid replacement without changing the project or navigation", () => {
    const originalGallery = createGallery({
      groups: [
        createGroup("old-first", ["old-first-image"]),
        createGroup("old-second", ["old-second-image"]),
      ],
      pageSize: 1,
    });
    const { effects, engine } = createEngine({
      imageGallery: originalGallery,
      viewedImageIds: ["old-first-image", "old-second-image"],
    });
    engine.handleAction("showImageGalleryVariant", {
      groupId: "old-second",
    });
    effects.length = 0;
    const beforeProjection = engine.selectImageGallery();

    const invalidReplacement = createProjectData({
      imageGallery: createGallery({
        groups: [createGroup("invalid", ["missing-image"])],
      }),
      imageIds: [],
    });

    expect(() =>
      engine.handleAction("updateProjectData", {
        projectData: invalidReplacement,
      }),
    ).toThrow();

    expect(engine.selectImageGallery()).toEqual(beforeProjection);
    expect(
      engine.selectSystemState().projectData.resources.imageGallery,
    ).toEqual(originalGallery);
    expect(effects).toEqual([]);
  });

  it("rolls back preceding actions when replacement validation fails in a batch", () => {
    const originalGallery = createGallery({
      groups: [createGroup("old", ["old-image"])],
    });
    const { effects, engine } = createEngine({
      imageGallery: originalGallery,
      viewedImageIds: ["old-image"],
    });
    const invalidReplacement = createProjectData({
      imageGallery: createGallery({
        groups: [createGroup("invalid", ["missing-image"])],
      }),
      imageIds: [],
    });

    expect(() =>
      engine.handleActions({
        showImageGalleryVariant: { groupId: "old" },
        updateProjectData: { projectData: invalidReplacement },
      }),
    ).toThrow();

    expect(engine.selectImageGallery()).toMatchObject({
      pageGroups: [{ groupId: "old" }],
      selection: null,
    });
    expect(
      engine.selectSystemState().projectData.resources.imageGallery,
    ).toEqual(originalGallery);
    expect(effects).toEqual([]);
  });
});

describe("RouteEngine image gallery resource validation", () => {
  const invalidGalleries = [
    ["a non-object gallery", null, []],
    [
      "a non-positive page size",
      createGallery({
        groups: [],
        pageSize: 0,
      }),
    ],
    [
      "an unknown gallery property",
      {
        ...createGallery(),
        unexpected: true,
      },
    ],
    [
      "an unknown group property",
      createGallery({
        groups: [
          {
            ...createGroup("group", ["group-image"]),
            unexpected: true,
          },
        ],
      }),
    ],
    [
      "an empty variants array",
      createGallery({
        groups: [
          {
            id: "group",
            variants: [],
          },
        ],
      }),
    ],
    [
      "an unknown variant property",
      createGallery({
        groups: [
          {
            id: "group",
            variants: [
              {
                id: "default",
                imageId: "group-image",
                unexpected: true,
              },
            ],
          },
        ],
      }),
    ],
    [
      "duplicate group IDs",
      createGallery({
        groups: [
          createGroup("duplicate", ["first-image"]),
          createGroup("duplicate", ["second-image"]),
        ],
      }),
    ],
    [
      "duplicate variant IDs within a group",
      createGallery({
        groups: [
          {
            id: "group",
            variants: [
              { id: "duplicate", imageId: "first-image" },
              { id: "duplicate", imageId: "second-image" },
            ],
          },
        ],
      }),
    ],
    [
      "a sparse groups array",
      createGallery({
        groups: Array(1),
      }),
      [],
    ],
    [
      "a sparse variants array",
      createGallery({
        groups: [
          {
            id: "group",
            variants: Array(1),
          },
        ],
      }),
      [],
    ],
  ];

  it.each(invalidGalleries)(
    "rejects %s during initialization",
    (_name, imageGallery, imageIds) => {
      const engine = createRouteEngine({
        handlePendingEffects: () => {},
      });

      expect(() =>
        engine.init({
          initialState: {
            projectData: createProjectData({ imageGallery, imageIds }),
          },
        }),
      ).toThrow();
    },
  );

  it("rejects an unresolved image reference during initialization", () => {
    const imageGallery = createGallery({
      groups: [createGroup("group", ["missing-image"])],
    });
    const engine = createRouteEngine({
      handlePendingEffects: () => {},
    });

    expect(() =>
      engine.init({
        initialState: {
          projectData: createProjectData({
            imageGallery,
            imageIds: [],
          }),
        },
      }),
    ).toThrow();
  });
});
