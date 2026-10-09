// Fixtures may opt in to a minimal asset catalog. Existing scenarios keep the
// complete catalog so dynamic, localized, and shader asset references still work.
export const selectVtAssets = (catalog, projectData) => {
  const selection = projectData.resources?.variables?.vtAssetIds?.default;
  if (typeof selection !== "string") return catalog;
  const ids = selection
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return Object.fromEntries(
    ids.map((id) => {
      if (!Object.hasOwn(catalog, id)) {
        throw new Error(`Unknown VT asset: ${id}`);
      }
      return [id, catalog[id]];
    }),
  );
};
