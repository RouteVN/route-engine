import { describe, expect, it } from "vitest";
import { selectRoutingCycle } from "../src/routingCycle.js";

// "a b a" is three entered lines in section "main". "other/x" is line "x" in
// section "other".
const pointers = (text) =>
  text
    .split(" ")
    .filter(Boolean)
    .map((token) => {
      const [first, second] = token.split("/");
      return second === undefined
        ? { sectionId: "main", lineId: first }
        : { sectionId: first, lineId: second };
    });

const cycleOf = (text) =>
  selectRoutingCycle(pointers(text))
    .map(({ sectionId, lineId }) =>
      sectionId === "main" ? lineId : `${sectionId}/${lineId}`,
    )
    .join(" ");

const repeat = (text, times) => Array(times).fill(text).join(" ");

describe("selectRoutingCycle", () => {
  it.each([
    ["nothing entered", "", ""],
    ["one line entered once", "a", ""],
    ["a chain of lines that never comes back", "a b c d e", ""],
    ["a line that keeps entering itself", "a a a a", "a"],
    ["a line that entered itself once", "a a", "a"],
    ["a line entering itself after a lead-in", "x y a a a", "a"],
    ["two lines, stopped on the first", "a b a b a", "a b"],
    ["two lines, stopped on the second", "a b a b", "b a"],
    ["two lines after a lead-in", "x y a b a b a", "a b"],
    ["three lines", "a b c a b c a", "a b c"],
    ["three lines, stopped mid-turn", "a b c a b c a b", "b c a"],
    ["a lead-in line that is not in the cycle", "x a b a b a b", "b a"],
    ["a line passed twice a turn", "a b a c a b a c a", "a b c"],
    [
      "a line passed twice a turn, stopped mid-turn",
      "a b a c a b a c",
      "c a b",
    ],
    [
      "a line entering itself inside a longer cycle",
      "a a b a a b a a b",
      "b a",
    ],
    ["only one full turn, stopped back at its start", "x a b c a", "a b c"],
    ["one and a half turns", "a b c a b", "b c a"],
    ["a route that varies between turns", "a b a c a d a", "a d"],
    ["a route that changed and then settled", "a b a b a c d c d c d", "d c"],
  ])("%s", (_label, entered, expected) => {
    expect(cycleOf(entered)).toBe(expected);
  });

  it("tells sections apart for lines that share an ID", () => {
    expect(cycleOf("main/loop other/loop main/loop other/loop")).toBe(
      "other/loop loop",
    );
  });

  it("keeps a line that shares its ID with a line of another section in the cycle", () => {
    expect(cycleOf("a other/a a other/a a")).toBe("a other/a");
  });

  it("finds a cycle as long as half the entered lines", () => {
    const turn = Array.from({ length: 500 }, (_, index) => `l${index}`).join(
      " ",
    );
    const cycle = selectRoutingCycle(pointers(repeat(turn, 2)));

    expect(cycle).toHaveLength(500);
    expect(cycle[0]).toEqual({ sectionId: "main", lineId: "l499" });
    expect(cycle[1]).toEqual({ sectionId: "main", lineId: "l0" });
    expect(cycle.at(-1)).toEqual({ sectionId: "main", lineId: "l498" });
  });

  it("finds a cycle that fits less than twice into the entered lines", () => {
    const turn = Array.from({ length: 700 }, (_, index) => `l${index}`);
    const entered = [...turn, ...turn.slice(0, 300)].join(" ");
    const cycle = selectRoutingCycle(pointers(entered));

    expect(cycle).toHaveLength(700);
    expect(cycle[0]).toEqual({ sectionId: "main", lineId: "l299" });
    expect(cycle.at(-1)).toEqual({ sectionId: "main", lineId: "l298" });
  });

  it("handles a full budget of one repeated line", () => {
    expect(cycleOf(repeat("a", 1000))).toBe("a");
  });

  it("returns copies, leaving the entered lines untouched", () => {
    const entered = pointers("a b a b");
    const snapshot = structuredClone(entered);
    const cycle = selectRoutingCycle(entered);

    cycle[0].lineId = "changed";

    expect(entered).toEqual(snapshot);
    expect(entered.includes(cycle[0])).toBe(false);
  });
});
