import { resolveLayoutReferences as resolveLayoutReferencesInternal } from "./stores/constructRenderState.js";

export const resolveLayoutReferences = (value, options = {}) => {
  const { resources = {} } = options;
  return resolveLayoutReferencesInternal(value, resources);
};

export default resolveLayoutReferences;
