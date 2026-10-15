const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "build");
const packageDir = path.join(output, "package");
const version = JSON.parse(fs.readFileSync(path.join(root, "src", "mnaddon.json"), "utf8")).version;
const archive = path.join(output, `marginnote-folio-v${version}.mnaddon`);
execFileSync(process.execPath, [path.join(root, "scripts", "check.cjs")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(root, "scripts", "build-icon.cjs")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(root, "scripts", "build-type-icons.cjs")], { stdio: "inherit" });
fs.rmSync(packageDir, { recursive: true, force: true });
fs.mkdirSync(packageDir, { recursive: true });
for (const name of fs.readdirSync(path.join(root, "src"))) {
  if (!/\.js$|^mnaddon\.json$|^(?:icon|type-[a-z-]+)\.png$/.test(name)) continue;
  const source = path.join(root, "src", name);
  if (name.startsWith("PaperLibraryNative") && name !== "PaperLibraryNativeValues.js") continue;
  fs.copyFileSync(source, path.join(packageDir, name));
}
execFileSync(process.execPath, [path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js"), "build", "--config", "web/vite.config.js"], { cwd: root, stdio: "inherit" });
const webDir = path.join(packageDir, "web-dist");
fs.cpSync(path.join(output, "web-dist"), webDir, { recursive: true });
fs.writeFileSync(path.join(webDir, "index.html"), '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Folio</title><link rel="stylesheet" href="assets/app.css"></head><body><div id="root"></div><script src="assets/app.iife.js"></script></body></html>');
fs.rmSync(archive, { force: true });
execFileSync("zip", ["-r", "-q", archive, "."], { cwd: packageDir, stdio: "inherit" });
console.log(`Built Folio WebView panel ${archive}`);
