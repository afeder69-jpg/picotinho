import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    rollupOptions: {
      external: ['@capacitor/browser'],
      output: {
        entryFileNames: `assets/[name].[hash]-${Date.now()}.js`,
        chunkFileNames: `assets/[name].[hash]-${Date.now()}.js`,
        assetFileNames: `assets/[name].[hash]-${Date.now()}.[ext]`
      }
    }
  },
  plugins: [
    react(),
    // Only include componentTagger in development and if available
    ...(mode === 'development' ? (() => {
      try {
        const { componentTagger } = require("lovable-tagger");
        return [componentTagger()];
      } catch {
        return [];
      }
    })() : [])
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
