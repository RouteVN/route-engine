import { constructPresentationState } from "./constructPresentationState.js";
import { findSectionLineIndex } from "./sectionLineIndex.js";

const EMPTY_PRESENTATION = Object.freeze({});
const CHECKPOINT_INTERVAL = 64;
const MAX_CHECKPOINTS = 16;
const MAX_RECENT_STATES = 4;
const MAX_CACHED_SECTIONS = 8;
const projects = new WeakMap();

const remember = (entries, key, value, limit) => {
  entries.delete(key);
  entries.set(key, value);
  if (entries.size > limit) entries.delete(entries.keys().next().value);
};

const getSectionCache = (projectData, section) => {
  // Store-owned project data is deeply frozen by Immer. Mutable standalone
  // selector inputs and modified drafts must always be evaluated afresh.
  if (
    !Array.isArray(section.lines) ||
    !Object.isFrozen(projectData) ||
    !Object.isFrozen(section) ||
    !Object.isFrozen(section.lines) ||
    (projectData.resources && !Object.isFrozen(projectData.resources))
  ) {
    return null;
  }

  let sections = projects.get(projectData);
  if (!sections) {
    sections = new Map();
    projects.set(projectData, sections);
  }
  let cache = sections.get(section);
  if (!cache) {
    cache = { checkpoints: new Map(), recent: new Map() };
  }
  remember(sections, section, cache, MAX_CACHED_SECTIONS);
  return cache;
};

export const selectSectionPresentation = (
  projectData,
  section,
  lineId,
  offset = 0,
) => {
  const lines = section?.lines ?? [];
  const cache =
    section && Array.isArray(lines)
      ? getSectionCache(projectData, section)
      : null;
  const lineIndex = findSectionLineIndex(lines, lineId);
  const targetIndex = lineIndex + offset;
  if (targetIndex < 0) return offset < 0 ? null : EMPTY_PRESENTATION;

  if (!cache) {
    return constructPresentationState(
      lines.slice(0, targetIndex + 1).map((line) => line.actions || {}),
      { resources: projectData.resources },
    );
  }

  let startIndex = -1;
  let presentation = EMPTY_PRESENTATION;
  for (const snapshots of [cache.checkpoints, cache.recent]) {
    for (const [index, snapshot] of snapshots) {
      if (index <= targetIndex && index > startIndex) {
        startIndex = index;
        presentation = snapshot;
      }
    }
  }

  for (let index = startIndex + 1; index <= targetIndex; index += 1) {
    // Resume the reducer's state, not its action input: treating a prior
    // presentation as a fresh action would replay NVL/dialogue/audio semantics.
    presentation = constructPresentationState([lines[index].actions || {}], {
      resources: projectData.resources,
      initialState: presentation,
    });
    if ((index + 1) % CHECKPOINT_INTERVAL === 0) {
      remember(cache.checkpoints, index, presentation, MAX_CHECKPOINTS);
    }
    if (index >= targetIndex - 1) {
      remember(cache.recent, index, presentation, MAX_RECENT_STATES);
    }
  }
  remember(cache.recent, targetIndex, presentation, MAX_RECENT_STATES);
  return presentation;
};
