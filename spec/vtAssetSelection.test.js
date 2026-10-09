import { describe, expect, it } from "vitest";
import { selectVtAssets } from "../vt/static/selectVtAssets.js";

describe("explicit VT asset selection", () => {
  const catalog = {
    video: { type: "video/webm" },
    atlas: { type: "image/png" },
  };
  it("preserves the complete catalog for existing fixtures", () => {
    expect(selectVtAssets(catalog, {})).toBe(catalog);
  });
  it("loads only the explicitly selected fixture assets", () => {
    expect(
      selectVtAssets(catalog, {
        resources: { variables: { vtAssetIds: { default: " atlas " } } },
      }),
    ).toEqual({ atlas: catalog.atlas });
  });
  it("fails clearly for a misspelled fixture asset", () => {
    expect(() =>
      selectVtAssets(catalog, {
        resources: { variables: { vtAssetIds: { default: "missing" } } },
      }),
    ).toThrow("Unknown VT asset: missing");
  });
});
