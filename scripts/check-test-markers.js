import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SKIPPED_DIRECTORIES = new Set([
  ".agents",
  ".codex",
  ".git",
  ".rettangoli",
  "coverage",
  "dist",
  "node_modules",
]);
const FORBIDDEN_MARKERS = [
  {
    label: "focused, skipped, todo, or expected-failure test",
    pattern: /\.\s*(?:only|skip|fails|todo|skipIf)\s*\(/g,
  },
  {
    label: "statically disabled conditional test",
    pattern: /\.\s*runIf\s*\(\s*false\s*\)/g,
  },
  {
    label: "known-defect test",
    pattern: /\bitKnownDefect\s*\(/g,
  },
];

const collectTestFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) {
          return [];
        }
        return collectTestFiles(entryPath);
      }
      return TEST_FILE_PATTERN.test(entry.name) ? [entryPath] : [];
    }),
  );
  return files.flat();
};

const getLineNumber = (source, index) =>
  source.slice(0, index).split("\n").length;

const detectMarkers = (source) =>
  FORBIDDEN_MARKERS.flatMap((marker) => {
    marker.pattern.lastIndex = 0;
    return [...source.matchAll(marker.pattern)].map((match) => ({
      ...marker,
      match,
    }));
  });

const detectorProbes = [
  "it" + ".only('case', fn)",
  "test" + ".skip('case', fn)",
  "it" + ".fails('case', fn)",
  "test" + ".todo('case')",
  "it" + ".skipIf(condition)('case', fn)",
  "test" + ".runIf(false)('case', fn)",
  "itKnown" + "Defect({})",
];
for (const probe of detectorProbes) {
  if (detectMarkers(probe).length !== 1) {
    throw new Error(`Test marker detector does not recognize: ${probe}`);
  }
}

const testFiles = await collectTestFiles(".");
const violations = [];
for (const testFile of testFiles) {
  const source = await readFile(testFile, "utf8");
  for (const { label, match } of detectMarkers(source)) {
    violations.push(
      `${testFile}:${getLineNumber(source, match.index)}: ${label} (${match[0].trim()})`,
    );
  }
}

if (violations.length > 0) {
  console.error(
    [
      "Test marker check failed. This behavior-preserving initiative requires fully active tests:",
      ...violations.map((violation) => `- ${violation}`),
    ].join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(`Test marker check passed (${testFiles.length} files scanned).`);
}
