import { describe, expect, it } from "vitest";
import { parseAndRender } from "jempl";
import { formatDate } from "../src/index.js";

const TIMESTAMP = new Date(2026, 11, 31, 12, 34, 56).getTime();
const DATE_FORMAT_CASES = [
  ["DD/MM/YYYY", "31/12/2026"],
  ["MM/DD/YYYY", "12/31/2026"],
  ["YYYY-MM-DD", "2026-12-31"],
  ["DD MMM YYYY", "31 Dec 2026"],
  ["YYYY年MM月DD日", "2026年12月31日"],
];
const MONTH_ABBREVIATION_CASES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
].map((expectedMonth, monthIndex) => [expectedMonth, monthIndex]);

describe("formatDate", () => {
  it.each(DATE_FORMAT_CASES)("formats the %s preset", (format, expected) => {
    expect(formatDate(TIMESTAMP, format)).toBe(expected);
  });

  it.each(MONTH_ABBREVIATION_CASES)(
    "formats the %s abbreviation atomically",
    (expectedMonth, monthIndex) => {
      const timestamp = new Date(2027, monthIndex, 15, 12).getTime();

      expect(formatDate(timestamp, "MMM")).toBe(expectedMonth);
    },
  );

  it("keeps the reported July regression fixed", () => {
    expect(formatDate(new Date(2027, 6, 20, 12).getTime(), "DD MMM YYYY")).toBe(
      "20 Jul 2027",
    );
  });

  it("handles repeated and overlapping tokens", () => {
    expect(formatDate(TIMESTAMP, "MMM|MM|YYYY|YY|DD|HH|mm|ss|MMM|YYYY")).toBe(
      "Dec|12|2026|26|31|12|34|56|Dec|2026",
    );
  });

  it("zero-pads date and time fields across boundaries", () => {
    expect(
      formatDate(
        new Date(2027, 0, 2, 3, 4, 5).getTime(),
        "DD/MM/YYYY - HH:mm:ss",
      ),
    ).toBe("02/01/2027 - 03:04:05");
    expect(
      formatDate(new Date(2028, 1, 29, 3, 4, 5).getTime(), "DD/MM/YYYY"),
    ).toBe("29/02/2028");
  });

  it("renders English and CJK presets through Jempl", () => {
    const data = { savedAt: TIMESTAMP };
    const options = { functions: { formatDate } };

    expect(
      parseAndRender('${formatDate(savedAt, "DD MMM YYYY")}', data, options),
    ).toBe("31 Dec 2026");
    expect(
      parseAndRender('${formatDate(savedAt, "YYYY年MM月DD日")}', data, options),
    ).toBe("2026年12月31日");
  });

  it("keeps the existing default and empty timestamp behavior", () => {
    expect(formatDate(TIMESTAMP)).toBe("31/12/2026 - 12:34");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate(0)).toBe("");
    expect(formatDate(Number.NaN)).toBe("");
  });

  it("preserves unsupported text as literals", () => {
    expect(formatDate(TIMESTAMP, "Saved: DD MMM YYYY")).toBe(
      "Saved: 31 Dec 2026",
    );
  });
});
