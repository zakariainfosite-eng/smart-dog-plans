import type { AuthSession } from "./types";

export type ElectronAuthBridge = {
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
};

export {};
