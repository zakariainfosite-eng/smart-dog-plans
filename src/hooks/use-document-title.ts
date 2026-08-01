import { useEffect } from "react";
import { useI18n } from "@/hooks/use-i18n";

export function useDocumentTitle(titleKey: string) {
  const { t } = useI18n();
  useEffect(() => {
    document.title = t(titleKey);
  }, [t, titleKey]);
}
