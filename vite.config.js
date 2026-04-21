import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
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
        banner: "globalThis.process = { env: { NODE_ENV: 'production' } };", // ← injected before all module code
      },
    },
  },
});