import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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
  ALL_EXCLUSION_TYPES,
  DOG_EXCLUSION_FORM_TYPES,
  PERSONNEL_EXCLUSION_FORM_TYPES,
  deleteAgentExclusion,
  exclusionApplyTarget,
  hasConflictingExistingExclusion,
  exclusionTypeI18nKey,
  expirePastExclusions,
  fetchAgentExclusionHistory,
  isAgentExclusionActive,
  isAgentLevelExclusionType,
  isDogLevelExclusionType,
  isOpenEndedExclusionType,
  todayISODate,
  type ExclusionApplyTarget,
} from "@/lib/agent-exclusions";
import {
  DEFAULT_EXCLUSION_LIST_STATUS_FILTER,
  EXCLUSION_LIST_STATUS_FILTERS,
  exclusionListStatus,
  isUpcomingExclusionStart,
  matchesExclusionListStatusFilter,
  type ExclusionListStatus,
  type ExclusionListStatusFilter,
} from "@/lib/exclusion-list-status";
import {
  DEFAULT_EXCLUSION_SETTINGS,
  EXCLUSION_SETTINGS_QUERY_KEY,
  availableExclusionFormTypes,
  defaultExclusionFormType,
  fetchExclusionSettings,
  isExclusionTypeEnabledForCreation,
  type ExclusionSettings,
} from "@/lib/exclusion-settings";
import {
  invalidateExclusionNotificationQueries,
  runExclusionNotificationSync,
} from "@/lib/notifications/run-exclusion-notification-sync";
import { normalizePersonnelFonction } from "@/lib/personnel-fonction";
import {
  UserX,
  Plus,
  Activity,
  HeartPulse,
  Flame,
  Stethoscope,
  CalendarRange,
  ChevronsUpDown,
  Check,
  Dog as DogIcon,
  Users,
  Pill,
  Bomb,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { RowActionButtons } from "@/components/enterprise/row-action-buttons";

import { db } from "@/integrations/database/client";
import { getAgents, getDogs } from "@/integrations/database";
import type { Gender } from "@/integrations/database/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PageTitle } from "@/components/layout/PageTitle";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageTablePagination, pageHeroLastUpdatedMeta } from "@/components/enterprise/page-layout";
import { formatPageLastUpdated, paginate, totalPages as calcTotalPages } from "@/lib/page-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { SearchField } from "@/components/enterprise/search-field";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { EnterpriseDataTable } from "@/components/enterprise/data-table";
import { CellTooltip, TableTooltipProvider } from "@/components/enterprise/cell-tooltip";
import { StatusBadge, type StatusTone } from "@/components/enterprise/status-badge";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { SpecialtyBreakdownLines } from "@/components/agents/specialty-breakdown-lines";
import { DogAvatar } from "@/components/dogs/dog-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/database/schema-types";
import {
  computeUniqueDogExclusionSpecialtyStats,
  countExclusionCynoSpecialties,
  computeExcludedPersonnelCardStats,
  listExcludedPersonnelRows,
  listExclusionRowsByCynoSpecialty,
  listUniqueExcludedDogRows,
} from "@/lib/exclusions-specialty-stats";
import { StatisticDetailsDialog } from "@/components/statistics/statistic-details-dialog";
import { useStatisticDetailsDialog } from "@/hooks/use-statistic-details-dialog";
import { exclusionStatisticColumns } from "@/lib/statistics/statistic-detail-columns";
import { mapExclusionDetailRows } from "@/lib/statistics/map-statistic-detail-rows";
import { STATISTICS_QUERY_KEY } from "@/lib/statistics/fetch-statistics";
type ExclusionType = Database["public"]["Enums"]["exclusion_type"];
type ExclusionRow = Database["public"]["Tables"]["agent_exclusions"]["Row"];
type DogSpecialty = Database["public"]["Enums"]["dog_specialty"];

type ExclusionWithAgent = ExclusionRow & {
  agent: {
    id: string;
    first_name: string;
    last_name: string;
    professional_number: string;
    section_id: string | null;
    fonction: string | null;
    photo_url: string | null;
    dog: { id: string; name: string } | null;
  } | null;
  dog: {
    id: string;
    name: string;
    microchip_number: string | null;
    specialty: DogSpecialty | null;
    photo_url: string | null;
  } | null;
};

type DogOption = {
  id: string;
  name: string;
  microchip_number: string | null;
  specialty: DogSpecialty | null;
  gender: Gender | null;
  photo_url: string | null;
  active: boolean;
  agent_id: string | null;
};

type AgentOption = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  active: boolean;
  section_id?: string | null;
  dog_id?: string | null;
  fonction?: string | null;
  photo_url?: string | null;
};

function isPersonnelExclusionRow(row: Pick<ExclusionRow, "exclusion_type">): boolean {
  return isAgentLevelExclusionType(row.exclusion_type);
}

function isDogExclusionRow(row: Pick<ExclusionRow, "exclusion_type">): boolean {
  return isDogLevelExclusionType(row.exclusion_type);
}

/** Fonction label for the personnel combobox (never availability status). */
function personnelSelectorFonctionLabel(
  agent: Pick<AgentOption, "fonction">,
  t: TFunction,
): string {
  const raw = agent.fonction?.trim();
  if (!raw) return t("exclusions.selector.noFonction");
  return t(`personnelFonction.${normalizePersonnelFonction(raw)}`);
}

function personnelSelectorDisplayLabel(
  agent: Pick<AgentOption, "first_name" | "last_name" | "fonction">,
  t: TFunction,
): string {
  return `${agent.first_name} ${agent.last_name} — ${personnelSelectorFonctionLabel(agent, t)}`;
}

function findReplaceablePersonnelExclusion(
  exclusions: ExclusionRow[],
  agentId: string,
  referenceISO: string,
): ExclusionRow | null {
  const coveringToday = exclusions.find(
    (row) =>
      row.agent_id === agentId &&
      isAgentLevelExclusionType(row.exclusion_type) &&
      isAgentExclusionActive(row, referenceISO),
  );
  if (coveringToday) return coveringToday;

  const enabled = exclusions
    .filter(
      (row) =>
        row.agent_id === agentId && row.active && isAgentLevelExclusionType(row.exclusion_type),
    )
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return enabled[0] ?? null;
}

export const Route = createFileRoute("/_authenticated/exclusions")({
  head: () => ({ meta: [{ title: "Exclusions — CynoPlanning" }] }),
  component: ExclusionsPage,
});

/** Official display label for any stored exclusion type (create, edit, table, filters). */
export function exclusionLabel(
  type: ExclusionType | string | null | undefined,
  t: TFunction,
): string {
  if (!type) return "—";
  const key = exclusionTypeI18nKey(type);
  const translated = t(key);
  return translated === key ? String(type) : translated;
}

/** Same official labels as the table — stored type codes are unchanged. */
export function exclusionFormTypeLabel(
  type: ExclusionType | string | null | undefined,
  t: TFunction,
): string {
  return exclusionLabel(type, t);
}

