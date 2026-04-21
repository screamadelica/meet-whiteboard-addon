import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,          // ← stops Vite from copying public/ into the output
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  esbuild: {
    jsx: "automatic",
  },
  optimizeDeps: {
    esbuildOptions: {
      jsx: "automatic",
    },
  },
  build: {
    minify: "esbuild",
    lib: {
      entry: "src/excalidraw-bundle.js",
      name: "ExcalidrawBundle",
      formats: ["iife"],
      fileName: () => "excalidraw-bundle.js",
    },
    outDir: "public/static",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});