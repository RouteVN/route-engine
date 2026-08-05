import { describe, expect, it } from "vitest";
import {
  normalizeRandomSource,
  sampleRandomDistribution,
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
  it("rolls dice with stable highest/lowest keep breakdowns", () => {
    expect(
      sample(
        {
          type: "dice",
          count: 4,
          sides: 6,
          modifier: 2,
          keep: { type: "highest", count: 2 },
        },
        [1, 4, 4, 0],
      ),
    ).toEqual({
      type: "dice",
      value: 12,
      rolls: [2, 5, 5, 1],
      keptRolls: [5, 5],
      discardedRolls: [2, 1],
      modifier: 2,
    });
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
    { type: "dice", sides: "${variables.sides}" },
    {
      type: "weighted",
      outcomes: [{ weight: "${variables.weight}", actions: {} }],
    },
  ])("rejects non-literal numeric distribution fields %#", (distribution) => {
    expect(() => sample(distribution, [0, 0])).toThrow(/number|integer/);
  });

  it.each([
    [{ type: "dice", count: 101, sides: 6 }, "count"],
    [{ type: "integer", min: 1, max: 6 }, 'must be "dice" or "weighted"'],
    [{ type: "chance", probability: 0.5 }, 'must be "dice" or "weighted"'],
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
        { type: "dice", sides: 2 },
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
        { type: "dice", sides: 5 },
        Array.from({ length: 128 }, () => 0xffff_ffff),
      ),
    ).toThrow("128 rejected samples");
  });

  it("returns deeply frozen result snapshots", () => {
    const result = sample({ type: "dice", count: 2, sides: 6 }, [0, 1]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rolls)).toBe(true);
  });
});
