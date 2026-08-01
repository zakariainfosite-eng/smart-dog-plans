import type { AuthProvider, AuthSession, AuthStateChangeCallback } from "./types";

type ElectronAuthBridge = {
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
};

function getBridge(): ElectronAuthBridge {
  const bridge = globalThis.window?.cynoplanning?.auth;
  if (!bridge) {
    throw new Error("Local authentication requires the CynoPlanning Electron desktop app.");
  }
  return bridge as ElectronAuthBridge;
}

function normalizeSession(session: AuthSession | null): AuthSession | null {
  if (!session?.user?.id || !session.accessToken) return null;
  return {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt ?? null,
    user: {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role === "admin" ? "admin" : "user",
    },
  };
}

export function createLocalAuthProvider(): AuthProvider {
  const listeners = new Set<AuthStateChangeCallback>();

  function notify(session: AuthSession | null, event: "SIGNED_IN" | "SIGNED_OUT") {
    for (const listener of listeners) {
      listener(session, event);
    }
  }

  return {
    async getSession() {
      return normalizeSession(await getBridge().getSession());
    },

    async signInWithPassword(email, password) {
      try {
        const session = normalizeSession(await getBridge().signIn(email, password));
        if (!session) throw new Error("Invalid login credentials");
        notify(session, "SIGNED_IN");
        return session;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/invalid login credentials/i.test(message)) {
          throw new Error("Invalid login credentials");
        }
        throw error instanceof Error ? error : new Error(message);
      }
    },

    async signUp() {
      throw new Error("Account creation is disabled in local authentication mode.");
    },

    async signOut() {
      await getBridge().signOut();
      notify(null, "SIGNED_OUT");
    },

    onAuthStateChange(callback: AuthStateChangeCallback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}
