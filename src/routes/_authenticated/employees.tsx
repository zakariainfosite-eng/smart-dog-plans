import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Dog as DogIcon,
  Shield,
  Moon,
  Venus,
  Mars,
  Pill,
  Bomb,
  UserCheck,
  UserX,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import {
  createAgent,
  deleteAgent,
  getAgents,
  getSections,
  updateAgent,
  type AgentRow,
  type Gender,
} from "@/integrations/database";
import { EmptyState } from "@/components/layout/EmptyState";
import { AgentsPageHero, AgentsFilterToolbar, AgentsTableShell } from "@/components/agents/agents-page-hero";
import { AgentsStatCard } from "@/components/agents/agents-stat-card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchField } from "@/components/enterprise/search-field";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { EnterpriseDataTable } from "@/components/enterprise/data-table";
import { CellTooltip, TableTooltipProvider } from "@/components/enterprise/cell-tooltip";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { AgentDetailsDrawer } from "@/components/agents/agent-details-drawer";
import { AgentFormDialog } from "@/components/agents/agent-form-dialog";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import {
  deleteAgentPhotoByUrl,
  uploadAgentPhoto,
  validateAgentPhotoFile,
} from "@/lib/agent-photo-api";
import {
  agentSpecialty,
  deriveAgentOperationalStatus,
  isNightEligible,
  type AgentOperationalStatus,
} from "@/lib/agent-ui";
import {
  ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY,
  fetchActiveExclusionsForDate,
  todayISODate,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import {
  buildCynotechniciansListPdfData,
  cynotechniciansListFilename,
} from "@/lib/documents/build-cynotechnicians-list-pdf-data";
import { downloadCynotechniciansListPdfWithLogo } from "@/lib/documents/feuille-presence-pdf";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({ meta: [{ title: "Cynotechniciens — Smart K9 Planning" }] }),
  component: EmployeesPage,
});

function createAgentSchema(t: (key: string) => string) {
  return z.object({
    first_name: z.string().trim().min(2, t("validation.firstNameRequired")).max(60),
    last_name: z.string().trim().min(2, t("validation.lastNameRequired")).max(60),
    professional_number: z
      .string()
      .trim()
      .min(1, t("validation.profNumberRequired"))
      .max(30),
    grade: z.string().trim().min(1, t("validation.gradeRequired")).max(60),
    gender: z.enum(["male", "female"]),
    section_id: z.string().uuid().nullable(),
    dog_id: z.string().uuid().nullable(),
    phone: z.string().trim().max(30),
    address: z.string().trim().max(200),
    observations: z.string().trim().max(500, t("validation.observationsMax")),
    active: z.boolean(),
  });
}
type AgentForm = z.infer<ReturnType<typeof createAgentSchema>>;

type AgentSavePayload = Omit<AgentForm, "phone" | "address" | "observations"> & {
  phone: string | null;
  address: string | null;
  observations: string | null;
};

function normalizeAgentForm(values: AgentForm): AgentSavePayload {
  return {
    ...values,
    section_id: values.gender === "female" ? null : values.section_id,
    phone: values.phone.trim() || null,
    address: values.address.trim() || null,
    observations: values.observations.trim() || null,
  };
}

type ActiveFilter = "all" | "active" | "inactive";
type GenderFilter = "all" | Gender;
type SpecialtyFilter = "all" | "narcotics" | "explosives" | "none";
type OperationalFilter = "all" | AgentOperationalStatus;

const emptyForm: AgentForm = {
  first_name: "",
  last_name: "",
  professional_number: "",
  grade: "",
  gender: "male",
  section_id: null,
  dog_id: null,
  phone: "",
  address: "",
  observations: "",
  active: true,
};

const OPERATIONAL_TONE: Record<AgentOperationalStatus, "success" | "danger"> = {
  available: "success",
  excluded: "danger",
};

const PAGE_SIZE = 15;

