import { useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

const ROUTE_KEYS: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/sections": "nav.sections",
  "/employees": "nav.employees",
  "/dogs": "nav.dogs",
  "/checkpoints": "nav.checkpoints",
  "/exclusions": "nav.exclusions",
  "/daily-planning": "nav.dailyPlanning",
  "/history": "nav.history",
  "/reports-messages": "nav.reportsMessages",
  "/statistics": "nav.statistics",
  "/settings": "nav.settings",
};

function resolveLabelKey(pathname: string): string | null {
  if (ROUTE_KEYS[pathname]) return ROUTE_KEYS[pathname];
  if (pathname.startsWith("/dogs/")) return "nav.dogs";
  return null;
}

export function Breadcrumb() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { t } = useI18n();
  const pageKey = resolveLabelKey(pathname);

  if (!pageKey) return null;

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      <span className="truncate text-muted-foreground">{t("app.name")}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-border" aria-hidden />
      <span className="truncate font-medium text-foreground">{t(pageKey)}</span>
    </nav>
  );
}
