const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const src = path.join(root, "src");
const files = fs.readdirSync(src).filter((name) => name.endsWith(".js"));
for (const name of files) {
  const source = fs.readFileSync(path.join(src, name), "utf8");
  new vm.Script(source, { filename: name });
  if (name !== "main.js" && /\bJSB\.require\s*\(/.test(source)) throw new Error(`Only main.js may import modules: ${name}`);
}
console.log(`Checked ${files.length} native scripts`);
