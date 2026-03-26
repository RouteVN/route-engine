import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const targetPath = path.resolve(repoRoot, "vt/static/RouteGraphics.js");
const defaultVersion = process.env.VT_ROUTE_GRAPHICS_VERSION || "1.1.4";
const sourceUrl =
  process.env.VT_ROUTE_GRAPHICS_URL ||
  `https://cdn.jsdelivr.net/npm/route-graphics@${defaultVersion}/dist/RouteGraphics.js`;
const initPattern = /await r\.init\(\{([^}]*)preference:"webgl"\}\)/;

const response = await fetch(sourceUrl);

if (!response.ok) {
  console.error(
    `Failed to download RouteGraphics from ${sourceUrl}: ` +
      `${response.status} ${response.statusText}`,
  );
  process.exit(1);
}

const source = await response.text();

if (!initPattern.test(source)) {
  console.error(
    `Could not find the expected Pixi init call in ${sourceUrl}. ` +
      "Upstream RouteGraphics.js likely changed and the VT sync patch needs an update.",
  );
  process.exit(1);
}

const patched = source.replace(
  initPattern,
  (_, initPrefix) =>
    `await r.init({${initPrefix}preference:"webgl",resolution:(globalThis.RTGL_VT_DEBUG||navigator.webdriver)? .5 : 1,preserveDrawingBuffer:!!(globalThis.RTGL_VT_DEBUG||navigator.webdriver),clearBeforeRender:!0})`,
);

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, patched);

console.log(`Synced VT RouteGraphics from ${sourceUrl} to ${targetPath}`);
