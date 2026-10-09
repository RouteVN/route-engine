import { describe, expect, it } from "vitest";
import { constructRenderState } from "../src/stores/constructRenderState.js";

const collectElements = (elements = []) =>
  elements.flatMap((element) => [
    element,
    ...collectElements(element.children ?? []),
  ]);

const createResources = () => ({
  layouts: {
    shared: {
      elements: [
        { id: "shared-label", type: "text", content: "Shared layout" },
        { id: "shared-input", type: "input", field: "sharedField" },
      ],
    },
    unrelatedBg: {
      elements: [{ id: "bg-art", type: "text", content: "BG" }],
    },
    unrelatedPanel: {
      elements: [{ id: "panel-note", type: "text", content: "Panel" }],
    },
    choiceUi: {
      elements: [{ id: "choice-title", type: "text", content: "Pick one" }],
    },
    revealBody: {
      elements: [
        {
          id: "reveal-text",
          type: "text-revealing",
          content: "Typing",
          speed: 10,
        },
      ],
    },
  },
  textStyles: {},
  colors: {},
  images: {},
  characters: {},
});

const render = (overrides = {}) =>
  constructRenderState({
    presentationState: { layout: { resourceId: "shared" } },
    resources: createResources(),
    screen: { width: 800, height: 600 },
    ...overrides,
  });

const ENGINE_ID_PATTERN =
  /^(story|layout-shared|overlayStack-\d+(-blocker)?|bg-cg-background-container|bg-cg-background-color|choice-container|visual-badge)$/;

const elementIds = (renderState) =>
  collectElements(renderState.elements)
    .filter((element) => typeof element.id === "string")
    .filter((element) => !ENGINE_ID_PATTERN.test(element.id))
    .map((element) => element.id);

