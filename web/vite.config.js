const path = require("node:path");
const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig({
  root: __dirname,
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: path.resolve(__dirname, "../build/web-dist/assets"),
    emptyOutDir: true,
    target: "es2018",
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "src/main.jsx"),
      name: "MNPLWebApp",
      formats: ["iife"],
      fileName: "app",
      cssFileName: "app",
    },
  },
});
