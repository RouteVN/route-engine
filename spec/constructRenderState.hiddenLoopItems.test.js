import { describe, expect, it } from "vitest";
import { constructRenderState } from "../src/stores/constructRenderState.js";

// A repeating element whose visibility condition is false renders no items.
// jempl renders each hidden item as {}, which Route Graphics cannot parse:
// the parent container then fails with "Width or height is missing".

const collectElements = (elements, found = []) => {
  for (const element of elements || []) {
    found.push(element);
    collectElements(element?.children, found);
  }
  return found;
};

const rowTemplate = (surface, when) => ({
  id: `${surface}-row-\${i}`,
  type: "container",
  $each: "row, i in variables.rows",
  $when: when,
  children: [
    {
      id: `${surface}-row-text-\${i}`,
      type: "text",
      content: "${row}",
    },
  ],
});

const layoutElements = (surface, when) => [
  {
    id: `${surface}-list`,
    type: "container",
    direction: "vertical",
    children: [
      { id: `${surface}-title`, type: "text", content: "Title" },
      rowTemplate(`${surface}-nested`, when),
    ],
  },
  rowTemplate(`${surface}-top`, when),
];

const SURFACES = [
  "background",
  "visual",
  "dialogue",
  "choice",
  "form",
  "control",
  "layout",
  "overlay",
  "confirm",
];

const renderAllSurfaces = (variables, when = "variables.showRows == true") => {
  const elementsFor = (surface) => layoutElements(surface, when);
  return constructRenderState({
    presentationState: {
      background: { resourceId: "backgroundTemplate" },
      visual: {
        items: [
          {
            id: "rows",
            resourceId: "visualTemplate",
            transformId: "visualTransform",
          },
        ],
      },
      dialogue: {
        mode: "adv",
        ui: { resourceId: "dialogueTemplate" },
        content: [{ text: "Dialogue" }],
      },
      choice: { resourceId: "choiceTemplate", items: [] },
      control: { resourceId: "controlTemplate" },
      layout: { resourceId: "layoutTemplate" },
    },
    previousPresentationState: {},
    resources: {
      layouts: {
        backgroundTemplate: { elements: elementsFor("background") },
        visualTemplate: { elements: elementsFor("visual") },
        dialogueTemplate: { elements: elementsFor("dialogue") },
        choiceTemplate: { elements: elementsFor("choice") },
        formTemplate: { elements: elementsFor("form") },
        layoutTemplate: { elements: elementsFor("layout") },
        overlayTemplate: { elements: elementsFor("overlay") },
        confirmTemplate: { elements: elementsFor("confirm") },
      },
      controls: {
        controlTemplate: { elements: elementsFor("control") },
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
    },
    variables,
    runtime: {},
    form: {
      resourceId: "formTemplate",
      key: "rows-form",
      fields: {},
      submitActions: {},
    },
    overlayStack: [{ resourceId: "overlayTemplate" }],
    confirmDialog: { resourceId: "confirmTemplate" },
    dialogueHistory: [],
    screen: { width: 1920, height: 1080 },
    isChoiceVisible: true,
    isFormVisible: true,
    isLineCompleted: false,
    skipTransitionsAndAnimations: false,
  });
};

const idsEndingWith = (elements, suffix) =>
  elements
    .map((element) => element?.id)
    .filter((id) => typeof id === "string" && id.endsWith(suffix));

describe("constructRenderState hidden loop items", () => {
  it("renders no items for a repeating element whose $when is false", () => {
    const renderState = renderAllSurfaces({
      rows: ["first", "second"],
      showRows: false,
    });
    const elements = collectElements(renderState.elements);

    expect(elements.filter((element) => !element?.type)).toEqual([]);
    for (const surface of SURFACES) {
      expect(
        idsEndingWith(elements, `--${surface}-title`),
        surface,
      ).toHaveLength(1);
      expect(
        idsEndingWith(elements, `--${surface}-nested-row-0`),
        surface,
      ).toEqual([]);
      expect(
        idsEndingWith(elements, `--${surface}-top-row-0`),
        surface,
      ).toEqual([]);
    }
  });

  it("renders only the items whose $when is true", () => {
    const renderState = renderAllSurfaces(
      { rows: ["first", "second"] },
      "i == 1",
    );
    const elements = collectElements(renderState.elements);

    expect(elements.filter((element) => !element?.type)).toEqual([]);
    for (const surface of SURFACES) {
      for (const placement of ["nested", "top"]) {
        const prefix = `--${surface}-${placement}-row-`;
        expect(idsEndingWith(elements, `${prefix}0`), surface).toEqual([]);
        expect(idsEndingWith(elements, `${prefix}1`), surface).toHaveLength(1);
      }
    }
  });

  it("renders every item when the $when is true", () => {
    const renderState = renderAllSurfaces({
      rows: ["first", "second"],
      showRows: true,
    });
    const elements = collectElements(renderState.elements);

    expect(elements.filter((element) => !element?.type)).toEqual([]);
    for (const surface of SURFACES) {
      for (const placement of ["nested", "top"]) {
        for (const index of [0, 1]) {
          expect(
            idsEndingWith(elements, `--${surface}-${placement}-row-${index}`),
            `${surface} ${placement} ${index}`,
          ).toHaveLength(1);
        }
      }
    }
  });
});
