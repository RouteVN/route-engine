import { describe, expect, it } from "vitest";
import { evaluateRouteCondition } from "../src/util.js";

describe("evaluateRouteCondition strict comparisons", () => {
  it.each([
    [{ eq: [1, 1] }, true],
    [{ eq: [1, "1"] }, false],
    [{ eq: [0, false] }, false],
    [{ neq: [1, "1"] }, true],
    [{ eq: [{ var: "missing" }, null] }, false],
  ])("evaluates %j without equality coercion", (condition, expected) => {
    expect(evaluateRouteCondition(condition)).toBe(expected);
  });

  it.each([
    [{ gt: [2, 1] }, true],
    [{ gte: [2, 2] }, true],
    [{ lt: ["a", "b"] }, true],
    [{ lte: ["b", "b"] }, true],
    [{ gt: ["2", 1] }, false],
    [{ gte: [2, "2"] }, false],
    [{ lt: [1, "2"] }, false],
    [{ lte: ["2", 2] }, false],
    [{ gt: [false, true] }, false],
    [{ gt: [null, 0] }, false],
    [{ gt: [{ var: "missing" }, 0] }, false],
    [{ gt: [Number.POSITIVE_INFINITY, 0] }, false],
  ])(
    "orders only same-domain scalar operands for %j",
    (condition, expected) => {
      expect(evaluateRouteCondition(condition)).toBe(expected);
    },
  );

  it("applies strict comparisons recursively", () => {
    expect(
      evaluateRouteCondition({
        all: [
          { eq: [1, 1] },
          { not: { eq: [1, "1"] } },
          {
            any: [{ gt: ["b", "a"] }, { eq: [false, 0] }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("keeps literal payloads opaque while rewriting comparisons", () => {
    const literalValue = { eq: [1, "1"] };

    expect(
      evaluateRouteCondition({
        in: [{ literal: literalValue }, { literal: [literalValue] }],
      }),
    ).toBe(true);
  });

  it("compares objects and arrays by identity", () => {
    const sharedObject = { value: 1 };
    const sharedArray = [1];

    expect(
      evaluateRouteCondition({
        eq: [{ literal: sharedObject }, { literal: sharedObject }],
      }),
    ).toBe(true);
    expect(
      evaluateRouteCondition({
        eq: [{ literal: { value: 1 } }, { literal: { value: 1 } }],
      }),
    ).toBe(false);
    expect(
      evaluateRouteCondition({
        eq: [{ literal: sharedArray }, { literal: sharedArray }],
      }),
    ).toBe(true);
    expect(
      evaluateRouteCondition({
        eq: [{ literal: [1] }, { literal: [1] }],
      }),
    ).toBe(false);
  });

  it("rewrites comparisons around semantic arithmetic", () => {
    expect(
      evaluateRouteCondition({
        eq: [{ add: [1, 2] }, 3],
      }),
    ).toBe(true);
  });

  it("preserves built-in function calls inside strict comparisons", () => {
    expect(
      evaluateRouteCondition({
        gt: [{ call: "now" }, 0],
      }),
    ).toBe(true);

    expect(
      evaluateRouteCondition({
        gt: [{ call: { name: "now", args: [] } }, 0],
      }),
    ).toBe(true);
  });

  it("reserves the internal strict-comparison function namespace", () => {
    expect(() =>
      evaluateRouteCondition({
        call: "__routeEngineConditionComparisoneq",
        args: [1, 1],
      }),
    ).toThrow("are reserved");
  });
});
