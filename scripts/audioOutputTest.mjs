// Audio output tests: play each avt/specs/*.yaml story through Route Engine
// and Route Graphics in headless Chromium on an offline audio clock. Each
// spec renders twice and must produce identical audio. The volume, pan, and
// pitch a listener would hear must match values derived from the authored
// project data, and the rendered WAV and its transcript must match the
// references in avt/references.
//
//   node scripts/audioOutputTest.mjs [test|generate|report] [spec-name ...]
//
// test (the default) checks every spec. generate rewrites the references of
// specs whose expectations pass. report also writes avt/output/report.html
// with each spec's audio, waveform, spectrogram, and measurements; a failing
// run writes it too.
//
// RE_AVT_ROUTE_GRAPHICS overrides the Route Graphics bundle, for example to
// check the version an application ships with. RE_AVT_ENGINE_ROOT points at
// another Route Engine checkout, for example to show a spec failing on an
// earlier version. Either one skips the reference comparison, because the
// references belong to this checkout and its own Route Graphics.
// RE_AVT_REPEATS sets how many times each spec renders (at least 2).

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import yaml from "js-yaml";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AVT_DIRECTORY = path.join(ROOT, "avt");
const SPEC_DIRECTORY = path.join(AVT_DIRECTORY, "specs");
const REFERENCE_DIRECTORY = path.join(AVT_DIRECTORY, "references");
const OUTPUT_DIRECTORY = path.join(AVT_DIRECTORY, "output");
const ENGINE_ROOT = path.resolve(process.env.RE_AVT_ENGINE_ROOT ?? ROOT);
const ROUTE_GRAPHICS_PATH = path.resolve(
  process.env.RE_AVT_ROUTE_GRAPHICS ??
    path.join(ROOT, "node_modules/route-graphics/dist/RouteGraphics.js"),
);
const ORIGIN = "http://route-engine.avt";
const TIMEOUT_MS = 60_000;
const DEFAULT_TOLERANCE = { volume: 0.75, pan: 0.02, rate: 0.005 };
const MODES = ["test", "generate", "report"];

const args = process.argv.slice(2);
const mode = MODES.includes(args[0]) ? args.shift() : "test";
const specNames = args;
const overridden =
  process.env.RE_AVT_ROUTE_GRAPHICS !== undefined ||
  process.env.RE_AVT_ENGINE_ROOT !== undefined;
const repeatCount = Number(process.env.RE_AVT_REPEATS ?? 2);
if (!Number.isInteger(repeatCount) || repeatCount < 2) {
  throw new Error("RE_AVT_REPEATS must be an integer of at least 2.");
}
if (mode === "generate" && overridden) {
  throw new Error(
    "Generate references from this checkout and its own Route Graphics, " +
      "without RE_AVT_ROUTE_GRAPHICS or RE_AVT_ENGINE_ROOT.",
  );
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const toJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const loadSpecs = async () => {
  const filenames = (await readdir(SPEC_DIRECTORY))
    .filter((filename) => filename.endsWith(".yaml"))
    .sort();
  const selected = specNames.length
    ? filenames.filter((filename) => specNames.includes(filename.slice(0, -5)))
    : filenames;
  if (selected.length === 0) {
    throw new Error(`No audio output specs match: ${specNames.join(", ")}`);
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

// Reference files whose spec no longer exists. Only a run over every spec
// can tell.
const findStaleReferences = async (specs) => {
  if (specNames.length > 0) return [];
  const names = new Set(specs.map(({ name }) => name));
  const filenames = await readdir(REFERENCE_DIRECTORY).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return filenames
    .filter((filename) => [".json", ".wav"].includes(path.extname(filename)))
    .filter(
      (filename) => !names.has(path.basename(filename, path.extname(filename))),
    );
};

const readReference = async (name) => {
  try {
    return {
      wav: await readFile(path.join(REFERENCE_DIRECTORY, `${name}.wav`)),
      json: await readFile(
        path.join(REFERENCE_DIRECTORY, `${name}.json`),
        "utf8",
      ),
    };
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
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
    const allowed =
      tolerance[
        ["maxVolume", "left", "right"].includes(property) ? "volume" : property
      ];
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
  compare("left", measured.left, expectation.left);
  compare("right", measured.right, expectation.right);
  // Pan is undefined for a silent tone, which only matters if it is checked.
  compare("pan", measured.pan, expectation.pan);
  compare("rate", measured.rate, expectation.rate);
  return failures;
};

const checkExpectations = (spec, render) => {
  const failures = [...render.errors];
  for (const { at, lineId } of spec.steps ?? []) {
    if (lineId === undefined) continue;
    const reached = render.lines.find((line) => line.atMs === at)?.lineId;
    if (reached !== lineId) {
      failures.push(
        `Step at ${at}ms expected line "${lineId}", reached "${reached}"`,
      );
    }
  }
  spec.expect.forEach((expectation, index) => {
    for (const failure of check(expectation, render.measurements[index])) {
      failures.push(`${describeExpectation(expectation)}: ${failure}`);
    }
  });
  return failures;
};

const round = (value) => {
  if (typeof value === "number") return Math.round(value * 10_000) / 10_000;
  if (value === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, round(item)]),
  );
};

// The reference JSON. Every value comes from the WAV bytes or the engine's
// deterministic state, so equal audio gives equal JSON.
const createSnapshot = (spec, render) => ({
  version: 1,
  wavSha256: sha256(render.wav),
  metadata: render.metadata,
  lines: render.lines,
  measurements: spec.expect.map((expectation, index) => ({
    check: describeExpectation(expectation),
    ...round(render.measurements[index]),
  })),
  events: render.events,
});

const describeJsonDifferences = (expected, actual) => {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const differences = [];
  const lineCount = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < lineCount && differences.length < 8; index++) {
    if (expectedLines[index] !== actualLines[index]) {
      differences.push(
        `  line ${index + 1}: reference ${expectedLines[index]?.trim() ?? "(none)"}` +
          `, rendered ${actualLines[index]?.trim() ?? "(none)"}`,
      );
    }
  }
  return differences.join("\n");
};

const renderSpec = async (browser, files, spec) => {
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
    if (!result.ok) throw new Error(`Run failed: ${result.error}`);
    const { wavBase64, ...render } = result;
    return {
      ...render,
      errors: [...pageErrors, ...render.errors],
      wav: Buffer.from(wavBase64, "base64"),
    };
  } finally {
    await page.close();
  }
};

