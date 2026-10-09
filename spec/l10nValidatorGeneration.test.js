import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

  it("loads as an ES module in plain Node", () => {
    const generatedPath = path.resolve(
      import.meta.dirname,
      "..",
      "src",
      "generated",
      "l10nPayloadValidators.js",
    );

    expect(() =>
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `await import(${JSON.stringify(pathToFileURL(generatedPath).href)})`,
        ],
        { stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
