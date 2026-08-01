export type AuthRole = "admin" | "user";

export type AuthUser = {
  id: string;
  email: string;
  role: AuthRole;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  expiresAt: string | null;
};

export type AuthStateChangeCallback = (
  session: AuthSession | null,
  event?: "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED" | "INITIAL_SESSION" | string,
) => void;

export interface AuthProvider {
  getSession(): Promise<AuthSession | null>;
  signInWithPassword(email: string, password: string): Promise<AuthSession>;
  /** Rejected in local auth mode (no public signup). */
  signUp(email: string, password: string): Promise<AuthSession | void>;
  signOut(): Promise<void>;
  onAuthStateChange(callback: AuthStateChangeCallback): () => void;
}
