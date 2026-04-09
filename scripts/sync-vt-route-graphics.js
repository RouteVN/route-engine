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
const addUpdateAnimationsPattern =
  'animations:h.suppressAnimations||y.type==="container"?d:[]';
const addUpdateAnimationsReplacement = "animations:d";
const sameSubjectTransitionPattern =
  /S\.value=M;let B=M\?uC\(r,M\):null;g\.destroy\(\{children:!1\}\),p&&u\.delete\(\{app:r,parent:t,element:e,animations:\[\],animationBus:n,completionTracker:a,eventHandler:l,elementPlugins:h,renderContext:c,signal:f\}\),M&&\(M\.zIndex=d,t\.addChild\(M\),M\.visible=!1\);let k=BU\(\{app:r,animation:s,prevSubject:m,nextSubject:B,zIndex:d\}\);/;
const sameSubjectTransitionReplacement =
  'S.value=M;let B=M?uC(r,M):null,C=m,T=B,N=!!e&&!!i&&e.id===i.id;N&&(s.mask!==void 0&&s.prev===void 0&&s.next===void 0?T=null:(s.prev===void 0&&(C=null),s.next===void 0&&(T=null))),g.destroy({children:!1}),p&&u.delete({app:r,parent:t,element:e,animations:[],animationBus:n,completionTracker:a,eventHandler:l,elementPlugins:h,renderContext:c,signal:f}),M&&(M.zIndex=d,t.addChild(M),M.visible=!1);let k=BU({app:r,animation:s,prevSubject:C,nextSubject:T,zIndex:d});';

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

let patched = source.replace(
  initPattern,
  (_, initPrefix) =>
    `await r.init({${initPrefix}preference:"webgl",resolution:(globalThis.RTGL_VT_DEBUG||navigator.webdriver)? .5 : 1,preserveDrawingBuffer:!!(globalThis.RTGL_VT_DEBUG||navigator.webdriver),clearBeforeRender:!0})`,
);

if (!patched.includes(addUpdateAnimationsPattern)) {
  console.error(
    `Could not find the add-time animation dispatch pattern in ${sourceUrl}. ` +
      "Upstream RouteGraphics.js likely changed and the VT sync patch needs an update.",
  );
  process.exit(1);
}

patched = patched.replace(
  addUpdateAnimationsPattern,
  addUpdateAnimationsReplacement,
);

if (!sameSubjectTransitionPattern.test(patched)) {
  console.error(
    `Could not find the same-subject transition pattern in ${sourceUrl}. ` +
      "Upstream RouteGraphics.js likely changed and the VT sync patch needs an update.",
  );
  process.exit(1);
}

patched = patched.replace(
  sameSubjectTransitionPattern,
  sameSubjectTransitionReplacement,
);

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, patched);

console.log(`Synced VT RouteGraphics from ${sourceUrl} to ${targetPath}`);
