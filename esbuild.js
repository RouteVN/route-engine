
import esbuild from "esbuild";

esbuild
  .build({
    bundle: true,
    minify: false,
    sourcemap: false,
    format: "esm",
    outfile: `dist/rvn.js`,
    entryPoints: [`index.js`],
  })
  .then(() => console.log("Build completed"))
  .catch(() => process.exit(1));




  esbuild
    .build({
      bundle: true,
      minify: true,
      sourcemap: false,
      format: "esm",
      outfile: `dist/apply.js`,
      entryPoints: [`sample/apply.js`],
    })
    .then(() => console.log("Build completed"))
    .catch(() => process.exit(1));
  
