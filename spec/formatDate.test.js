import { describe, expect, it } from "vitest";
import { formatDate } from "../src/util.js";

const TIMESTAMP = new Date(2026, 11, 31, 12, 34, 56).getTime();

describe("formatDate", () => {
  it("formats abbreviated English month names", () => {
    expect(formatDate(TIMESTAMP, "DD MMM YYYY")).toBe("31 Dec 2026");
    expect(
      formatDate(new Date(2027, 6, 20, 12).getTime(), "DD MMM YYYY"),
    ).toBe("20 Jul 2027");
  });

  it("preserves literal CJK date markers", () => {
    expect(formatDate(TIMESTAMP, "YYYY年MM月DD日")).toBe("2026年12月31日");
  });

  it("handles repeated and overlapping tokens", () => {
    expect(formatDate(TIMESTAMP, "MMM MM YYYY YYYY")).toBe("Dec 12 2026 2026");
  });

  it("keeps existing numeric and time tokens", () => {
    expect(formatDate(TIMESTAMP, "DD/MM/YYYY - HH:mm:ss YY")).toBe(
      "31/12/2026 - 12:34:56 26",
    );
  });

  it("keeps the existing default and empty timestamp behavior", () => {
    expect(formatDate(TIMESTAMP)).toBe("31/12/2026 - 12:34");
    expect(formatDate(undefined)).toBe("");
  });
});
