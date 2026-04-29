import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const esbuildBin = path.resolve("node_modules", ".bin", "esbuild");

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

const runEsbuild = (args) => {
  const result = spawnSync(esbuildBin, args, {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

copyVtRouteGraphicsBundle();

runEsbuild([
  "src/index.js",
  "--bundle",
  "--minify",
  "--format=esm",
  "--outfile=./dist/RouteEngine.js",
]);

runEsbuild([
  "src/index.js",
  "--bundle",
  "--minify",
  "--sourcemap",
  "--format=esm",
  "--outfile=./vt/static/RouteEngine.js",
]);

console.log("Build completed");
