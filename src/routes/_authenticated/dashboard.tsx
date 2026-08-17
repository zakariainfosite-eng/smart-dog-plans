import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Users, Dog, UserCheck, Unlink, Ban } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { PageTitle } from "@/components/layout/PageTitle";
import { pageHeroLastUpdatedMeta } from "@/components/enterprise/page-layout";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { DashboardSpecialtyKpiCard } from "@/components/dashboard/dashboard-specialty-kpi-card";
import { SpecialtyBreakdownLines } from "@/components/agents/specialty-breakdown-lines";
import { OperationalSummaryCard } from "@/components/dashboard/operational-summary-card";
import { TodayPlanningCard } from "@/components/dashboard/today-planning-card";
import { ImminentReturnsCard } from "@/components/dashboard/imminent-returns-card";
import { StatisticDetailsDialog } from "@/components/statistics/statistic-details-dialog";
import { formatPageLastUpdated } from "@/lib/page-ui";
import { db } from "@/integrations/database/client";
import { fetchDashboardStats } from "@/lib/dashboard/fetch-dashboard-stats";
import {
  createEmptyDashboardPersonnelGroups,
  createEmptyDashboardPersonnelStats,
} from "@/lib/dashboard/compute-dashboard-personnel-stats";
import {
  createEmptyOperationalSummary,
  fetchOperationalSummary,
  OPERATIONAL_SUMMARY_QUERY_KEY,
} from "@/lib/dashboard/fetch-operational-summary";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useStatisticDetailsDialog } from "@/hooks/use-statistic-details-dialog";
import { cn } from "@/lib/utils";
import {
  invalidateExclusionNotificationQueries,
  runExclusionNotificationSync,
} from "@/lib/notifications/run-exclusion-notification-sync";
import { personnelStatisticColumns } from "@/lib/statistics/statistic-detail-columns";
import { mapPersonnelDetailRows } from "@/lib/statistics/map-statistic-detail-rows";
import type { StatisticDetailsPayload } from "@/lib/statistics/statistic-details";

const kpiCardClass =
  "h-full min-h-[148px] [&_p]:whitespace-normal [&_p]:overflow-visible";

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
  const details = useStatisticDetailsDialog();

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
  const personnel = data?.personnel ?? createEmptyDashboardPersonnelStats();
  const personnelGroups = data?.personnelGroups ?? createEmptyDashboardPersonnelGroups();
  const exclusions = data?.exclusions ?? [];

  const showPersonnel = (
    title: string,
    rows: typeof personnelGroups.totalFonctionnaires,
  ) => {
    const payload: StatisticDetailsPayload = {
      title,
      columns: personnelStatisticColumns(t),
      rows: mapPersonnelDetailRows(rows, t, exclusions),
    };
    details.showDetails(payload);
  };

  return (
    <div className="space-y-7">
      <PageTitle
        icon={LayoutDashboard}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        loading={isLoading}
        meta={[
          { label: t("dashboard.stat.totalFonctionnaires"), value: personnel.totalFonctionnaires },
          { label: t("dashboard.stat.todayPlannings"), value: planningTotal },
          pageHeroLastUpdatedMeta(
            t("common.page.lastUpdated"),
            formatPageLastUpdated(dataUpdatedAt, locale),
          ),
        ]}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:gap-3.5">
        <KpiCard
          label={t("dashboard.stat.totalFonctionnaires")}
          value={personnel.totalFonctionnaires}
          icon={Users}
          accent="primary"
          loading={isLoading}
          className={cn("page-enter stagger-1", kpiCardClass)}
          onDetailsClick={() =>
            showPersonnel(t("dashboard.stat.totalFonctionnaires"), personnelGroups.totalFonctionnaires)
          }
        />
        <KpiCard
          label={t("dashboard.stat.activeCynotechniciens")}
          value={personnel.activeCynotechniciens}
          icon={UserCheck}
          accent="success"
          loading={isLoading}
          className={cn("page-enter stagger-2", kpiCardClass)}
          onDetailsClick={() =>
            showPersonnel(
              t("dashboard.stat.activeCynotechniciens"),
              personnelGroups.activeCynotechniciens,
            )
          }
          footer={
            <SpecialtyBreakdownLines
              specialty={personnel.activeCynotechniciensBySpecialty}
              loading={isLoading}
              onNarcoticsClick={() =>
                showPersonnel(
                  `${t("dashboard.stat.activeCynotechniciens")} — ${t("dashboard.stat.narcotics")}`,
                  personnelGroups.activeCynotechniciensNarcotics,
                )
              }
              onExplosivesClick={() =>
                showPersonnel(
                  `${t("dashboard.stat.activeCynotechniciens")} — ${t("dashboard.stat.explosives")}`,
                  personnelGroups.activeCynotechniciensExplosives,
                )
              }
            />
          }
        />
        <DashboardSpecialtyKpiCard
          label={t("dashboard.stat.cynotechniciensBySpecialty")}
          icon={Dog}
          narcotics={personnel.cynotechniciensBySpecialty.narcotics}
          explosives={personnel.cynotechniciensBySpecialty.explosives}
          accent="primary"
          loading={isLoading}
          className="page-enter stagger-3"
          onNarcoticsClick={() =>
            showPersonnel(
              `${t("dashboard.stat.cynotechniciensBySpecialty")} — ${t("dashboard.stat.narcotics")}`,
              personnelGroups.cynotechniciensNarcotics,
            )
          }
          onExplosivesClick={() =>
            showPersonnel(
              `${t("dashboard.stat.cynotechniciensBySpecialty")} — ${t("dashboard.stat.explosives")}`,
              personnelGroups.cynotechniciensExplosives,
            )
          }
        />
        <KpiCard
          label={t("dashboard.stat.cynotechniciensWithoutDog")}
          value={personnel.cynotechniciensWithoutDog}
          icon={Unlink}
          accent="warning"
          loading={isLoading}
          className={cn("page-enter stagger-4", kpiCardClass)}
          onDetailsClick={() =>
            showPersonnel(
              t("dashboard.stat.cynotechniciensWithoutDog"),
              personnelGroups.cynotechniciensWithoutDog,
            )
          }
        />
        <DashboardSpecialtyKpiCard
          label={t("dashboard.stat.excludedCynotechniciensBySpecialty")}
          icon={Ban}
          narcotics={personnel.excludedCynotechniciensBySpecialty.narcotics}
          explosives={personnel.excludedCynotechniciensBySpecialty.explosives}
          accent="danger"
          loading={isLoading}
          className="page-enter stagger-5"
          onNarcoticsClick={() =>
            showPersonnel(
              `${t("dashboard.stat.excludedCynotechniciensBySpecialty")} — ${t("dashboard.stat.narcotics")}`,
              personnelGroups.excludedCynotechniciensNarcotics,
            )
          }
          onExplosivesClick={() =>
            showPersonnel(
              `${t("dashboard.stat.excludedCynotechniciensBySpecialty")} — ${t("dashboard.stat.explosives")}`,
              personnelGroups.excludedCynotechniciensExplosives,
            )
          }
        />
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

      <StatisticDetailsDialog
        open={details.open}
        onOpenChange={details.onOpenChange}
        payload={details.payload}
      />
    </div>
  );
}
