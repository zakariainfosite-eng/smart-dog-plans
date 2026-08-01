import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { Briefcase, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { SearchField } from "@/components/enterprise/search-field";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { EnterpriseDataTable } from "@/components/enterprise/data-table";
import { CellTooltip, TableTooltipProvider } from "@/components/enterprise/cell-tooltip";
import { StatusBadge } from "@/components/enterprise/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  OperationalCaseDialog,
  type OperationalCaseDialogMode,
} from "@/components/operational-cases/operational-case-dialog";
import { StatMiniKpi } from "@/components/statistics/stat-section";
import { useI18n } from "@/hooks/use-i18n";
import { db } from "@/integrations/database/client";
import {
  checkpointLabel,
  fetchOperationalCases,
  type OperationalCaseWithRelations,
} from "@/lib/operational-case-api";
import {
  caseSpecialtyBadgeTone,
  caseSpecialtyLabel,
} from "@/lib/operational-cases";
import {
  exportCaseHistoryExcel,
  exportCaseHistoryPdf,
} from "@/lib/statistics/export-cases-history";
import {
  CASE_SPECIALTY_ORDER,
  computeCaseHistorySummary,
  DEFAULT_CASE_HISTORY_FILTERS,
  filterCaseHistoryRows,
  caseHistoryQuantity,
  caseHistorySeizureLabel,
  caseHistoryStatusLabel,
  caseHistoryUnit,
  seizureTypeOptions,
  STATISTICS_CASE_SELECT,
  type CaseHistoryFilters,
  type CaseHistoryRow,
} from "@/lib/statistics/operational-cases-history";

const PAGE_SIZE = 20;
const CASES_HISTORY_QUERY_KEY = "statistics-operational-cases-history";

const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"] as const;

