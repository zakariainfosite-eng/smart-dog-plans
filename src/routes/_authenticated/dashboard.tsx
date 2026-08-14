import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Users, Dog, CalendarDays, MapPin } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { PageTitle } from "@/components/layout/PageTitle";
import { pageHeroLastUpdatedMeta } from "@/components/enterprise/page-layout";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { OperationalSummaryCard } from "@/components/dashboard/operational-summary-card";
import { TodayPlanningCard } from "@/components/dashboard/today-planning-card";
import { ImminentReturnsCard } from "@/components/dashboard/imminent-returns-card";
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
import {
  invalidateExclusionNotificationQueries,
  runExclusionNotificationSync,
} from "@/lib/notifications/run-exclusion-notification-sync";

const personnelTrendCardClass =
  "h-full [&_p:last-child]:whitespace-pre-line [&_p:last-child]:normal-case [&_p:last-child]:text-xs [&_p:last-child]:leading-relaxed";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — CynoPlanning" }] }),
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
  const queryClient = useQueryClient();
  const { data, isLoading, dataUpdatedAt } = useDashboardStats();
  const operationalSummaryQuery = useOperationalSummary();

  useEffect(() => {
    void (async () => {
      try {
        await runExclusionNotificationSync(db);
        invalidateExclusionNotificationQueries(queryClient);
      } catch (error) {
        console.warn("[notifications] dashboard sync failed", error);
      }
    })();
  }, [queryClient]);

  const planningTotal = data?.planning.length ?? 0;
  const operationalSummary =
    operationalSummaryQuery.data ?? createEmptyOperationalSummary();

  const activePersonnel = data?.activePersonnel ?? {
    total: 0,
    cynotechniciens: 0,
    administrative: 0,
  };

  const activePersonnelTrend = [
    `🐕 ${t("dashboard.stat.activeCynotechniciens")} : ${activePersonnel.cynotechniciens}`,
    `📋 ${t("dashboard.stat.activeAdministrative")} : ${activePersonnel.administrative}`,
  ].join("\n");

  const stats = [
    {
      key: "active-personnel",
      label: t("dashboard.stat.activePersonnelTotal"),
      value: activePersonnel.total,
      icon: Users,
      accent: "primary" as const,
      trend: activePersonnelTrend,
      className: personnelTrendCardClass,
      stagger: "stagger-1",
    },
    {
      key: "active-k9",
      label: t("dashboard.stat.activeK9"),
      value: data?.dogs ?? 0,
      icon: Dog,
      accent: "success" as const,
      trend: t("dashboard.kpi.hint.operational"),
      stagger: "stagger-2",
    },
    {
      key: "active-checkpoints",
      label: t("dashboard.stat.activeCheckpoints"),
      value: data?.checkpoints ?? 0,
      icon: MapPin,
      accent: "warning" as const,
      trend: t("dashboard.kpi.hint.active"),
      stagger: "stagger-3",
    },
    {
      key: "today-plannings",
      label: t("dashboard.stat.todayPlannings"),
      value: planningTotal,
      icon: CalendarDays,
      accent: "neutral" as const,
      trend: t("dashboard.kpi.hint.today"),
      stagger: "stagger-4",
    },
  ];

  return (
    <div className="space-y-7">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-3.5">
        {stats.map((s) => (
          <KpiCard
            key={s.key}
            label={s.label}
            value={s.value}
            icon={s.icon}
            accent={s.accent}
            trend={s.trend}
            loading={isLoading}
            className={cn("page-enter", s.stagger, s.className)}
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <TodayPlanningCard planning={data?.planning ?? []} loading={isLoading} />
        <OperationalSummaryCard
          summary={operationalSummary}
          loading={operationalSummaryQuery.isLoading}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <ImminentReturnsCard />
      </div>
    </div>
  );
}
