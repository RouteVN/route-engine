// Audio output tests: play each avt/specs/*.yaml story through Route Engine
// and Route Graphics in headless Chromium on an offline audio clock, then
// check the volume, pan, and pitch a listener would hear against values
// derived from the authored project data.
//
//   node scripts/audioOutputTest.mjs [spec-name ...]
//
// RE_AVT_ROUTE_GRAPHICS overrides the Route Graphics bundle, for example to
// check the version an application ships with. RE_AVT_ENGINE_ROOT points at
// another Route Engine checkout, for example to show a spec failing on an
// earlier version.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import yaml from "js-yaml";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AVT_DIRECTORY = path.join(ROOT, "avt");
const SPEC_DIRECTORY = path.join(AVT_DIRECTORY, "specs");
const ENGINE_ROOT = path.resolve(process.env.RE_AVT_ENGINE_ROOT ?? ROOT);
const ROUTE_GRAPHICS_PATH = path.resolve(
  process.env.RE_AVT_ROUTE_GRAPHICS ??
    path.join(ROOT, "node_modules/route-graphics/dist/RouteGraphics.js"),
);
const ORIGIN = "http://route-engine.avt";
const TIMEOUT_MS = 60_000;
const DEFAULT_TOLERANCE = { volume: 0.75, pan: 0.02, rate: 0.005 };

const loadSpecs = async (names) => {
  const filenames = (await readdir(SPEC_DIRECTORY))
    .filter((filename) => filename.endsWith(".yaml"))
    .sort();
  const selected = names.length
    ? filenames.filter((filename) => names.includes(filename.slice(0, -5)))
    : filenames;
  if (selected.length === 0) {
    throw new Error(`No audio output specs match: ${names.join(", ")}`);
  }
  return await Promise.all(
    selected.map(async (filename) => {
      const spec = yaml.load(
        await readFile(path.join(SPEC_DIRECTORY, filename), "utf8"),
      );
      return {
        name: filename.slice(0, -5),
        ...spec,
        runtime: { musicVolume: 100, soundVolume: 100, ...spec.runtime },
      };
    }),
  );
};

const buildEngineBundle = async () => {
  const result = await esbuild.build({
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    entryPoints: [path.join(ENGINE_ROOT, "src/index.js")],
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
};

const describeExpectation = (expectation) =>
  expectation.maxVolume !== undefined
    ? `${expectation.source} ${expectation.from}-${expectation.to}ms`
    : `${expectation.source} at ${expectation.at}ms`;

const check = (expectation, measured) => {
  const tolerance = { ...DEFAULT_TOLERANCE, ...expectation.tolerance };
  const failures = [];
  const compare = (property, actual, expected, limit = "equal") => {
    if (expected === undefined) return;
    const allowed = tolerance[property === "maxVolume" ? "volume" : property];
    const passes =
      actual !== undefined &&
      (limit === "max"
        ? actual <= expected + allowed
        : Math.abs(actual - expected) <= allowed);
    if (!passes) {
      failures.push(
        `${property} expected ${limit === "max" ? "at most " : ""}${expected}` +
          ` ±${allowed}, heard ${actual === undefined ? "nothing" : +actual.toFixed(4)}`,
      );
    }
  };

  if (expectation.maxVolume !== undefined) {
    compare(
      "maxVolume",
      measured.maxVolume.volume,
      expectation.maxVolume,
      "max",
    );
    if (failures.length) {
      failures[0] += ` at ${measured.maxVolume.atMs}ms`;
    }
    return failures;
  }
  compare("volume", measured.volume, expectation.volume);
  // Pan is undefined for a silent tone, which only matters if it is checked.
  compare("pan", measured.pan, expectation.pan);
  compare("rate", measured.rate, expectation.rate);
  return failures;
};

const runSpec = async (browser, files, spec) => {
  const page = await browser.newPage();
  try {
    await page.route(`${ORIGIN}/**`, (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const body = files[pathname];
      if (body === undefined) return route.fulfill({ status: 404 });
      return route.fulfill({
        status: 200,
        contentType: pathname.endsWith(".html")
          ? "text/html"
          : "text/javascript",
        body,
      });
    });
    await page.addInitScript((value) => {
      globalThis.__RE_AVT_SPEC__ = value;
    }, spec);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => globalThis.__RE_AVT_RESULT__, null, {
      timeout: TIMEOUT_MS,
    });
    const result = await page.evaluate(() => globalThis.__RE_AVT_RESULT__);
    if (!result.ok) return [`Run failed: ${result.error}`];

    const failures = [...pageErrors, ...result.errors];
    for (const { at, lineId } of spec.steps ?? []) {
      if (lineId === undefined) continue;
      const reached = result.lines.find((line) => line.atMs === at)?.lineId;
      if (reached !== lineId) {
        failures.push(
          `Step at ${at}ms expected line "${lineId}", reached "${reached}"`,
        );
      }
    }
    spec.expect.forEach((expectation, index) => {
      for (const failure of check(expectation, result.measurements[index])) {
        failures.push(`${describeExpectation(expectation)}: ${failure}`);
      }
    });
    return failures;
  } finally {
    await page.close();
  }
};

const main = async () => {
  const specs = await loadSpecs(process.argv.slice(2));
  const files = {
    "/index.html":
      '<!doctype html><meta charset="utf-8"><script type="module" src="/runner.js"></script>',
    "/runner.js": await readFile(path.join(AVT_DIRECTORY, "runner.js"), "utf8"),
    "/analyzeAudio.js": await readFile(
      path.join(AVT_DIRECTORY, "analyzeAudio.js"),
      "utf8",
    ),
    "/RouteEngine.js": await buildEngineBundle(),
    "/RouteGraphics.js": await readFile(ROUTE_GRAPHICS_PATH, "utf8"),
  };
  const routeGraphicsVersion = files["/RouteGraphics.js"].match(
    /route-graphics@([\d.]+)/,
  )?.[1];
  console.log(
    `Route Graphics bundle: ${path.relative(ROOT, ROUTE_GRAPHICS_PATH)}` +
      (routeGraphicsVersion ? ` (${routeGraphicsVersion})` : ""),
  );

  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const spec of specs) {
      const failures = await runSpec(browser, files, spec);
      if (failures.length === 0) {
        console.log(`PASS ${spec.name}`);
        continue;
      }
      failed += 1;
      console.log(`FAIL ${spec.name}`);
      for (const failure of failures) console.log(`  - ${failure}`);
    }
  } finally {
    await browser.close();
  }
  console.log(
    `${specs.length - failed}/${specs.length} audio output specs passed`,
  );
  if (failed > 0) process.exitCode = 1;
};

await main();
