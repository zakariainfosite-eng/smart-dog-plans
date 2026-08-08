import type { AuthProvider, AuthSession, AuthStateChangeCallback } from "./types";
import {
  clearLocalAuthSession,
  getLocalSession,
  signInLocal,
} from "@/integrations/database/local-auth-store";
import { getLocalSqliteExecutor } from "@/integrations/database/local-sqlite";

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

export function createCapacitorAuthProvider(): AuthProvider {
  const listeners = new Set<AuthStateChangeCallback>();

  function notify(session: AuthSession | null, event: "SIGNED_IN" | "SIGNED_OUT") {
    for (const listener of listeners) listener(session, event);
  }

  return {
    async getSession() {
      const db = await getLocalSqliteExecutor();
      return normalizeSession(await getLocalSession(db));
    },

    async signInWithPassword(email, password) {
      try {
        const db = await getLocalSqliteExecutor();
        const session = normalizeSession(await signInLocal(db, email, password));
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
      clearLocalAuthSession();
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
