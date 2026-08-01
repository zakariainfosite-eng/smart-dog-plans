import { createLocalAuthProvider } from "./local-auth-provider";
import type { AuthProvider } from "./types";

export type AuthProviderName = "local";

export function getAuthProviderName(): AuthProviderName {
  return "local";
}

export type { AuthProvider, AuthRole, AuthSession, AuthUser } from "./types";

let cachedProvider: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (!cachedProvider) {
    cachedProvider = createLocalAuthProvider();
  }
  return cachedProvider;
}

export function resetAuthProviderForTests(): void {
  cachedProvider = null;
}