const writeOutputFiles = async (basename, { wav, json }) => {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(path.join(OUTPUT_DIRECTORY, `${basename}.wav`), wav);
  await writeFile(path.join(OUTPUT_DIRECTORY, `${basename}.json`), json);
};

const createReportHtml = (results) => {
  const encodedAudio = {};
  const registerAudio = (key, wav) => {
    if (!wav) return undefined;
    encodedAudio[key] = wav.toString("base64");
    return key;
  };
  const audioPanel = (title, key) =>
    key
      ? `<div><h3>${title}</h3><audio controls data-audio="${escapeHtml(key)}"></audio><canvas class="waveform" data-audio="${escapeHtml(key)}"></canvas><canvas class="spectrogram" data-audio="${escapeHtml(key)}"></canvas></div>`
      : `<div><h3>${title}</h3><p>No audio.</p></div>`;
  const formatExpected = (expectation) =>
    ["volume", "pan", "left", "right", "rate", "maxVolume"]
      .filter((property) => expectation[property] !== undefined)
      .map(
        (property) =>
          `${property === "maxVolume" ? "volume ≤" : property} ${expectation[property]}`,
      )
      .join(", ");
  const formatHeard = (measured) =>
    measured?.maxVolume
      ? `max volume ${+measured.maxVolume.volume.toFixed(2)} at ${measured.maxVolume.atMs}ms`
      : ["volume", "pan", "left", "right", "rate"]
          .filter((property) => measured?.[property] !== undefined)
          .map((property) => `${property} ${+measured[property].toFixed(3)}`)
          .join(", ");

  const sections = results
    .map((result) => {
      const actualKey = registerAudio(
        `${result.name}:actual`,
        result.actualWav,
      );
      const referenceKey = result.ok
        ? undefined
        : registerAudio(`${result.name}:reference`, result.referenceWav);
      const rows = result.spec.expect
        .map(
          (expectation, index) =>
            `<tr><td>${escapeHtml(describeExpectation(expectation))}</td><td>${escapeHtml(formatExpected(expectation))}</td><td>${escapeHtml(formatHeard(result.measurements?.[index]))}</td></tr>`,
        )
        .join("");
      return `
        <section class="result ${result.ok ? "pass" : "fail"}">
          <h2>${result.ok ? "PASS" : "FAIL"} · ${escapeHtml(result.name)}</h2>
          <p>${escapeHtml(result.spec.title ?? "")}</p>
          ${result.failures.length ? `<pre>${escapeHtml(result.failures.join("\n"))}</pre>` : ""}
          <table><tr><th>Check</th><th>Expected</th><th>Heard</th></tr>${rows}</table>
          <div class="audios">
            ${audioPanel(result.ok ? "Rendered (matches the reference)" : "Rendered", actualKey)}
            ${referenceKey ? audioPanel("Reference", referenceKey) : ""}
          </div>
        </section>`;
    })
    .join("\n");

  return `<!doctype html>
<meta charset="utf-8">
<title>Route Engine Audio Output Report</title>
<style>
  :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #090909; color: #eee; }
  body { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .result { border: 1px solid #444; border-left-width: 6px; padding: 16px; margin: 16px 0; background: #111; }
  .pass { border-left-color: #4caf50; } .fail { border-left-color: #f44336; }
  .audios { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; }
  audio, canvas { display: block; width: 100%; margin: 8px 0; }
  canvas { height: 140px; background: #000; }
  table { border-collapse: collapse; margin: 8px 0; font-size: 14px; }
  td, th { border: 1px solid #333; padding: 4px 8px; text-align: left; }
  pre { overflow: auto; white-space: pre-wrap; color: #ffb4ab; }
</style>
<h1>Route Engine audio output report</h1>
<p>${results.filter((result) => result.ok).length}/${results.length} specs passed.</p>
${sections}
<script>
const encodedAudio = ${JSON.stringify(encodedAudio).replaceAll("<", "\\u003c")};
const audioUrls = new Map(Object.entries(encodedAudio).map(([key, base64]) => {
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return [key, URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))];
}));
const cache = new Map();
const loadAudio = async (key) => {
  if (!cache.has(key)) cache.set(key, (async () => {
    const context = new AudioContext();
    const data = await (await fetch(audioUrls.get(key))).arrayBuffer();
    const buffer = await context.decodeAudioData(data);
    await context.close();
    return buffer;
  })());
  return cache.get(key);
};
const drawWaveform = async (canvas) => {
  const buffer = await loadAudio(canvas.dataset.audio);
  const samples = buffer.getChannelData(0); const width = 900; const height = 140;
  canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#fff'; ctx.beginPath();
  const stride = Math.max(1, Math.floor(samples.length / width));
  for (let x = 0; x < width; x++) { let peak = 0; for (let i = 0; i < stride; i++) peak = Math.max(peak, Math.abs(samples[x * stride + i] || 0)); const y = peak * height / 2; ctx.moveTo(x, height / 2 - y); ctx.lineTo(x, height / 2 + y); }
  ctx.stroke();
};
const drawSpectrogram = async (canvas) => {
  const buffer = await loadAudio(canvas.dataset.audio); const samples = buffer.getChannelData(0);
  const width = 240; const height = 128; const windowSize = 256; canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); const image = ctx.createImageData(width, height);
  for (let x = 0; x < width; x++) { const start = Math.floor(x * Math.max(0, samples.length - windowSize) / Math.max(1, width - 1)); for (let bin = 0; bin < height; bin++) { let re = 0; let im = 0; for (let n = 0; n < windowSize; n++) { const value = (samples[start + n] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / (windowSize - 1))); const phase = 2 * Math.PI * bin * n / windowSize; re += value * Math.cos(phase); im -= value * Math.sin(phase); } const magnitude = Math.min(255, Math.max(0, 55 * Math.log10(1 + Math.hypot(re, im)))); const y = height - 1 - bin; const offset = (y * width + x) * 4; image.data[offset] = magnitude; image.data[offset + 1] = magnitude; image.data[offset + 2] = magnitude; image.data[offset + 3] = 255; } }
  ctx.putImageData(image, 0, 0);
};
const renderAudioVisualizations = async () => {
  document.querySelectorAll('audio[data-audio]').forEach((audio) => { audio.src = audioUrls.get(audio.dataset.audio); });
  await Promise.all([
    ...Array.from(document.querySelectorAll('.waveform'), drawWaveform),
    ...Array.from(document.querySelectorAll('.spectrogram'), drawSpectrogram),
  ]);
  document.documentElement.dataset.audioReportState = 'ready';
};
renderAudioVisualizations().catch((error) => {
  document.documentElement.dataset.audioReportState = 'failed';
  document.documentElement.dataset.audioReportError = error.stack || error.message;
  console.error(error);
});
</script>`;
};

