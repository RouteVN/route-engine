import { current, isDraft } from "immer";

const lineIndexes = new WeakMap();

export const findSectionLineIndex = (lines, lineId) => {
  const snapshot = isDraft(lines) ? current(lines) : lines;
  if (!Array.isArray(snapshot)) return -1;
  if (!Object.isFrozen(snapshot)) {
    return snapshot.findIndex((line) => line.id === lineId);
  }
  let indexes = lineIndexes.get(snapshot);
  if (!indexes) {
    indexes = new Map();
    snapshot.forEach((line, index) => {
      if (!indexes.has(line.id)) indexes.set(line.id, index);
    });
    lineIndexes.set(snapshot, indexes);
  }
  return indexes.get(lineId) ?? -1;
};
