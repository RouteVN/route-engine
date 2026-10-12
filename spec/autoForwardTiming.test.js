import { describe, expect, it, vi } from "vitest";
import {
  AUTO_FORWARD_MAX_DELAY_MS,
  estimateAutoForwardDelay,
  getAutoForwardSpeedMultiplier,
  getAutoForwardReadingUnits,
} from "../src/autoForwardTiming.js";

// 2 ** ((speed - 50) / 50) rounded to the nearest binary64, indexed by speed.
const INTEGER_SPEED_MULTIPLIERS = [
  0.5, 0.5069797398950145, 0.5140569133280333, 0.5212328804205607,
  0.5285090202806901, 0.5358867312681466, 0.543367431263029, 0.5509525579383053,
  0.55864356903611, 0.5664419426478994, 0.5743491774985174, 0.5823667932342279,
  0.5904963307147651, 0.5987393523094643, 0.6070974421975235,
  0.6155722066724582, 0.6241652744508059, 0.63287829698514, 0.6417129487814521,
  0.6506709277209668, 0.6597539553864471, 0.668963777393056, 0.6783021637238359,
  0.6877709090698718, 0.6973718331752027, 0.7071067811865476,
  0.7169776240079136, 0.7269862586601553, 0.7371346086455506,
  0.7474246243174693, 0.757858283255199, 0.7684375906440062, 0.7791645796604999,
  0.7900413118633771, 0.8010698775896221, 0.8122523963562356,
  0.8235910172675731, 0.8350879194283694, 0.8467453123625271,
  0.8585654364377537, 0.8705505632961241, 0.8827029962906549,
  0.8950250709279725, 0.9075191553171609, 0.9201876506248751,
  0.9330329915368074, 0.9460576467255959, 0.9592641193252643,
  0.9726549474122855, 0.9862327044933592, 1, 1.013959479790029,
  1.0281138266560665, 1.0424657608411214, 1.0570180405613803,
  1.0717734625362931, 1.086734862526058, 1.1019051158766107, 1.11728713807222,
  1.1328838852957985, 1.148698354997035, 1.1647335864684558, 1.1809926614295303,
  1.1974787046189286, 1.214194884395047, 1.2311444133449163, 1.2483305489016119,
  1.26575659397028, 1.2834258975629043, 1.3013418554419336, 1.3195079107728942,
  1.337927554786112, 1.3566043274476718, 1.3755418181397439, 1.3947436663504054,
  1.4142135623730951, 1.4339552480158273, 1.4539725173203106,
  1.4742692172911012, 1.4948492486349383, 1.515716566510398, 1.5368751812880124,
  1.5583291593209998, 1.5800826237267545, 1.6021397551792442, 1.624504792712471,
  1.6471820345351462, 1.6701758388567387, 1.6934906247250543,
  1.7171308728755075, 1.7411011265922482, 1.7654059925813097, 1.790050141855945,
  1.8150383106343217, 1.8403753012497501, 1.8660659830736148,
  1.8921152934511918, 1.9185282386505287, 1.945309894824571, 1.9724654089867184,
  2,
];

// Fractional speeds where glibc 2.43 pow (which V8 calls on Linux) returns
// the neighbouring binary64 instead of the nearest one.
const FRACTIONAL_SPEED_MULTIPLIERS = [
  [5.39, 0.5387918749305093],
  [44.62, 0.9281307732922005],
  [55.39, 1.0775837498610186],
  [61.09, 1.1661876906400275],
  [76.42, 1.4423287144604011],
  [1.6218108357861638, 0.5113688606410209],
  [11.278214515186846, 0.5846172445536842],
  [15.85592566115398, 0.6229198767484339],
  [23.260451527312398, 0.6902586802976548],
  [32.64301389745219, 0.7861411522977813],
  [41.55971207655966, 0.8895787565530576],
  [48.62368886824697, 0.9811011421990845],
  [56.852721643664715, 1.0996576386064774],
  [77.03163006808609, 1.4546102034938393],
  [79.53354422934353, 1.5059468826790383],
  [89.62236507454348, 1.732010050185167],
  [93.5848910594359, 1.829815033321451],
  [96.70571486931294, 1.9107172431722372],
];

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

  it("returns the correctly rounded multiplier for every integer speed", () => {
    expect(
      Array.from({ length: 101 }, (_, speed) =>
        getAutoForwardSpeedMultiplier(speed),
      ),
    ).toEqual(INTEGER_SPEED_MULTIPLIERS);
    // JavaScriptCore and fdlibm-based pow implementations return
    // 0.7071067811865475 here.
    expect(getAutoForwardSpeedMultiplier(25)).toBe(Math.SQRT1_2);
  });

  it.each(FRACTIONAL_SPEED_MULTIPLIERS)(
    "returns the correctly rounded multiplier for speed %s",
    (speed, multiplier) => {
      expect(getAutoForwardSpeedMultiplier(speed)).toBe(multiplier);
    },
  );

  it("keeps fractional speeds monotonic between half and double speed", () => {
    let previous = getAutoForwardSpeedMultiplier(0);
    for (let step = 1; step <= 10_000; step += 1) {
      const multiplier = getAutoForwardSpeedMultiplier(step / 100);
      expect(multiplier).toBeGreaterThanOrEqual(previous);
      previous = multiplier;
    }
    expect(previous).toBe(2);
  });

  it("derives the reading delay from the exact multiplier", () => {
    const text = "Hi 世界 e\u0301 👨‍👩‍👧‍👦";
    expect(getAutoForwardReadingUnits(text)).toBe(11.5);
    expect(estimateAutoForwardDelay({ text, baseDelay: 0, speed: 25 })).toBe(
      975.8073580374355,
    );
    expect(estimateAutoForwardDelay({ text, baseDelay: 0, speed: 55.39 })).toBe(
      640.3214600155142,
    );
    expect(
      estimateAutoForwardDelay({ text, baseDelay: 0, speed: 93.5848910594359 }),
    ).toBe(377.08729430838866);
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
