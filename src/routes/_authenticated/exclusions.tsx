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
  ALL_EXCLUSION_TYPES,
  DOG_EXCLUSION_FORM_TYPES,
  PERSONNEL_EXCLUSION_FORM_TYPES,
  deleteAgentExclusion,
  exclusionApplyTarget,
  exclusionCalendarStatus,
  fetchAgentExclusionHistory,
  isAgentExclusionActive,
  isAgentLevelExclusionType,
  isDogLevelExclusionType,
  todayISODate,
  type ExclusionApplyTarget,
  type ExclusionCalendarStatus,
} from "@/lib/agent-exclusions";
import { normalizePersonnelFonction } from "@/lib/personnel-fonction";
import {
  UserX, Plus, Pencil, Trash2, Activity, HeartPulse,
  CalendarOff, Flame, Stethoscope, CalendarRange, ChevronsUpDown, Check, Dog as DogIcon, Users,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { getAgents, getDogs } from "@/integrations/database";
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
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { DogAvatar } from "@/components/dogs/dog-avatar";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Database } from "@/integrations/database/schema-types";

type ExclusionType = Database["public"]["Enums"]["exclusion_type"];
type ExclusionRow = Database["public"]["Tables"]["agent_exclusions"]["Row"];
type DogSpecialty = Database["public"]["Enums"]["dog_specialty"];

type ExclusionTab = "all" | "personnel" | "dogs";

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

/** Status label for the personnel combobox — never hides anyone. */
function personnelSelectorStatus(
  agent: Pick<AgentOption, "id" | "active">,
  exclusions: ExclusionRow[],
  referenceISO: string,
  t: TFunction,
): string {
  if (!agent.active) return t("common.inactive");

  const activeExclusion = exclusions.find(
    (row) =>
      row.agent_id === agent.id &&
      isAgentLevelExclusionType(row.exclusion_type) &&
      isAgentExclusionActive(row, referenceISO),
  );
  if (activeExclusion) {
    return exclusionLabel(activeExclusion.exclusion_type, t);
  }
  return t("employees.operationalStatus.available");
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
        row.agent_id === agentId &&
        row.active &&
        isAgentLevelExclusionType(row.exclusion_type),
    )
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return enabled[0] ?? null;
}

export const Route = createFileRoute("/_authenticated/exclusions")({
  head: () => ({ meta: [{ title: "Exclusions — Smart K9 Planning" }] }),
  component: ExclusionsPage,
});

export function exclusionLabel(type: ExclusionType, t: TFunction): string {
  return t(`exclusions.type.${type}`);
}

function exclusionSchema(t: TFunction) {
  return z
    .object({
      apply_to: z.enum(["agent", "dog"]),
      agent_id: z.string().nullable(),
      dog_id: z.string().nullable(),
      exclusion_type: z.enum([
        "sickness", "annual_leave", "administrative_leave", "mission",
        "training", "dog_sick", "female_dog_heat", "other",
        "absence", "special_leave", "suspension",
        "dog_injured", "dog_temporary_retirement", "dog_vet_visit",
        "dog_training", "dog_other",
      ]),
      start_date: z.string().min(1, t("validation.startDateRequired")),
      end_date: z.string().min(1, t("validation.endDateRequired")),
      duration_days: z.number().int().min(MIN_EXCLUSION_DURATION_DAYS, t("validation.durationMin")),
      notes: z.string().max(500).optional().or(z.literal("")),
      active: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (v.apply_to === "agent" && !v.agent_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("validation.agentRequired"),
          path: ["agent_id"],
        });
      }
      if (v.apply_to === "dog" && !v.dog_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("validation.dogRequired"),
          path: ["dog_id"],
        });
      }
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

function ExclusionsPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.exclusions.title");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ExclusionTab>("all");
  const [personnelPage, setPersonnelPage] = useState(1);
  const [dogsPage, setDogsPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ExclusionType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<"all" | DogSpecialty>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<ExclusionApplyTarget>("agent");
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
          const rawTargetDog = (row as unknown as { dog: unknown }).dog;
          const dog = Array.isArray(rawTargetDog)
            ? rawTargetDog[0] ?? null
            : rawTargetDog ?? null;
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
        photo_url: row.photo_url,
        active: row.active,
        agent_id: row.agent?.id ?? null,
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

  const stats = useMemo(() => {
    const list = data ?? [];
    const active = list.filter((e) => isAgentExclusionActive(e));
    return {
      total: active.length,
      upcoming: list.filter((e) => exclusionCalendarStatus(e) === "upcoming").length,
      sick: active.filter((e) => e.exclusion_type === "sickness").length,
      dogHeat: active.filter((e) => e.exclusion_type === "female_dog_heat").length,
      dogSick: active.filter((e) => e.exclusion_type === "dog_sick").length,
      personnel: list.filter(isPersonnelExclusionRow).length,
      dogs: list.filter(isDogExclusionRow).length,
    };
  }, [data]);

  const typeOptions = useMemo(() => {
    if (tab === "personnel") {
      return ALL_EXCLUSION_TYPES.filter((type) => isAgentLevelExclusionType(type));
    }
    if (tab === "dogs") {
      return ALL_EXCLUSION_TYPES.filter((type) => isDogLevelExclusionType(type));
    }
    return ALL_EXCLUSION_TYPES;
  }, [tab]);

  const matchesSharedFilters = (e: ExclusionWithAgent) => {
    if (typeFilter !== "all" && e.exclusion_type !== typeFilter) return false;
    if (dateFilter) {
      if (!(e.start_date <= dateFilter && dateFilter <= e.end_date)) return false;
    }
    const status = exclusionCalendarStatus(e);
    if (statusFilter === "active" && !isAgentExclusionActive(e)) return false;
    if (statusFilter !== "all" && statusFilter !== "active" && status !== statusFilter) return false;
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
  }, [data, search, typeFilter, statusFilter, sectionFilter, dateFilter]);

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
  }, [data, search, typeFilter, statusFilter, specialtyFilter, dateFilter]);

  const hasActiveFilters =
    !!search ||
    typeFilter !== "all" ||
    sectionFilter !== "all" ||
    specialtyFilter !== "all" ||
    !!dateFilter ||
    statusFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setSectionFilter("all");
    setSpecialtyFilter("all");
    setDateFilter("");
    setStatusFilter("all");
  };

  useEffect(() => {
    setPersonnelPage(1);
    setDogsPage(1);
  }, [search, typeFilter, sectionFilter, specialtyFilter, dateFilter, statusFilter, tab]);

  useEffect(() => {
    // Drop type filter if it doesn't belong to the active tab's type list.
    if (typeFilter !== "all" && !typeOptions.includes(typeFilter)) {
      setTypeFilter("all");
    }
  }, [tab, typeFilter, typeOptions]);

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
  const showPersonnel = tab === "all" || tab === "personnel";
  const showDogs = tab === "all" || tab === "dogs";

  const statusLabel = (status: ExclusionCalendarStatus) => {
    if (status === "active") return t("status.active");
    if (status === "upcoming") return t("status.upcoming");
    return t("status.expired");
  };

  const upsert = useMutation({
    mutationFn: async (values: ExclusionForm & { id?: string }) => {
      const dogHandlerId =
        values.apply_to === "dog" && values.dog_id
          ? (dogs ?? []).find((d) => d.id === values.dog_id)?.agent_id ?? null
          : null;
      const agentId = values.apply_to === "agent" ? values.agent_id : dogHandlerId;
      const dogId = values.apply_to === "dog" ? values.dog_id : null;

      // Overlap guard: one active exclusion per agent or dog for the same period
      let overlapQuery = db
        .from("agent_exclusions")
        .select("id")
        .eq("active", true)
        .lte("start_date", values.end_date)
        .gte("end_date", values.start_date);
      if (values.apply_to === "agent" && agentId) {
        overlapQuery = overlapQuery.eq("agent_id", agentId);
      } else if (dogId) {
        overlapQuery = overlapQuery.eq("dog_id", dogId);
      }
      if (values.id) overlapQuery.neq("id", values.id);
      const { data: overlaps, error: overlapErr } = await overlapQuery;
      if (overlapErr) throw overlapErr;
      if ((overlaps?.length ?? 0) > 0) {
        throw new Error(t("exclusions.error.overlap"));
      }

      const payload = {
        agent_id: agentId,
        dog_id: dogId,
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
      queryClient.invalidateQueries({ queryKey: ["dog-details"] });
      queryClient.invalidateQueries({ queryKey: ["dogs-with-agent"] });
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
      queryClient.invalidateQueries({ queryKey: ["dog-details"] });
      queryClient.invalidateQueries({ queryKey: ["dogs-with-agent"] });
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
      queryClient.invalidateQueries({ queryKey: ["dog-details"] });
      queryClient.invalidateQueries({ queryKey: ["dogs-with-agent"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setCreateTarget(tab === "dogs" ? "dog" : "agent");
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
          const name = sid ? sectionNameById.get(sid) ?? "—" : "—";
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
          const d = format(parseISO(row.original.start_date), "dd/MM/yyyy");
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
          const d = format(parseISO(row.original.end_date), "dd/MM/yyyy");
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
          const status = exclusionCalendarStatus(row.original);
          const tone = status === "active" ? "success" : status === "upcoming" ? "warning" : "neutral";
          const label = statusLabel(status);
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
    [t, sectionNameById, actionsColumn],
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
            (row.original.agent_id ? agentById.get(row.original.agent_id) ?? null : null);
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
          const d = format(parseISO(row.original.start_date), "dd/MM/yyyy");
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
          const d = format(parseISO(row.original.end_date), "dd/MM/yyyy");
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
          const status = exclusionCalendarStatus(row.original);
          const tone = status === "active" ? "success" : status === "upcoming" ? "warning" : "neutral";
          const label = statusLabel(status);
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
    [t, agentById, actionsColumn],
  );

  const searchPlaceholder =
    tab === "dogs"
      ? t("exclusions.searchDogs")
      : tab === "personnel"
        ? t("exclusions.searchPersonnel")
        : t("exclusions.search");

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
          { label: t("exclusions.tabs.personnel"), value: stats.personnel },
          { label: t("exclusions.tabs.dogs"), value: stats.dogs },
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as ExclusionTab)}>
        <TabsList>
          <TabsTrigger value="all">{t("exclusions.tabs.all")}</TabsTrigger>
          <TabsTrigger value="personnel">{t("exclusions.tabs.personnel")}</TabsTrigger>
          <TabsTrigger value="dogs">{t("exclusions.tabs.dogs")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <FilterBar
        showReset={hasActiveFilters}
        onReset={resetFilters}
        resetLabel={t("common.page.filterReset")}
      >
        <SearchField
          className="min-w-0 flex-1 lg:max-w-md"
          placeholder={searchPlaceholder}
          value={search}
          onChange={setSearch}
        />
        <FilterPills>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <FilterSelectTrigger><SelectValue placeholder={t("exclusions.filter.reason")} /></FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("exclusions.filter.allReasons")}</SelectItem>
              {typeOptions.map((type) => (
                <SelectItem key={type} value={type}>{exclusionLabel(type, t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-9 w-[150px]"
            aria-label={t("exclusions.filter.date")}
          />
          {(tab === "all" || tab === "personnel") && (
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <FilterSelectTrigger><SelectValue placeholder={t("field.section")} /></FilterSelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allSections")}</SelectItem>
                {sections?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(tab === "all" || tab === "dogs") && (
            <Select
              value={specialtyFilter}
              onValueChange={(v) => setSpecialtyFilter(v as typeof specialtyFilter)}
            >
              <FilterSelectTrigger><SelectValue placeholder={t("field.specialty")} /></FilterSelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("specialty.all")}</SelectItem>
                <SelectItem value="narcotics">{t("specialty.narcotics")}</SelectItem>
                <SelectItem value="explosives">{t("specialty.explosives")}</SelectItem>
                <SelectItem value="currency">{t("operationalCases.specialty.currency")}</SelectItem>
              </SelectContent>
            </Select>
          )}
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

      {showPersonnel ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-l-2 border-primary/70 pl-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold tracking-tight">
              {t("exclusions.sections.personnel")}
            </h2>
            <Badge variant="secondary" className="tabular-nums">{personnelFiltered.length}</Badge>
          </div>
          <PageTableShell
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
              <DataTableShell isLoading={isLoading}>
                <EnterpriseDataTable
                  data={personnelRows}
                  columns={personnelColumns}
                  getRowId={(row) => row.id}
                  layout="fixed"
                  density="compact"
                  responsiveScroll
                  emptyState={
                    <EmptyState
                      icon={Users}
                      title={
                        (data ?? []).some(isPersonnelExclusionRow)
                          ? t("exclusions.empty.noMatch")
                          : t("exclusions.empty.nonePersonnel")
                      }
                      description={
                        (data ?? []).some(isPersonnelExclusionRow)
                          ? t("common.tryAdjustFilters")
                          : t("exclusions.empty.recordFirst")
                      }
                    />
                  }
                />
              </DataTableShell>
            </TableTooltipProvider>
          </PageTableShell>
        </section>
      ) : null}

      {showDogs ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-l-2 border-primary/70 pl-3">
            <DogIcon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold tracking-tight">
              {t("exclusions.sections.dogs")}
            </h2>
            <Badge variant="secondary" className="tabular-nums">{dogsFiltered.length}</Badge>
          </div>
          <PageTableShell
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
              <DataTableShell isLoading={isLoading}>
                <EnterpriseDataTable
                  data={dogRows}
                  columns={dogColumns}
                  getRowId={(row) => row.id}
                  layout="fixed"
                  density="compact"
                  responsiveScroll
                  emptyState={
                    <EmptyState
                      icon={DogIcon}
                      title={
                        (data ?? []).some(isDogExclusionRow)
                          ? t("exclusions.empty.noMatch")
                          : t("exclusions.empty.noneDogs")
                      }
                      description={
                        (data ?? []).some(isDogExclusionRow)
                          ? t("common.tryAdjustFilters")
                          : t("exclusions.empty.recordFirst")
                      }
                    />
                  }
                />
              </DataTableShell>
            </TableTooltipProvider>
          </PageTableShell>
        </section>
      ) : null}

      <ExclusionDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        initial={editing}
        defaultApplyTo={createTarget}
        agents={agents ?? []}
        dogs={dogs ?? []}
        exclusions={data ?? []}
        onSubmit={(v) => upsert.mutate(v)}
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
  open, onOpenChange, initial, defaultApplyTo = "agent", agents, dogs, exclusions, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: ExclusionRow | null;
  defaultApplyTo?: ExclusionApplyTarget;
  agents: AgentOption[];
  dogs: DogOption[];
  exclusions: ExclusionRow[];
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
      const startDate = initial?.start_date ?? today;
      const endDate = initial?.end_date ?? today;
      const initialDuration = exclusionDurationDays(startDate, endDate);
      const target = initial
        ? exclusionApplyTarget(initial.exclusion_type, initial.dog_id)
        : defaultApplyTo;
      setApplyTo(target);
      setAgentId(initial?.agent_id ?? "");
      setDogId(initial?.dog_id ?? "");
      setType(
        initial?.exclusion_type ??
          (target === "dog" ? "dog_sick" : "sickness"),
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
  }, [open, initial, today, defaultApplyTo]);

  const handleApplyToChange = (next: ExclusionApplyTarget) => {
    setApplyTo(next);
    setErrors({});
    if (next === "agent") {
      setDogId("");
      setType("sickness");
    } else {
      setAgentId("");
      setType("dog_sick");
    }
  };

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
      apply_to: applyTo,
      agent_id: applyTo === "agent" ? agentId || null : null,
      dog_id: applyTo === "dog" ? dogId || null : null,
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
    onSubmit({ ...parsed.data, id: replaceId });
  };

  const loadPersonnelExclusionIntoForm = (row: ExclusionRow) => {
    const startDate = row.start_date;
    const endDate = row.end_date;
    setReplaceId(row.id);
    setApplyTo("agent");
    setAgentId(row.agent_id ?? "");
    setDogId("");
    setType(row.exclusion_type);
    setStart(startDate);
    setDuration(exclusionDurationDays(startDate, endDate));
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
  const selectedAgent = allAgents.find((a) => a.id === agentId);
  const selectedDog = activeDogs.find((d) => d.id === dogId);
  const typeOptions = applyTo === "dog" ? DOG_EXCLUSION_FORM_TYPES : PERSONNEL_EXCLUSION_FORM_TYPES;
  const selectedAgentStatus = selectedAgent
    ? personnelSelectorStatus(selectedAgent, exclusions, statusReferenceISO, t)
    : null;

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
          {applyTo === "agent" && selectedAgent && selectedAgentStatus ? (
            <div className="border-t border-border/60 pt-2.5">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("exclusions.field.agent")}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
                {selectedAgent.first_name} {selectedAgent.last_name} — {selectedAgentStatus}
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
                  <ExclusionFormField label={t("exclusions.field.applyTo")} required>
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
                    <Select value={type} onValueChange={(v) => setType(v as ExclusionType)}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((exType) => (
                          <SelectItem key={exType} value={exType}>
                            {exclusionLabel(exType, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </ExclusionFormField>
                </div>

                {applyTo === "agent" ? (
                  <ExclusionFormField
                    label={t("exclusions.field.agent")}
                    required
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
                            {selectedAgent && selectedAgentStatus
                              ? `${selectedAgent.first_name} ${selectedAgent.last_name} — ${selectedAgentStatus}`
                              : t("exclusions.selectAgent")}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t("exclusions.searchAgent")} />
                          <CommandList>
                            <CommandEmpty>{t("exclusions.noAgentMatch")}</CommandEmpty>
                            <CommandGroup>
                              {allAgents.map((a) => {
                                const status = personnelSelectorStatus(
                                  a,
                                  exclusions,
                                  statusReferenceISO,
                                  t,
                                );
                                return (
                                  <CommandItem
                                    key={a.id}
                                    value={`${a.first_name} ${a.last_name} ${a.professional_number} ${status}`}
                                    onSelect={() => handleSelectAgent(a.id)}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        agentId === a.id ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    <span className="truncate">
                                      {a.first_name} {a.last_name} — {status}
                                    </span>
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
                    required
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
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t("exclusions.searchDog")} />
                          <CommandList>
                            <CommandEmpty>{t("exclusions.noDogMatch")}</CommandEmpty>
                            <CommandGroup>
                              {activeDogs.map((d) => (
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
