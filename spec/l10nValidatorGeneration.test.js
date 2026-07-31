import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generateL10nPayloadValidators } from "../scripts/generate-l10n-payload-validators.js";

describe("generated L10n payload validators", () => {
  it("stays synchronized with the authoritative YAML schemas", async () => {
    const generatedPath = path.resolve(
      import.meta.dirname,
      "..",
      "src",
      "generated",
      "l10nPayloadValidators.js",
    );

    expect(readFileSync(generatedPath, "utf8")).toBe(
      await generateL10nPayloadValidators(),
    );
  });
});
