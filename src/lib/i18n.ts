import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "@/locales/fr.json";
import ar from "@/locales/ar.json";
import en from "@/locales/en.json";

export const LOCALE_STORAGE_KEY = "smartk9.locale";
export type AppLocale = "fr" | "ar" | "en";

function readStoredLocale(): AppLocale {
  if (typeof window === "undefined") return "fr";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "ar") return "ar";
  if (stored === "en") return "en";
  return "fr";
}

export function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

const initialLocale = readStoredLocale();
applyDocumentLocale(initialLocale);

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: initialLocale,
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export default i18n;
