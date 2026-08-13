import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

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