export function StatisticsCasesHistory({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [filters, setFilters] = useState<CaseHistoryFilters>(DEFAULT_CASE_HISTORY_FILTERS);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<OperationalCaseDialogMode>("view");
  const [activeCase, setActiveCase] = useState<OperationalCaseWithRelations | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [CASES_HISTORY_QUERY_KEY],
    queryFn: () => fetchOperationalCases(db, STATISTICS_CASE_SELECT) as Promise<CaseHistoryRow[]>,
  });

  const allCases = data ?? [];

  const summary = useMemo(() => computeCaseHistorySummary(allCases), [allCases]);

  const filtered = useMemo(
    () => filterCaseHistoryRows(allCases, filters),
    [allCases, filters],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const agents = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allCases) {
      if (row.agent) {
        map.set(row.agent.id, `${row.agent.first_name} ${row.agent.last_name}`);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allCases]);

  const dogs = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allCases) {
      if (row.dog) map.set(row.dog.id, row.dog.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allCases]);

  const sections = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allCases) {
      const section = row.agent?.sections;
      if (section?.id && section.name) map.set(section.id, section.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allCases]);

  const checkpoints = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allCases) {
      if (row.checkpoint) map.set(row.checkpoint.id, row.checkpoint.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allCases]);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const row of allCases) {
      set.add(row.case_date.slice(0, 4));
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [allCases]);

  const seizureOptions = useMemo(() => seizureTypeOptions(t), [t]);

  const updateFilter = <K extends keyof CaseHistoryFilters>(key: K, value: CaseHistoryFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const openView = (row: CaseHistoryRow) => {
    setActiveCase(row);
    setDialogMode("view");
    setDialogOpen(true);
  };

  const handleExportExcel = () => {
    try {
      exportCaseHistoryExcel(filtered, t, `historique-affaires-${Date.now()}.xlsx`);
      toast.success(t("statistics.export.excelSuccess"));
    } catch {
      toast.error(t("statistics.export.error"));
    }
  };

  const handleExportPdf = () => {
    try {
      exportCaseHistoryPdf(
        filtered,
        t,
        t("statistics.casesHistory.title"),
        `historique-affaires-${Date.now()}.pdf`,
      );
      toast.success(t("statistics.export.pdfSuccess"));
    } catch {
      toast.error(t("statistics.export.error"));
    }
  };

  const columns = useMemo<ColumnDef<CaseHistoryRow>[]>(
    () => [
      {
        id: "date",
        header: t("operationalCases.table.date"),
        meta: { width: "8%" },
        cell: ({ row }) => {
          const d = format(parseISO(row.original.case_date), "dd/MM/yyyy");
          return (
            <CellTooltip label={d}>
              <span className="truncate text-xs text-muted-foreground">{d}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "caseNumber",
        header: t("operationalCases.table.caseNumber"),
        meta: { width: "9%" },
        cell: ({ row }) => (
          <CellTooltip label={row.original.case_number}>
            <span className="truncate font-mono text-xs font-medium">{row.original.case_number}</span>
          </CellTooltip>
        ),
      },
      {
        id: "agent",
        header: t("operationalCases.table.agent"),
        meta: { width: "10%" },
        cell: ({ row }) => {
          const agent = row.original.agent;
          if (!agent) return <span className="text-muted-foreground">—</span>;
          const name = `${agent.first_name} ${agent.last_name}`;
          return (
            <CellTooltip label={name}>
              <span className="truncate text-sm font-medium">{name}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "dog",
        header: t("operationalCases.table.dog"),
        meta: { width: "8%" },
        cell: ({ row }) => {
          const name = row.original.dog?.name ?? "—";
          return (
            <CellTooltip label={name}>
              <span className="truncate text-sm">{name}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "specialty",
        header: t("operationalCases.table.specialty"),
        meta: { width: "9%" },
        cell: ({ row }) => {
          const label = caseSpecialtyLabel(row.original.specialty, t);
          return (
            <CellTooltip label={label}>
              <span className="truncate text-sm">{label}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "checkpoint",
        header: t("operationalCases.table.checkpoint"),
        meta: { width: "9%" },
        cell: ({ row }) => {
          const label = checkpointLabel(row.original);
          return (
            <CellTooltip label={label}>
              <span className="truncate text-sm">{label}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "location",
        header: t("operationalCases.table.location"),
        meta: { width: "8%" },
        cell: ({ row }) => {
          const label = row.original.location ?? "—";
          return (
            <CellTooltip label={label}>
              <span className="truncate text-sm">{label}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "seizure",
        header: t("statistics.casesHistory.table.seizureObject"),
        meta: { width: "11%" },
        cell: ({ row }) => {
          const label = caseHistorySeizureLabel(row.original, t);
          return (
            <CellTooltip label={label}>
              <span className="truncate text-sm">{label}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "quantity",
        header: t("operationalCases.table.quantity"),
        meta: { width: "7%" },
        cell: ({ row }) => {
          const label = caseHistoryQuantity(row.original);
          return (
            <CellTooltip label={label}>
              <span className="truncate text-sm">{label}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "unit",
        header: t("operationalCases.field.unit"),
        meta: { width: "7%" },
        cell: ({ row }) => {
          const label = caseHistoryUnit(row.original, t);
          return (
            <CellTooltip label={label}>
              <span className="truncate text-sm">{label}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "status",
        header: t("common.status"),
        meta: { width: "9%" },
        cell: ({ row }) => {
          const label = caseHistoryStatusLabel(row.original, t);
          return (
            <StatusBadge tone={caseSpecialtyBadgeTone(row.original.specialty)} className="max-w-full truncate px-1.5 py-0 text-[10px]">
              {label}
            </StatusBadge>
          );
        },
      },
    ],
    [t],
  );

  const filterPills = [
    filters.search && { label: filters.search, onRemove: () => updateFilter("search", "") },
    filters.dateFrom && {
      label: `${t("statistics.casesHistory.filter.dateFrom")}: ${filters.dateFrom}`,
      onRemove: () => updateFilter("dateFrom", ""),
    },
    filters.dateTo && {
      label: `${t("statistics.casesHistory.filter.dateTo")}: ${filters.dateTo}`,
      onRemove: () => updateFilter("dateTo", ""),
    },
    filters.year !== "all" && {
      label: `${t("statistics.casesHistory.filter.year")}: ${filters.year}`,
      onRemove: () => updateFilter("year", "all"),
    },
    filters.month !== "all" && {
      label: `${t("statistics.casesHistory.filter.month")}: ${t(`statistics.casesHistory.months.${filters.month}`)}`,
      onRemove: () => updateFilter("month", "all"),
    },
    filters.agentId !== "all" && {
      label: agents.find((a) => a.id === filters.agentId)?.name ?? filters.agentId,
      onRemove: () => updateFilter("agentId", "all"),
    },
    filters.dogId !== "all" && {
      label: dogs.find((d) => d.id === filters.dogId)?.name ?? filters.dogId,
      onRemove: () => updateFilter("dogId", "all"),
    },
    filters.specialty !== "all" && {
      label: caseSpecialtyLabel(filters.specialty as CaseHistoryRow["specialty"], t),
      onRemove: () => updateFilter("specialty", "all"),
    },
    filters.status !== "all" && {
      label: caseSpecialtyLabel(filters.status as CaseHistoryRow["specialty"], t),
      onRemove: () => updateFilter("status", "all"),
    },
    filters.sectionId !== "all" && {
      label: sections.find((s) => s.id === filters.sectionId)?.name ?? filters.sectionId,
      onRemove: () => updateFilter("sectionId", "all"),
    },
    filters.checkpointId !== "all" && {
      label: checkpoints.find((c) => c.id === filters.checkpointId)?.name ?? filters.checkpointId,
      onRemove: () => updateFilter("checkpointId", "all"),
    },
    filters.seizureType !== "all" && {
      label: seizureOptions.find((o) => o.value === filters.seizureType)?.label ?? filters.seizureType,
      onRemove: () => updateFilter("seizureType", "all"),
    },
  ].filter(Boolean) as { label: string; onRemove: () => void }[];

  return (
    <div className="space-y-4">
      {!embedded ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatMiniKpi label={t("statistics.casesHistory.summary.total")} value={summary.total} />
          <StatMiniKpi label={t("statistics.casesHistory.summary.thisMonth")} value={summary.thisMonth} />
          <StatMiniKpi label={t("statistics.casesHistory.summary.thisYear")} value={summary.thisYear} />
          <StatMiniKpi label={t("statistics.casesHistory.summary.narcotics")} value={summary.narcotics} />
          <StatMiniKpi label={t("statistics.casesHistory.summary.explosives")} value={summary.explosives} />
          <StatMiniKpi label={t("statistics.casesHistory.summary.currency")} value={summary.currency} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("statistics.casesHistory.results", { count: filtered.length, total: allCases.length })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={isLoading || filtered.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {t("statistics.export.excel")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isLoading || filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {t("statistics.export.pdf")}
          </Button>
        </div>
      </div>

      <FilterBar>
        <SearchField
          value={filters.search}
          onChange={(v) => updateFilter("search", v)}
          placeholder={t("statistics.casesHistory.search")}
          className="min-w-[220px] flex-1"
        />
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => updateFilter("dateFrom", e.target.value)}
          className="h-9 w-[150px]"
          aria-label={t("statistics.casesHistory.filter.dateFrom")}
        />
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => updateFilter("dateTo", e.target.value)}
          className="h-9 w-[150px]"
          aria-label={t("statistics.casesHistory.filter.dateTo")}
        />
        <Select value={filters.year} onValueChange={(v) => updateFilter("year", v)}>
          <FilterSelectTrigger label={t("statistics.casesHistory.filter.year")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.casesHistory.filter.allYears")}</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.month} onValueChange={(v) => updateFilter("month", v)}>
          <FilterSelectTrigger label={t("statistics.casesHistory.filter.month")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.casesHistory.filter.allMonths")}</SelectItem>
            {MONTH_KEYS.map((month) => (
              <SelectItem key={month} value={month}>
                {t(`statistics.casesHistory.months.${month}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.agentId} onValueChange={(v) => updateFilter("agentId", v)}>
          <FilterSelectTrigger label={t("operationalCases.filter.agent")} />
          <SelectContent>
            <SelectItem value="all">{t("operationalCases.filter.allAgents")}</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.dogId} onValueChange={(v) => updateFilter("dogId", v)}>
          <FilterSelectTrigger label={t("operationalCases.table.dog")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.casesHistory.filter.allDogs")}</SelectItem>
            {dogs.map((dog) => (
              <SelectItem key={dog.id} value={dog.id}>
                {dog.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.specialty} onValueChange={(v) => updateFilter("specialty", v)}>
          <FilterSelectTrigger label={t("operationalCases.filter.specialty")} />
          <SelectContent>
            <SelectItem value="all">{t("operationalCases.filter.allSpecialties")}</SelectItem>
            {CASE_SPECIALTY_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {caseSpecialtyLabel(s, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.sectionId} onValueChange={(v) => updateFilter("sectionId", v)}>
          <FilterSelectTrigger label={t("field.section")} />
          <SelectContent>
            <SelectItem value="all">{t("common.allSections")}</SelectItem>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.checkpointId} onValueChange={(v) => updateFilter("checkpointId", v)}>
          <FilterSelectTrigger label={t("operationalCases.table.checkpoint")} />
          <SelectContent>
            <SelectItem value="all">{t("statistics.casesHistory.filter.allCheckpoints")}</SelectItem>
            {checkpoints.map((checkpoint) => (
              <SelectItem key={checkpoint.id} value={checkpoint.id}>
                {checkpoint.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.seizureType} onValueChange={(v) => updateFilter("seizureType", v)}>
          <FilterSelectTrigger label={t("operationalCases.filter.seizureType")} />
          <SelectContent>
            <SelectItem value="all">{t("operationalCases.filter.allSeizureTypes")}</SelectItem>
            {seizureOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => updateFilter("status", v)}>
          <FilterSelectTrigger label={t("common.status")} />
          <SelectContent>
            <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
            {CASE_SPECIALTY_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {caseSpecialtyLabel(s, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FilterPills pills={filterPills} />
      </FilterBar>

      <TableTooltipProvider>
        <DataTableShell isLoading={isLoading}>
          <EnterpriseDataTable
            columns={columns}
            data={paginated}
            loading={isLoading}
            layout="fixed"
            density="compact"
            responsiveScroll
            onRowClick={(row) => openView(row.original)}
            emptyState={
              <EmptyState
                icon={Briefcase}
                title={
                  allCases.length
                    ? t("statistics.casesHistory.empty.noMatch")
                    : t("statistics.casesHistory.empty.none")
                }
                description={
                  allCases.length ? t("common.tryAdjustFilters") : t("operationalCases.empty.createFirst")
                }
              />
            }
          />
        </DataTableShell>
      </TableTooltipProvider>

      {filtered.length > 0 ? (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {t("statistics.casesHistory.pagination", {
              from: (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, filtered.length),
              total: filtered.length,
            })}
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    if (page > 1) setPage(page - 1);
                  }}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev != null && p - prev > 1;
                  return (
                    <PaginationItem key={p}>
                      {showEllipsis ? (
                        <span className="flex h-9 w-9 items-center justify-center text-muted-foreground">…</span>
                      ) : null}
                      <PaginationLink
                        href="#"
                        isActive={p === page}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage(p);
                        }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    if (page < totalPages) setPage(page + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}

      <OperationalCaseDialog
        mode={dialogMode}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        caseRow={activeCase}
        onModeChange={(mode) => setDialogMode(mode)}
      />
    </div>
  );
}
