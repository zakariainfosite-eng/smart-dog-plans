/**
 * Runtime platform detection for CynoPlanning.
 * Electron desktop, Capacitor native (iOS), or browser/web.
 */

export type RuntimePlatform = "electron" | "capacitor" | "browser";

function hasCynoplanningBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.cynoplanning);
}

function hasElectronProcessVersion(): boolean {
  try {
    const versions = (globalThis as { process?: { versions?: { electron?: string } } }).process
      ?.versions;
    return Boolean(versions?.electron);
  } catch {
    return false;
  }
}

function isElectronUserAgent(): boolean {
  return typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent);
}

/** True only when the Electron preload bridge (or Electron UA) is present. */
export function isElectronDesktopRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return hasCynoplanningBridge() || hasElectronProcessVersion() || isElectronUserAgent();
}

export function isNativeCapacitorRuntime(): boolean {
  if (typeof window === "undefined") return false;
  if (isElectronDesktopRuntime()) return false;
  try {
    const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    if (typeof capacitor?.isNativePlatform === "function" && capacitor.isNativePlatform()) {
      return true;
    }
  } catch {
    // ignore
  }
  const protocol = window.location?.protocol ?? "";
  return protocol === "capacitor:" || protocol.startsWith("ionic:");
}

export function isBrowserRuntime(): boolean {
  return !isElectronDesktopRuntime() && !isNativeCapacitorRuntime();
}

/** True on the Capacitor Android WebView (not Electron, not iOS). */
export function isAndroidCapacitorRuntime(): boolean {
  if (!isNativeCapacitorRuntime()) return false;
  try {
    const capacitor = (
      window as Window & { Capacitor?: { getPlatform?: () => string } }
    ).Capacitor;
    if (typeof capacitor?.getPlatform === "function") {
      return capacitor.getPlatform() === "android";
    }
  } catch {
    // fall through to UA
  }
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

export function getRuntimePlatform(): RuntimePlatform {
  if (isElectronDesktopRuntime()) return "electron";
  if (isNativeCapacitorRuntime()) return "capacitor";
  return "browser";
}