// Opens the finished report and checks that every player and canvas loaded.
const validateReport = async (browser, html) => {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction(
      () => document.documentElement.dataset.audioReportState !== undefined,
    );
    const validation = await page.evaluate(() => ({
      state: document.documentElement.dataset.audioReportState,
      error: document.documentElement.dataset.audioReportError,
      audioCount: document.querySelectorAll("audio[src]").length,
      declaredAudioCount: document.querySelectorAll("audio[data-audio]").length,
      drawnCanvasCount: [...document.querySelectorAll("canvas")].filter(
        (canvas) => canvas.width > 0 && canvas.height > 0,
      ).length,
      canvasCount: document.querySelectorAll("canvas").length,
    }));
    if (
      validation.state !== "ready" ||
      validation.audioCount !== validation.declaredAudioCount ||
      validation.drawnCanvasCount !== validation.canvasCount
    ) {
      throw new Error(
        `The audio output report did not load: ${JSON.stringify(validation)}`,
      );
    }
  } finally {
    await page.close();
  }
};

const runSpec = async (browser, files, spec) => {
  const result = { name: spec.name, spec, failures: [] };
  const runs = [];
  try {
    for (let run = 0; run < repeatCount; run++) {
      runs.push(await renderSpec(browser, files, spec));
    }
  } catch (error) {
    result.failures.push(error.message);
    result.ok = false;
    return result;
  }

  const [actual] = runs;
  const json = toJson(createSnapshot(spec, actual));
  result.actualWav = actual.wav;
  result.measurements = actual.measurements;
  result.sha = sha256(actual.wav);
  const deterministic = runs.every(
    (run) =>
      run.wav.equals(actual.wav) && toJson(createSnapshot(spec, run)) === json,
  );
  if (!deterministic) {
    result.failures.push(
      `${repeatCount} renders differ: ${runs.map((run) => sha256(run.wav)).join(", ")}`,
    );
    await Promise.all(
      runs.map((run, index) =>
        writeOutputFiles(`${spec.name}.run-${index + 1}`, {
          wav: run.wav,
          json: toJson(createSnapshot(spec, run)),
        }),
      ),
    );
  }
  result.failures.push(...checkExpectations(spec, actual));

  if (mode === "generate") {
    // A reference records audio that meets its expectations, never a mix
    // that only happens to be what the engine plays.
    if (result.failures.length === 0) {
      await writeFile(
        path.join(REFERENCE_DIRECTORY, `${spec.name}.wav`),
        actual.wav,
      );
      await writeFile(
        path.join(REFERENCE_DIRECTORY, `${spec.name}.json`),
        json,
      );
      result.generated = true;
    }
  } else if (!overridden) {
    const reference = await readReference(spec.name);
    if (!reference) {
      result.failures.push(
        `No reference. Run: bun run test:audio:generate ${spec.name}`,
      );
    } else {
      result.referenceWav = reference.wav;
      if (!reference.wav.equals(actual.wav)) {
        result.failures.push(
          `WAV differs from the reference: reference ${sha256(reference.wav)}, rendered ${result.sha}`,
        );
      }
      if (reference.json !== json) {
        result.failures.push(
          `Transcript differs from the reference:\n${describeJsonDifferences(reference.json, json)}`,
        );
      }
      if (result.failures.length > 0) {
        await writeOutputFiles(`${spec.name}.reference`, reference);
      }
    }
  }

  result.ok = result.failures.length === 0;
  if (!result.ok) {
    await writeOutputFiles(`${spec.name}.actual`, { wav: actual.wav, json });
  }
  return result;
};

