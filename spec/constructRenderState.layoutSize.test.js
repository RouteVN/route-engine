import { describe, expect, it } from "vitest";
import { constructRenderState } from "../src/stores/constructRenderState.js";

const screen = { width: 1280, height: 720 };
const transform = { x: 640, y: 360, anchorX: 0.5, anchorY: 0.5 };
const child = {
  id: "rect",
  type: "rect",
  x: 100,
  y: 100,
  width: 200,
  height: 200,
};
const render = (
  presentationState,
  layout = { elements: [child] },
  screenConfig = screen,
) =>
  constructRenderState({
    presentationState,
    screen: screenConfig,
    resources: {
      layouts: { canvas: layout },
      images: { image: { fileId: "image.png", width: 64, height: 32 } },
      transforms: { center: transform },
      colors: {},
      textStyles: {},
      characters: {},
    },
  }).elements.find(({ id }) => id === "story").children;

describe("layout canvas sizes", () => {
  for (const [label, size, expected] of [
    ["screen size", {}, { width: 1280, height: 720 }],
    ["authored size", { width: 500, height: 300 }, { width: 500, height: 300 }],
  ]) {
    for (const inline of [false, true]) {
      it(`uses ${label} for ${inline ? "inline" : "resource"} visual layouts`, () => {
        const layout = { ...size, elements: [child] };
        const item = { id: "art", transform };
        if (inline) item.layout = layout;
        else item.resourceId = "canvas";
        const visual = render({ visual: { items: [item] } }, layout).find(
          ({ id }) => id === "visual-art",
        );
        expect(visual).toMatchObject({ ...expected, ...transform });
        expect(visual.children[0]).toMatchObject({
          width: 200,
          height: 200,
          x: 100,
          y: 100,
        });
      });
    }
    for (const authoredTransform of [false, true]) {
      it(`uses ${label} for backgrounds ${authoredTransform ? "with" : "without"} a transform`, () => {
        const background = { resourceId: "canvas" };
        if (authoredTransform) background.transformId = "center";
        const bg = render({ background }, { ...size, elements: [child] }).find(
          ({ id }) => id === "bg-cg-background-container",
        );
        expect(bg).toMatchObject(expected);
        if (authoredTransform) expect(bg).toMatchObject(transform);
        expect(bg.children[0]).toMatchObject({
          width: 200,
          height: 200,
          x: 100,
          y: 100,
        });
      });
    }
  }
  for (const field of ["width", "height"]) {
    for (const [valueLabel, value] of [
      ["a string", "bad"],
      ["zero", 0],
      ["a negative number", -1],
      ["NaN", Number.NaN],
      ["Infinity", Infinity],
    ]) {
      it(`rejects ${valueLabel} for inline visual layout ${field}`, () => {
        const layout = { elements: [child], [field]: value };
        const item = { id: "art", transform, layout };
        expect(() => render({ visual: { items: [item] } })).toThrow(
          `Visual item "art" layout.${field} must be a positive number`,
        );
      });

      it(`rejects ${valueLabel} for resource visual layout ${field}`, () => {
        const layout = { elements: [child], [field]: value };
        const item = { id: "art", transform, resourceId: "canvas" };
        expect(() => render({ visual: { items: [item] } }, layout)).toThrow(
          `Layout "canvas" ${field} must be a positive number`,
        );
      });

      it(`rejects ${valueLabel} for background layout ${field}`, () => {
        const layout = { elements: [child], [field]: value };
        expect(() =>
          render({ background: { resourceId: "canvas" } }, layout),
        ).toThrow(`Layout "canvas" ${field} must be a positive number`);
      });
    }
  }
  it("keeps image visual dimensions unchanged", () => {
    const image = render({
      visual: { items: [{ id: "art", resourceId: "image", transform }] },
    }).find(({ id }) => id === "visual-art");
    expect(image).toMatchObject({
      type: "sprite",
      width: 64,
      height: 32,
      ...transform,
    });
  });
  it("falls back per dimension when screen dimensions are missing", () => {
    const item = { id: "art", resourceId: "canvas", transform };
    const visual = render(
      { visual: { items: [item] } },
      { elements: [child], width: 500 },
      {},
    ).find(({ id }) => id === "visual-art");
    expect(visual).toMatchObject({ width: 500, height: 1080 });
  });
});
