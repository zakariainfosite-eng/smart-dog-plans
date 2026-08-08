import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor loads the static SPA shell from the mobile Vite build.
 * Produce it with: npm run build  (runs web Nitro + build:mobile)
 * or: npm run build:mobile
 */
const config: CapacitorConfig = {
  appId: "com.cynoplanning.app",
  appName: "CynoPlanning",
  webDir: "dist/client",
  server: {
    androidScheme: "https",
    iosScheme: "capacitor",
  },
  plugins: {
    CapacitorSQLite: {
      // Persistent app-container storage. Survives Xcode/TestFlight/App Store
      // updates of the same bundle id. Never point this at a temp/cache path.
      // Do not clear this directory on startup or during cap sync.
      iosDatabaseLocation: "Library/CapacitorDatabase",
      iosIsEncryption: false,
    },
  },
};

export default config;
