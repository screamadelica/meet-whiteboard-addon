import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      workbox: {
        maximumFileSizeToCacheInBytes: 3000000, 
      },
      manifest: {
        display: 'fullscreen', // This is what hides the Chrome URL bar
        orientation: 'landscape',
        theme_color: '#ffffff',
        // ... other manifest settings
      }
    })
  ],
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