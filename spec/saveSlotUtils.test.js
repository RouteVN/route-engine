import { describe, expect, it } from "vitest";
import {
  createSaveThumbnailAssetId,
  resolveSaveSlotId,
} from "../vt/static/saveSlotUtils.js";

describe("save slot VT helpers", () => {
  it("keeps direct numeric slot ids unchanged", () => {
    expect(resolveSaveSlotId(3)).toBe(3);
  });

  it("resolves _event slot ids before thumbnail asset naming", () => {
    expect(
      createSaveThumbnailAssetId("_event.slotId", 1701234567890, {
        _event: {
          slotId: 4,
        },
      }),
    ).toBe("saveThumbnailImage:4:1701234567890");
  });

  it("falls back to the raw slot id binding when event data is missing", () => {
    expect(createSaveThumbnailAssetId("_event.slotId", 1701234567890)).toBe(
      "saveThumbnailImage:_event.slotId:1701234567890",
    );
  });
});
