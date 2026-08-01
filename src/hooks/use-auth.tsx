import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { getAuthProvider, type AuthSession, type AuthUser } from "@/integrations/auth";

interface AuthContextValue {
  user: AuthUser | null;
  session: AuthSession | null;
  isLoading: boolean;
  role: AuthUser["role"] | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  isLoading: true,
  role: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const auth = getAuthProvider();
    let cancelled = false;

    const unsubscribe = auth.onAuthStateChange((next) => {
      if (!cancelled) setSession(next);
    });

    auth
      .getSession()
      .then((current) => {
        if (!cancelled) {
          setSession(current);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role: session?.user?.role ?? null,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
