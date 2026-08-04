import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]sx?|ya?ml)$/;
const YAML_TEST_FILE_PATTERN = /\.ya?ml$/;
const SKIPPED_DIRECTORIES = new Set([
  ".agents",
  ".codex",
  ".git",
  ".rettangoli",
  "coverage",
  "dist",
  "node_modules",
]);
const FORBIDDEN_JAVASCRIPT_MARKERS = [
  {
    label: "focused, skipped, todo, or expected-failure test",
    pattern:
      /\.\s*(?:only|skip|fails|todo|skipIf)\s*(?:\.\s*each\s*)?(?:\(|`)/g,
  },
  {
    label: "option-based focused, skipped, or expected-failure test",
    pattern:
      /\b(?:describe|suite|test|it)\s*\(\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)\s*,\s*\{[^{}]*\b(?:only|skip|fails)\s*:\s*true\b/g,
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
const FORBIDDEN_YAML_MARKERS = [
  {
    label: "skipped Puty YAML document",
    pattern: /^skip\s*:\s*true\s*(?:#.*)?$/gm,
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

const detectMarkers = (source, markers) =>
  markers.flatMap((marker) => {
    marker.pattern.lastIndex = 0;
    return [...source.matchAll(marker.pattern)].map((match) => ({
      ...marker,
      match,
    }));
  });

const javascriptDetectorProbes = [
  "it" + ".only('case', fn)",
  "test" + ".skip('case', fn)",
  "it" + ".fails('case', fn)",
  "test" + ".skip.each(cases)('case', fn)",
  "describe" + ".only.each(cases)('case', fn)",
  "it" + ".fails.each`case`(fn)",
  "test" + ".todo('case')",
  "it" + ".skipIf(condition)('case', fn)",
  "test" + ".runIf(false)('case', fn)",
  "test('case', { " + "skip: true }, fn)",
  "describe('case', { " + "only: true }, fn)",
  "it('case', { " + "fails: true }, fn)",
  "itKnown" + "Defect({})",
];
for (const probe of javascriptDetectorProbes) {
  if (detectMarkers(probe, FORBIDDEN_JAVASCRIPT_MARKERS).length !== 1) {
    throw new Error(`Test marker detector does not recognize: ${probe}`);
  }
}

const yamlDetectorProbes = ["skip" + ": true", "skip" + ": true # reason"];
for (const probe of yamlDetectorProbes) {
  if (detectMarkers(probe, FORBIDDEN_YAML_MARKERS).length !== 1) {
    throw new Error(`Puty marker detector does not recognize: ${probe}`);
  }
}

const testFiles = await collectTestFiles(".");
const violations = [];
for (const testFile of testFiles) {
  const source = await readFile(testFile, "utf8");
  const markers = YAML_TEST_FILE_PATTERN.test(testFile)
    ? FORBIDDEN_YAML_MARKERS
    : FORBIDDEN_JAVASCRIPT_MARKERS;
  for (const { label, match } of detectMarkers(source, markers)) {
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
