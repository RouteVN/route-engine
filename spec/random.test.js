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

const sample = (distribution, values, resolveNumeric = (value) => value) =>
  sampleRandomDistribution(distribution, {
    randomSource: createSource(...values),
    resolveNumeric,
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
            { value: "never", weight: 0 },
            { value: "common", weight: 1 },
            { value: "rare", weight: 3 },
          ],
        },
        [0xffff_ffff, 0xffff_ffff],
      ),
    ).toEqual({ type: "weighted", value: "rare" });
  });

  it("resolves only numeric fields and validates the resolved values", () => {
    const resolvedPaths = [];
    const result = sample(
      {
        type: "weighted",
        outcomes: [
          { value: "${variables.literal}", weight: "${variables.weight}" },
        ],
      },
      [0, 0],
      (value, path) => {
        resolvedPaths.push(path);
        return value === "${variables.weight}" ? 5 : value;
      },
    );

    expect(result.value).toBe("${variables.literal}");
    expect(resolvedPaths).toEqual(["random.distribution.outcomes[0].weight"]);
  });

  it.each([
    [{ type: "dice", count: 101, sides: 6 }, "count"],
    [{ type: "integer", min: 0, max: 0x1_0000_0000 }, "range"],
    [{ type: "chance", probability: Number.NaN }, "finite number"],
    [
      {
        type: "weighted",
        outcomes: [
          { value: "same", weight: 1 },
          { value: "same", weight: 1 },
        ],
      },
      "unique",
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