function exclusionSchema(t: TFunction) {
  return z
    .object({
      apply_to: z.enum(["agent", "dog"]),
      agent_id: z.string().nullable(),
      dog_id: z.string().nullable(),
      exclusion_type: z.enum([
        "sickness",
        "annual_leave",
        "administrative_leave",
        "mission",
        "training",
        "rest",
        "dog_sick",
        "female_dog_heat",
        "other",
        "absence",
        "special_leave",
        "suspension",
        "dog_injured",
        "dog_temporary_retirement",
        "dog_vet_visit",
        "dog_without_handler",
        "dog_training",
        "dog_other",
      ]),
      start_date: z.string(),
      end_date: z.string().optional().nullable(),
      duration_days: z.number().int().optional(),
      notes: z.string().max(500).optional().or(z.literal("")),
      active: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (v.apply_to === "agent" && isDogLevelExclusionType(v.exclusion_type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("validation.agentRequired"),
          path: ["exclusion_type"],
        });
      }
      if (v.apply_to === "dog" && !isDogLevelExclusionType(v.exclusion_type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("validation.dogRequired"),
          path: ["exclusion_type"],
        });
      }
      if (isOpenEndedExclusionType(v.exclusion_type)) return;
      const start = v.start_date?.trim() ?? "";
      const end = v.end_date?.trim() ?? "";
      if (start && end && end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("validation.endBeforeStart"),
          path: ["end_date"],
        });
      }
      if (start && end && exclusionDurationDays(start, end) < MIN_EXCLUSION_DURATION_DAYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("validation.durationMin"),
          path: ["duration_days"],
        });
      }
    });
}
type ExclusionForm = z.infer<ReturnType<typeof exclusionSchema>>;

function exclusionListEmptyCopy(
  t: TFunction,
  statusFilter: ExclusionListStatusFilter,
  hasRowsForStatus: boolean,
): { title: string; description?: string } {
  if (hasRowsForStatus) {
    return { title: t("exclusions.empty.noMatch"), description: t("common.tryAdjustFilters") };
  }
  if (statusFilter === "upcoming") {
    return { title: t("exclusions.empty.noneUpcoming") };
  }
  if (statusFilter === "expired") {
    return { title: t("exclusions.empty.noneExpired") };
  }
  if (statusFilter === "all") {
    return {
      title: t("exclusions.empty.noneRecorded"),
      description: t("exclusions.empty.recordFirst"),
    };
  }
  return {
    title: t("exclusions.empty.noneInForce"),
    description: t("exclusions.empty.recordFirst"),
  };
}

const LIST_STATUS_TONE: Record<ExclusionListStatus, StatusTone> = {
  inForce: "success",
  upcoming: "info",
  expired: "neutral",
  inactive: "warning",
};

function formatExclusionEndTableDate(type: string, endDate: string | null | undefined): string {
  if (isOpenEndedExclusionType(type)) return "—";
  return formatExclusionTableDate(endDate);
}

const PAGE_SIZE = 15;

function invalidateExclusionAssignmentQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["exclusions-with-agent"] });
  queryClient.invalidateQueries({ queryKey: ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  queryClient.invalidateQueries({ queryKey: ["operational-summary"] });
  queryClient.invalidateQueries({ queryKey: ["agent-details"] });
  queryClient.invalidateQueries({ queryKey: ["dog-details"] });
  queryClient.invalidateQueries({ queryKey: ["dogs-with-agent"] });
  queryClient.invalidateQueries({ queryKey: ["dogs-basic-exclusions"] });
  queryClient.invalidateQueries({ queryKey: ["dogs"] });
  queryClient.invalidateQueries({ queryKey: ["dogs", "select"] });
  queryClient.invalidateQueries({ queryKey: ["agents-full"] });
  queryClient.invalidateQueries({ queryKey: ["agents-basic"] });
  queryClient.invalidateQueries({ queryKey: ["agents-basic-exclusions"] });
  queryClient.invalidateQueries({ queryKey: [STATISTICS_QUERY_KEY] });
}

function formatExclusionTableDate(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  try {
    const parsed = parseISO(value.slice(0, 10));
    if (Number.isNaN(parsed.getTime())) return "—";
    return format(parsed, "dd/MM/yyyy");
  } catch {
    return "—";
  }
}

function ExclusionsPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.exclusions.title");
  const queryClient = useQueryClient();

  const refreshExclusionNotifications = () => {
    void (async () => {
      try {
        await runExclusionNotificationSync(db);
        invalidateExclusionNotificationQueries(queryClient);
      } catch (error) {
        console.warn("[notifications] exclusions sync failed", error);
      }
    })();
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await runExclusionNotificationSync(db);
        if (!cancelled) invalidateExclusionNotificationQueries(queryClient);
      } catch (error) {
        console.warn("[notifications] exclusions page sync failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient]);
  const [personnelPage, setPersonnelPage] = useState(1);
  const [dogsPage, setDogsPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ExclusionType>("all");
  const [statusFilter, setStatusFilter] = useState<ExclusionListStatusFilter>(
    DEFAULT_EXCLUSION_LIST_STATUS_FILTER,
  );
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<"all" | DogSpecialty>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<ExclusionApplyTarget>("agent");
  const [editing, setEditing] = useState<ExclusionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExclusionWithAgent | null>(null);
  const details = useStatisticDetailsDialog();

  const { data: exclusionSettings } = useQuery({
    queryKey: EXCLUSION_SETTINGS_QUERY_KEY,
    queryFn: () => fetchExclusionSettings(db),
  });
  const creationSettings = exclusionSettings ?? DEFAULT_EXCLUSION_SETTINGS;

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["exclusions-with-agent"],
    queryFn: async (): Promise<ExclusionWithAgent[]> => {
      const expiredCount = await expirePastExclusions(db);
      if (expiredCount > 0) {
        void queryClient.invalidateQueries({ queryKey: ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
        void queryClient.invalidateQueries({ queryKey: ["operational-summary"] });
      }

      const mapRows = (rows: ExclusionRow[]) =>
        rows.map((row: any) => {
          const rawAgent = (row as unknown as { agent: unknown }).agent;
          const agent = Array.isArray(rawAgent) ? (rawAgent[0] ?? null) : (rawAgent ?? null);
          if (agent) {
            const rawDog = (agent as { dog: unknown }).dog;
            (agent as { dog: unknown }).dog = Array.isArray(rawDog)
              ? (rawDog[0] ?? null)
              : (rawDog ?? null);
          }
          const rawTargetDog = (row as unknown as { dog: unknown }).dog;
          const dog = Array.isArray(rawTargetDog)
            ? (rawTargetDog[0] ?? null)
            : (rawTargetDog ?? null);
          return { ...(row as ExclusionRow), agent, dog };
        }) as ExclusionWithAgent[];

      const { data, error } = await db
        .from("agent_exclusions")
        .select(
          "*, agent:agents(id, first_name, last_name, professional_number, section_id, fonction, photo_url, dog:dogs(id, name)), dog:dogs(id, name, microchip_number, specialty, photo_url)",
        )
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
        dog_id: row.dog_id,
        fonction: row.fonction,
        photo_url: row.photo_url,
      }));
    },
  });

  const { data: dogs } = useQuery({
    queryKey: ["dogs-basic-exclusions"],
    queryFn: async (): Promise<DogOption[]> => {
      const rows = await getDogs();
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        microchip_number: row.microchip_number,
        specialty: row.specialty,
        gender: row.gender ?? null,
        photo_url: row.photo_url,
        active: row.active,
        agent_id: row.agent?.id ?? null,
      }));
    },
  });

  const { data: sections } = useQuery({
    queryKey: ["sections-basic"],
    queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
      const { data, error } = await db.from("sections").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const sectionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sections ?? []) map.set(s.id, s.name);
    return map;
  }, [sections]);

  const agentById = useMemo(() => {
    const map = new Map<string, AgentOption>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const dogById = useMemo(() => {
    const map = new Map<string, DogOption>();
    for (const dog of dogs ?? []) map.set(dog.id, dog);
    return map;
  }, [dogs]);

  const specialtyLookups = useMemo(() => ({ agentById, dogById }), [agentById, dogById]);

  const todayISO = todayISODate();

  const dogExclusionStats = useMemo(() => {
    const activeDogRows = (data ?? []).filter(
      (row) => isDogExclusionRow(row) && exclusionListStatus(row, todayISO) === "inForce",
    );
    return {
      rows: activeDogRows,
      ...computeUniqueDogExclusionSpecialtyStats(activeDogRows, specialtyLookups),
    };
  }, [data, specialtyLookups, todayISO]);

  const stats = useMemo(() => {
    const list = (data ?? []).filter((row) => exclusionListStatus(row, todayISO) === "inForce");
    const personnel = list.filter(isPersonnelExclusionRow);
    const dogHeat = list.filter((e) => e.exclusion_type === "female_dog_heat");
    const dogSick = list.filter((e) => e.exclusion_type === "dog_sick");
    return {
      total: list.length,
      list,
      personnel,
      dogHeat,
      dogSick,
      excludedPersonnel: computeExcludedPersonnelCardStats(personnel, specialtyLookups),
      specialty: {
        active: countExclusionCynoSpecialties(list, specialtyLookups),
        dogHeat: countExclusionCynoSpecialties(dogHeat, specialtyLookups),
        dogSick: countExclusionCynoSpecialties(dogSick, specialtyLookups),
      },
    };
  }, [data, specialtyLookups, todayISO]);

  const typeOptions = ALL_EXCLUSION_TYPES;

  const matchesSharedFilters = (e: ExclusionWithAgent) => {
    if (!matchesExclusionListStatusFilter(e, statusFilter, todayISO)) return false;
    if (typeFilter !== "all" && e.exclusion_type !== typeFilter) return false;
    if (dateFilter) {
      const start = e.start_date?.slice(0, 10);
      if (!start || start > dateFilter) return false;
      if (isOpenEndedExclusionType(e.exclusion_type)) return true;
      const end = e.end_date?.slice(0, 10);
      if (!end || dateFilter > end) return false;
    }
    return true;
  };

  const personnelFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (data ?? []).filter((e) => {
      if (!isPersonnelExclusionRow(e)) return false;
      if (!matchesSharedFilters(e)) return false;
      if (sectionFilter !== "all") {
        const sid = e.agent?.section_id ?? null;
        if (sid !== sectionFilter) return false;
      }
      if (q) {
        const hay = e.agent
          ? `${e.agent.first_name} ${e.agent.last_name} ${e.agent.professional_number}`.toLowerCase()
          : "";
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, typeFilter, sectionFilter, dateFilter, statusFilter, todayISO]);

  const dogsFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (data ?? []).filter((e) => {
      if (!isDogExclusionRow(e)) return false;
      if (!matchesSharedFilters(e)) return false;
      if (specialtyFilter !== "all") {
        const specialty = e.dog?.specialty ?? null;
        if (specialty !== specialtyFilter) return false;
      }
      if (q) {
        const hay = e.dog
          ? `${e.dog.name} ${e.dog.microchip_number ?? ""} ${e.dog.id}`.toLowerCase()
          : "";
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, typeFilter, specialtyFilter, dateFilter, statusFilter, todayISO]);

  const hasActiveFilters =
    !!search ||
    typeFilter !== "all" ||
    statusFilter !== DEFAULT_EXCLUSION_LIST_STATUS_FILTER ||
    sectionFilter !== "all" ||
    specialtyFilter !== "all" ||
    !!dateFilter;

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter(DEFAULT_EXCLUSION_LIST_STATUS_FILTER);
    setSectionFilter("all");
    setSpecialtyFilter("all");
    setDateFilter("");
  };

  useEffect(() => {
    setPersonnelPage(1);
    setDogsPage(1);
  }, [search, typeFilter, statusFilter, sectionFilter, specialtyFilter, dateFilter]);

  const personnelRows = useMemo(
    () => paginate(personnelFiltered, personnelPage, PAGE_SIZE),
    [personnelFiltered, personnelPage],
  );
  const dogRows = useMemo(
    () => paginate(dogsFiltered, dogsPage, PAGE_SIZE),
    [dogsFiltered, dogsPage],
  );
  const personnelPageCount = calcTotalPages(personnelFiltered.length, PAGE_SIZE);
  const dogsPageCount = calcTotalPages(dogsFiltered.length, PAGE_SIZE);
  const lastUpdated = formatPageLastUpdated(dataUpdatedAt, locale);

  const upsert = useMutation({
    mutationFn: async (values: ExclusionForm & { id?: string }) => {
      const dogHandlerId =
        values.apply_to === "dog" && values.dog_id
          ? ((dogs ?? []).find((d) => d.id === values.dog_id)?.agent_id ?? null)
          : null;
      const agentId = values.apply_to === "agent" ? values.agent_id : dogHandlerId;
      const dogId = values.apply_to === "dog" ? values.dog_id : null;

      const openEnded = isOpenEndedExclusionType(values.exclusion_type);
      const nextRecord = {
        start_date: values.start_date,
        end_date: openEnded ? null : values.end_date?.trim() || null,
        exclusion_type: values.exclusion_type,
      };

      // Overlap guard: same target type only (agent_id vs dog_id — never via handler↔dog).
      let hasOverlap = false;
      const hasOverlapTarget =
        (values.apply_to === "agent" && Boolean(agentId)) ||
        (values.apply_to === "dog" && Boolean(dogId));
      if (hasOverlapTarget) {
      let overlapQuery = db
        .from("agent_exclusions")
        .select("id, agent_id, dog_id, exclusion_type, start_date, end_date")
        .eq("active", true);
      if (values.apply_to === "agent" && agentId) {
        overlapQuery = overlapQuery.eq("agent_id", agentId);
      } else if (values.apply_to === "dog" && dogId) {
        overlapQuery = overlapQuery.eq("dog_id", dogId);
      }
      if (values.id) overlapQuery.neq("id", values.id);
      const { data: overlaps, error: overlapErr } = await overlapQuery;
      if (overlapErr) throw overlapErr;
      hasOverlap = hasConflictingExistingExclusion(
        {
          applyTo: values.apply_to,
          agentId: values.apply_to === "agent" ? agentId : null,
          dogId: values.apply_to === "dog" ? dogId : null,
          start_date: nextRecord.start_date,
          end_date: nextRecord.end_date,
          exclusion_type: nextRecord.exclusion_type,
        },
        (overlaps ?? []).map((row) => ({
          id: row.id as string,
          agent_id: (row.agent_id as string | null) ?? null,
          dog_id: (row.dog_id as string | null) ?? null,
          exclusion_type: row.exclusion_type as string,
          start_date: row.start_date as string,
          end_date: (row.end_date as string | null) ?? null,
        })),
      );
      }
      if (hasOverlap) {
        throw new Error(t("exclusions.error.overlap"));
      }

      if (
        !values.id &&
        !isExclusionTypeEnabledForCreation(values.exclusion_type, creationSettings)
      ) {
        throw new Error(t("exclusions.error.typeDisabled"));
      }

      const payload = {
        agent_id: agentId,
        dog_id: dogId,
        exclusion_type: values.exclusion_type,
        start_date: values.start_date,
        end_date: nextRecord.end_date,
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
      if (!vars.id && isUpcomingExclusionStart(vars.start_date, todayISODate())) {
        toast.success(t("exclusions.toast.createdUpcoming"), {
          description: t("exclusions.toast.createdUpcomingHint", {
            date: formatExclusionTableDate(vars.start_date),
          }),
        });
      } else {
        toast.success(vars.id ? t("exclusions.toast.updated") : t("exclusions.toast.created"));
      }
      setDialogOpen(false);
      setEditing(null);
      invalidateExclusionAssignmentQueries(queryClient);
      refreshExclusionNotifications();
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
      invalidateExclusionAssignmentQueries(queryClient);
      refreshExclusionNotifications();
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
      invalidateExclusionAssignmentQueries(queryClient);
      refreshExclusionNotifications();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = (target: ExclusionApplyTarget = "agent") => {
    setEditing(null);
    setCreateTarget(target);
    setDialogOpen(true);
  };
  const openEdit = (e: ExclusionRow) => {
    setEditing(e);
    setCreateTarget(exclusionApplyTarget(e.exclusion_type, e.dog_id));
    setDialogOpen(true);
  };

  const actionsColumn = useMemo<ColumnDef<ExclusionWithAgent>>(
    () => ({
      id: "actions",
      header: () => <span className="sr-only">{t("common.actions")}</span>,
      meta: { width: "72px", sticky: "right" },
      cell: ({ row }) => {
        const e = row.original;
        return (
          <RowActionButtons
            editLabel={t("aria.edit")}
            deleteLabel={t("aria.delete")}
            onEdit={() => openEdit(e)}
            onDelete={() => setDeleteTarget(e)}
          />
        );
      },
    }),
    [t],
  );

  const personnelColumns = useMemo<ColumnDef<ExclusionWithAgent>[]>(
    () => [
      {
        id: "photo",
        header: t("exclusions.table.photo"),
        meta: { width: "56px" },
        cell: ({ row }) => {
          const agent = row.original.agent;
          if (!agent) return <span className="text-muted-foreground">—</span>;
          return (
            <AgentAvatar
              firstName={agent.first_name}
              lastName={agent.last_name}
              photoUrl={agent.photo_url}
              className="h-8 w-8"
            />
          );
        },
      },
      {
        id: "fullName",
        header: t("exclusions.table.fullName"),
        meta: { width: "14%" },
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
        id: "fonction",
        header: t("employees.field.fonction"),
        meta: { width: "11%" },
        cell: ({ row }) => {
          const fonction = normalizePersonnelFonction(row.original.agent?.fonction);
          const label = t(`personnelFonction.${fonction}`);
          return (
            <CellTooltip label={label}>
              <span className="truncate text-sm">{label}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "section",
        header: t("field.section"),
        meta: { width: "10%" },
        cell: ({ row }) => {
          const sid = row.original.agent?.section_id;
          const name = sid ? (sectionNameById.get(sid) ?? "—") : "—";
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
        meta: { width: "12%" },
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
        meta: { width: "9%" },
        cell: ({ row }) => {
          const d = formatExclusionTableDate(row.original.start_date);
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
        meta: { width: "9%" },
        cell: ({ row }) => {
          const d = formatExclusionEndTableDate(row.original.exclusion_type, row.original.end_date);
          return (
            <CellTooltip label={d}>
              <span className="truncate text-xs text-muted-foreground">{d}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "status",
        header: t("common.status"),
        meta: { width: "9%" },
        cell: ({ row }) => {
          const status = exclusionListStatus(row.original, todayISO);
          const label = t(`exclusions.listStatus.${status}`);
          return (
            <CellTooltip label={label}>
              <StatusBadge tone={LIST_STATUS_TONE[status]} className="max-w-full truncate">
                {label}
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "notes",
        header: t("common.notes"),
        meta: { width: "12%" },
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
      actionsColumn,
    ],
    [t, sectionNameById, actionsColumn, todayISO],
  );

  const dogColumns = useMemo<ColumnDef<ExclusionWithAgent>[]>(
    () => [
      {
        id: "photo",
        header: t("exclusions.table.dogPhoto"),
        meta: { width: "56px" },
        cell: ({ row }) => {
          const dog = row.original.dog;
          if (!dog) return <span className="text-muted-foreground">—</span>;
          return (
            <DogAvatar
              name={dog.name}
              photoUrl={dog.photo_url}
              specialty={dog.specialty}
              className="h-8 w-8"
            />
          );
        },
      },
      {
        id: "dogName",
        header: t("exclusions.table.dogName"),
        meta: { width: "12%" },
        cell: ({ row }) => {
          const name = row.original.dog?.name;
          if (!name) return <span className="text-muted-foreground">—</span>;
          return (
            <CellTooltip label={name}>
              <span className="truncate text-sm font-medium">{name}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "dogId",
        header: t("exclusions.table.dogId"),
        meta: { width: "12%" },
        cell: ({ row }) => {
          const id = row.original.dog?.microchip_number || row.original.dog?.id || "—";
          return (
            <CellTooltip label={id}>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{id}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "specialty",
        header: t("field.specialty"),
        meta: { width: "11%" },
        cell: ({ row }) => {
          const specialty = row.original.dog?.specialty;
          if (!specialty) return <span className="text-muted-foreground">—</span>;
          const label = t(`specialty.${specialty}`);
          return (
            <CellTooltip label={label}>
              <span className="truncate text-sm">{label}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "handler",
        header: t("exclusions.table.assignedAgent"),
        meta: { width: "13%" },
        cell: ({ row }) => {
          const agent =
            row.original.agent ??
            (row.original.agent_id ? (agentById.get(row.original.agent_id) ?? null) : null);
          if (!agent) return <span className="text-muted-foreground">—</span>;
          const name = `${agent.first_name} ${agent.last_name}`;
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
        meta: { width: "12%" },
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
        meta: { width: "9%" },
        cell: ({ row }) => {
          const d = formatExclusionTableDate(row.original.start_date);
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
        meta: { width: "9%" },
        cell: ({ row }) => {
          const d = formatExclusionEndTableDate(row.original.exclusion_type, row.original.end_date);
          return (
            <CellTooltip label={d}>
              <span className="truncate text-xs text-muted-foreground">{d}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "status",
        header: t("common.status"),
        meta: { width: "9%" },
        cell: ({ row }) => {
          const status = exclusionListStatus(row.original, todayISO);
          const label = t(`exclusions.listStatus.${status}`);
          return (
            <CellTooltip label={label}>
              <StatusBadge tone={LIST_STATUS_TONE[status]} className="max-w-full truncate">
                {label}
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "notes",
        header: t("common.notes"),
        meta: { width: "11%" },
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
      actionsColumn,
    ],
    [t, agentById, actionsColumn, todayISO],
  );

  const filterTriggerClass =
    "h-10 min-w-[140px] rounded-xl border-[#E5E7EB] bg-white px-3 text-[13px] shadow-none";

  const showExclusions = (title: string, rows: ExclusionWithAgent[]) => {
    details.showDetails({
      title,
      columns: exclusionStatisticColumns(t),
      rows: mapExclusionDetailRows(rows, t, todayISODate()),
    });
  };

  return (
    <div className="space-y-4">
      <PageTitle
        icon={UserX}
        title={t("exclusions.title")}
        description={t("exclusions.description")}
        loading={isLoading}
        meta={[pageHeroLastUpdatedMeta(t("common.page.lastUpdated"), lastUpdated)]}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          variant="minimal"
          icon={Activity}
          label={t("exclusions.stat.active")}
          value={stats.total}
          accent="primary"
          loading={isLoading}
          onDetailsClick={() => showExclusions(t("exclusions.stat.active"), stats.list)}
          footer={
            <SpecialtyBreakdownLines
              specialty={stats.specialty.active}
              loading={isLoading}
              onNarcoticsClick={() =>
                showExclusions(
                  `${t("exclusions.stat.active")} — ${t("specialty.narcotics")}`,
                  listExclusionRowsByCynoSpecialty(stats.list, specialtyLookups, "narcotics"),
                )
              }
              onExplosivesClick={() =>
                showExclusions(
                  `${t("exclusions.stat.active")} — ${t("specialty.explosives")}`,
                  listExclusionRowsByCynoSpecialty(stats.list, specialtyLookups, "explosives"),
                )
              }
            />
          }
        />
        <KpiCard
          variant="minimal"
          icon={HeartPulse}
          label={t("exclusions.stat.sickAgents")}
          value={stats.excludedPersonnel.total}
          accent="primary"
          loading={isLoading}
          onDetailsClick={() =>
            showExclusions(
              t("exclusions.stat.sickAgents"),
              listExcludedPersonnelRows(stats.personnel, specialtyLookups),
            )
          }
          footer={
            <SpecialtyBreakdownLines
              specialty={stats.excludedPersonnel}
              administrative={stats.excludedPersonnel.administrative}
              explosivesFirst
              loading={isLoading}
              onNarcoticsClick={() =>
                showExclusions(
                  `${t("exclusions.stat.sickAgents")} — ${t("specialty.narcotics")}`,
                  listExcludedPersonnelRows(stats.personnel, specialtyLookups, "narcotics"),
                )
              }
              onExplosivesClick={() =>
                showExclusions(
                  `${t("exclusions.stat.sickAgents")} — ${t("specialty.explosives")}`,
                  listExcludedPersonnelRows(stats.personnel, specialtyLookups, "explosives"),
                )
              }
              onAdministrativeClick={() =>
                showExclusions(
                  `${t("exclusions.stat.sickAgents")} — ${t("employees.stat.administrative")}`,
                  listExcludedPersonnelRows(stats.personnel, specialtyLookups, "administrative"),
                )
              }
            />
          }
        />
        <KpiCard
          variant="minimal"
          icon={Flame}
          label={t("exclusions.stat.dogsInHeat")}
          value={stats.dogHeat.length}
          accent="primary"
          loading={isLoading}
          onDetailsClick={() => showExclusions(t("exclusions.stat.dogsInHeat"), stats.dogHeat)}
          footer={
            <SpecialtyBreakdownLines
              specialty={stats.specialty.dogHeat}
              loading={isLoading}
              onNarcoticsClick={() =>
                showExclusions(
                  `${t("exclusions.stat.dogsInHeat")} — ${t("specialty.narcotics")}`,
                  listExclusionRowsByCynoSpecialty(stats.dogHeat, specialtyLookups, "narcotics"),
                )
              }
              onExplosivesClick={() =>
                showExclusions(
                  `${t("exclusions.stat.dogsInHeat")} — ${t("specialty.explosives")}`,
                  listExclusionRowsByCynoSpecialty(stats.dogHeat, specialtyLookups, "explosives"),
                )
              }
            />
          }
        />
        <KpiCard
          variant="minimal"
          icon={Stethoscope}
          label={t("exclusions.stat.sickDogs")}
          value={stats.dogSick.length}
          accent="primary"
          loading={isLoading}
          onDetailsClick={() => showExclusions(t("exclusions.stat.sickDogs"), stats.dogSick)}
          footer={
            <SpecialtyBreakdownLines
              specialty={stats.specialty.dogSick}
              loading={isLoading}
              onNarcoticsClick={() =>
                showExclusions(
                  `${t("exclusions.stat.sickDogs")} — ${t("specialty.narcotics")}`,
                  listExclusionRowsByCynoSpecialty(stats.dogSick, specialtyLookups, "narcotics"),
                )
              }
              onExplosivesClick={() =>
                showExclusions(
                  `${t("exclusions.stat.sickDogs")} — ${t("specialty.explosives")}`,
                  listExclusionRowsByCynoSpecialty(stats.dogSick, specialtyLookups, "explosives"),
                )
              }
            />
          }
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          {t("exclusions.stat.dogBySpecialty")}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <KpiCard
            variant="minimal"
            icon={Pill}
            label={`🐕 ${t("dogs.stat.narcotics")}`}
            value={dogExclusionStats.narcotics}
            accent="warning"
            loading={isLoading}
            onDetailsClick={() =>
              showExclusions(
                t("dogs.stat.narcotics"),
                listUniqueExcludedDogRows(dogExclusionStats.rows, specialtyLookups, "narcotics"),
              )
            }
          />
          <KpiCard
            variant="minimal"
            icon={Bomb}
            label={`💣 ${t("dogs.stat.explosives")}`}
            value={dogExclusionStats.explosives}
            accent="danger"
            loading={isLoading}
            onDetailsClick={() =>
              showExclusions(
                t("dogs.stat.explosives"),
                listUniqueExcludedDogRows(dogExclusionStats.rows, specialtyLookups, "explosives"),
              )
            }
          />
          <KpiCard
            variant="minimal"
            icon={DogIcon}
            label={t("exclusions.stat.excludedDogsTotal")}
            value={dogExclusionStats.total}
            accent="primary"
            loading={isLoading}
            className="col-span-2 md:col-span-1"
            onDetailsClick={() =>
              showExclusions(
                t("exclusions.stat.excludedDogsTotal"),
                listUniqueExcludedDogRows(dogExclusionStats.rows, specialtyLookups),
              )
            }
            footer={
              <SpecialtyBreakdownLines
                specialty={dogExclusionStats}
                loading={isLoading}
                onNarcoticsClick={() =>
                  showExclusions(
                    `${t("exclusions.stat.excludedDogsTotal")} — ${t("specialty.narcotics")}`,
                    listUniqueExcludedDogRows(
                      dogExclusionStats.rows,
                      specialtyLookups,
                      "narcotics",
                    ),
                  )
                }
                onExplosivesClick={() =>
                  showExclusions(
                    `${t("exclusions.stat.excludedDogsTotal")} — ${t("specialty.explosives")}`,
                    listUniqueExcludedDogRows(
                      dogExclusionStats.rows,
                      specialtyLookups,
                      "explosives",
                    ),
                  )
                }
              />
            }
          />
        </div>
      </section>

      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-none",
          "lg:flex-row lg:items-center lg:gap-3",
        )}
      >
        <SearchField
          className="min-w-0 flex-1 [&_input]:h-10 [&_input]:rounded-xl [&_input]:border-[#E5E7EB] [&_input]:shadow-none"
          placeholder={t("exclusions.search")}
          value={search}
          onChange={setSearch}
        />
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <FilterSelectTrigger className={filterTriggerClass}>
              <SelectValue placeholder={t("exclusions.filter.reason")} />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("exclusions.filter.allReasons")}</SelectItem>
              {typeOptions.map((type) => (
                <SelectItem key={type} value={type}>
                  {exclusionLabel(type, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as ExclusionListStatusFilter)}
          >
            <FilterSelectTrigger className={filterTriggerClass}>
              <SelectValue placeholder={t("exclusions.filter.status")} />
            </FilterSelectTrigger>
            <SelectContent>
              {EXCLUSION_LIST_STATUS_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`exclusions.filter.statusOption.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-10 w-[150px] rounded-xl border-[#E5E7EB] text-[13px] shadow-none"
            aria-label={t("exclusions.filter.date")}
          />
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <FilterSelectTrigger className={filterTriggerClass}>
              <SelectValue placeholder={t("field.section")} />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allSections")}</SelectItem>
              {sections?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={specialtyFilter}
            onValueChange={(v) => setSpecialtyFilter(v as typeof specialtyFilter)}
          >
            <FilterSelectTrigger className={filterTriggerClass}>
              <SelectValue placeholder={t("field.specialty")} />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("specialty.all")}</SelectItem>
              <SelectItem value="narcotics">{t("specialty.narcotics")}</SelectItem>
              <SelectItem value="explosives">{t("specialty.explosives")}</SelectItem>
              <SelectItem value="currency">{t("operationalCases.specialty.currency")}</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-10 shrink-0"
              onClick={resetFilters}
            >
              {t("common.page.filterReset")}
            </Button>
          ) : null}
        </div>
      </div>

      <ExclusionSectionCard
        icon={Users}
        title={t("exclusions.sections.personnel")}
        count={personnelFiltered.length}
        addLabel={t("exclusions.new")}
        onAdd={() => openCreate("agent")}
        footer={
          !isLoading ? (
            <PageTablePagination
              showingLabel={t("common.page.showing", {
                displayed: personnelRows.length,
                total: personnelFiltered.length,
              })}
              page={personnelPage}
              totalPages={personnelPageCount}
              onPageChange={setPersonnelPage}
              prevLabel={t("common.page.prev")}
              nextLabel={t("common.page.next")}
            />
          ) : undefined
        }
      >
        <TableTooltipProvider>
          <DataTableShell isLoading={isLoading} loadingRows={4}>
            <EnterpriseDataTable
              data={personnelRows}
              columns={personnelColumns}
              getRowId={(row) => row.id}
              layout="fixed"
              density="dense"
              zebraStriping
              responsiveScroll
              emptyState={
                <EmptyState
                  compact
                  icon={Users}
                  {...exclusionListEmptyCopy(
                    t,
                    statusFilter,
                    (data ?? []).some(
                      (row) =>
                        isPersonnelExclusionRow(row) &&
                        matchesExclusionListStatusFilter(row, statusFilter, todayISO),
                    ),
                  )}
                />
              }
            />
          </DataTableShell>
        </TableTooltipProvider>
      </ExclusionSectionCard>

      <ExclusionSectionCard
        icon={DogIcon}
        title={t("exclusions.sections.dogs")}
        count={dogsFiltered.length}
        addLabel={t("exclusions.new")}
        onAdd={() => openCreate("dog")}
        footer={
          !isLoading ? (
            <PageTablePagination
              showingLabel={t("common.page.showing", {
                displayed: dogRows.length,
                total: dogsFiltered.length,
              })}
              page={dogsPage}
              totalPages={dogsPageCount}
              onPageChange={setDogsPage}
              prevLabel={t("common.page.prev")}
              nextLabel={t("common.page.next")}
            />
          ) : undefined
        }
      >
        <TableTooltipProvider>
          <DataTableShell isLoading={isLoading} loadingRows={4}>
            <EnterpriseDataTable
              data={dogRows}
              columns={dogColumns}
              getRowId={(row) => row.id}
              layout="fixed"
              density="dense"
              zebraStriping
              responsiveScroll
              emptyState={
                <EmptyState
                  compact
                  icon={DogIcon}
                  {...exclusionListEmptyCopy(
                    t,
                    statusFilter,
                    (data ?? []).some(
                      (row) =>
                        isDogExclusionRow(row) &&
                        matchesExclusionListStatusFilter(row, statusFilter, todayISO),
                    ),
                  )}
                />
              }
            />
          </DataTableShell>
        </TableTooltipProvider>
      </ExclusionSectionCard>

      <ExclusionDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        initial={editing}
        defaultApplyTo={createTarget}
        agents={agents ?? []}
        dogs={dogs ?? []}
        sectionNameById={sectionNameById}
        exclusions={data ?? []}
        exclusionSettings={creationSettings}
        onSubmit={(v) => upsert.mutate(v)}
        submitting={upsert.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("exclusions.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("exclusions.delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || remove.isPending}
              onClick={(evt) => {
                evt.preventDefault();
                if (deleteTarget) remove.mutate(deleteTarget);
              }}
              className={buttonVariants({ variant: "danger" })}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <StatisticDetailsDialog
        open={details.open}
        onOpenChange={details.onOpenChange}
        payload={details.payload}
      />
    </div>
  );
}

function ExclusionSectionCard({
  icon: Icon,
  title,
  count,
  addLabel,
  onAdd,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5F9] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#023A84]/10 text-[#023A84]">
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <h2 className="truncate text-xl font-semibold tracking-tight text-[#0F172A]">{title}</h2>
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#F1F5F9] px-2 text-[12px] font-semibold tabular-nums text-[#374151]">
            {count}
          </span>
        </div>
        <Button type="button" size="sm" onClick={onAdd} className="shrink-0">
          <Plus />
          {addLabel}
        </Button>
      </div>
      <div className="min-h-0">{children}</div>
      {footer ? <div className="border-t border-[#F1F5F9] px-4 py-2.5">{footer}</div> : null}
    </section>
  );
}

function ExclusionDialog({
  open,
  onOpenChange,
  initial,
  defaultApplyTo = "agent",
  agents,
  dogs,
  sectionNameById,
  exclusions,
  exclusionSettings = DEFAULT_EXCLUSION_SETTINGS,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ExclusionRow | null;
  defaultApplyTo?: ExclusionApplyTarget;
  agents: AgentOption[];
  dogs: DogOption[];
  /** Live section names from the Sections table (id → name). */
  sectionNameById: Map<string, string>;
  exclusions: ExclusionRow[];
  exclusionSettings?: ExclusionSettings;
  onSubmit: (v: ExclusionForm & { id?: string }) => void;
  submitting: boolean;
}) {
  const { t, locale } = useI18n();
  const today = format(new Date(), "yyyy-MM-dd");
  const statusReferenceISO = todayISODate();
  const [applyTo, setApplyTo] = useState<ExclusionApplyTarget>("agent");
  const [agentId, setAgentId] = useState("");
  const [dogId, setDogId] = useState("");
  const [type, setType] = useState<ExclusionType>("sickness");
  const [start, setStart] = useState(today);
  const [duration, setDuration] = useState(MIN_EXCLUSION_DURATION_DAYS);
  const [end, setEnd] = useState(today);
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agentOpen, setAgentOpen] = useState(false);
  const [dogOpen, setDogOpen] = useState(false);
  /** When set, submit updates this exclusion (selecting an already-excluded person). */
  const [replaceId, setReplaceId] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      const openEnded = initial ? isOpenEndedExclusionType(initial.exclusion_type) : false;
      const startDate = initial?.start_date ?? today;
      const endDate = openEnded ? "" : (initial?.end_date ?? today);
      const initialDuration = endDate
        ? exclusionDurationDays(startDate, endDate)
        : MIN_EXCLUSION_DURATION_DAYS;
      const target = initial
        ? exclusionApplyTarget(initial.exclusion_type, initial.dog_id)
        : defaultApplyTo;
      setApplyTo(target);
      setAgentId(initial?.agent_id ?? "");
      setDogId(initial?.dog_id ?? "");
      setType(
        initial?.exclusion_type ??
          defaultExclusionFormType(
            target === "dog" ? DOG_EXCLUSION_FORM_TYPES : PERSONNEL_EXCLUSION_FORM_TYPES,
            exclusionSettings,
            target === "dog" ? "dog_sick" : "sickness",
          ),
      );
      setStart(startDate);
      setDuration(initialDuration);
      setEnd(endDate);
      setNotes(initial?.notes ?? "");
      setActive(initial?.active ?? true);
      setReplaceId(initial?.id);
      setErrors({});
      setAgentOpen(false);
      setDogOpen(false);
    }
  }, [open, initial, today, defaultApplyTo, exclusionSettings]);

  const handleApplyToChange = (next: ExclusionApplyTarget) => {
    setApplyTo(next);
    setErrors({});
    if (next === "agent") {
      setDogId("");
      setType(
        defaultExclusionFormType(PERSONNEL_EXCLUSION_FORM_TYPES, exclusionSettings, "sickness"),
      );
    } else {
      setAgentId("");
      setType(defaultExclusionFormType(DOG_EXCLUSION_FORM_TYPES, exclusionSettings, "dog_sick"));
    }
  };

  const handleStartChange = (value: string) => {
    setStart(value);
    if (!isOpenEndedExclusionType(type)) {
      setEnd(exclusionEndFromDuration(value, duration));
    }
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

  const openEnded = isOpenEndedExclusionType(type);
  const datesValid = openEnded
    ? Boolean(start)
    : Boolean(start && end) && end >= start && duration >= MIN_EXCLUSION_DURATION_DAYS;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = exclusionSchema(t).safeParse({
      apply_to: applyTo,
      agent_id: applyTo === "agent" ? agentId || null : null,
      dog_id: applyTo === "dog" ? dogId || null : null,
      exclusion_type: type,
      start_date: start,
      end_date: isOpenEndedExclusionType(type) ? null : end,
      duration_days: isOpenEndedExclusionType(type) ? undefined : duration,
      notes,
      active,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[issue.path.join(".")] = issue.message;
      setErrors(errs);
      return;
    }
    onSubmit({ ...parsed.data, id: replaceId });
  };

  const loadPersonnelExclusionIntoForm = (row: ExclusionRow) => {
    const openEnded = isOpenEndedExclusionType(row.exclusion_type);
    const startDate = row.start_date;
    const endDate = openEnded ? "" : (row.end_date ?? "");
    setReplaceId(row.id);
    setApplyTo("agent");
    setAgentId(row.agent_id ?? "");
    setDogId("");
    setType(row.exclusion_type);
    setStart(startDate);
    setDuration(endDate ? exclusionDurationDays(startDate, endDate) : MIN_EXCLUSION_DURATION_DAYS);
    setEnd(endDate);
    setNotes(row.notes ?? "");
    setActive(row.active);
    setErrors({});
  };

  const handleSelectAgent = (id: string) => {
    setAgentId(id);
    setAgentOpen(false);
    const existing = findReplaceablePersonnelExclusion(exclusions, id, statusReferenceISO);
    if (existing) {
      loadPersonnelExclusionIntoForm(existing);
      return;
    }
    // New exclusion for this person — do not keep a previous replace target.
    if (!initial || initial.agent_id !== id) {
      setReplaceId(undefined);
    }
  };

  // All personnel — no active/availability filter.
  const allAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const byLast = a.last_name.localeCompare(b.last_name, locale);
        if (byLast !== 0) return byLast;
        return a.first_name.localeCompare(b.first_name, locale);
      }),
    [agents, locale],
  );
  const activeDogs = dogs.filter((d) => d.active || d.id === initial?.dog_id);
  const selectableDogs =
    type === "female_dog_heat" ? activeDogs.filter((d) => d.gender === "female") : activeDogs;
  const selectedAgent = allAgents.find((a) => a.id === agentId);
  const selectedDog = activeDogs.find((d) => d.id === dogId);
  const typeOptions = availableExclusionFormTypes(
    applyTo === "dog" ? DOG_EXCLUSION_FORM_TYPES : PERSONNEL_EXCLUSION_FORM_TYPES,
    exclusionSettings,
    initial?.exclusion_type,
  );

  useEffect(() => {
    if (type !== "female_dog_heat" || !dogId) return;
    const selected = dogs.find((d) => d.id === dogId);
    if (selected?.gender !== "female") setDogId("");
  }, [type, dogId, dogs]);
  const selectedAgentLabel = selectedAgent ? personnelSelectorDisplayLabel(selectedAgent, t) : null;

  /** Section of the selected agent, or of the dog's assigned handler — read-only info. */
  const selectedSectionDisplay = useMemo(() => {
    const none = t("exclusions.field.noSection");
    if (applyTo === "agent") {
      if (!selectedAgent) return null;
      const sid = selectedAgent.section_id ?? null;
      return sid ? (sectionNameById.get(sid) ?? none) : none;
    }
    if (!selectedDog) return null;
    const handler =
      allAgents.find((a) => a.id === selectedDog.agent_id) ??
      allAgents.find((a) => a.dog_id === selectedDog.id);
    const sid = handler?.section_id ?? null;
    return sid ? (sectionNameById.get(sid) ?? none) : none;
  }, [applyTo, selectedAgent, selectedDog, allAgents, sectionNameById, t]);

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
          {!openEnded ? (
            <>
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
            </>
          ) : null}
          {applyTo === "agent" && selectedAgent && selectedAgentLabel ? (
            <div className="border-t border-border/60 pt-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("exclusions.field.agent")}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
                {selectedAgentLabel}
              </dd>
            </div>
          ) : null}
          {applyTo === "dog" && selectedDog ? (
            <div className="border-t border-border/60 pt-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("exclusions.field.dog")}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
                {selectedDog.name}
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
                  <ExclusionFormField label={t("exclusions.field.applyTo")}>
                    <Select
                      value={applyTo}
                      onValueChange={(v) => handleApplyToChange(v as ExclusionApplyTarget)}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agent">{t("exclusions.applyTo.agent")}</SelectItem>
                        <SelectItem value="dog">{t("exclusions.applyTo.dog")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </ExclusionFormField>

                  <ExclusionFormField label={t("exclusions.field.exclusionType")}>
                    {typeOptions.length === 0 ? (
                      <p className="rounded-[var(--radius)] border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {t("exclusions.form.noTypesAvailable")}
                      </p>
                    ) : (
                      <Select
                        value={type}
                        onValueChange={(v) => {
                          const nextType = v as ExclusionType;
                          setType(nextType);
                          if (nextType === "female_dog_heat" && dogId) {
                            const selected = dogs.find((d) => d.id === dogId);
                            if (selected?.gender !== "female") setDogId("");
                          }
                          if (!isOpenEndedExclusionType(nextType) && start) {
                            const days =
                              duration >= MIN_EXCLUSION_DURATION_DAYS
                                ? duration
                                : MIN_EXCLUSION_DURATION_DAYS;
                            setDuration(days);
                            setEnd(exclusionEndFromDuration(start, days));
                          }
                        }}
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {typeOptions.map((exType) => (
                            <SelectItem key={exType} value={exType}>
                              {exclusionFormTypeLabel(exType, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </ExclusionFormField>
                </div>

                {applyTo === "agent" ? (
                  <ExclusionFormField
                    label={t("exclusions.field.agent")}
                    error={errors.agent_id}
                  >
                    <Popover open={agentOpen} onOpenChange={setAgentOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={agentOpen}
                          className="h-10 w-full justify-between font-normal"
                        >
                          <span className="truncate">
                            {selectedAgentLabel ?? t("exclusions.selectAgent")}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                        align="start"
                      >
                        <Command>
                          <CommandInput placeholder={t("exclusions.searchAgent")} />
                          <CommandList>
                            <CommandEmpty>{t("exclusions.noAgentMatch")}</CommandEmpty>
                            <CommandGroup>
                              {allAgents.map((a) => {
                                const fonctionLabel = personnelSelectorFonctionLabel(a, t);
                                const displayLabel = personnelSelectorDisplayLabel(a, t);
                                return (
                                  <CommandItem
                                    key={a.id}
                                    value={`${a.first_name} ${a.last_name} ${a.professional_number} ${fonctionLabel}`}
                                    onSelect={() => handleSelectAgent(a.id)}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        agentId === a.id ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    <span className="truncate">{displayLabel}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </ExclusionFormField>
                ) : (
                  <ExclusionFormField
                    label={t("exclusions.field.dog")}
                    error={errors.dog_id}
                  >
                    <Popover open={dogOpen} onOpenChange={setDogOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={dogOpen}
                          className="h-10 w-full justify-between font-normal"
                        >
                          <span className="truncate">
                            {selectedDog
                              ? `${selectedDog.name}${selectedDog.microchip_number ? ` — ${selectedDog.microchip_number}` : ""}`
                              : t("exclusions.selectDog")}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                        align="start"
                      >
                        <Command>
                          <CommandInput placeholder={t("exclusions.searchDog")} />
                          <CommandList>
                            <CommandEmpty>
                              {type === "female_dog_heat"
                                ? t("exclusions.noFemaleDogAvailable")
                                : t("exclusions.noDogMatch")}
                            </CommandEmpty>
                            <CommandGroup>
                              {selectableDogs.map((d) => (
                                <CommandItem
                                  key={d.id}
                                  value={`${d.name} ${d.microchip_number ?? ""} ${d.id}`}
                                  onSelect={() => {
                                    setDogId(d.id);
                                    setDogOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      dogId === d.id ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  {d.name}
                                  {d.microchip_number ? ` — ${d.microchip_number}` : ""}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </ExclusionFormField>
                )}

                {selectedSectionDisplay != null ? (
                  <ExclusionFormField
                    label={
                      applyTo === "agent"
                        ? t("exclusions.field.section")
                        : t("exclusions.field.dogSection")
                    }
                  >
                    <div
                      className="flex h-10 items-center rounded-lg border border-border/70 bg-muted/40 px-3 text-sm font-medium text-foreground shadow-sm"
                      aria-live="polite"
                    >
                      <span className="truncate">{selectedSectionDisplay}</span>
                    </div>
                  </ExclusionFormField>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <ExclusionFormField
                    label={t("field.startDate")}
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

                  {!openEnded ? (
                    <ExclusionFormField
                      label={t("exclusions.field.durationDays")}
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
                  ) : (
                    <ExclusionFormField label={t("exclusions.table.enabled")}>
                      <div className="flex h-10 items-center justify-between rounded-lg border border-border/70 bg-background px-3 shadow-sm">
                        <span className="text-sm text-foreground">
                          {t("exclusions.table.enabled")}
                        </span>
                        <Switch
                          id="exclusion-active-open-ended"
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
                  )}
                </div>

                {!openEnded ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ExclusionFormField
                      label={t("exclusions.field.endDateCalculated")}
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
                        <span className="text-sm text-foreground">
                          {t("exclusions.table.enabled")}
                        </span>
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
                ) : null}

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
            <Button type="submit" disabled={submitting || (!initial && typeOptions.length === 0)}>
              {submitting
                ? t("action.saving")
                : initial
                  ? t("action.saveChanges")
                  : t("exclusions.submit.create")}
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
  if (!data?.length)
    return <p className="text-sm text-muted-foreground">{t("exclusions.history.empty")}</p>;

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
                <TableCell className="text-muted-foreground">
                  {formatExclusionTableDate(e.start_date)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatExclusionEndTableDate(e.exclusion_type, e.end_date)}
                </TableCell>
                <TableCell>
                  <Badge variant={active ? "default" : "secondary"}>
                    {active ? t("status.active") : t("status.expired")}
                  </Badge>
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
