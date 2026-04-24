import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  // Add this to handle global 'process' errors if they appear in the browser
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
  },
  server: {
    proxy: {
      // Proxies '/api' requests to your local Vercel functions during dev
      '/api': {
        target: 'http://localhost:3000', 
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist", // Vercel looks for the 'dist' folder by default
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        sidePanel: resolve(__dirname, "side-panel.html"),
        mainStage: resolve(__dirname, "main-stage.html"),
        mobile: resolve(__dirname, "mobile.html"),
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
});