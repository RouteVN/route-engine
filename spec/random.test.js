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

  it("samples inclusive integer endpoints without modulo bias", () => {
    expect(
      sample({ type: "integer", min: -2, max: 2 }, [0xffff_ffff, 4]),
    ).toEqual({ type: "integer", value: 2 });
  });

  it("uses a 53-bit unit sample for chance and weighted selection", () => {
    expect(sample({ type: "chance", probability: 0.5 }, [0, 0])).toEqual({
      type: "chance",
      value: true,
    });
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

  it.each([
    { type: "dice", sides: "${variables.sides}" },
    { type: "integer", min: 1, max: "${variables.max}" },
    { type: "chance", probability: "${variables.probability}" },
    {
      type: "weighted",
      outcomes: [{ weight: "${variables.weight}", actions: {} }],
    },
  ])("rejects non-literal numeric distribution fields %#", (distribution) => {
    expect(() => sample(distribution, [0, 0])).toThrow(/number|integer/);
  });

  it.each([
    [{ type: "dice", count: 101, sides: 6 }, "count"],
    [{ type: "integer", min: 0, max: 0x1_0000_0000 }, "range"],
    [{ type: "chance", probability: Number.NaN }, "finite number"],
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
  ])("rejects an invalid distribution %#", (distribution, message) => {
    expect(() => sample(distribution, [0, 0])).toThrow(message);
  });

  it("validates every injected uint32 value", () => {
    expect(() =>
      sampleRandomDistribution(
        { type: "integer", min: 1, max: 2 },
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
        { type: "integer", min: 1, max: 5 },
        Array.from({ length: 128 }, () => 0xffff_ffff),
      ),
    ).toThrow("128 rejected samples");
  });

  it("does not consume random words for certain chance outcomes", () => {
    expect(sample({ type: "chance", probability: 0 }, [])).toEqual({
      type: "chance",
      value: false,
    });
    expect(sample({ type: "chance", probability: 1 }, [])).toEqual({
      type: "chance",
      value: true,
    });
  });

  it("returns deeply frozen result snapshots", () => {
    const result = sample({ type: "dice", count: 2, sides: 6 }, [0, 1]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rolls)).toBe(true);
  });
});
