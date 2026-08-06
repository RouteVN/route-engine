import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

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

const buildOrCopyVtRouteGraphicsBundle = async () => {
  const distSource = path.resolve(
    "node_modules",
    "route-graphics",
    "dist",
    "RouteGraphics.js",
  );
  const target = path.resolve("vt", "static", "RouteGraphics.js");

  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (fs.existsSync(distSource)) {
    fs.copyFileSync(distSource, target);
    return;
  }

  const sourceEntry = path.resolve(
    "node_modules",
    "route-graphics",
    "src",
    "index.js",
  );
  if (!fs.existsSync(sourceEntry)) {
    throw new Error(
      "Missing route-graphics dist bundle and source entry. Run `bun install` before building VT assets.",
    );
  }

  await esbuild.build({
    entryPoints: [sourceEntry],
    bundle: true,
    minify: true,
    sourcemap: false,
    outfile: target,
    format: "esm",
    plugins: [excludeUnusedOpusMlPlugin],
  });
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

  await buildOrCopyVtRouteGraphicsBundle();
  console.log("Build completed");
};

try {
  await build();
} catch (error) {
  console.error("Build failed", error);
  process.exitCode = 1;
}
