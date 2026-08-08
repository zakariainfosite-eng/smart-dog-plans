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
};

export default config;
