import { describe, expect, it, vi } from "vitest";
import {
  AUTO_FORWARD_MAX_DELAY_MS,
  estimateAutoForwardDelay,
  getAutoForwardSpeedMultiplier,
  getAutoForwardReadingUnits,
} from "../src/autoForwardTiming.js";

// Reading units under the bundled Unicode 17.0 grapheme rules. Rows marked
// "Unicode 17" counted differently through Intl.Segmenter on Unicode 16 hosts.
const READING_UNIT_CORPUS = [
  ["Latin", "Hello, world.", 12.5],
  ["combining marks", "cafe\u0301 A\u030Angstro\u0308m", 12.5],
  ["stacked combining marks", "Z\u0351\u036B\u0343\u036A\u0302a", 2],
  ["Han and kana", "漢字とカタカナ", 21],
  ["Hangul syllables", "한국어", 9],
  ["Hangul conjoining jamo", "\u1100\u1161\u11A8\u1112\u1161\u11AB", 6],
  ["emoji ZWJ family", "👨‍👩‍👧‍👦", 1],
  ["emoji ZWJ with skin tone", "🧑🏿‍🦱", 1],
  ["regional indicator flags", "🇯🇵🇰🇷🇺🇳🇳", 4],
  ["emoji tag sequence", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", 1],
  ["emoji keycaps", "1️⃣#️⃣", 2],
  ["Thai tone marks and sara am", "ภาษาไทย น้ำ กำลัง", 12],
  ["Devanagari conjuncts", "क्षत्रिय श्री", 4.5],
  ["Khmer conjuncts (Unicode 17)", "ភាសាខ្មែរ", 4],
  ["Myanmar kinzi (Unicode 17)", "\u1004\u103A\u1039\u1011\u1039\u1011", 1],
  ["pictograph ZWJ pictograph (Unicode 17)", "\u2701\u200D\u2701", 2],
  ["CRLF", "a\r\nb", 2.5],
  ["mixed dialogue", "Hi 世界 e\u0301 👨‍👩‍👧‍👦 สวัสดี 🇯🇵!", 18.5],
];

describe("auto-forward timing", () => {
  it("weights Latin text and whitespace", () => {
    expect(getAutoForwardReadingUnits("abcd")).toBe(4);
    expect(getAutoForwardReadingUnits("a b")).toBe(2.5);
  });

  it("weights Han, Hiragana, Katakana, and Hangul graphemes", () => {
    expect(getAutoForwardReadingUnits("漢あア한")).toBe(12);
  });

  it("supports mixed CJK and Latin text", () => {
    expect(getAutoForwardReadingUnits("Hi 世界")).toBe(8.5);
    expect(
      estimateAutoForwardDelay({
        text: "Hi 世界",
        baseDelay: 1000,
      }),
    ).toBe(1510);
  });

  it("counts composed characters and emoji sequences as graphemes", () => {
    expect(getAutoForwardReadingUnits("e\u0301")).toBe(1);
    expect(getAutoForwardReadingUnits("👨‍👩‍👧‍👦")).toBe(1);
  });

  it("keeps emoji sequences intact without Intl.Segmenter", () => {
    const segmenterDescriptor = Object.getOwnPropertyDescriptor(
      Intl,
      "Segmenter",
    );
    Object.defineProperty(Intl, "Segmenter", {
      configurable: true,
      value: undefined,
    });

    try {
      expect(getAutoForwardReadingUnits("👨‍👩‍👧‍👦")).toBe(1);
      expect(getAutoForwardReadingUnits("🇨🇳")).toBe(1);
    } finally {
      Object.defineProperty(Intl, "Segmenter", segmenterDescriptor);
    }
  });

  it.each(READING_UNIT_CORPUS)(
    "counts %s with the bundled Unicode 17 grapheme rules",
    (_label, text, units) => {
      expect(getAutoForwardReadingUnits(text)).toBe(units);
    },
  );

  it("ignores the host Intl.Segmenter and its Unicode data", async () => {
    const segmenterDescriptor = Object.getOwnPropertyDescriptor(
      Intl,
      "Segmenter",
    );
    let hostSegmenterCount = 0;
    // Stands in for a host with outdated grapheme data: one code point each.
    class OutdatedHostSegmenter {
      constructor() {
        hostSegmenterCount += 1;
      }

      segment(text) {
        return Array.from(text, (segment) => ({ segment }));
      }
    }
    Object.defineProperty(Intl, "Segmenter", {
      configurable: true,
      value: OutdatedHostSegmenter,
    });

    try {
      vi.resetModules();
      const timing = await import("../src/autoForwardTiming.js");
      for (const [, text, units] of READING_UNIT_CORPUS) {
        expect(timing.getAutoForwardReadingUnits(text)).toBe(units);
      }
      expect(hostSegmenterCount).toBe(0);
    } finally {
      Object.defineProperty(Intl, "Segmenter", segmenterDescriptor);
      vi.resetModules();
    }
  });

  it("uses the base delay for empty content", () => {
    expect(
      estimateAutoForwardDelay({
        text: "",
        baseDelay: 1250,
      }),
    ).toBe(1250);
  });

  it("maps the 0–100 speed setting from half to double speed", () => {
    expect(getAutoForwardSpeedMultiplier(0)).toBe(0.5);
    expect(getAutoForwardSpeedMultiplier(50)).toBe(1);
    expect(getAutoForwardSpeedMultiplier(100)).toBe(2);
  });

  it("scales only length-derived reading time with the speed setting", () => {
    expect(
      estimateAutoForwardDelay({
        text: "abcd",
        baseDelay: 1000,
        speed: 100,
      }),
    ).toBe(1120);
    expect(
      estimateAutoForwardDelay({
        text: "abcd",
        baseDelay: 1000,
        speed: 0,
      }),
    ).toBe(1480);
  });

  it("caps reading time without reducing an explicit base above the cap", () => {
    expect(
      estimateAutoForwardDelay({
        text: "a".repeat(400),
        baseDelay: 1000,
      }),
    ).toBe(AUTO_FORWARD_MAX_DELAY_MS);

    expect(
      estimateAutoForwardDelay({
        text: "long text",
        baseDelay: 25_000,
      }),
    ).toBe(25_000);
  });

  it("normalizes invalid and negative base delays", () => {
    expect(
      estimateAutoForwardDelay({
        text: "a",
        baseDelay: Number.NaN,
      }),
    ).toBe(1060);
    expect(
      estimateAutoForwardDelay({
        text: "a",
        baseDelay: -100,
      }),
    ).toBe(60);
  });

  it("uses normal speed when the setting is invalid", () => {
    expect(
      estimateAutoForwardDelay({
        text: "abcd",
        baseDelay: 1000,
        speed: Number.NaN,
      }),
    ).toBe(1240);
  });

  it("clamps out-of-range speed settings", () => {
    expect(
      estimateAutoForwardDelay({
        text: "abcd",
        baseDelay: 1000,
        speed: -1,
      }),
    ).toBe(1480);
    expect(
      estimateAutoForwardDelay({
        text: "abcd",
        baseDelay: 1000,
        speed: 101,
      }),
    ).toBe(1120);
  });
});
