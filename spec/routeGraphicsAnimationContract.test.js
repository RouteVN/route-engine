import Ajv from "ajv";
import { load } from "js-yaml";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The animation schema must accept exactly the animation shapes Route
// Graphics 1.43.0 plays. These cases run the real renderer parser (no mocks;
// only the browser-only Worker constructor is stubbed so the browser bundle
// imports under Node) side by side with the authored project schema.
vi.stubGlobal("Worker", class {});
afterAll(() => vi.unstubAllGlobals());

const compileAnimationSchema = () => {
  const schema = load(
    readFileSync(
      new URL(
        "../src/schemas/projectData/animationResource.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return new Ajv({ strict: false }).compile(schema);
};

describe("projectData animation schema mirrors the renderer contract", () => {
  let validate;
  let parse;

  beforeAll(async () => {
    validate = compileAnimationSchema();
    const { default: createRouteGraphics } = await import("route-graphics");
    const app = createRouteGraphics();
    parse = (animation) =>
      app.parse({
        id: "scene",
        elements: [],
        animations: [
          { id: "probe", targetId: "scene", ...structuredClone(animation) },
        ],
        audio: [],
      });
  });

  it.each([
    [
      "an update auto track",
      {
        type: "update",
        tween: { alpha: { auto: { duration: 200, delay: 25 } } },
      },
    ],
    [
      "a delayed keyframe track",
      {
        type: "update",
        tween: {
          alpha: {
            keyframes: [{ startValue: 0, value: 1, delay: 25, duration: 200 }],
          },
        },
      },
    ],
    [
      "a mask array transition",
      {
        type: "transition",
        mask: [
          {
            kind: "single",
            texture: "mask-diagonal",
            progress: { keyframes: [{ value: 1, duration: 200 }] },
          },
        ],
      },
    ],
    [
      "an auto track with a renderer easing",
      {
        type: "update",
        tween: {
          alpha: { auto: { duration: 200, easing: "easeInOutQuad" } },
        },
      },
    ],
  ])("accepts %s in both schema and renderer", (_label, animation) => {
    expect(validate(animation)).toBe(true);
    expect(() => parse(animation)).not.toThrow();
  });

  it.each([
    [
      "an empty draft transition",
      { type: "transition" },
      "must define prev, next, mask, or compositor",
    ],
    [
      "auto mixed with keyframes and initialValue",
      {
        type: "update",
        tween: {
          alpha: {
            initialValue: 0,
            keyframes: [{ value: 1, duration: 200 }],
            auto: { duration: 200 },
          },
        },
      },
      "cannot define both keyframes and auto",
    ],
    [
      "auto mixed with keyframes",
      {
        type: "update",
        tween: {
          alpha: {
            keyframes: [{ value: 1, duration: 200 }],
            auto: { duration: 200 },
          },
        },
      },
      "cannot define both keyframes and auto",
    ],
    [
      "auto with initialValue",
      {
        type: "update",
        tween: {
          alpha: { initialValue: 0, auto: { duration: 200 } },
        },
      },
      "initialValue is not valid when auto is defined",
    ],
    [
      "auto on a transition surface",
      {
        type: "transition",
        next: { tween: { alpha: { auto: { duration: 200 } } } },
      },
      "keyframes must be a non-empty array",
    ],
    [
      "auto on mask progress",
      {
        type: "transition",
        mask: {
          kind: "single",
          texture: "mask-diagonal",
          progress: { auto: { duration: 200 } },
        },
      },
      "keyframes must be a non-empty array",
    ],
    [
      "fractional auto duration",
      { type: "update", tween: { x: { auto: { duration: 250.5 } } } },
      "integer number of milliseconds",
    ],
    [
      "fractional auto delay",
      {
        type: "update",
        tween: { x: { auto: { duration: 200, delay: 50.5 } } },
      },
      "integer number of milliseconds",
    ],
    [
      "unsafe auto duration",
      {
        type: "update",
        tween: { x: { auto: { duration: Number.MAX_SAFE_INTEGER + 1 } } },
      },
      "integer number of milliseconds",
    ],
    [
      "unsafe auto delay",
      {
        type: "update",
        tween: {
          x: { auto: { duration: 200, delay: Number.MAX_SAFE_INTEGER + 1 } },
        },
      },
      "integer number of milliseconds",
    ],
    [
      "fractional keyframe delay",
      {
        type: "update",
        tween: { x: { keyframes: [{ value: 1, duration: 200, delay: 50.5 }] } },
      },
      "integer number of milliseconds",
    ],
    [
      "unsafe keyframe delay",
      {
        type: "update",
        tween: {
          x: {
            keyframes: [
              { value: 1, duration: 200, delay: Number.MAX_SAFE_INTEGER + 1 },
            ],
          },
        },
      },
      "integer number of milliseconds",
    ],
    [
      "a legacy sequence mask inside an array",
      {
        type: "transition",
        mask: [
          {
            kind: "sequence",
            textures: ["mask-diagonal"],
            progress: { keyframes: [{ value: 1, duration: 200 }] },
          },
        ],
      },
      "textures is no longer supported",
    ],
    [
      "an auto easing outside the renderer enum",
      {
        type: "update",
        tween: {
          alpha: { auto: { duration: 200, easing: "nonesuch" } },
        },
      },
      "auto.easing must be one of",
    ],
    [
      "a composite mask inside a mask array",
      {
        type: "transition",
        mask: [
          {
            kind: "single",
            texture: "mask-diagonal",
            progress: { keyframes: [{ value: 1, duration: 200 }] },
          },
          {
            kind: "composite",
            combine: "max",
            items: [{ texture: "mask-diagonal", channel: "red" }],
            progress: { keyframes: [{ value: 1, duration: 200 }] },
          },
        ],
      },
      "kind must be one of: single, sequence",
    ],
  ])("rejects %s in both schema and renderer", (_label, animation, message) => {
    expect(validate(animation)).toBe(false);
    expect(() => parse(animation)).toThrow(message);
  });
});
