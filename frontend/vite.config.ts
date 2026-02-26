import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: "/assets/xpos/dist/js/",
  plugins: [vue()],
  css: {
    postcss: "./postcss.config.js",
  },
  build: {
    target: "esnext",
    modulePreload: false,
    outDir: "../xpos/public/dist/js",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        xpos: path.resolve(__dirname, "src/xpos.bundle.ts"),
        loader: path.resolve(__dirname, "src/loader.ts"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "xpos.[ext]",
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("vue-router")) return "vue-router";
            if (id.includes("vue")) return "vue";
            if (id.includes("pinia")) return "pinia";
            return "vendor";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
