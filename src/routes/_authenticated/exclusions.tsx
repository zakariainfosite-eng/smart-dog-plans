import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { z } from "zod";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { format, parseISO } from "date-fns";
import {
  exclusionDurationDays,
  exclusionEndFromDuration,
  formatExclusionSummaryDate,
  MIN_EXCLUSION_DURATION_DAYS,
} from "@/lib/exclusion-dates";
import {
  ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY,
  deleteAgentExclusion,
  exclusionCalendarStatus,
  fetchAgentExclusionHistory,
  isAgentExclusionActive,
} from "@/lib/agent-exclusions";
import {
  UserX, Plus, Pencil, Trash2, Activity, HeartPulse,
  CalendarOff, Flame, Stethoscope, CalendarRange,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { getAgents } from "@/integrations/database";
import { PageTitle } from "@/components/layout/PageTitle";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  PageTableShell,
  PageTablePagination,
  pageHeroLastUpdatedMeta,
} from "@/components/enterprise/page-layout";
import { formatPageLastUpdated, paginate, totalPages as calcTotalPages } from "@/lib/page-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { SearchField } from "@/components/enterprise/search-field";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { EnterpriseDataTable } from "@/components/enterprise/data-table";
import { CellTooltip, TableTooltipProvider } from "@/components/enterprise/cell-tooltip";
import { StatusBadge } from "@/components/enterprise/status-badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Database } from "@/integrations/database/schema-types";

type ExclusionType = Database["public"]["Enums"]["exclusion_type"];
type ExclusionRow = Database["public"]["Tables"]["agent_exclusions"]["Row"];

type ExclusionWithAgent = ExclusionRow & {
  agent: {
    id: string;
    first_name: string;
    last_name: string;
    professional_number: string;
    dog: { id: string; name: string } | null;
  } | null;
};

export const Route = createFileRoute("/_authenticated/exclusions")({
  head: () => ({ meta: [{ title: "Exclusions — Smart K9 Planning" }] }),
  component: ExclusionsPage,
});

export function exclusionLabel(type: ExclusionType, t: TFunction): string {
  return t(`exclusions.type.${type}`);
}

const EXCLUSION_ORDER: ExclusionType[] = [
  "sickness",
  "annual_leave",
  "administrative_leave",
  "mission",
  "training",
  "dog_sick",
  "female_dog_heat",
  "other",
];

function exclusionSchema(t: TFunction) {
  return z
    .object({
      agent_id: z.string().min(1, t("validation.agentRequired")),
      exclusion_type: z.enum([
        "sickness", "annual_leave", "administrative_leave", "mission",
        "training", "dog_sick", "female_dog_heat", "other",
        "absence", "special_leave",
      ]),
      start_date: z.string().min(1, t("validation.startDateRequired")),
      end_date: z.string().min(1, t("validation.endDateRequired")),
      duration_days: z.number().int().min(MIN_EXCLUSION_DURATION_DAYS, t("validation.durationMin")),
      notes: z.string().max(500).optional().or(z.literal("")),
      active: z.boolean(),
    })
    .refine((v) => v.end_date >= v.start_date, {
      message: t("validation.endBeforeStart"),
      path: ["end_date"],
    })
    .refine(
      (v) => exclusionDurationDays(v.start_date, v.end_date) >= MIN_EXCLUSION_DURATION_DAYS,
      {
        message: t("validation.durationMin"),
        path: ["duration_days"],
      },
    );
}
type ExclusionForm = z.infer<ReturnType<typeof exclusionSchema>>;

type StatusFilter = "all" | "active" | "upcoming" | "expired";

const PAGE_SIZE = 15;

function isExclusionEnabled(e: Pick<ExclusionRow, "active">) {
  return e.active;
}

function ExclusionsPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.exclusions.title");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ExclusionType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExclusionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExclusionWithAgent | null>(null);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["exclusions-with-agent"],
    queryFn: async (): Promise<ExclusionWithAgent[]> => {
      const mapRows = (rows: ExclusionRow[]) =>
        rows.map((row: any) => {
          const rawAgent = (row as unknown as { agent: unknown }).agent;
          const agent = Array.isArray(rawAgent) ? rawAgent[0] ?? null : rawAgent ?? null;
          if (agent) {
            const rawDog = (agent as { dog: unknown }).dog;
            (agent as { dog: unknown }).dog = Array.isArray(rawDog) ? rawDog[0] ?? null : rawDog ?? null;
          }
          return { ...(row as ExclusionRow), agent };
        }) as ExclusionWithAgent[];

      const { data, error } = await db
        .from("agent_exclusions")
        .select("*, agent:agents(id, first_name, last_name, professional_number, section_id, dog:dogs(id, name))")
        .order("start_date", { ascending: false });

      if (error) throw error;
      return mapRows((data ?? []) as ExclusionRow[]);
    },
  });

  const { data: agents } = useQuery({
    queryKey: ["agents-basic-exclusions"],
    queryFn: async () => {
      const rows = await getAgents();
      return rows.map((row) => ({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        professional_number: row.professional_number,
        active: row.active,
        section_id: row.section_id,
      }));
    },
  });

  const { data: sections } = useQuery({
    queryKey: ["sections-basic"],
    queryFn: async () => {
      const { data, error } = await db
        .from("sections")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const list = data ?? [];
    const active = list.filter((e: any) => isAgentExclusionActive(e));
    return {
      total: active.length,
      upcoming: list.filter((e: any) => exclusionCalendarStatus(e) === "upcoming").length,
      sick: active.filter((e: any) => e.exclusion_type === "sickness").length,
      dogHeat: active.filter((e: any) => e.exclusion_type === "female_dog_heat").length,
      dogSick: active.filter((e: any) => e.exclusion_type === "dog_sick").length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((e: any) => {
      const q = search.toLowerCase();
      if (q && e.agent) {
        const hay = `${e.agent.first_name} ${e.agent.last_name} ${e.agent.professional_number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      } else if (q) return false;
      if (typeFilter !== "all" && e.exclusion_type !== typeFilter) return false;
      if (agentFilter !== "all" && e.agent_id !== agentFilter) return false;
      if (sectionFilter !== "all") {
        const sid = (e.agent as { section_id?: string | null } | null)?.section_id ?? null;
        if (sid !== sectionFilter) return false;
      }
      const status = exclusionCalendarStatus(e);
      if (statusFilter === "active" && !isAgentExclusionActive(e)) return false;
      if (statusFilter !== "all" && statusFilter !== "active" && status !== statusFilter) return false;
      return true;
    });
  }, [data, search, typeFilter, statusFilter, sectionFilter, agentFilter]);

  const hasActiveFilters =
    !!search ||
    typeFilter !== "all" ||
    sectionFilter !== "all" ||
    agentFilter !== "all" ||
    statusFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setSectionFilter("all");
    setAgentFilter("all");
    setStatusFilter("all");
  };

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, sectionFilter, agentFilter, statusFilter]);

  const paginatedRows = useMemo(
    () => paginate(filtered, page, PAGE_SIZE),
    [filtered, page],
  );
  const pageCount = calcTotalPages(filtered.length, PAGE_SIZE);
  const lastUpdated = formatPageLastUpdated(dataUpdatedAt, locale);

  const upsert = useMutation({
    mutationFn: async (values: ExclusionForm & { id?: string }) => {
      // Overlap guard: only one active exclusion per agent for the same period
      const overlapQuery = db
        .from("agent_exclusions")
        .select("id")
        .eq("agent_id", values.agent_id)
        .eq("active", true)
        .lte("start_date", values.end_date)
        .gte("end_date", values.start_date);
      if (values.id) overlapQuery.neq("id", values.id);
      const { data: overlaps, error: overlapErr } = await overlapQuery;
      if (overlapErr) throw overlapErr;
      if ((overlaps?.length ?? 0) > 0) {
        throw new Error(t("exclusions.error.overlap"));
      }

      const payload = {
        agent_id: values.agent_id,
        exclusion_type: values.exclusion_type,
        start_date: values.start_date,
        end_date: values.end_date,
        notes: values.notes?.trim() ? values.notes.trim() : null,
        active: values.active,
      };
      if (values.id) {
        const { error } = await db.from("agent_exclusions").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("agent_exclusions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? t("exclusions.toast.updated") : t("exclusions.toast.created"));
      setDialogOpen(false); setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["exclusions-with-agent"] });
      queryClient.invalidateQueries({ queryKey: ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["agent-details"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await db.from("agent_exclusions").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.active ? t("exclusions.toast.enabled") : t("exclusions.toast.disabled"));
      queryClient.invalidateQueries({ queryKey: ["exclusions-with-agent"] });
      queryClient.invalidateQueries({ queryKey: ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: ExclusionWithAgent) => {
      await deleteAgentExclusion(db, row.id);
    },
    onSuccess: () => {
      toast.success(t("exclusions.toast.deleted"));
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["exclusions-with-agent"] });
      queryClient.invalidateQueries({ queryKey: ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["agent-details"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (e: ExclusionRow) => { setEditing(e); setDialogOpen(true); };

  const columns = useMemo<ColumnDef<ExclusionWithAgent>[]>(
    () => [
      {
        id: "agent",
        header: t("exclusions.table.agent"),
        meta: { width: "17%" },
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
        id: "profNumber",
        header: t("exclusions.table.profNumber"),
        meta: { width: "9%" },
        cell: ({ row }) => {
          const num = row.original.agent?.professional_number ?? "—";
          return (
            <CellTooltip label={num}>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{num}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "dog",
        header: t("exclusions.table.assignedDog"),
        meta: { width: "11%" },
        cell: ({ row }) => {
          const name = row.original.agent?.dog?.name;
          if (!name) return <span className="text-muted-foreground">—</span>;
          return (
            <CellTooltip label={name}>
              <span className="truncate text-sm">{name}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "type",
        header: t("exclusions.table.type"),
        meta: { width: "14%" },
        cell: ({ row }) => {
          const label = exclusionLabel(row.original.exclusion_type, t);
          return (
            <CellTooltip label={label}>
              <span className="truncate text-sm">{label}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "start",
        header: t("exclusions.table.start"),
        meta: { width: "10%" },
        cell: ({ row }) => {
          const d = format(parseISO(row.original.start_date), "MMM d, yyyy");
          return (
            <CellTooltip label={d}>
              <span className="truncate text-xs text-muted-foreground">{d}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "end",
        header: t("exclusions.table.end"),
        meta: { width: "10%" },
        cell: ({ row }) => {
          const d = format(parseISO(row.original.end_date), "MMM d, yyyy");
          return (
            <CellTooltip label={d}>
              <span className="truncate text-xs text-muted-foreground">{d}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "enabled",
        header: t("exclusions.table.enabled"),
        meta: { width: "7%" },
        cell: ({ row }) => {
          const e = row.original;
          const enabled = isExclusionEnabled(e);
          return (
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => toggleActive.mutate({ id: e.id, active: checked })}
              disabled={toggleActive.isPending}
              aria-label={enabled ? t("exclusions.aria.disable") : t("exclusions.aria.enable")}
            />
          );
        },
      },
      {
        id: "status",
        header: t("common.status"),
        meta: { width: "9%" },
        cell: ({ row }) => {
          const status = exclusionCalendarStatus(row.original);
          const tone = status === "active" ? "success" : status === "upcoming" ? "warning" : "neutral";
          const label =
            status === "active"
              ? t("status.active")
              : status === "upcoming"
                ? t("status.upcoming")
                : t("status.expired");
          return (
            <CellTooltip label={label}>
              <StatusBadge tone={tone} className="max-w-full truncate">
                {label}
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "notes",
        header: t("common.notes"),
        meta: { width: "13%" },
        cell: ({ row }) => {
          const notes = row.original.notes;
          if (!notes) return <span className="text-muted-foreground/60">—</span>;
          return (
            <CellTooltip label={notes}>
              <span className="truncate text-xs text-muted-foreground">{notes}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        meta: { width: "72px", sticky: "right" },
        cell: ({ row }) => {
          const e = row.original;
          return (
            <div className="flex justify-end gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openEdit(e)}
                aria-label={t("aria.edit")}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(e)}
                aria-label={t("aria.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        },
      },
    ],
    [t, toggleActive.isPending],
  );

  return (
    <div className="space-y-6">
      <PageTitle
        icon={UserX}
        title={t("exclusions.title")}
        description={t("exclusions.description")}
        loading={isLoading}
        meta={[
          pageHeroLastUpdatedMeta(t("common.page.lastUpdated"), lastUpdated),
          { label: t("exclusions.stat.active"), value: stats.total },
        ]}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("exclusions.new")}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={Activity} label={t("exclusions.stat.active")} value={stats.total} accent="primary" loading={isLoading} />
        <KpiCard icon={CalendarOff} label={t("status.upcoming")} value={stats.upcoming} accent="warning" loading={isLoading} />
        <KpiCard icon={HeartPulse} label={t("exclusions.stat.sickAgents")} value={stats.sick} accent="danger" loading={isLoading} />
        <KpiCard icon={Flame} label={t("exclusions.stat.dogsInHeat")} value={stats.dogHeat} accent="warning" loading={isLoading} />
        <KpiCard icon={Stethoscope} label={t("exclusions.stat.sickDogs")} value={stats.dogSick} accent="danger" loading={isLoading} />
      </div>

      <FilterBar
        showReset={hasActiveFilters}
        onReset={resetFilters}
        resetLabel={t("common.page.filterReset")}
      >
        <SearchField
          className="min-w-0 flex-1 lg:max-w-md"
          placeholder={t("exclusions.search")}
          value={search}
          onChange={setSearch}
        />
        <FilterPills>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <FilterSelectTrigger><SelectValue placeholder={t("exclusions.filter.reason")} /></FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("exclusions.filter.allReasons")}</SelectItem>
              {EXCLUSION_ORDER.map((type: any) => (
                <SelectItem key={type} value={type}>{exclusionLabel(type, t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <FilterSelectTrigger><SelectValue placeholder={t("field.section")} /></FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allSections")}</SelectItem>
              {sections?.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <FilterSelectTrigger><SelectValue placeholder={t("exclusions.field.agent")} /></FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("exclusions.filter.allAgents")}</SelectItem>
              {agents?.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.last_name} {a.first_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <FilterSelectTrigger><SelectValue /></FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
              <SelectItem value="active">{t("status.active")}</SelectItem>
              <SelectItem value="upcoming">{t("status.upcoming")}</SelectItem>
              <SelectItem value="expired">{t("status.expired")}</SelectItem>
            </SelectContent>
          </Select>
        </FilterPills>
      </FilterBar>

      <PageTableShell
        footer={
          !isLoading ? (
            <PageTablePagination
              showingLabel={t("common.page.showing", {
                displayed: paginatedRows.length,
                total: filtered.length,
              })}
              page={page}
              totalPages={pageCount}
              onPageChange={setPage}
              prevLabel={t("common.page.prev")}
              nextLabel={t("common.page.next")}
            />
          ) : undefined
        }
      >
        <TableTooltipProvider>
          <DataTableShell isLoading={isLoading}>
            <EnterpriseDataTable
              data={paginatedRows}
              columns={columns}
              getRowId={(row) => row.id}
              layout="fixed"
              density="compact"
              responsiveScroll
              emptyState={
                <EmptyState
                  icon={UserX}
                  title={data?.length ? t("exclusions.empty.noMatch") : t("exclusions.empty.none")}
                  description={data?.length ? t("common.tryAdjustFilters") : t("exclusions.empty.recordFirst")}
                />
              }
            />
          </DataTableShell>
        </TableTooltipProvider>
      </PageTableShell>

      <ExclusionDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        initial={editing}
        agents={agents ?? []}
        onSubmit={(v) => upsert.mutate({ ...v, id: editing?.id })}
        submitting={upsert.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("exclusions.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("exclusions.delete.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || remove.isPending}
              onClick={(evt) => { evt.preventDefault(); if (deleteTarget) remove.mutate(deleteTarget); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ExclusionDialog({
  open, onOpenChange, initial, agents, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ExclusionRow | null;
  agents: Array<{ id: string; first_name: string; last_name: string; professional_number: string; active: boolean }>;
  onSubmit: (v: ExclusionForm) => void;
  submitting: boolean;
}) {
  const { t, locale } = useI18n();
  const today = format(new Date(), "yyyy-MM-dd");
  const [agentId, setAgentId] = useState("");
  const [type, setType] = useState<ExclusionType>("sickness");
  const [start, setStart] = useState(today);
  const [duration, setDuration] = useState(MIN_EXCLUSION_DURATION_DAYS);
  const [end, setEnd] = useState(today);
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const startDate = initial?.start_date ?? today;
      const endDate = initial?.end_date ?? today;
      const initialDuration = exclusionDurationDays(startDate, endDate);
      setAgentId(initial?.agent_id ?? "");
      setType(initial?.exclusion_type ?? "sickness");
      setStart(startDate);
      setDuration(initialDuration);
      setEnd(endDate);
      setNotes(initial?.notes ?? "");
      setActive(initial?.active ?? true);
      setErrors({});
    }
  }, [open, initial, today]);

  const handleStartChange = (value: string) => {
    setStart(value);
    setEnd(exclusionEndFromDuration(value, duration));
  };

  const handleDurationChange = (raw: string) => {
    if (raw === "") {
      setDuration(0);
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const days = Math.max(MIN_EXCLUSION_DURATION_DAYS, parsed);
    setDuration(days);
    setEnd(exclusionEndFromDuration(start, days));
  };

  const handleEndChange = (value: string) => {
    setEnd(value);
    if (value && start && value >= start) {
      setDuration(exclusionDurationDays(start, value));
    }
  };

  const datesValid =
    Boolean(start && end) &&
    end >= start &&
    duration >= MIN_EXCLUSION_DURATION_DAYS;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = exclusionSchema(t).safeParse({
      agent_id: agentId,
      exclusion_type: type,
      start_date: start,
      end_date: end,
      duration_days: duration,
      notes,
      active,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[issue.path.join(".")] = issue.message;
      setErrors(errs);
      return;
    }
    onSubmit(parsed.data);
  };

  const activeAgents = agents.filter((a: any) => a.active || a.id === initial?.agent_id);
  const selectedAgent = activeAgents.find((a: any) => a.id === agentId);

  const summaryCard = (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-sm font-semibold tracking-tight text-foreground">
          {t("exclusions.summary.title")}
        </p>
      </div>
      {datesValid ? (
        <dl className="space-y-2.5">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("exclusions.summary.starts")}
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {formatExclusionSummaryDate(start, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("exclusions.summary.ends")}
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {formatExclusionSummaryDate(end, locale)}
            </dd>
          </div>
          <div className="border-t border-border/60 pt-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("exclusions.summary.durationLabel")}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-primary">
              {t("exclusions.summary.duration", { count: duration })}
            </dd>
          </div>
          {selectedAgent ? (
            <div className="border-t border-border/60 pt-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("exclusions.field.agent")}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
                {selectedAgent.last_name} {selectedAgent.first_name}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("exclusions.hint.endDateEditable")}
        </p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,680px)] w-[calc(100%-1.5rem)] max-w-[900px] flex-col gap-0 overflow-hidden rounded-2xl border-border/80 p-0 shadow-elevated sm:max-w-[900px]">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 bg-gradient-to-b from-muted/35 to-background px-6 pb-4 pt-6 pr-14 sm:px-8">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              {initial ? t("exclusions.dialog.editTitle") : t("exclusions.dialog.newTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {initial ? t("exclusions.dialog.editDesc") : t("exclusions.dialog.newDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/10 px-6 py-5 sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ExclusionFormField
                    label={t("exclusions.field.agent")}
                    required
                    error={errors.agent_id}
                  >
                    <Select value={agentId} onValueChange={setAgentId}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder={t("exclusions.selectAgent")} />
                      </SelectTrigger>
                      <SelectContent>
                        {activeAgents.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.last_name} {a.first_name} — {a.professional_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </ExclusionFormField>

                  <ExclusionFormField label={t("exclusions.field.exclusionType")}>
                    <Select value={type} onValueChange={(v) => setType(v as ExclusionType)}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXCLUSION_ORDER.map((exType: any) => (
                          <SelectItem key={exType} value={exType}>
                            {exclusionLabel(exType, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </ExclusionFormField>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ExclusionFormField
                    label={t("field.startDate")}
                    required
                    error={errors.start_date}
                    htmlFor="start"
                  >
                    <Input
                      id="start"
                      type="date"
                      className="h-10"
                      value={start}
                      onChange={(e) => handleStartChange(e.target.value)}
                    />
                  </ExclusionFormField>

                  <ExclusionFormField
                    label={t("exclusions.field.durationDays")}
                    required
                    error={errors.duration_days}
                    htmlFor="duration"
                  >
                    <Input
                      id="duration"
                      type="number"
                      className="h-10"
                      min={MIN_EXCLUSION_DURATION_DAYS}
                      step={1}
                      inputMode="numeric"
                      value={duration === 0 ? "" : duration}
                      onChange={(e) => handleDurationChange(e.target.value)}
                    />
                  </ExclusionFormField>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ExclusionFormField
                    label={t("exclusions.field.endDateCalculated")}
                    required
                    error={errors.end_date}
                    hint={t("exclusions.hint.endDateEditable")}
                    htmlFor="end"
                  >
                    <Input
                      id="end"
                      type="date"
                      className="h-10"
                      value={end}
                      min={start}
                      onChange={(e) => handleEndChange(e.target.value)}
                    />
                  </ExclusionFormField>

                  <ExclusionFormField label={t("exclusions.table.enabled")}>
                    <div className="flex h-10 items-center justify-between rounded-lg border border-border/70 bg-background px-3 shadow-sm">
                      <span className="text-sm text-foreground">{t("exclusions.table.enabled")}</span>
                      <Switch
                        id="exclusion-active"
                        checked={active}
                        onCheckedChange={setActive}
                        aria-label={
                          active ? t("exclusions.aria.disable") : t("exclusions.aria.enable")
                        }
                      />
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {t("exclusions.hint.disabledIgnored")}
                    </p>
                  </ExclusionFormField>
                </div>

                <aside className="lg:hidden">{summaryCard}</aside>

                <ExclusionFormField label={t("common.notes")} htmlFor="notes">
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={500}
                    rows={2}
                    className="min-h-[72px] resize-none"
                    placeholder={t("exclusions.placeholder.notes")}
                  />
                </ExclusionFormField>
              </div>

              <aside className="hidden w-full shrink-0 lg:block lg:w-[260px] lg:sticky lg:top-0">
                {summaryCard}
              </aside>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-6 py-4 sm:px-8">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("action.saving") : initial ? t("action.saveChanges") : t("exclusions.submit.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExclusionFormField({
  label,
  required,
  error,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {hint && !error ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * Reusable exclusion history for an agent — drop into a future agent profile.
 */
export function AgentExclusionsHistory({ agentId }: { agentId: string }) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["agent-exclusions", agentId],
    queryFn: () => fetchAgentExclusionHistory(db, agentId),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data?.length) return <p className="text-sm text-muted-foreground">{t("exclusions.history.empty")}</p>;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("exclusions.table.type")}</TableHead>
            <TableHead>{t("exclusions.table.start")}</TableHead>
            <TableHead>{t("exclusions.table.end")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
            <TableHead>{t("common.notes")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((e: any) => {
            const active = isAgentExclusionActive(e);
            return (
              <TableRow key={e.id}>
                <TableCell>{exclusionLabel(e.exclusion_type, t)}</TableCell>
                <TableCell className="text-muted-foreground">{format(parseISO(e.start_date), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-muted-foreground">{format(parseISO(e.end_date), "MMM d, yyyy")}</TableCell>
                <TableCell>
                  <Badge variant={active ? "default" : "secondary"}>{active ? t("status.active") : t("status.expired")}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.notes ?? "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
