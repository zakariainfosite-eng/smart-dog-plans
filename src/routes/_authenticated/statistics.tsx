import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";

import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell, pageHeroLastUpdatedMeta } from "@/components/enterprise/page-layout";
import { OperationalIntelligencePanel } from "@/components/statistics/operational-intelligence-panel";
import { db } from "@/integrations/database/client";
import {
  aggregateOperationalIntelligence,
  buildStatisticsCenterFilterOptions,
  fetchStatisticsCenterRaw,
  STATISTICS_CENTER_QUERY_KEY,
} from "@/lib/statistics/fetch-statistics-center";
import {
  DEFAULT_STATISTICS_CENTER_FILTERS,
  type StatisticsCenterFilters,
} from "@/lib/statistics/statistics-center-types";
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

  const [filters, setFilters] = useState<StatisticsCenterFilters>(
    DEFAULT_STATISTICS_CENTER_FILTERS,
  );

  const year = parseInt(filters.year, 10) || new Date().getFullYear();

  const { data: raw, isLoading, dataUpdatedAt } = useQuery({
    queryKey: [STATISTICS_CENTER_QUERY_KEY, year],
    queryFn: () => fetchStatisticsCenterRaw(db, year),
  });

  const filterOptions = useMemo(
    () =>
      raw
        ? buildStatisticsCenterFilterOptions(raw)
        : { years: [String(year)], checkpoints: [], sections: [], agents: [], dogs: [] },
    [raw, year],
  );

  const data = useMemo(() => {
    if (!raw) return undefined;
    return aggregateOperationalIntelligence(
      raw,
      filters,
      (monthIndex) => {
        const date = new Date(year, monthIndex, 1);
        return date.toLocaleDateString(locale, { month: "long" });
      },
      {
        unknown: t("common.none"),
        specialty: (value) => {
          if (value === "narcotics") return t("specialty.narcotics");
          if (value === "explosives") return t("specialty.explosives");
          return value;
        },
      },
    );
  }, [raw, filters, year, locale, t]);

  return (
    <div className="space-y-6 pb-8">
      <PageTitle
        icon={BarChart3}
        title={t("statistics.title")}
        description={t("statistics.intelligence.description")}
        loading={isLoading}
        meta={[
          pageHeroLastUpdatedMeta(
            t("common.page.lastUpdated"),
            formatPageLastUpdated(dataUpdatedAt, locale),
          ),
        ]}
      />

      <PageContentShell className="bg-white px-6 py-6 sm:px-8">
        <OperationalIntelligencePanel
          data={data}
          filterOptions={filterOptions}
          isLoading={isLoading}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </PageContentShell>
    </div>
  );
}