const main = async () => {
  const specs = await loadSpecs();
  const staleReferences = await findStaleReferences(specs);
  if (mode !== "generate" && staleReferences.length > 0) {
    throw new Error(
      `References without a spec: ${staleReferences.join(", ")}. ` +
        "Delete them, or run: bun run test:audio:generate",
    );
  }
  await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  if (mode === "generate") {
    await mkdir(REFERENCE_DIRECTORY, { recursive: true });
  }

  const files = {
    "/index.html":
      '<!doctype html><meta charset="utf-8"><script type="module" src="/runner.js"></script>',
    "/runner.js": await readFile(path.join(AVT_DIRECTORY, "runner.js"), "utf8"),
    "/analyzeAudio.js": await readFile(
      path.join(AVT_DIRECTORY, "analyzeAudio.js"),
      "utf8",
    ),
    "/wav.js": await readFile(path.join(AVT_DIRECTORY, "wav.js"), "utf8"),
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
  if (overridden) {
    console.log(
      "References are not compared: RE_AVT_ROUTE_GRAPHICS or RE_AVT_ENGINE_ROOT is set.",
    );
  }

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const spec of specs) {
      const result = await runSpec(browser, files, spec);
      results.push(result);
      if (result.ok) {
        console.log(
          `${result.generated ? "GENERATED" : "PASS"} ${spec.name} ${result.sha}`,
        );
        continue;
      }
      console.log(`FAIL ${spec.name}`);
      for (const failure of result.failures) console.log(`  - ${failure}`);
    }

    if (mode === "report" || results.some((result) => !result.ok)) {
      const html = createReportHtml(results);
      await mkdir(OUTPUT_DIRECTORY, { recursive: true });
      const reportPath = path.join(OUTPUT_DIRECTORY, "report.html");
      await writeFile(reportPath, html);
      await validateReport(browser, html);
      console.log(`Report: ${path.relative(ROOT, reportPath)}`);
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((result) => !result.ok).length;
  if (mode === "generate" && failed === 0) {
    await Promise.all(
      staleReferences.map((filename) =>
        rm(path.join(REFERENCE_DIRECTORY, filename), { force: true }),
      ),
    );
  }
  console.log(
    `${results.length - failed}/${results.length} audio output specs passed`,
  );
  if (failed > 0) process.exitCode = 1;
};

await main();