function pct(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function exportAgentsCsv(rows: AgentRow[], filename: string, t: (key: string) => string) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = [
    t("employees.table.name"),
    t("employees.field.professionalNumber"),
    t("field.grade"),
    t("field.section"),
    t("employees.field.assignedDog"),
    t("field.gender"),
    t("field.active"),
  ];
  const lines = rows.map((row) =>
    [
      `${row.first_name} ${row.last_name}`,
      row.professional_number,
      row.grade,
      row.sections?.name ?? "",
      row.dogs?.name ?? "",
      t(`gender.${row.gender}`),
      row.active ? t("common.yes") : t("common.no"),
    ]
      .map((cell) => escape(String(cell)))
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function operationalStatusLabel(status: AgentOperationalStatus, t: (key: string) => string) {
  const keys: Record<AgentOperationalStatus, string> = {
    available: "employees.operationalStatus.available",
    excluded: "employees.operationalStatus.excluded",
  };
  return t(keys[status]);
}

function EmployeesPage() {
  const { t } = useI18n();
  useDocumentTitle("meta.employees.title");
  const agentSchema = useMemo(() => createAgentSchema(t), [t]);

  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<SpecialtyFilter>("all");
  const [operationalFilter, setOperationalFilter] = useState<OperationalFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentRow | null>(null);
  const [detailsAgentId, setDetailsAgentId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof AgentForm, string>>>({});
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data: agents, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["agents-full"],
    queryFn: getAgents,
  });

  const { data: sections } = useQuery({
    queryKey: ["sections", "select"],
    queryFn: async () => {
      const rows = await getSections();
      return rows
        .map((section) => ({
          id: section.id,
          name: section.name,
          shift_type: section.shift_type,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data: dogs } = useQuery({
    queryKey: ["dogs", "select"],
    queryFn: async () => {
      const { data, error } = await db
        .from("dogs")
        .select("id, name, specialty, status, active")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: todayExclusions = [] } = useQuery({
    queryKey: ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY,
    queryFn: () => fetchActiveExclusionsForDate(db, todayISODate()),
  });

  const takenDogIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents ?? []) {
      if (a.dog_id && a.id !== editing?.id) set.add(a.dog_id);
    }
    return set;
  }, [agents, editing]);

  const stats = useMemo(() => {
    const list = agents ?? [];
    const exclusions = todayExclusions as AgentExclusionRecord[];
    const total = list.length;
    const available = list.filter((a) => deriveAgentOperationalStatus(a, exclusions) === "available").length;
    const excluded = list.filter((a) => deriveAgentOperationalStatus(a, exclusions) === "excluded").length;
    const female = list.filter((a) => a.gender === "female").length;
    const male = list.filter((a) => a.gender === "male").length;
    const withDog = list.filter((a) => a.dog_id).length;
    const nightEligible = list.filter((a) => isNightEligible(a, exclusions)).length;

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const addedThisMonth = list.filter((a) => {
      const d = new Date(a.created_at);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    }).length;

    return {
      total,
      available,
      excluded,
      female,
      male,
      withDog,
      nightEligible,
      addedThisMonth,
      narcotics: list.filter((a) => agentSpecialty(a) === "narcotics").length,
      explosives: list.filter((a) => agentSpecialty(a) === "explosives").length,
    };
  }, [agents, todayExclusions]);

  const filtered = useMemo(() => {
    let list = agents ?? [];

    if (activeFilter !== "all") {
      const active = activeFilter === "active";
      list = list.filter((a) => a.active === active);
    }
    if (sectionFilter !== "all") {
      list = list.filter((a) => a.section_id === sectionFilter);
    }
    if (genderFilter !== "all") {
      list = list.filter((a) => a.gender === genderFilter);
    }
    if (specialtyFilter !== "all") {
      list = list.filter((a) => {
        const spec = agentSpecialty(a);
        if (specialtyFilter === "none") return spec === null;
        return spec === specialtyFilter;
      });
    }
    if (operationalFilter !== "all") {
      const exclusions = todayExclusions as AgentExclusionRecord[];
      list = list.filter((a) => deriveAgentOperationalStatus(a, exclusions) === operationalFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.first_name.toLowerCase().includes(q) ||
          a.last_name.toLowerCase().includes(q) ||
          a.professional_number.toLowerCase().includes(q) ||
          a.grade.toLowerCase().includes(q),
      );
    }
    return list;
  }, [agents, activeFilter, sectionFilter, genderFilter, specialtyFilter, operationalFilter, search, todayExclusions]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const hasActiveFilters =
    search.trim() !== "" ||
    activeFilter !== "all" ||
    sectionFilter !== "all" ||
    genderFilter !== "all" ||
    specialtyFilter !== "all" ||
    operationalFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setActiveFilter("all");
    setSectionFilter("all");
    setGenderFilter("all");
    setSpecialtyFilter("all");
    setOperationalFilter("all");
    setPage(1);
  };

  const lastUpdatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";

  const handleExport = () => {
    if (filtered.length === 0) return;
    exportAgentsCsv(filtered, `cynotechniciens-${todayISODate()}.csv`, t);
    toast.success(t("employees.export.success"));
  };

  const handleExportPdf = async () => {
    if (filtered.length === 0 || exportingPdf) return;
    setExportingPdf(true);
    try {
      const data = buildCynotechniciansListPdfData(
        filtered,
        todayExclusions as AgentExclusionRecord[],
      );
      await downloadCynotechniciansListPdfWithLogo({
        data,
        filename: cynotechniciansListFilename(),
      });
      toast.success(t("employees.export.pdfSuccess"));
    } catch (error) {
      console.error("[employees] PDF export failed:", error);
      toast.error(t("employees.export.pdfError"));
    } finally {
      setExportingPdf(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, activeFilter, sectionFilter, genderFilter, specialtyFilter, operationalFilter]);

  const resetPhotoState = () => {
    setPendingPhotoFile(null);
    setRemovePhoto(false);
    setPhotoError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    resetPhotoState();
    setDialogOpen(true);
  };

  const openEdit = (a: AgentRow) => {
    setEditing(a);
    setForm({
      first_name: a.first_name,
      last_name: a.last_name,
      professional_number: a.professional_number,
      grade: a.grade,
      gender: a.gender as Gender,
      section_id: a.section_id,
      dog_id: a.dog_id,
      phone: a.phone ?? "",
      address: a.address ?? "",
      observations: a.observations ?? "",
      active: a.active,
    });
    setErrors({});
    resetPhotoState();
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: AgentForm) => {
      const payload = normalizeAgentForm(values);

      if (pendingPhotoFile) {
        const validationKey = validateAgentPhotoFile(pendingPhotoFile);
        if (validationKey) {
          throw new Error(t(`employees.photo.error.${validationKey}`, { maxMb: 5 }));
        }
      }

      if (editing) {
        let photoUrl = editing.photo_url;

        if (removePhoto) {
          if (editing.photo_url) {
            await deleteAgentPhotoByUrl(db, editing.photo_url);
          }
          photoUrl = null;
        } else if (pendingPhotoFile) {
          if (editing.photo_url) {
            await deleteAgentPhotoByUrl(db, editing.photo_url);
          }
          photoUrl = await uploadAgentPhoto(db, editing.id, pendingPhotoFile);
        }

        await updateAgent(editing.id, { ...payload, photo_url: photoUrl });
        return;
      }

      const created = await createAgent(payload);

      if (pendingPhotoFile) {
        const photoUrl = await uploadAgentPhoto(db, created.id, pendingPhotoFile);
        await updateAgent(created.id, { ...payload, photo_url: photoUrl });
      }
    },
    onSuccess: () => {
      toast.success(editing ? t("employees.toast.updated") : t("employees.toast.created"));
      queryClient.invalidateQueries({ queryKey: ["agents-full"] });
      if (editing) {
        queryClient.invalidateQueries({ queryKey: ["agent", editing.id] });
        queryClient.invalidateQueries({ queryKey: ["agent-details", editing.id] });
      }
      setDialogOpen(false);
      resetPhotoState();
    },
    onError: (err: { message?: string; code?: string }) => {
      const msg = err?.message ?? "";
      if (msg.includes("agents_professional_number_key")) {
        setErrors((e) => ({ ...e, professional_number: t("validation.profNumberUsed") }));
        toast.error(t("employees.toast.profNumberUnique"));
      } else if (msg.includes("agents_dog_id_key")) {
        setErrors((e) => ({ ...e, dog_id: t("validation.dogAlreadyAssigned") }));
        toast.error(t("employees.toast.dogAlreadyAssigned"));
      } else {
        toast.error(msg || t("employees.error.saveFailed"));
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (agent: AgentRow) => {
      if (agent.photo_url) {
        await deleteAgentPhotoByUrl(db, agent.photo_url);
      }
      await deleteAgent(agent.id);
    },
    onSuccess: () => {
      toast.success(t("employees.toast.deleted"));
      queryClient.invalidateQueries({ queryKey: ["agents-full"] });
      setDeleteTarget(null);
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? t("employees.error.deleteFailed"));
    },
  });

  const submit = () => {
    const parsed = agentSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof AgentForm, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof AgentForm;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    if (photoError) return;
    saveMutation.mutate(parsed.data);
  };

  const columns = useMemo<ColumnDef<AgentRow>[]>(
    () => [
      {
        id: "agent",
        header: t("employees.table.name"),
        meta: { width: "26%" },
        cell: ({ row }) => {
          const a = row.original;
          const fullName = `${a.first_name} ${a.last_name}`;
          return (
            <div className="flex min-w-0 items-center gap-2">
              <AgentAvatar
                firstName={a.first_name}
                lastName={a.last_name}
                photoUrl={a.photo_url}
                className="h-8 w-8 shrink-0"
              />
              <CellTooltip label={`${fullName} · #${a.professional_number}`} className="flex-1">
                <button
                  type="button"
                  onClick={() => setDetailsAgentId(a.id)}
                  className="block min-w-0 rounded-md text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="truncate text-sm font-semibold leading-tight">{fullName}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    #{a.professional_number}
                  </p>
                </button>
              </CellTooltip>
            </div>
          );
        },
      },
      {
        id: "dog",
        header: t("employees.table.assignedDog"),
        meta: { width: "17%" },
        cell: ({ row }) => {
          const dog = row.original.dogs;
          if (!dog) return <span className="text-[10px] text-muted-foreground">—</span>;
          return (
            <CellTooltip label={dog.name} className="flex min-w-0 items-center gap-1.5">
              <DogIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">{dog.name}</span>
            </CellTooltip>
          );
        },
      },
      {
        id: "specialty",
        header: t("field.specialty"),
        meta: { width: "11%", align: "center" },
        cell: ({ row }) => {
          const spec = agentSpecialty(row.original);
          if (!spec) return <span className="text-[10px] text-muted-foreground">—</span>;
          const isNarcotics = spec === "narcotics";
          const short = isNarcotics
            ? t("checkpoints.badge.narcotics")
            : t("checkpoints.badge.explosives");
          const full = t(`specialty.${spec}`);
          return (
            <CellTooltip label={full}>
              <StatusBadge tone={isNarcotics ? "success" : "danger"} className="max-w-full gap-0.5 px-1.5 py-0 text-[10px]">
                {isNarcotics ? <Pill className="h-2.5 w-2.5 shrink-0" /> : <Bomb className="h-2.5 w-2.5 shrink-0" />}
                <span className="truncate">{short}</span>
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "section",
        header: t("field.section"),
        meta: { width: "11%" },
        cell: ({ row }) => {
          const name = row.original.sections?.name;
          if (!name) return <span className="text-[10px] text-muted-foreground">—</span>;
          return (
            <CellTooltip label={name}>
              <StatusBadge tone="neutral" className="max-w-full truncate px-1.5 py-0 text-[10px]">
                {name}
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "grade",
        header: t("field.grade"),
        meta: { width: "8%", align: "center" },
        cell: ({ row }) => {
          const grade = row.original.grade;
          return (
            <CellTooltip label={grade}>
              <StatusBadge tone="primary" className="max-w-full gap-0.5 px-1.5 py-0 text-[10px]">
                <Shield className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{grade}</span>
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "gender",
        header: () => (
          <span className="sr-only">{t("field.gender")}</span>
        ),
        meta: { width: "4%", align: "center" },
        cell: ({ row }) => {
          const g = row.original.gender;
          const label = t(`gender.${g}`);
          return (
            <CellTooltip label={label} className="flex justify-center">
              <StatusBadge tone="neutral" className="px-1.5 py-0">
                {g === "female" ? <Venus className="h-3 w-3" /> : <Mars className="h-3 w-3" />}
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "operational",
        header: () => (
          <span className="sr-only">{t("employees.filter.operationalStatus")}</span>
        ),
        meta: { width: "7%", align: "center" },
        cell: ({ row }) => {
          const exclusions = todayExclusions as AgentExclusionRecord[];
          const status = deriveAgentOperationalStatus(row.original, exclusions);
          const label = operationalStatusLabel(status, t);
          const Icon = status === "available" ? UserCheck : UserX;
          return (
            <CellTooltip label={label} className="flex justify-center">
              <StatusBadge tone={OPERATIONAL_TONE[status]} className="px-1.5 py-0">
                <Icon className="h-3 w-3" />
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "active",
        header: () => <span className="sr-only">{t("field.active")}</span>,
        meta: { width: "5%", align: "center" },
        cell: ({ row }) => {
          const active = row.original.active;
          const label = active ? t("common.active") : t("common.inactive");
          return (
            <CellTooltip label={label} className="flex justify-center">
              <StatusBadge tone={active ? "success" : "neutral"} className="px-1.5 py-0">
                {active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        meta: { width: "11%", sticky: "right", align: "right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0 opacity-90 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={() => openEdit(row.original)}
              aria-label={t("aria.edit")}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteTarget(row.original)}
              aria-label={t("aria.delete")}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ),
      },
    ],
    [t, todayExclusions],
  );

  return (
    <div className="space-y-6 pb-8">
      <AgentsPageHero
        title={t("employees.hero.title")}
        subtitle={t("employees.hero.subtitle")}
        totalAgents={stats.total}
        activeToday={stats.available}
        lastUpdated={lastUpdatedLabel}
        totalLabel={t("employees.stat.total")}
        activeTodayLabel={t("employees.hero.activeToday")}
        lastUpdatedLabel={t("employees.hero.lastUpdated")}
        addLabel={t("employees.addAgent")}
        exportLabel={t("employees.export.label")}
        exportPdfLabel={t("employees.export.pdfLabel")}
        onAdd={openCreate}
        onExport={handleExport}
        onExportPdf={() => void handleExportPdf()}
        exportDisabled={filtered.length === 0}
        exportPdfDisabled={filtered.length === 0 || exportingPdf}
        loading={isLoading}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <AgentsStatCard
          icon={Users}
          value={stats.total}
          label={t("employees.stat.total")}
          trend={
            stats.addedThisMonth > 0
              ? t("employees.stat.trendThisMonth", { count: stats.addedThisMonth })
              : undefined
          }
          loading={isLoading}
        />
        <AgentsStatCard
          icon={UserCheck}
          value={stats.available}
          label={t("employees.stat.available")}
          percentage={pct(stats.available, stats.total)}
          iconBgClassName="bg-emerald-500/10 text-emerald-600"
          loading={isLoading}
        />
        <AgentsStatCard
          icon={DogIcon}
          value={stats.withDog}
          label={t("employees.stat.withDog")}
          percentage={pct(stats.withDog, stats.total)}
          iconBgClassName="bg-sky-500/10 text-sky-600"
          loading={isLoading}
        />
        <AgentsStatCard
          icon={UserX}
          value={stats.excluded}
          label={t("employees.stat.excluded")}
          percentage={pct(stats.excluded, stats.total)}
          iconBgClassName="bg-red-500/10 text-red-600"
          loading={isLoading}
        />
        <AgentsStatCard
          icon={Venus}
          value={stats.female}
          label={t("employees.stat.female")}
          percentage={pct(stats.female, stats.total)}
          iconBgClassName="bg-pink-500/10 text-pink-600"
          loading={isLoading}
        />
        <AgentsStatCard
          icon={Mars}
          value={stats.male}
          label={t("employees.stat.male")}
          percentage={pct(stats.male, stats.total)}
          iconBgClassName="bg-indigo-500/10 text-indigo-600"
          loading={isLoading}
        />
        <AgentsStatCard
          icon={Moon}
          value={stats.nightEligible}
          label={t("employees.stat.nightEligible")}
          percentage={pct(stats.nightEligible, stats.total)}
          iconBgClassName="bg-violet-500/10 text-violet-600"
          loading={isLoading}
        />
      </div>

      <AgentsFilterToolbar
        resetLabel={t("employees.filter.reset")}
        onReset={resetFilters}
        showReset={hasActiveFilters}
      >
        <SearchField
          className="min-w-0 flex-1 lg:min-w-[240px] lg:max-w-sm"
          placeholder={t("employees.search")}
          value={search}
          onChange={setSearch}
        />
        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <FilterSelectTrigger>
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
        <Select value={specialtyFilter} onValueChange={(v) => setSpecialtyFilter(v as SpecialtyFilter)}>
          <FilterSelectTrigger>
            <SelectValue placeholder={t("employees.filter.specialty")} />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("specialty.all")}</SelectItem>
            <SelectItem value="narcotics">{t("specialty.narcotics")}</SelectItem>
            <SelectItem value="explosives">{t("specialty.explosives")}</SelectItem>
            <SelectItem value="none">{t("common.none")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={genderFilter} onValueChange={(v) => setGenderFilter(v as GenderFilter)}>
          <FilterSelectTrigger>
            <SelectValue placeholder={t("field.gender")} />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("gender.all")}</SelectItem>
            <SelectItem value="male">{t("gender.male")}</SelectItem>
            <SelectItem value="female">{t("gender.female")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={operationalFilter} onValueChange={(v) => setOperationalFilter(v as OperationalFilter)}>
          <FilterSelectTrigger>
            <SelectValue placeholder={t("employees.filter.operationalStatus")} />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("employees.filter.allStatuses")}</SelectItem>
            <SelectItem value="available">{t("employees.operationalStatus.available")}</SelectItem>
            <SelectItem value="excluded">{t("employees.operationalStatus.excluded")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as ActiveFilter)}>
          <FilterSelectTrigger>
            <SelectValue placeholder={t("employees.filter.activeState")} />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("common.active")}</SelectItem>
            <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
          </SelectContent>
        </Select>
      </AgentsFilterToolbar>

      <AgentsTableShell
        header={
          <p className="text-sm text-muted-foreground">
            {t("employees.table.showing", {
              displayed: filtered.length,
              total: agents?.length ?? 0,
            })}
          </p>
        }
        footer={
          filtered.length > 0 ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {t("employees.table.pagination", {
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
          ) : undefined
        }
      >
        <TableTooltipProvider>
          <DataTableShell isLoading={isLoading}>
            <EnterpriseDataTable
              data={paginated}
              columns={columns}
              getRowId={(row) => row.id}
              layout="fixed"
              density="compact"
              responsiveScroll
              emptyState={
                <EmptyState
                  icon={Users}
                  title={t("employees.empty.title")}
                  description={t("employees.empty.description")}
                />
              }
            />
          </DataTableShell>
        </TableTooltipProvider>
      </AgentsTableShell>

      <AgentDetailsDrawer
        agentId={detailsAgentId}
        agentRow={agents?.find((agent) => agent.id === detailsAgentId) ?? null}
        open={!!detailsAgentId}
        onOpenChange={(next) => {
          if (!next) setDetailsAgentId(null);
        }}
        onEdit={(agent) => {
          setDetailsAgentId(null);
          openEdit(agent);
        }}
      />

      <AgentFormDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) resetPhotoState();
        }}
        editing={editing}
        form={form}
        setForm={setForm}
        errors={errors}
        sections={sections}
        dogs={dogs}
        takenDogIds={takenDogIds}
        pendingPhotoFile={pendingPhotoFile}
        removePhoto={removePhoto}
        onPendingPhotoFileChange={setPendingPhotoFile}
        onRemovePhotoChange={setRemovePhoto}
        photoError={photoError}
        onPhotoError={setPhotoError}
        onSubmit={submit}
        isSaving={saveMutation.isPending}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("employees.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? t("employees.delete.description", {
                    name: `${deleteTarget.first_name} ${deleteTarget.last_name}`,
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget)
              }
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
