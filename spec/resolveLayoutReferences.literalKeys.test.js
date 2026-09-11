import { describe, expect, it } from "vitest";
import { resolveLayoutReferences } from "../src/resolveLayoutReferences.js";
import {
  resolveTextStyleIds,
  resolveColorIds,
  resolveImageIds,
} from "../src/stores/constructRenderState.js";

const resources = { colors: { panel: { hex: "#123456" } } };

describe("layout resolution preserves literal JSON keys", () => {
  it.each([
    ["text styles", resolveTextStyleIds],
    ["colors", resolveColorIds],
    ["images", resolveImageIds],
    [
      "public resolver",
      (node, resources) => resolveLayoutReferences(node, { resources }),
    ],
  ])("does not invoke a prototype setter during %s", (_, resolve) => {
    const node = JSON.parse('{"__proto__":{"type":"rect"},"colorId":"panel"}');
    const result = resolve(node, resources);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(result).toEqual(node);
    expect(Object.getPrototypeOf(node)).toBe(Object.prototype);
  });

  it("does not turn nested metadata into a render element between passes", () => {
    const metadata = JSON.parse(
      '{"__proto__":{"type":"rect"},"colorId":"panel","constructor":{"role":"literal"}}',
    );
    const node = {
      type: "container",
      metadata,
      children: [{ type: "rect", colorId: "panel" }],
    };
    const result = resolveLayoutReferences(node, { resources });
    expect(result.metadata).toEqual(metadata);
    expect(Object.hasOwn(result.metadata, "__proto__")).toBe(true);
    expect(result.children).toEqual([{ type: "rect", fill: "#123456" }]);
    expect(node.children[0]).toEqual({ type: "rect", colorId: "panel" });
  });

  it("preserves literal keys in rect interaction data and opaque shader data", () => {
    const literal = JSON.parse('{"__proto__":{"label":"literal"}}');
    const node = {
      type: "rect",
      colorId: "panel",
      hover: { ...literal, colorId: "panel" },
      filters: literal,
    };
    const result = resolveLayoutReferences(node, { resources });
    expect(Object.hasOwn(result.hover, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.hover)).toBe(Object.prototype);
    expect(result.hover.fill).toBe("#123456");
    expect(result.filters).toEqual(literal);
    expect(Object.hasOwn(result.filters, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.filters)).toBe(Object.prototype);
  });
});
