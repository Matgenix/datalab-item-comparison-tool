import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";

export default {
  plugins: [vue()],
  build: {
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/main.js", import.meta.url)),
      name: "comparisonToolFrontend",
      formats: ["iife"],
      fileName: () => "tool.js",
    },
    minify: false,
    outDir: fileURLToPath(
      new URL("../src/datalab_item_comparison_tool/static/frontend", import.meta.url),
    ),
    rolldownOptions: {
      external: ["vue"],
      output: {
        globals: {
          vue: "window.datalabToolSdk.runtime",
        },
      },
    },
  },
};