describe("constructRenderState layout instances", () => {
  it("namespaces every authored child id under its owning slot root id", () => {
    const renderState = render();

    expect(elementIds(renderState).sort()).toEqual([
      "layout-shared--shared-input",
      "layout-shared--shared-label",
    ]);
  });

  it("keeps root container ids unchanged", () => {
    const renderState = render({
      presentationState: {
        layout: { resourceId: "shared" },
        background: { resourceId: "unrelatedBg" },
      },
      overlayStack: [
        { resourceId: "shared", resourceType: "layout" },
        { resourceId: "unrelatedPanel", resourceType: "layout" },
      ],
    });

    const rootIds = collectElements(renderState.elements)
      .map((element) => element.id)
      .filter(
        (id) =>
          id === "story" ||
          id === "layout-shared" ||
          id === "bg-cg-background-container" ||
          id === "overlayStack-0" ||
          id === "overlayStack-1" ||
          id === "overlayStack-0-blocker" ||
          id === "overlayStack-1-blocker",
      );

    expect(rootIds.sort()).toEqual(
      [
        "story",
        "layout-shared",
        "bg-cg-background-container",
        "overlayStack-0",
        "overlayStack-1",
        "overlayStack-0-blocker",
        "overlayStack-1-blocker",
      ].sort(),
    );
  });

  it("gives unique stable ids when main layout and overlay share a resource", () => {
    const renderState = render({
      overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
    });
    const ids = elementIds(renderState).sort();

    expect(ids).toEqual([
      "layout-shared--shared-input",
      "layout-shared--shared-label",
      "overlayStack-0--shared-input",
      "overlayStack-0--shared-label",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      elementIds(
        render({
          overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
        }),
      ).sort(),
    ).toEqual(ids);
  });

  it("never mutates the layout resources it renders", () => {
    const resources = createResources();
    constructRenderState({
      presentationState: {
        layout: { resourceId: "shared" },
        background: { resourceId: "unrelatedBg" },
        dialogue: {
          ui: { resourceId: "shared" },
          content: [{ text: "Hello" }],
        },
      },
      resources,
      screen: { width: 800, height: 600 },
      overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
    });

    expect(resources.layouts.shared.elements.map((e) => e.id)).toEqual([
      "shared-label",
      "shared-input",
    ]);
    expect(resources.layouts.unrelatedBg.elements[0].id).toBe("bg-art");
  });

  it("keeps overlay ids when the sharing main layout is removed (repeated -> single)", () => {
    const withMain = render({
      overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
    });
    const overlayOnly = render({
      presentationState: {},
      overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
    });

    expect(elementIds(overlayOnly)).toEqual(
      elementIds(withMain).filter((id) => id.startsWith("overlayStack-0--")),
    );
  });

  it("keeps overlay ids when a sharing main layout appears (single -> repeated)", () => {
    const overlayOnly = render({
      presentationState: {},
      overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
    });
    const withMain = render({
      overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
    });

    expect(
      elementIds(withMain).filter((id) => id.startsWith("overlayStack-0--")),
    ).toEqual(elementIds(overlayOnly));
  });

  it("keeps every instance's ids when an unrelated background is added or removed", () => {
    const withoutBackground = render({
      overlayStack: [{ resourceId: "unrelatedPanel", resourceType: "layout" }],
    });
    const withBackground = render({
      presentationState: {
        layout: { resourceId: "shared" },
        background: { resourceId: "unrelatedBg" },
      },
      overlayStack: [{ resourceId: "unrelatedPanel", resourceType: "layout" }],
    });
    const removedAgain = render({
      overlayStack: [{ resourceId: "unrelatedPanel", resourceType: "layout" }],
    });

    const withoutBackgroundIds = elementIds(withoutBackground).sort();
    const withBackgroundIds = elementIds(withBackground).sort();
    expect(withBackgroundIds).toEqual(
      [...withoutBackgroundIds, "bg-cg-background-container--bg-art"].sort(),
    );
    expect(elementIds(removedAgain).sort()).toEqual(withoutBackgroundIds);
  });

  it("keeps ids when a conditional choice sibling appears or disappears", () => {
    const withoutChoice = render({
      overlayStack: [{ resourceId: "unrelatedPanel", resourceType: "layout" }],
    });
    const withChoice = render({
      presentationState: {
        layout: { resourceId: "shared" },
        choice: {
          resourceId: "choiceUi",
          items: [{ id: "one", text: "One" }],
        },
      },
      overlayStack: [{ resourceId: "unrelatedPanel", resourceType: "layout" }],
    });

    expect(
      elementIds(withChoice).filter(
        (id) => !id.startsWith("choice-container--"),
      ),
    ).toEqual(elementIds(withoutChoice));
  });

  it("keeps ids when an unrelated visual item sibling appears or disappears", () => {
    const base = {
      presentationState: {
        layout: { resourceId: "shared" },
        visual: {
          items: [
            {
              id: "badge",
              transform: { x: 10, y: 10 },
              layout: {
                elements: [{ id: "badge-text", type: "text", content: "B" }],
              },
            },
          ],
        },
      },
      overlayStack: [{ resourceId: "unrelatedPanel", resourceType: "layout" }],
    };
    const withVisual = render(base);
    const withoutVisual = render({
      ...base,
      presentationState: { layout: { resourceId: "shared" } },
      overlayStack: [{ resourceId: "unrelatedPanel", resourceType: "layout" }],
    });

    expect(
      elementIds(withVisual).filter((id) => !id.startsWith("visual-badge--")),
    ).toEqual(elementIds(withoutVisual));
    expect(
      elementIds(withVisual).find((id) => id.startsWith("visual-badge--")),
    ).toBe("visual-badge--badge-text");
  });

  it("keeps earlier overlay ids when a new overlay is pushed or the top one pops", () => {
    const oneOverlay = render({
      presentationState: {},
      overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
    });
    const twoOverlays = render({
      presentationState: {},
      overlayStack: [
        { resourceId: "shared", resourceType: "layout" },
        { resourceId: "unrelatedPanel", resourceType: "layout" },
      ],
    });
    const popped = render({
      presentationState: {},
      overlayStack: [{ resourceId: "shared", resourceType: "layout" }],
    });

    expect(elementIds(twoOverlays).sort()).toEqual([
      "overlayStack-0--shared-input",
      "overlayStack-0--shared-label",
      "overlayStack-1--panel-note",
    ]);
    expect(elementIds(oneOverlay)).toEqual(
      elementIds(twoOverlays).filter((id) => id.startsWith("overlayStack-0--")),
    );
    expect(elementIds(popped)).toEqual(elementIds(oneOverlay));
  });

  it("keeps dialogue UI ids distinct from a sharing background and stable across renders", () => {
    const params = {
      presentationState: {
        background: { resourceId: "shared" },
        dialogue: {
          ui: { resourceId: "shared" },
          content: [{ text: "Hello" }],
        },
      },
      screen: { width: 800, height: 600 },
    };
    const first = elementIds(render(params)).sort();
    const second = elementIds(render(params)).sort();

    expect(first).toEqual([
      "bg-cg-background-container--shared-input",
      "bg-cg-background-container--shared-label",
      "dialogue-container--shared-input",
      "dialogue-container--shared-label",
    ]);
    expect(new Set(first).size).toBe(first.length);
    expect(second).toEqual(first);
  });

  it("keeps instance ids through text reveal settlement of the same line", () => {
    const params = (isLineCompleted) => ({
      presentationState: {
        layout: { resourceId: "revealBody" },
        dialogue: {
          ui: { resourceId: "revealBody" },
          content: [{ text: "Typing" }],
        },
      },
      isLineCompleted,
      screen: { width: 800, height: 600 },
    });

    const revealing = elementIds(render(params(false))).sort();
    const settled = elementIds(render(params(true))).sort();

    expect(revealing).toEqual(settled);
    expect(revealing).toContain("dialogue-container--reveal-text");
  });

  it("suffixes authored ids duplicated inside one instance deterministically", () => {
    const resources = createResources();
    resources.layouts.shared = {
      elements: [
        { id: "dup", type: "text", content: "first" },
        { id: "dup", type: "text", content: "second" },
      ],
    };

    const ids = () =>
      elementIds(
        constructRenderState({
          presentationState: { layout: { resourceId: "shared" } },
          resources,
          screen: { width: 800, height: 600 },
        }),
      ).sort();

    expect(ids()).toEqual(["layout-shared--dup", "layout-shared--dup-1"]);
    expect(ids()).toEqual(["layout-shared--dup", "layout-shared--dup-1"]);
    expect(resources.layouts.shared.elements.map((e) => e.id)).toEqual([
      "dup",
      "dup",
    ]);
  });

  it("keeps separator ambiguity from creating cross-slot collisions", () => {
    const resources = {
      layouts: {
        // Authored ids containing "--" must never alias another slot's
        // namespaced id: "x--y" under slot "layout-slot" stays distinct from
        // authored "y" under a slot literally named "layout-slot--x".
        slot: {
          elements: [{ id: "x--y", type: "text", content: "segmented" }],
        },
        "slot--x": {
          elements: [{ id: "y", type: "text", content: "cross" }],
        },
        plain: {
          elements: [
            { id: "hyphen-ok", type: "text", content: "readable" },
            { id: "dup", type: "text", content: "first" },
            { id: "dup-1", type: "text", content: "preexisting" },
            { id: "dup", type: "text", content: "second" },
          ],
        },
      },
    };

    const ids = () =>
      collectElements(
        constructRenderState({
          presentationState: {
            layout: { resourceId: "plain" },
            background: { resourceId: "slot" },
            dialogue: {
              ui: { resourceId: "slot--x" },
              content: [{ text: "Hello" }],
            },
          },
          resources,
          screen: { width: 800, height: 600 },
        }).elements,
      )
        .filter(
          (element) =>
            typeof element.id === "string" &&
            (element.id.includes("--") || element.id.includes("%2D")),
        )
        .map((element) => element.id)
        .sort();

    const expected = [
      // Ordinary hyphens stay readable; "--" inside a segment is escaped.
      "bg-cg-background-container--x%2D%2Dy",
      "dialogue-container--y",
      // Authored "dup", authored "dup-1", then duplicated "dup": suffixes
      // resolve around the already-occupied "-1" spelling, deterministically.
      "layout-plain--dup",
      "layout-plain--dup-1",
      "layout-plain--dup-2",
      "layout-plain--hyphen-ok",
    ];

    expect(ids()).toEqual(expected);
    expect(new Set(ids()).size).toBe(expected.length);
    expect(ids()).toEqual(expected);
  });
});
