import { parseAndRender } from "jempl";

/**
 * Interpolates dialogue text using the same variable context as dialogue
 * rendering. Object results are left authored so they are not rendered as
 * "[object Object]".
 */
export const interpolateDialogueText = (text, data) => {
  if (!text || typeof text !== "string") return text;
  if (!text.includes("${")) return text;

  const rendered = parseAndRender(text, data);
  if (rendered && typeof rendered === "object") return text;
  return rendered;
};
