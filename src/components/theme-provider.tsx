import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
type Ctx = {
  theme: Theme;
  /** Reserved for future dark mode — UI toggle is not exposed yet */
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<Ctx | undefined>(undefined);
const STORAGE_KEY = "skp-theme";

/** Light mode is enforced until dark mode UI is enabled. Tokens are prepared in styles.css. */
const ACTIVE_THEME: Theme = "light";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(ACTIVE_THEME);

  useEffect(() => {
    setThemeState(ACTIVE_THEME);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    window.localStorage.setItem(STORAGE_KEY, ACTIVE_THEME);
  }, [theme]);

  const value: Ctx = {
    theme: ACTIVE_THEME,
    setTheme: setThemeState,
    toggleTheme: () => {
      /* dark mode toggle reserved for future release */
    },
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
