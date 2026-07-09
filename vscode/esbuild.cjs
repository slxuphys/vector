const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const assetUrlPlugin = {
  name: "asset-url",
  setup(build) {
    build.onResolve({ filter: /textFontMetrics$/ }, (args) => {
      if (!args.importer.includes(`${path.sep}src${path.sep}core${path.sep}`)) return undefined;
      return { path: path.join(__dirname, "src", "nodeTextFontMetrics.ts") };
    });

    build.onResolve({ filter: /\.(otf|ttf|wasm)\?url$/ }, (args) => {
      return { path: resolveImportPath(args.path.slice(0, -"?url".length), args.resolveDir), namespace: "asset-url" };
    });

    build.onResolve({ filter: /\.woff2\?inline$/ }, (args) => {
      return { path: resolveImportPath(args.path.slice(0, -"?inline".length), args.resolveDir), namespace: "asset-inline" };
    });

    build.onResolve({ filter: /\?raw$/ }, (args) => {
      return { path: resolveImportPath(args.path.slice(0, -"?raw".length), args.resolveDir), namespace: "asset-raw" };
    });

    build.onLoad({ filter: /\.(otf|ttf|wasm)$/, namespace: "asset-url" }, async (args) => {
      const bytes = await fs.promises.readFile(args.path);
      const extension = path.extname(args.path).toLowerCase();
      const mime = extension === ".wasm"
        ? "application/wasm"
        : extension === ".ttf"
          ? "font/ttf"
          : "font/otf";
      const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
      return {
        contents: `export default ${JSON.stringify(dataUrl)};`,
        loader: "js"
      };
    });

    build.onLoad({ filter: /\.woff2$/, namespace: "asset-inline" }, async (args) => {
      const bytes = await fs.promises.readFile(args.path);
      return {
        contents: `export default ${JSON.stringify(`data:font/woff2;base64,${bytes.toString("base64")}`)};`,
        loader: "js"
      };
    });

    build.onLoad({ filter: /.*/, namespace: "asset-raw" }, async (args) => {
      const text = await fs.promises.readFile(args.path, "utf8");
      return {
        contents: `export default ${JSON.stringify(text)};`,
        loader: "js"
      };
    });
  }
};

function resolveImportPath(specifier, resolveDir) {
  if (path.isAbsolute(specifier)) return specifier;
  if (specifier.startsWith(".") || specifier.startsWith("/")) return path.resolve(resolveDir, specifier);
  return require.resolve(specifier, { paths: [resolveDir, root] });
}

esbuild.build({
  entryPoints: [process.env.VECTOR_ENTRY ? path.resolve(root, process.env.VECTOR_ENTRY) : path.join(__dirname, "src", "extension.ts")],
  outfile: process.env.VECTOR_OUTFILE ? path.resolve(root, process.env.VECTOR_OUTFILE) : path.join(__dirname, "dist", "extension.js"),
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
  absWorkingDir: root,
  plugins: [assetUrlPlugin],
  loader: {
    ".otf": "dataurl",
    ".ttf": "dataurl",
    ".wasm": "dataurl"
  }
}).catch(() => process.exit(1));
