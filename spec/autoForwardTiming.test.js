import { describe, expect, it } from "vitest";
import {
  AUTO_FORWARD_MAX_DELAY_MS,
  estimateAutoForwardDelay,
  getAutoForwardReadingUnits,
} from "../src/autoForwardTiming.js";

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

  it("uses the base delay for empty content", () => {
    expect(
      estimateAutoForwardDelay({
        text: "",
        baseDelay: 1250,
      }),
    ).toBe(1250);
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
});
