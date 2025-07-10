
import esbuild from "esbuild";

esbuild
  .build({
    bundle: true,
    minify: true,
    sourcemap: false,
    format: "esm",
    outfile: `./dist/RouteEngine.js`,
    // outfile: `./vt/static/RouteEngine.js`,
    entryPoints: [`src/index.js`],
  })
  .then(() => console.log("Build completed"))
  .catch(() => {
    console.log("Build failed");
    process.exit(1);
  });

