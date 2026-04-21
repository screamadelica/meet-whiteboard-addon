import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic",         // handles JSX inside .js files from node_modules
  },
  optimizeDeps: {
    esbuildOptions: {
      jsx: "automatic",       // same for dependency pre-bundling
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
