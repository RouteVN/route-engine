import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

// Route Graphics always uses the default Opus decoder without speech-quality
// enhancement. Keep its source-build exclusion so the unused 4 MiB ML model
// is not embedded in the VT bundle.
const excludeUnusedOpusMlPlugin = {
  name: "exclude-unused-opus-ml",
  setup(build) {
    build.onResolve({ filter: /^@wasm-audio-decoders\/opus-ml$/ }, () => ({
      namespace: "unused-opus-ml",
      path: "unused-opus-ml",
    }));
    build.onLoad({ filter: /.*/, namespace: "unused-opus-ml" }, () => ({
      contents: [
        "export const OpusMLDecoder = undefined;",
        "export const OpusMLDecoderWebWorker = undefined;",
      ].join("\n"),
      loader: "js",
    }));
  },
};

const buildVtRouteGraphicsBundle = async () => {
  const sourceEntry = path.resolve(
    "node_modules",
    "route-graphics",
    "src",
    "index.js",
  );
  const distBundle = path.resolve(
    "node_modules",
    "route-graphics",
    "dist",
    "RouteGraphics.js",
  );
  const target = path.resolve("vt", "static", "RouteGraphics.js");

  if (fs.existsSync(sourceEntry)) {
    await esbuild.build({
      bundle: true,
      minify: true,
      sourcemap: false,
      format: "esm",
      platform: "browser",
      outfile: target,
      entryPoints: [sourceEntry],
      plugins: [excludeUnusedOpusMlPlugin],
    });
    return;
  }

  if (fs.existsSync(distBundle)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(distBundle, target);
    return;
  }

  throw new Error(
    "Missing route-graphics source and dist bundles. Run `bun install` before building VT assets.",
  );
};

const build = async () => {
  await esbuild.build({
    bundle: true,
    minify: true,
    sourcemap: false,
    format: "esm",
    outfile: `./dist/RouteEngine.js`,
    entryPoints: [`src/index.js`],
  });

  await esbuild.build({
    bundle: true,
    minify: true,
    sourcemap: true,
    format: "esm",
    outfile: `./vt/static/RouteEngine.js`,
    entryPoints: [`src/index.js`],
  });

  await esbuild.build({
    bundle: true,
    minify: true,
    sourcemap: false,
    format: "esm",
    platform: "browser",
    outfile: `./vt/static/VtDependencies.js`,
    entryPoints: [`vt/vtDependencies.js`],
  });

  await buildVtRouteGraphicsBundle();
  console.log("Build completed");
};

try {
  await build();
} catch (error) {
  console.error("Build failed", error);
  process.exitCode = 1;
}
