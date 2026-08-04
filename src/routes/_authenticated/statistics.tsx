import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";

import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell, pageHeroLastUpdatedMeta } from "@/components/enterprise/page-layout";
import { CasesStatisticsDashboard } from "@/components/statistics/cases-statistics-dashboard";
import { db } from "@/integrations/database/client";
import {
  DEFAULT_CASES_STATISTICS_FILTERS,
  type CasesStatisticsFilters,
} from "@/lib/statistics/cases-statistics-types";
import {
  aggregateCasesStatistics,
  buildCasesStatisticsFilterOptions,
  CASES_STATISTICS_QUERY_KEY,
  fetchCasesStatisticsRaw,
} from "@/lib/statistics/fetch-cases-statistics";
import { formatPageLastUpdated } from "@/lib/page-ui";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useI18n } from "@/hooks/use-i18n";

export const Route = createFileRoute("/_authenticated/statistics")({
  head: () => ({ meta: [{ title: "Statistiques — Smart K9 Planning" }] }),
  component: StatisticsPage,
});

function StatisticsPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.statistics.title");

  const [filters, setFilters] = useState<CasesStatisticsFilters>(
    DEFAULT_CASES_STATISTICS_FILTERS,
  );

  const { data: raw, isLoading, dataUpdatedAt } = useQuery({
    queryKey: [CASES_STATISTICS_QUERY_KEY],
    queryFn: () => fetchCasesStatisticsRaw(db),
  });

  const filterOptions = useMemo(
    () =>
      raw
        ? buildCasesStatisticsFilterOptions(raw, (key) => {
            if (key === "other") return t("statistics.casesDashboard.specialty.other");
            if (key === "narcotics" || key === "explosives" || key === "currency") {
              return t(`operationalCases.specialty.${key}`);
            }
            return key;
          })
        : {
            years: [String(new Date().getFullYear())],
            specialties: [],
            sections: [],
            checkpoints: [],
            agents: [],
            dogs: [],
          },
    [raw, t],
  );

  const data = useMemo(() => {
    if (!raw) return undefined;
    return aggregateCasesStatistics(
      raw,
      filters,
      (monthKey) => {
        const [year, month] = monthKey.split("-");
        const date = new Date(Number(year), Number(month) - 1, 1);
        return date.toLocaleDateString(locale, { month: "short", year: "numeric" });
      },
      {
        unknown: t("common.none"),
        specialty: (key) => {
          if (key === "other") return t("statistics.casesDashboard.specialty.other");
          if (key === "narcotics" || key === "explosives" || key === "currency") {
            return t(`operationalCases.specialty.${key}`);
          }
          return key;
        },
        seizureType: (key) => {
          const path = `operationalCases.drugType.${key}`;
          const labeled = t(path);
          return labeled === path ? t(`operationalCases.seizureType.${key}`, { defaultValue: key }) : labeled;
        },
        objectType: (key) => t(`operationalCases.objectType.${key}`, { defaultValue: key }),
        team: (agentName, dogName) =>
          dogName
            ? t("statistics.casesDashboard.teamLabel", { agent: agentName, dog: dogName })
            : agentName,
      },
    );
  }, [raw, filters, locale, t]);

  const hasNoSourceData = !!raw && raw.cases.length === 0;

  return (
    <div className="space-y-6 pb-8">
      <PageTitle
        icon={BarChart3}
        title={t("statistics.title")}
        description={t("statistics.casesDashboard.description")}
        loading={isLoading}
        meta={[
          pageHeroLastUpdatedMeta(
            t("common.page.lastUpdated"),
            formatPageLastUpdated(dataUpdatedAt, locale),
          ),
          ...(data
            ? [{ label: t("statistics.casesDashboard.totalCases"), value: data.totalCases }]
            : []),
        ]}
      />

      <PageContentShell className="bg-white px-6 py-6 sm:px-8">
        <CasesStatisticsDashboard
          data={data}
          filterOptions={filterOptions}
          isLoading={isLoading}
          filters={filters}
          onFiltersChange={setFilters}
          hasNoSourceData={hasNoSourceData}
        />
      </PageContentShell>
    </div>
  );
}
