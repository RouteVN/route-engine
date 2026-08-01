import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const copyVtRouteGraphicsBundle = () => {
  const source = path.resolve(
    "node_modules",
    "route-graphics",
    "dist",
    "RouteGraphics.js",
  );
  const target = path.resolve("vt", "static", "RouteGraphics.js");

  if (!fs.existsSync(source)) {
    throw new Error(
      "Missing route-graphics dist bundle. Run `bun install` before building VT assets.",
    );
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
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

  copyVtRouteGraphicsBundle();
  console.log("Build completed");
};

try {
  await build();
} catch (error) {
  console.error("Build failed", error);
  process.exitCode = 1;
}
