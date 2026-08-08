/**
 * Capacitor / iOS static web bundle (SPA shell + index.html).
 *
 * Isolated from:
 * - vite.config.ts          → Nitro SSR web (Lovable)
 * - vite.desktop.config.ts  → Electron Node server
 */
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    spa: {
      enabled: true,
      prerender: {
        outputPath: "/index.html",
        crawlLinks: false,
      },
    },
  },
  // Skip Nitro so TanStack writes dist/client + dist/server for SPA prerender.
  nitro: false,
  vite: {
    envPrefix: ["VITE_", "DATABASE_", "AUTH_"],
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  },
});
