import { describe, expect, it } from "vitest";
import {
  normalizeRandomSource,
  sampleRandomDistribution,
  sampleVariableRandomDistribution,
  validateRandomResult,
  validateVariableRandomDistribution,
} from "../src/random.js";

const createSource = (...values) => {
  let index = 0;
  return normalizeRandomSource({
    nextUint32() {
      if (index >= values.length) {
        throw new Error("test random source exhausted");
      }
      const value = values[index];
      index += 1;
      return value;
    },
  });
};

const sample = (distribution, values) =>
  sampleRandomDistribution(distribution, {
    randomSource: createSource(...values),
  });

describe("random distributions", () => {
  it("samples every integer in an inclusive negative-to-positive range", () => {
    const distribution = { type: "integer", min: -2, max: 2 };

    expect(
      [0, 1, 2, 3, 4].map((word) => sample(distribution, [word]).value),
    ).toEqual([-2, -1, 0, 1, 2]);
  });

  it("supports the full uint32 cardinality at safe-integer offsets", () => {
    expect(
      sample(
        {
          type: "integer",
          min: Number.MIN_SAFE_INTEGER,
          max: Number.MIN_SAFE_INTEGER + 0xffff_ffff,
        },
        [0],
      ),
    ).toEqual({ type: "integer", value: Number.MIN_SAFE_INTEGER });
    expect(
      sample(
        {
          type: "integer",
          min: Number.MAX_SAFE_INTEGER - 0xffff_ffff,
          max: Number.MAX_SAFE_INTEGER,
        },
        [0xffff_ffff],
      ),
    ).toEqual({ type: "integer", value: Number.MAX_SAFE_INTEGER });
  });

  it("supports a single-value inclusive range", () => {
    expect(sample({ type: "integer", min: -7, max: -7 }, [])).toEqual({
      type: "integer",
      value: -7,
    });
  });

  it("uses rejection sampling instead of modulo-biased integer selection", () => {
    expect(
      sample({ type: "integer", min: 10, max: 14 }, [0xffff_ffff, 3]),
    ).toEqual({ type: "integer", value: 13 });
  });

  it("uses a 53-bit unit sample for weighted selection", () => {
    expect(
      sample(
        {
          type: "weighted",
          outcomes: [
            { weight: 0, actions: {} },
            { weight: 1, actions: {} },
            { weight: 3, actions: {} },
          ],
        },
        [0xffff_ffff, 0xffff_ffff],
      ),
    ).toEqual({ type: "weighted", outcomeIndex: 2 });
  });

  it("samples equal subnormal weights without skew", () => {
    const distribution = {
      type: "weighted",
      outcomes: [
        { weight: Number.MIN_VALUE, actions: {} },
        { weight: Number.MIN_VALUE, actions: {} },
      ],
    };

    expect(sample(distribution, [0, 0])).toEqual({
      type: "weighted",
      outcomeIndex: 0,
    });
    expect(sample(distribution, [0x8000_0000, 0])).toEqual({
      type: "weighted",
      outcomeIndex: 1,
    });
  });

  it("keeps the smallest supported weighted interval reachable", () => {
    expect(
      sample(
        {
          type: "weighted",
          outcomes: [
            { weight: 2 ** 52, actions: {} },
            { weight: 1, actions: {} },
          ],
        },
        [0xffff_ffff, 0xffff_ffff],
      ),
    ).toEqual({ type: "weighted", outcomeIndex: 1 });
  });

  it.each([
    { type: "integer", min: "${variables.min}", max: 10 },
    { type: "integer", min: 1, max: "${variables.max}" },
    {
      type: "weighted",
      outcomes: [{ weight: "${variables.weight}", actions: {} }],
    },
  ])("rejects non-literal numeric distribution fields %#", (distribution) => {
    expect(() => sample(distribution, [0, 0])).toThrow(/number|integer/);
  });

  it.each([
    [{ type: "integer", max: 6 }, "min is required"],
    [{ type: "integer", min: 1 }, "max is required"],
    [
      { type: "integer", min: 2, max: 1 },
      "range must contain from 1 through 4294967296 values",
    ],
    [
      { type: "integer", min: 0, max: 0x1_0000_0000 },
      "range must contain from 1 through 4294967296 values",
    ],
    [
      { type: "integer", min: 0, max: Number.MAX_SAFE_INTEGER + 1 },
      "max must be a safe integer",
    ],
    [{ type: "integer", min: 1, max: 6, sides: 6 }, "sides is not supported"],
    [
      { type: "integer", min: 1, max: 6, shape: "uniform" },
      "shape is not supported",
    ],
    [{ type: "dice", sides: 6 }, 'must be "integer" or "weighted"'],
    [{ type: "chance", probability: 0.5 }, 'must be "integer" or "weighted"'],
    [
      {
        type: "weighted",
        outcomes: [{ weight: 1 }],
      },
      "actions",
    ],
    [
      {
        type: "weighted",
        outcomes: [{ value: "removed", weight: 1, actions: {} }],
      },
      "value is not supported",
    ],
    [
      {
        type: "weighted",
        outcomes: [
          { weight: 2 ** 53, actions: {} },
          { weight: 1, actions: {} },
        ],
      },
      "below the supported probability resolution",
    ],
  ])("rejects an invalid distribution %#", (distribution, message) => {
    expect(() => sample(distribution, [0, 0])).toThrow(message);
  });

  it("validates every injected uint32 value", () => {
    expect(() =>
      sampleRandomDistribution(
        { type: "integer", min: 0, max: 1 },
        {
          randomSource: normalizeRandomSource({
            nextUint32: () => 0x1_0000_0000,
          }),
        },
      ),
    ).toThrow("0 through 4294967295");
  });

  it("bounds rejection sampling attempts", () => {
    expect(() =>
      sample(
        { type: "integer", min: 0, max: 4 },
        Array.from({ length: 128 }, () => 0xffff_ffff),
      ),
    ).toThrow("128 rejected samples");
  });

  it("validates and freezes persisted integer result snapshots", () => {
    const source = { type: "integer", value: 4 };
    const result = validateRandomResult(source, "integer");

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() =>
      validateRandomResult({ type: "integer", value: 1.5 }, "integer"),
    ).toThrow("value must be a safe integer");
    expect(() =>
      validateRandomResult(
        { type: "integer", value: 1, rolls: [1] },
        "integer",
      ),
    ).toThrow("rolls is not supported");
  });

  it("samples variable distributions as an integer or a value index", () => {
    const sampleVariable = (distribution, values) =>
      sampleVariableRandomDistribution(distribution, {
        randomSource: createSource(...values),
      });

    expect(sampleVariable({ type: "integer", min: -2, max: 2 }, [3])).toEqual({
      type: "integer",
      value: 1,
    });

    const distribution = {
      type: "weighted",
      values: [
        { weight: 0, value: "never" },
        { weight: 1, value: "first" },
        { weight: 3, value: "second" },
      ],
    };
    expect(sampleVariable(distribution, [0, 0])).toEqual({
      type: "weighted",
      outcomeIndex: 1,
    });
    expect(sampleVariable(distribution, [0x4000_0000, 0])).toEqual({
      type: "weighted",
      outcomeIndex: 2,
    });
    expect(Object.isFrozen(sampleVariable(distribution, [0, 0]))).toBe(true);
  });

  it("validates variable distributions without drawing", () => {
    const valid = [
      { type: "integer", min: 1, max: 1 },
      { type: "weighted", values: [{ weight: 0.5, value: false }] },
      { type: "weighted", values: [{ weight: 1, value: "" }] },
    ];
    valid.forEach((distribution) => {
      expect(() =>
        validateVariableRandomDistribution(distribution),
      ).not.toThrow();
    });

    const invalid = [
      [undefined, "must be an object"],
      [{ type: "normal" }, 'type must be "integer" or "weighted"'],
      [{ type: "integer", min: 1 }, "distribution.max is required"],
      [{ type: "integer", min: 1, max: 2, step: 1 }, "step is not supported"],
      [{ type: "weighted", outcomes: [] }, "outcomes is not supported"],
      [{ type: "weighted", values: [] }, "must contain from 1 through 1000"],
      [{ type: "weighted", values: [{ value: 1 }] }, "weight is required"],
      [
        { type: "weighted", values: [{ weight: -1, value: 1 }] },
        "weight must be at least 0",
      ],
      [
        { type: "weighted", values: [{ weight: 1 }] },
        "value must be a string, a finite number or a boolean",
      ],
      [
        { type: "weighted", values: [{ weight: 1, value: Infinity }] },
        "value must be a string, a finite number or a boolean",
      ],
      [
        { type: "weighted", values: [{ weight: 1, value: 1, actions: {} }] },
        "actions is not supported",
      ],
      [
        { type: "weighted", values: [{ weight: 0, value: 1 }] },
        "total weight must be positive",
      ],
    ];
    invalid.forEach(([distribution, message]) => {
      expect(() => validateVariableRandomDistribution(distribution)).toThrow(
        message,
      );
    });
  });
});
