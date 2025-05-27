
import esbuild from "esbuild";
import { cp, rm } from "node:fs/promises";

// await rm('./dist', { recursive: true, force: true });

esbuild
  .build({
    bundle: true,
    minify: false,
    sourcemap: false,
    format: "esm",
    // outfile: `./viz/_site/rvn.js`,
    outfile: `./viz/static/RouteEngine.js`,
    entryPoints: [`engine3/RouteEngine.js`],
  })
  .then(() => console.log("Build completed"))
  .catch(() => {
    console.log("Build failed");
    process.exit(1);
  });


// await cp('./web2', './dist', { recursive: true });

  // esbuild
  //   .build({
  //     bundle: true,
  //     minify: true,
  //     sourcemap: false,
  //     format: "esm",
  //     outfile: `dist/apply.js`,
  //     entryPoints: [`sample/apply.js`],
  //   })
  //   .then(() => console.log("Build completed"))
  //   .catch(() => process.exit(1));
  
