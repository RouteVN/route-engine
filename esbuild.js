
import esbuild from "esbuild";

esbuild
  .build({
    bundle: true,
    minify: false,
    sourcemap: false,
    format: "esm",
    // outfile: `./viz/_site/rvn.js`,
    outfile: `./vt/static/RouteEngine.js`,
    entryPoints: [`src/RouteEngine.js`],
  })
  .then(() => console.log("Build completed"))
  .catch(() => {
    console.log("Build failed");
    process.exit(1);
  });
