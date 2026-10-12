import { splitGraphemes } from "unicode-segmenter/grapheme";

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_AUTO_FORWARD_SPEED = 50;
const MIN_AUTO_FORWARD_SPEED = 0;
const MAX_AUTO_FORWARD_SPEED = 100;
const NORMAL_AUTO_FORWARD_SPEED = 50;

export const AUTO_FORWARD_MS_PER_READING_UNIT = 60;
export const AUTO_FORWARD_CJK_READING_WEIGHT = 3;
export const AUTO_FORWARD_WHITESPACE_READING_WEIGHT = 0.5;
export const AUTO_FORWARD_MAX_DELAY_MS = 20_000;

const CJK_GRAPHEME_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WHITESPACE_GRAPHEME_RE = /^\s+$/u;

// Graphemes always come from the bundled UAX #29 segmenter (Unicode 17.0).
// Intl.Segmenter follows the host's ICU data, so the same line counted
// differently on hosts with older Unicode tables (for example Khmer and
// Myanmar conjuncts, or U+2701 U+200D U+2701).
const segmentGraphemes = (text) =>
  Array.from(splitGraphemes(`${text ?? ""}`.normalize("NFC")));

export const getAutoForwardReadingUnits = (text) =>
  segmentGraphemes(text).reduce((units, grapheme) => {
    if (WHITESPACE_GRAPHEME_RE.test(grapheme)) {
      return units + AUTO_FORWARD_WHITESPACE_READING_WEIGHT;
    }

    if (CJK_GRAPHEME_RE.test(grapheme)) {
      return units + AUTO_FORWARD_CJK_READING_WEIGHT;
    }

    return units + 1;
  }, 0);

const binary64View = new DataView(new ArrayBuffer(8));
const EXP2_INITIAL_PRECISION_BITS = 128;
const LN2_GUARD_BITS = 64n;
const scaledLn2Cache = new Map();

// ln(2) * 2 ** bits to within 2, from ln(2) = sum of 1 / (k * 2 ** k), k >= 1.
const getScaledLn2 = (bits) => {
  let scaledLn2 = scaledLn2Cache.get(bits);
  if (scaledLn2 === undefined) {
    const scale = 1n << (BigInt(bits) + LN2_GUARD_BITS);
    let sum = 0n;
    for (let k = 1n; scale >> k !== 0n; k += 1n) {
      sum += (scale >> k) / k;
    }
    scaledLn2 = sum >> LN2_GUARD_BITS;
    scaledLn2Cache.set(bits, scaledLn2);
  }
  return scaledLn2;
};

// Nearest binary64 (ties to even) to scaled / 2 ** bits, for normal results.
const roundScaledToBinary64 = (scaled, bits) => {
  const shift = BigInt(scaled.toString(2).length - 53);
  let significand = scaled >> shift;
  const remainder = scaled - (significand << shift);
  const half = 1n << (shift - 1n);
  if (remainder > half || (remainder === half && (significand & 1n) === 1n)) {
    significand += 1n;
  }
  let exponent = shift - BigInt(bits);
  if (significand === 1n << 53n) {
    significand >>= 1n;
    exponent += 1n;
  }
  binary64View.setBigUint64(
    0,
    ((exponent + 1075n) << 52n) | (significand - (1n << 52n)),
  );
  return binary64View.getFloat64(0);
};

// 2 ** x rounded to the nearest binary64, for binary64 x in [-1, 1].
//
// `2 ** x` and Math.pow are implementation-approximated in ECMA-262 and differ
// in the last bit between engines and C libraries (V8 uses the host C pow;
// JavaScriptCore returns 0.7071067811865475 for 2 ** -0.5, V8 on glibc
// 0.7071067811865476). The correctly rounded value has exactly one answer, so
// it is computed with exact BigInt fixed-point arithmetic. With 2 ** -bits as
// the unit, x * ln(2) is off by less than 3 units, each truncated series term
// adds less than 4, and the bracket [sum - error, sum + error] must round to
// a single binary64; otherwise the precision doubles. 2 ** x is irrational
// for every non-integer rational x, so it never lies exactly halfway and the
// loop ends (in practice after the first pass).
const exp2CorrectlyRounded = (x) => {
  if (x === 0) return 1;
  if (x === 1) return 2;
  if (x === -1) return 0.5;

  binary64View.setFloat64(0, x);
  const bitsOfX = binary64View.getBigUint64(0);
  const exponentField = Number((bitsOfX >> 52n) & 0x7ffn);
  const fraction = bitsOfX & ((1n << 52n) - 1n);
  const magnitude = exponentField === 0 ? fraction : fraction | (1n << 52n);
  const significandOfX = bitsOfX >> 63n === 1n ? -magnitude : magnitude;
  const shiftOfX = 1075 - Math.max(exponentField, 1);

  for (let bits = EXP2_INITIAL_PRECISION_BITS; ; bits *= 2) {
    const scale = 1n << BigInt(bits);
    const product = significandOfX * getScaledLn2(bits);
    const t =
      shiftOfX >= 0
        ? product >> BigInt(shiftOfX)
        : product << BigInt(-shiftOfX);
    let term = scale;
    let sum = scale;
    let termCount = 1;
    for (let n = 1n; term !== 0n; n += 1n) {
      term = (term * t) / (scale * n);
      sum += term;
      termCount += 1;
    }
    const error = BigInt(4 * termCount + 16);
    const lower = roundScaledToBinary64(sum - error, bits);
    const upper = roundScaledToBinary64(sum + error, bits);
    if (lower === upper) return lower;
  }
};

// 2 ** ((speed - 50) / 50): 0.5 at speed 0, 1 at 50, 2 at 100. The clamp,
// subtraction and division are IEEE-754 basic operations and the power is
// correctly rounded, so every host returns the same binary64.
export const getAutoForwardSpeedMultiplier = (speed) => {
  const normalizedSpeed = Number.isFinite(speed)
    ? Math.min(MAX_AUTO_FORWARD_SPEED, Math.max(MIN_AUTO_FORWARD_SPEED, speed))
    : DEFAULT_AUTO_FORWARD_SPEED;

  return exp2CorrectlyRounded(
    (normalizedSpeed - NORMAL_AUTO_FORWARD_SPEED) /
      (MAX_AUTO_FORWARD_SPEED - NORMAL_AUTO_FORWARD_SPEED),
  );
};

export const estimateAutoForwardDelay = ({
  text = "",
  baseDelay = DEFAULT_BASE_DELAY_MS,
  speed = DEFAULT_AUTO_FORWARD_SPEED,
} = {}) => {
  const normalizedBaseDelay = Number.isFinite(baseDelay)
    ? Math.max(0, baseDelay)
    : DEFAULT_BASE_DELAY_MS;
  const speedMultiplier = getAutoForwardSpeedMultiplier(speed);
  const readingDelay =
    (getAutoForwardReadingUnits(text) * AUTO_FORWARD_MS_PER_READING_UNIT) /
    speedMultiplier;
  const delayCeiling = Math.max(normalizedBaseDelay, AUTO_FORWARD_MAX_DELAY_MS);

  return Math.min(normalizedBaseDelay + readingDelay, delayCeiling);
};
