import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sourcePath = process.env.VT_ROUTE_GRAPHICS_SOURCE
  ? path.resolve(process.env.VT_ROUTE_GRAPHICS_SOURCE)
  : path.resolve(repoRoot, "../route-graphics/dist/RouteGraphics.js");
const targetPath = path.resolve(repoRoot, "vt/static/RouteGraphics.js");
const upstreamSnippet =
  'await r.init({width:E,height:w,backgroundColor:P,preference:"webgl"})';
const vtSnippet =
  'await r.init({width:E,height:w,backgroundColor:P,preference:"webgl",resolution:.5,preserveDrawingBuffer:!0})';

if (!fs.existsSync(sourcePath)) {
  console.error(
    `Missing RouteGraphics source at ${sourcePath}. ` +
      "Set VT_ROUTE_GRAPHICS_SOURCE to a local RouteGraphics.js build.",
  );
  process.exit(1);
}

const source = fs.readFileSync(sourcePath, "utf8");

if (!source.includes(upstreamSnippet)) {
  console.error(
    `Could not find the expected Pixi init snippet in ${sourcePath}. ` +
      "Upstream RouteGraphics.js likely changed and the VT sync patch needs an update.",
  );
  process.exit(1);
}

const patched = source.replace(upstreamSnippet, vtSnippet);

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, patched);

console.log(`Synced VT RouteGraphics from ${sourcePath} to ${targetPath}`);
