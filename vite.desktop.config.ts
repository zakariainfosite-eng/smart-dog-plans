/**
 * Desktop production Vite config.
 * Builds TanStack Start + Nitro as a local Node server for Electron.
 * Does NOT use vite-plugin-electron.
 */
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
  },
  vite: {
    envPrefix: ["VITE_", "DATABASE_", "AUTH_"],
    optimizeDeps: {
      exclude: ["pdfjs-dist"],
    },
  },
});
