import { isElectronDesktopRuntime } from "@/lib/runtime-platform";
import { createLocalAuthProvider } from "./local-auth-provider";
import type { AuthProvider, AuthStateChangeCallback } from "./types";

export type AuthProviderName = "local";

export function getAuthProviderName(): AuthProviderName {
  return "local";
}

export type { AuthProvider, AuthRole, AuthSession, AuthUser } from "./types";

let cachedElectronProvider: AuthProvider | null = null;
let cachedLocalProvider: AuthProvider | null = null;
let cachedSsrProvider: AuthProvider | null = null;

function createSsrAuthStub(): AuthProvider {
  return {
    async getSession() {
      return null;
    },
    async signInWithPassword() {
      throw new Error("Authentication is only available in the client runtime.");
    },
    async signUp() {
      throw new Error("Account creation is disabled in local authentication mode.");
    },
    async signOut() {},
    onAuthStateChange(_callback: AuthStateChangeCallback) {
      return () => {};
    },
  };
}

export function getAuthProvider(): AuthProvider {
  if (typeof window === "undefined") {
    if (!cachedSsrProvider) cachedSsrProvider = createSsrAuthStub();
    return cachedSsrProvider;
  }
  if (isElectronDesktopRuntime()) {
    if (!cachedElectronProvider) {
      cachedElectronProvider = createLocalAuthProvider();
    }
    return cachedElectronProvider;
  }
  if (!cachedLocalProvider) {
    cachedLocalProvider = createLazyLocalAuthProvider();
  }
  return cachedLocalProvider;
}

function createLazyLocalAuthProvider(): AuthProvider {
  let inner: Promise<AuthProvider> | null = null;
  const load = () => {
    if (!inner) {
      inner = import("./capacitor-auth-provider").then((mod) => mod.createCapacitorAuthProvider());
    }
    return inner;
  };
  return {
    async getSession() {
      return (await load()).getSession();
    },
    async signInWithPassword(email, password) {
      return (await load()).signInWithPassword(email, password);
    },
    async signUp(email, password) {
      return (await load()).signUp(email, password);
    },
    async signOut() {
      await (await load()).signOut();
    },
    onAuthStateChange(callback: AuthStateChangeCallback) {
      let unsubscribe: (() => void) | undefined;
      void load().then((provider) => {
        unsubscribe = provider.onAuthStateChange(callback);
      });
      return () => unsubscribe?.();
    },
  };
}

export function resetAuthProviderForTests(): void {
  cachedElectronProvider = null;
  cachedLocalProvider = null;
  cachedSsrProvider = null;
}
