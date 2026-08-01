import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Users, Dog, CalendarDays, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell, pageHeroLastUpdatedMeta } from "@/components/enterprise/page-layout";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { OperationalSummaryCard } from "@/components/dashboard/operational-summary-card";
import { TodayPlanningCard } from "@/components/dashboard/today-planning-card";
import { formatPageLastUpdated } from "@/lib/page-ui";
import { db } from "@/integrations/database/client";
import { fetchDashboardStats } from "@/lib/dashboard/fetch-dashboard-stats";
import {
  createEmptyOperationalSummary,
  fetchOperationalSummary,
  OPERATIONAL_SUMMARY_QUERY_KEY,
} from "@/lib/dashboard/fetch-operational-summary";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — Smart K9 Planning" }] }),
  component: DashboardPage,
});

function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetchDashboardStats(db),
  });
}

function useOperationalSummary() {
  return useQuery({
    queryKey: OPERATIONAL_SUMMARY_QUERY_KEY,
    queryFn: () => fetchOperationalSummary(db),
  });
}

function DashboardPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.dashboard.title");
  const { data, isLoading, dataUpdatedAt } = useDashboardStats();
  const operationalSummaryQuery = useOperationalSummary();

  const planningTotal = data?.planning.length ?? 0;
  const operationalSummary =
    operationalSummaryQuery.data ?? createEmptyOperationalSummary();

  const stats = [
    {
      label: t("dashboard.stat.activeAgents"),
      value: data?.agents ?? 0,
      icon: Users,
      accent: "primary" as const,
      stagger: "stagger-1",
    },
    {
      label: t("dashboard.stat.activeK9"),
      value: data?.dogs ?? 0,
      icon: Dog,
      accent: "success" as const,
      stagger: "stagger-2",
    },
    {
      label: t("dashboard.stat.activeCheckpoints"),
      value: data?.checkpoints ?? 0,
      icon: MapPin,
      accent: "warning" as const,
      stagger: "stagger-3",
    },
    {
      label: t("dashboard.stat.todayPlannings"),
      value: planningTotal,
      icon: CalendarDays,
      accent: "neutral" as const,
      stagger: "stagger-4",
    },
  ];

  return (
    <div className="space-y-6">
      <PageTitle
        icon={LayoutDashboard}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        loading={isLoading}
        meta={[
          { label: t("dashboard.stat.todayPlannings"), value: planningTotal },
          pageHeroLastUpdatedMeta(
            t("common.page.lastUpdated"),
            formatPageLastUpdated(dataUpdatedAt, locale),
          ),
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <KpiCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            accent={s.accent}
            loading={isLoading}
            className={cn("page-enter", s.stagger)}
          />
        ))}
      </div>

      <PageContentShell>
        <div className="grid gap-6 lg:grid-cols-2">
          <TodayPlanningCard planning={data?.planning ?? []} loading={isLoading} />
          <OperationalSummaryCard
            summary={operationalSummary}
            loading={operationalSummaryQuery.isLoading}
          />
        </div>
      </PageContentShell>
    </div>
  );
}
