const DEFAULT_BASE_DELAY_MS = 1000;

export const AUTO_FORWARD_MS_PER_READING_UNIT = 60;
export const AUTO_FORWARD_CJK_READING_WEIGHT = 3;
export const AUTO_FORWARD_WHITESPACE_READING_WEIGHT = 0.5;
export const AUTO_FORWARD_MAX_DELAY_MS = 20_000;

const CJK_GRAPHEME_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WHITESPACE_GRAPHEME_RE = /^\s+$/u;

let graphemeSegmenter;

const segmentGraphemes = (text) => {
  const normalizedText = `${text ?? ""}`.normalize("NFC");
  const Segmenter = globalThis.Intl?.Segmenter;

  if (typeof Segmenter !== "function") {
    return Array.from(normalizedText);
  }

  graphemeSegmenter ??= new Segmenter(undefined, {
    granularity: "grapheme",
  });

  return Array.from(
    graphemeSegmenter.segment(normalizedText),
    ({ segment }) => segment,
  );
};

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

export const estimateAutoForwardDelay = ({
  text = "",
  baseDelay = DEFAULT_BASE_DELAY_MS,
} = {}) => {
  const normalizedBaseDelay = Number.isFinite(baseDelay)
    ? Math.max(0, baseDelay)
    : DEFAULT_BASE_DELAY_MS;
  const readingDelay =
    getAutoForwardReadingUnits(text) * AUTO_FORWARD_MS_PER_READING_UNIT;
  const delayCeiling = Math.max(normalizedBaseDelay, AUTO_FORWARD_MAX_DELAY_MS);

  return Math.min(normalizedBaseDelay + readingDelay, delayCeiling);
};
