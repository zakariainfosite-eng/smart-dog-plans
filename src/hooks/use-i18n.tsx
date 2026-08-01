import "@/lib/i18n";
import { useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  applyDocumentLocale,
  LOCALE_STORAGE_KEY,
  type AppLocale,
} from "@/lib/i18n";

export type Locale = AppLocale;

export function I18nProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();

  useEffect(() => {
    const lang = i18n.language;
    const locale: AppLocale = lang === "ar" ? "ar" : lang === "en" ? "en" : "fr";
    applyDocumentLocale(locale);
  }, [i18n.language]);

  return <>{children}</>;
}

export function useI18n() {
  const { t, i18n } = useTranslation();
  const locale: Locale =
    i18n.language === "ar" ? "ar" : i18n.language === "en" ? "en" : "fr";
  const dir: "ltr" | "rtl" = locale === "ar" ? "rtl" : "ltr";

  const setLocale = useMemo(
    () => (next: Locale) => {
      void i18n.changeLanguage(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      }
      applyDocumentLocale(next);
    },
    [i18n],
  );

  return { locale, setLocale, t, dir };
}
