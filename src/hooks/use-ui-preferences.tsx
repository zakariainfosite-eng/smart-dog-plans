import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyDocumentDensity,
  readUiPreferences,
  writeNotificationsEnabled,
  writeUiDensity,
  type UiDensity,
  type UiPreferences,
} from "@/lib/ui-preferences";

type UiPreferencesContextValue = UiPreferences & {
  setDensity: (density: UiDensity) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
};

const UiPreferencesContext = createContext<UiPreferencesContextValue | undefined>(undefined);

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UiPreferences>(() => readUiPreferences());

  useEffect(() => {
    applyDocumentDensity(preferences.density);
  }, [preferences.density]);

  const setDensity = useCallback((density: UiDensity) => {
    writeUiDensity(density);
    applyDocumentDensity(density);
    setPreferences((current) => ({ ...current, density }));
  }, []);

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    writeNotificationsEnabled(enabled);
    setPreferences((current) => ({ ...current, notificationsEnabled: enabled }));
  }, []);

  const value = useMemo<UiPreferencesContextValue>(
    () => ({
      ...preferences,
      setDensity,
      setNotificationsEnabled,
    }),
    [preferences, setDensity, setNotificationsEnabled],
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  const ctx = useContext(UiPreferencesContext);
  if (!ctx) throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  return ctx;
}
