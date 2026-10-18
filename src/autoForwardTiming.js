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

// Han, Hiragana, Katakana and Hangul code points from Unicode 17.0
// Scripts.txt, as sorted inclusive [first, last] ranges. \p{Script=...} in a
// regular expression follows the host's Unicode tables, so a character added
// to these scripts in a newer Unicode version (for example CJK Extension J in
// 17.0) weighed 1 instead of 3 on older hosts. Update this table together with
// unicode-segmenter.
const CJK_CODE_POINT_RANGES = [
  [0x1100, 0x11ff],
  [0x2e80, 0x2e99],
  [0x2e9b, 0x2ef3],
  [0x2f00, 0x2fd5],
  [0x3005, 0x3005],
  [0x3007, 0x3007],
  [0x3021, 0x3029],
  [0x302e, 0x302f],
  [0x3038, 0x303b],
  [0x3041, 0x3096],
  [0x309d, 0x309f],
  [0x30a1, 0x30fa],
  [0x30fd, 0x30ff],
  [0x3131, 0x318e],
  [0x31f0, 0x321e],
  [0x3260, 0x327e],
  [0x32d0, 0x32fe],
  [0x3300, 0x3357],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa960, 0xa97c],
  [0xac00, 0xd7a3],
  [0xd7b0, 0xd7c6],
  [0xd7cb, 0xd7fb],
  [0xf900, 0xfa6d],
  [0xfa70, 0xfad9],
  [0xff66, 0xff6f],
  [0xff71, 0xff9d],
  [0xffa0, 0xffbe],
  [0xffc2, 0xffc7],
  [0xffca, 0xffcf],
  [0xffd2, 0xffd7],
  [0xffda, 0xffdc],
  [0x16fe2, 0x16fe3],
  [0x16ff0, 0x16ff6],
  [0x1aff0, 0x1aff3],
  [0x1aff5, 0x1affb],
  [0x1affd, 0x1affe],
  [0x1b000, 0x1b122],
  [0x1b132, 0x1b132],
  [0x1b150, 0x1b152],
  [0x1b155, 0x1b155],
  [0x1b164, 0x1b167],
  [0x1f200, 0x1f200],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b81d],
  [0x2b820, 0x2cead],
  [0x2ceb0, 0x2ebe0],
  [0x2ebf0, 0x2ee5d],
  [0x2f800, 0x2fa1d],
  [0x30000, 0x3134a],
  [0x31350, 0x33479],
];

// ECMAScript WhiteSpace and LineTerminator code points, which \s matches.
const WHITESPACE_CODE_POINT_RANGES = [
  [0x0009, 0x000d],
  [0x0020, 0x0020],
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
];

const isInCodePointRanges = (ranges, codePoint) => {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [first, last] = ranges[middle];
    if (codePoint < first) {
      high = middle - 1;
    } else if (codePoint > last) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
};

const isWhitespaceGrapheme = (grapheme) => {
  for (const character of grapheme) {
    if (
      !isInCodePointRanges(
        WHITESPACE_CODE_POINT_RANGES,
        character.codePointAt(0),
      )
    ) {
      return false;
    }
  }
  return true;
};

const isCjkGrapheme = (grapheme) => {
  for (const character of grapheme) {
    if (isInCodePointRanges(CJK_CODE_POINT_RANGES, character.codePointAt(0))) {
      return true;
    }
  }
  return false;
};

// Graphemes always come from the bundled UAX #29 segmenter (Unicode 17.0).
// Intl.Segmenter follows the host's ICU data, so the same line counted
// differently on hosts with older Unicode tables (for example Khmer and
// Myanmar conjuncts, or U+2701 U+200D U+2701). The text is not normalized:
// String.prototype.normalize also follows the host's Unicode tables, and the
// bundled segmenter already keeps a base and its combining marks together.
const segmentGraphemes = (text) => Array.from(splitGraphemes(`${text ?? ""}`));

export const getAutoForwardReadingUnits = (text) =>
  segmentGraphemes(text).reduce((units, grapheme) => {
    if (isWhitespaceGrapheme(grapheme)) {
      return units + AUTO_FORWARD_WHITESPACE_READING_WEIGHT;
    }

    if (isCjkGrapheme(grapheme)) {
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
// in the last bit between engines and C libraries (V8 calls the C library pow
// or its own fdlibm port, depending on the build and --use-std-math-pow;
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
// correctly rounded, so every host returns the same binary64. The last result
// is cached: the speed setting rarely changes, while playback timers re-read
// the multiplier on every reconcile.
let cachedSpeedExponent = 0;
let cachedSpeedMultiplier = 1;

export const getAutoForwardSpeedMultiplier = (speed) => {
  const normalizedSpeed = Number.isFinite(speed)
    ? Math.min(MAX_AUTO_FORWARD_SPEED, Math.max(MIN_AUTO_FORWARD_SPEED, speed))
    : DEFAULT_AUTO_FORWARD_SPEED;
  const exponent =
    (normalizedSpeed - NORMAL_AUTO_FORWARD_SPEED) /
    (MAX_AUTO_FORWARD_SPEED - NORMAL_AUTO_FORWARD_SPEED);

  if (exponent !== cachedSpeedExponent) {
    cachedSpeedMultiplier = exp2CorrectlyRounded(exponent);
    cachedSpeedExponent = exponent;
  }
  return cachedSpeedMultiplier;
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
