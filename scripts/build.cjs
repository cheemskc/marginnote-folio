const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "build");
const packageDir = path.join(output, "package");
const version = JSON.parse(fs.readFileSync(path.join(root, "src", "mnaddon.json"), "utf8")).version;
const archive = path.join(output, `marginnote-paper-library-v${version}.mnaddon`);
execFileSync(process.execPath, [path.join(root, "scripts", "check.cjs")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(root, "scripts", "build-icon.cjs")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(root, "scripts", "build-type-icons.cjs")], { stdio: "inherit" });
fs.rmSync(packageDir, { recursive: true, force: true });
fs.mkdirSync(packageDir, { recursive: true });
for (const name of fs.readdirSync(path.join(root, "src"))) {
  if (!/\.js$|^mnaddon\.json$|^(?:icon|type-[a-z-]+)\.png$/.test(name)) continue;
  const source = path.join(root, "src", name);
  if (name.endsWith(".js") && /UIWebView|WKWebView|evaluateJavaScript|web-dist/.test(fs.readFileSync(source, "utf8"))) {
    throw new Error(`Native package must not include a WebView runtime: ${name}`);
  }
  fs.copyFileSync(source, path.join(packageDir, name));
}
fs.rmSync(archive, { force: true });
execFileSync("zip", ["-r", "-q", archive, "."], { cwd: packageDir, stdio: "inherit" });
console.log(`Built native panel ${archive}`);
