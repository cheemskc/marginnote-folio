const fs = require("node:fs");
const path = require("node:path");
// Approved option A: stacked papers with a bookmark. Keep toolbar dimensions.
fs.copyFileSync(path.join(__dirname, "../assets/icon-a-44.png"), path.join(__dirname, "../src/icon.png"));
