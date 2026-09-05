import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { z } from "zod";
import {
  Users,
  Plus,
  Dog as DogIcon,
  Shield,
  Venus,
  Mars,
  Pill,
  Bomb,
  Check,
  X,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { RowActionButtons } from "@/components/enterprise/row-action-buttons";
import {
  createAgent,
  deleteAgent,
  getAgents,
  getSections,
  updateAgent,
  type AgentRow,
  type Gender,
  type MaritalStatus,
} from "@/integrations/database";
import {
  formatMaritalStatusLabel,
  MARITAL_STATUSES,
  normalizeMaritalStatus,
} from "@/lib/marital-status";
import {
  formatAgentBirthDateDisplay,
  normalizeAgentBirthDate,
  validateAgentBirthDate,
} from "@/lib/agent-birth-date";
import { EmptyState } from "@/components/layout/EmptyState";
import { AgentsPageHero, AgentsFilterToolbar, AgentsTableShell } from "@/components/agents/agents-page-hero";
import { AgentsStatCard } from "@/components/agents/agents-stat-card";
import { EmployeesTotalStatCard } from "@/components/agents/employees-total-stat-card";
import { SpecialtyBreakdownLines } from "@/components/agents/specialty-breakdown-lines";
import { StatisticDetailsDialog } from "@/components/statistics/statistic-details-dialog";
import { useStatisticDetailsDialog } from "@/hooks/use-statistic-details-dialog";
import { personnelStatisticColumns } from "@/lib/statistics/statistic-detail-columns";
import { mapPersonnelDetailRows } from "@/lib/statistics/map-statistic-detail-rows";
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
import { AgentFormDialog, type AgentFormValues } from "@/components/agents/agent-form-dialog";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { EntityPdfTableTemplateDialog } from "@/components/reports-messages/entity-pdf-table-template-dialog";
import {
  canEditEntityPdfTable,
  fetchFonctionnairePdfTemplate,
} from "@/lib/reports-messages/entity-pdf-table-store";
import { useAuth } from "@/hooks/use-auth";
import {
  deleteAgentPhotoByUrl,
  uploadAgentPhoto,
  validateAgentPhotoFile,
} from "@/lib/agent-photo-api";
import {
  agentSpecialty,
  availabilityBadgeTone,
  cynotechnicienSpecialty,
  deriveAgentAvailabilityForAgent,
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
import { shouldAnnounceBrowserPdfExport } from "@/lib/documents/export-binary";
import { downloadCynotechniciansListPdfWithLogo } from "@/lib/documents/feuille-presence-pdf";
import {
  DEFAULT_PERSONNEL_FONCTION,
  isChefDeSectionFonction,
  isCynotechnicienFonction,
  normalizePersonnelFonction,
  PERSONNEL_FONCTIONS,
  usesOperationalPersonnelColumns,
} from "@/lib/personnel-fonction";
import {
  comparePersonnelRows,
  DEFAULT_PERSONNEL_SORT,
  hasPersonnelSeniorityData,
  personnelMatchesSearch,
  personnelMatchesStatusFilter,
  PERSONNEL_STATUS_FILTER_TYPES,
  uniquePersonnelGrades,
  type PersonnelSortKey,
  type PersonnelStatusFilter,
} from "@/lib/personnel-table-controls";
import { computePersonnelCategoryStats, countCynotechnicienSpecialties } from "@/lib/personnel-fonction-stats";
import { splitPersonnelIntoTwoTables } from "@/lib/documents/personnel-two-tables";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({ meta: [{ title: "Personnel — CynoPlanning" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    details: typeof search.details === "string" ? search.details : undefined,
  }),
  component: EmployeesPage,
});

function createAgentSchema(t: (key: string) => string) {
  return z
    .object({
      first_name: z.string().trim().max(60),
      last_name: z.string().trim().max(60),
      professional_number: z.string().trim().max(30),
      grade: z.string().trim().max(60),
      gender: z.enum(["male", "female"]),
      fonction: z.enum(PERSONNEL_FONCTIONS),
      marital_status: z.union([z.enum(MARITAL_STATUSES), z.literal("")]),
      date_naissance: z.string(),
      origine: z.string().trim().max(120),
      section_id: z.string().uuid().nullable(),
      dog_id: z.string().uuid().nullable(),
      phone: z.string().trim().max(30),
      address: z.string().trim().max(200),
      observations: z.string().trim().max(500, t("validation.observationsMax")),
      active: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const birthCode = validateAgentBirthDate(values.date_naissance);
      if (birthCode) {
        const messageKey =
          birthCode === "future"
            ? "validation.dateOfBirthFuture"
            : birthCode === "tooYoung"
              ? "validation.dateOfBirthTooYoung"
              : birthCode === "tooOld"
                ? "validation.dateOfBirthTooOld"
                : "validation.dateOfBirthInvalid";
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t(messageKey),
          path: ["date_naissance"],
        });
      }
    });
}
type AgentForm = z.infer<ReturnType<typeof createAgentSchema>>;

type AgentSavePayload = Omit<AgentForm, "origine" | "phone" | "address" | "observations"> & {
  origine: string | null;
  phone: string | null;
  address: string | null;
  observations: string | null;
};

function normalizeAgentForm(values: AgentForm): AgentSavePayload {
  const fonction = normalizePersonnelFonction(values.fonction);
  const isCyno = isCynotechnicienFonction(fonction);
  const isChef = isChefDeSectionFonction(fonction);
  return {
    ...values,
    fonction,
    section_id: isCyno
      ? values.gender !== "female"
        ? values.section_id
        : null
      : isChef
        ? values.section_id
        : null,
    dog_id: isCyno ? values.dog_id : null,
    origine: values.origine.trim() || null,
    phone: values.phone.trim() || null,
    address: values.address.trim() || null,
    observations: values.observations.trim() || null,
  };
}

type ActiveFilter = "all" | "active" | "inactive";
type GenderFilter = "all" | Gender;
type SpecialtyFilter = "all" | "narcotics" | "explosives" | "none";
type MaritalFilter = "all" | MaritalStatus;

const emptyForm: AgentFormValues = {
  first_name: "",
  last_name: "",
  professional_number: "",
  grade: "",
  gender: "male",
  fonction: DEFAULT_PERSONNEL_FONCTION,
  marital_status: "",
  date_naissance: "",
  origine: "",
  section_id: null,
  dog_id: null,
  phone: "",
  address: "",
  observations: "",
  active: true,
};

const PAGE_SIZE = 15;

/** Toast once if Electron main predates marital_status IPC support. */
let staleMaritalMainToastShown = false;

function pct(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function exportAgentsCsv(rows: AgentRow[], filename: string, t: TFunction) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = [
    t("employees.table.name"),
    t("employees.field.professionalNumber"),
    t("employees.field.fonction"),
    t("field.grade"),
    t("field.section"),
    t("employees.field.assignedDog"),
    t("field.gender"),
    t("employees.field.maritalStatus"),
    t("employees.field.dateOfBirth"),
    t("employees.field.origine"),
    t("field.active"),
  ];
  const lines = rows.map((row) =>
    [
      `${row.first_name} ${row.last_name}`,
      row.professional_number,
      t(`personnelFonction.${normalizePersonnelFonction(row.fonction)}`),
      row.grade,
      row.sections?.name ?? "",
      row.dogs?.name ?? "",
      t(`gender.${row.gender}`),
      formatMaritalStatusLabel(row.marital_status, t),
      formatAgentBirthDateDisplay(row.date_naissance) || t("common.none"),
      row.origine ?? "",
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

function availabilityLabel(
  availability: ReturnType<typeof deriveAgentAvailabilityForAgent>,
  t: (key: string) => string,
): string {
  if (availability.status === "available") {
    return t("employees.operationalStatus.available");
  }
  return t(`exclusions.type.${availability.exclusionType}`);
}

function EmployeesPage() {
  const { t } = useI18n();
  const { role } = useAuth();
  const canManagePdf = canEditEntityPdfTable(role);
  useDocumentTitle("meta.employees.title");
  const agentSchema = useMemo(() => createAgentSchema(t), [t]);
  const { details: detailsFromSearch } = Route.useSearch();

  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<PersonnelSortKey>(DEFAULT_PERSONNEL_SORT);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<SpecialtyFilter>("all");
  const [fonctionFilter, setFonctionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<PersonnelStatusFilter>("all");
  const [maritalFilter, setMaritalFilter] = useState<MaritalFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentRow | null>(null);
  const [detailsAgentId, setDetailsAgentId] = useState<string | null>(
    detailsFromSearch ?? null,
  );
  const [form, setForm] = useState<AgentFormValues>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof AgentFormValues, string>>>({});
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfTemplateOpen, setPdfTemplateOpen] = useState(false);
  const details = useStatisticDetailsDialog();

  useEffect(() => {
    if (detailsFromSearch) {
      setDetailsAgentId(detailsFromSearch);
    }
  }, [detailsFromSearch]);

  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents-full"],
    queryFn: async () => {
      const rows = await getAgents();
      // Stale Electron main (started before marital_status existed) omits the key entirely.
      // Null is valid (« Non renseignée »); missing key means the IPC store must be restarted.
      if (
        rows.length > 0 &&
        !Object.prototype.hasOwnProperty.call(rows[0], "marital_status") &&
        !staleMaritalMainToastShown
      ) {
        staleMaritalMainToastShown = true;
        console.error(
          "[employees] getAgents() response is missing marital_status — Electron main is stale. Quit and restart npm run electron:dev.",
        );
        toast.error(t("employees.error.staleMainMaritalStatus"));
      }
      return rows;
    },
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
    queryKey: [...ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY, todayISODate()],
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
    const availableList = list.filter(
      (a) => deriveAgentAvailabilityForAgent(a, exclusions).status === "available",
    );
    const excludedList = list.filter(
      (a) => deriveAgentAvailabilityForAgent(a, exclusions).status === "excluded",
    );
    const femaleList = list.filter((a) => a.gender === "female");
    const maleList = list.filter((a) => a.gender === "male");
    const withDogList = list.filter((a) => a.dog_id);

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const addedThisMonth = list.filter((a) => {
      const d = new Date(a.created_at);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    }).length;

    const narcoticsList = list.filter((a) => agentSpecialty(a) === "narcotics");
    const explosivesList = list.filter((a) => agentSpecialty(a) === "explosives");
    const cynotechniciensList = list.filter((a) => usesOperationalPersonnelColumns(a.fonction));
    const administrativeList = list.filter((a) => !usesOperationalPersonnelColumns(a.fonction));
    const excludedAdministrativeList = excludedList.filter(
      (a) => !usesOperationalPersonnelColumns(a.fonction),
    );

    return {
      total,
      list,
      available: availableList.length,
      availableList,
      excluded: excludedList.length,
      excludedList,
      female: femaleList.length,
      femaleList,
      male: maleList.length,
      maleList,
      withDog: withDogList.length,
      withDogList,
      addedThisMonth,
      categoryStats: computePersonnelCategoryStats(list),
      cynotechniciensList,
      administrativeList,
      excludedAdministrative: computePersonnelCategoryStats(excludedList).administrative,
      excludedAdministrativeList,
      narcotics: narcoticsList.length,
      narcoticsList,
      explosives: explosivesList.length,
      explosivesList,
      specialty: {
        total: countCynotechnicienSpecialties(list),
        available: countCynotechnicienSpecialties(availableList),
        excluded: countCynotechnicienSpecialties(excludedList),
        withDog: countCynotechnicienSpecialties(withDogList),
        female: countCynotechnicienSpecialties(femaleList),
        male: countCynotechnicienSpecialties(maleList),
        totalNarcotics: list.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "narcotics",
        ),
        totalExplosives: list.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "explosives",
        ),
        availableNarcotics: availableList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "narcotics",
        ),
        availableExplosives: availableList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "explosives",
        ),
        excludedNarcotics: excludedList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "narcotics",
        ),
        excludedExplosives: excludedList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "explosives",
        ),
        withDogNarcotics: withDogList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "narcotics",
        ),
        withDogExplosives: withDogList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "explosives",
        ),
        femaleNarcotics: femaleList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "narcotics",
        ),
        femaleExplosives: femaleList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "explosives",
        ),
        maleNarcotics: maleList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "narcotics",
        ),
        maleExplosives: maleList.filter(
          (a) => isCynotechnicienFonction(a.fonction) && cynotechnicienSpecialty(a) === "explosives",
        ),
      },
    };
  }, [agents, todayExclusions]);

  const gradeOptions = useMemo(
    () => uniquePersonnelGrades(agents ?? []),
    [agents],
  );

  const showSenioritySort = useMemo(
    () => hasPersonnelSeniorityData(agents ?? []),
    [agents],
  );

  const filtered = useMemo(() => {
    let list = agents ?? [];
    const exclusions = todayExclusions as AgentExclusionRecord[];

    if (activeFilter !== "all") {
      const active = activeFilter === "active";
      list = list.filter((a) => a.active === active);
    }
    if (sectionFilter !== "all") {
      list = list.filter((a) => a.section_id === sectionFilter);
    }
    if (gradeFilter !== "all") {
      list = list.filter((a) => (a.grade?.trim() ?? "") === gradeFilter);
    }
    if (fonctionFilter !== "all") {
      list = list.filter(
        (a) => normalizePersonnelFonction(a.fonction) === fonctionFilter,
      );
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
    if (statusFilter !== "all") {
      list = list.filter((a) =>
        personnelMatchesStatusFilter(a, exclusions, statusFilter),
      );
    }
    if (maritalFilter !== "all") {
      list = list.filter((a) => normalizeMaritalStatus(a.marital_status) === maritalFilter);
    }

    list = list.filter((a) =>
      personnelMatchesSearch(a, search, (fonction) => t(`personnelFonction.${fonction}`)),
    );

    const sorted = [...list];
    sorted.sort((a, b) => comparePersonnelRows(a, b, sortBy, exclusions));
    return sorted;
  }, [
    agents,
    activeFilter,
    sectionFilter,
    gradeFilter,
    fonctionFilter,
    genderFilter,
    specialtyFilter,
    statusFilter,
    maritalFilter,
    sortBy,
    search,
    todayExclusions,
    t,
  ]);

  /** Two-table layout: admin/command first (hierarchy), then Cynotechniciens. */
  const { administrative: adminRows, operational: operationalRows } = useMemo(
    () => splitPersonnelIntoTwoTables(filtered),
    [filtered],
  );

  const displayList = useMemo(
    () => [...adminRows, ...operationalRows],
    [adminRows, operationalRows],
  );

  const totalPages = Math.max(1, Math.ceil(displayList.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return displayList.slice(start, start + PAGE_SIZE);
  }, [displayList, page]);

  const pageAdminRows = useMemo(
    () => paginated.filter((agent) => !usesOperationalPersonnelColumns(agent.fonction)),
    [paginated],
  );
  const pageOperationalRows = useMemo(
    () => paginated.filter((agent) => usesOperationalPersonnelColumns(agent.fonction)),
    [paginated],
  );

  const hasActiveFilters =
    search.trim() !== "" ||
    activeFilter !== "all" ||
    sectionFilter !== "all" ||
    gradeFilter !== "all" ||
    fonctionFilter !== "all" ||
    genderFilter !== "all" ||
    specialtyFilter !== "all" ||
    statusFilter !== "all" ||
    maritalFilter !== "all" ||
    sortBy !== DEFAULT_PERSONNEL_SORT;

  const resetFilters = () => {
    setSearch("");
    setSortBy(DEFAULT_PERSONNEL_SORT);
    setActiveFilter("all");
    setSectionFilter("all");
    setGradeFilter("all");
    setFonctionFilter("all");
    setGenderFilter("all");
    setSpecialtyFilter("all");
    setStatusFilter("all");
    setMaritalFilter("all");
    setPage(1);
  };

  const handleExport = () => {
    if (filtered.length === 0) return;
    exportAgentsCsv(filtered, `fonctionnaires-${todayISODate()}.csv`, t);
    toast.success(t("employees.export.success"));
  };

  const handleExportPdf = async () => {
    if (filtered.length === 0 || exportingPdf) return;
    setExportingPdf(true);
    try {
      const template = await fetchFonctionnairePdfTemplate(db);
      const data = buildCynotechniciansListPdfData(
        filtered,
        todayExclusions as AgentExclusionRecord[],
        new Date(),
        template.fields,
        template.listScope,
      );
      await downloadCynotechniciansListPdfWithLogo({
        data,
        filename: cynotechniciansListFilename(),
      });
      if (shouldAnnounceBrowserPdfExport()) {
        toast.success(t("employees.export.pdfSuccess"));
      }
    } catch (error) {
      console.error("[employees] PDF export failed:", error);
      toast.error(t("employees.export.pdfError"));
    } finally {
      setExportingPdf(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [
    search,
    sortBy,
    activeFilter,
    sectionFilter,
    gradeFilter,
    fonctionFilter,
    genderFilter,
    specialtyFilter,
    statusFilter,
    maritalFilter,
  ]);

  useEffect(() => {
    if (
      !showSenioritySort &&
      (sortBy === "seniority_asc" || sortBy === "seniority_desc")
    ) {
      setSortBy(DEFAULT_PERSONNEL_SORT);
    }
  }, [showSenioritySort, sortBy]);

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
      fonction: normalizePersonnelFonction(a.fonction),
      marital_status: normalizeMaritalStatus(a.marital_status) ?? "",
      date_naissance: normalizeAgentBirthDate(a.date_naissance) ?? "",
      origine: a.origine ?? "",
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
    mutationFn: async (values: AgentForm): Promise<AgentRow> => {
      const payload = normalizeAgentForm(values);
      const maritalStatus = normalizeMaritalStatus(payload.marital_status);
      const birthDate = normalizeAgentBirthDate(payload.date_naissance);
      const birthCode = validateAgentBirthDate(birthDate);
      if (birthCode) {
        const messageKey =
          birthCode === "future"
            ? "validation.dateOfBirthFuture"
            : birthCode === "tooYoung"
              ? "validation.dateOfBirthTooYoung"
              : birthCode === "tooOld"
                ? "validation.dateOfBirthTooOld"
                : "validation.dateOfBirthInvalid";
        throw new Error(t(messageKey));
      }
      const writePayload = {
        ...payload,
        marital_status: maritalStatus,
        date_naissance: birthDate,
      };

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

        return (await updateAgent(editing.id, {
          ...writePayload,
          photo_url: photoUrl,
        })) as AgentRow;
      }

      const created = await createAgent(writePayload);

      if (pendingPhotoFile) {
        const photoUrl = await uploadAgentPhoto(db, created.id, pendingPhotoFile);
        return (await updateAgent(created.id, {
          ...writePayload,
          photo_url: photoUrl,
        })) as AgentRow;
      }

      return created as AgentRow;
    },
    onSuccess: async (saved) => {
      toast.success(editing ? t("employees.toast.updated") : t("employees.toast.created"));
      // Immediate table update (Situation familiale) before network refetch completes.
      queryClient.setQueryData<AgentRow[]>(["agents-full"], (prev) => {
        if (!prev) return [saved];
        const index = prev.findIndex((row) => row.id === saved.id);
        if (index === -1) return [saved, ...prev];
        const next = [...prev];
        next[index] = { ...next[index], ...saved };
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agents-full"] }),
        queryClient.invalidateQueries({ queryKey: ["sections-with-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["sections"] }),
        queryClient.invalidateQueries({ queryKey: ["agent", saved.id] }),
        queryClient.invalidateQueries({ queryKey: ["agent-details", saved.id] }),
      ]);
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
      queryClient.invalidateQueries({ queryKey: ["sections-with-counts"] });
      queryClient.invalidateQueries({ queryKey: ["sections"] });
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

  const agentIdentityColumn = useMemo<ColumnDef<AgentRow>>(
    () => ({
      id: "agent",
      header: t("employees.table.name"),
      meta: { width: "24%" },
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
                {a.origine ? (
                  <p className="truncate text-[10px] text-muted-foreground">
                    {t("employees.field.origine")}: {a.origine}
                  </p>
                ) : null}
              </button>
            </CellTooltip>
          </div>
        );
      },
    }),
    [t],
  );

  const sharedTrailingColumns = useMemo<ColumnDef<AgentRow>[]>(
    () => [
      {
        id: "grade",
        header: t("field.grade"),
        meta: { width: "10%", align: "center" },
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
        header: () => <span className="sr-only">{t("field.gender")}</span>,
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
        id: "marital_status",
        header: t("employees.field.maritalStatus"),
        meta: { width: "12%" },
        cell: ({ row }) => {
          const label = formatMaritalStatusLabel(row.original.marital_status, t);
          const hasValue = !!normalizeMaritalStatus(row.original.marital_status);
          return (
            <CellTooltip label={label}>
              <span
                className={`truncate text-xs ${hasValue ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </CellTooltip>
          );
        },
      },
      {
        id: "disponibilite",
        header: t("employees.table.disponibilite"),
        meta: { width: "11%", align: "center" },
        cell: ({ row }) => {
          const exclusions = todayExclusions as AgentExclusionRecord[];
          const availability = deriveAgentAvailabilityForAgent(row.original, exclusions);
          const label = availabilityLabel(availability, t);
          return (
            <CellTooltip label={label} className="flex justify-center">
              <StatusBadge
                tone={availabilityBadgeTone(availability)}
                className="max-w-full px-1.5 py-0 text-[10px]"
              >
                <span className="truncate">{label}</span>
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
        meta: { width: "10%", sticky: "right", align: "right" },
        cell: ({ row }) => (
          <RowActionButtons
            className="opacity-90 transition-opacity group-hover:opacity-100"
            editLabel={t("aria.edit")}
            deleteLabel={t("aria.delete")}
            onEdit={() => openEdit(row.original)}
            onDelete={() => setDeleteTarget(row.original)}
          />
        ),
      },
    ],
    [t, todayExclusions],
  );

  /** Administrative / command — Fonction column; no dog / specialty / section. */
  const adminColumns = useMemo<ColumnDef<AgentRow>[]>(
    () => [
      { ...agentIdentityColumn, meta: { width: "26%" } },
      {
        id: "fonction",
        header: t("employees.table.fonction"),
        meta: { width: "18%" },
        cell: ({ row }) => {
          const fonction = normalizePersonnelFonction(row.original.fonction);
          const label = t(`personnelFonction.${fonction}`);
          return (
            <CellTooltip label={label}>
              <span className="block truncate text-sm font-medium leading-tight text-foreground">
                {label}
              </span>
            </CellTooltip>
          );
        },
      },
      ...sharedTrailingColumns,
    ],
    [agentIdentityColumn, sharedTrailingColumns, t],
  );

  /** Cynotechniciens — full operational columns. */
  const operationalColumns = useMemo<ColumnDef<AgentRow>[]>(
    () => [
      { ...agentIdentityColumn, meta: { width: "22%" } },
      {
        id: "dog",
        header: t("employees.table.assignedDog"),
        meta: { width: "13%" },
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
        meta: { width: "10%", align: "center" },
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
              <StatusBadge
                tone={isNarcotics ? "success" : "danger"}
                className="max-w-full gap-0.5 px-1.5 py-0 text-[10px]"
              >
                {isNarcotics ? (
                  <Pill className="h-2.5 w-2.5 shrink-0" />
                ) : (
                  <Bomb className="h-2.5 w-2.5 shrink-0" />
                )}
                <span className="truncate">{short}</span>
              </StatusBadge>
            </CellTooltip>
          );
        },
      },
      {
        id: "section",
        header: t("field.section"),
        meta: { width: "10%" },
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
      ...sharedTrailingColumns,
    ],
    [agentIdentityColumn, sharedTrailingColumns, t],
  );

  const showPersonnel = (title: string, rows: AgentRow[]) => {
    details.showDetails({
      title,
      columns: personnelStatisticColumns(t),
      rows: mapPersonnelDetailRows(rows, t, todayExclusions as AgentExclusionRecord[]),
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <AgentsPageHero
        title={t("employees.hero.title")}
        subtitle={t("employees.hero.subtitle")}
        breadcrumb={[
          { label: t("auth.brandName") },
          { label: t("nav.employees") },
        ]}
        addLabel={t("employees.addAgent")}
        exportLabel={t("employees.export.label")}
        exportPdfLabel={t("employees.export.pdfLabel")}
        onAdd={openCreate}
        onExport={handleExport}
        onExportPdf={() => void handleExportPdf()}
        exportDisabled={filtered.length === 0}
        exportPdfDisabled={filtered.length === 0 || exportingPdf}
        loading={isLoading}
        managePdfLabel={canManagePdf ? t("entityPdfTable.manageAction") : undefined}
        onManagePdf={canManagePdf ? () => setPdfTemplateOpen(true) : undefined}
      />

      {canManagePdf ? (
        <EntityPdfTableTemplateDialog
          kind="fonctionnaire"
          open={pdfTemplateOpen}
          onOpenChange={setPdfTemplateOpen}
        />
      ) : null}

      <div className="grid auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-8">
        <EmployeesTotalStatCard
          total={stats.total}
          categories={stats.categoryStats}
          specialty={stats.specialty.total}
          label={t("employees.stat.total")}
          trend={
            stats.addedThisMonth > 0
              ? t("employees.stat.trendThisMonth", { count: stats.addedThisMonth })
              : undefined
          }
          loading={isLoading}
          onTotalClick={() => showPersonnel(t("employees.stat.total"), stats.list)}
          onCynotechniciensClick={() =>
            showPersonnel(t("employees.stat.cynotechniciens"), stats.cynotechniciensList)
          }
          onAdministrativeClick={() =>
            showPersonnel(t("employees.stat.administrative"), stats.administrativeList)
          }
          onNarcoticsClick={() =>
            showPersonnel(
              `${t("employees.stat.total")} — ${t("specialty.narcotics")}`,
              stats.specialty.totalNarcotics,
            )
          }
          onExplosivesClick={() =>
            showPersonnel(
              `${t("employees.stat.total")} — ${t("specialty.explosives")}`,
              stats.specialty.totalExplosives,
            )
          }
        />
        <AgentsStatCard
          icon={UserCheck}
          value={stats.available}
          label={t("employees.stat.available")}
          percentage={pct(stats.available, stats.total)}
          iconBgClassName="bg-emerald-500/10 text-emerald-600"
          loading={isLoading}
          onDetailsClick={() => showPersonnel(t("employees.stat.available"), stats.availableList)}
          footer={
            <SpecialtyBreakdownLines
              specialty={stats.specialty.available}
              loading={isLoading}
              onNarcoticsClick={() =>
                showPersonnel(
                  `${t("employees.stat.available")} — ${t("specialty.narcotics")}`,
                  stats.specialty.availableNarcotics,
                )
              }
              onExplosivesClick={() =>
                showPersonnel(
                  `${t("employees.stat.available")} — ${t("specialty.explosives")}`,
                  stats.specialty.availableExplosives,
                )
              }
            />
          }
        />
        <AgentsStatCard
          icon={DogIcon}
          value={stats.withDog}
          label={t("employees.stat.withDog")}
          percentage={pct(stats.withDog, stats.total)}
          iconBgClassName="bg-sky-500/10 text-sky-600"
          loading={isLoading}
          onDetailsClick={() => showPersonnel(t("employees.stat.withDog"), stats.withDogList)}
          footer={
            <SpecialtyBreakdownLines
              specialty={stats.specialty.withDog}
              loading={isLoading}
              onNarcoticsClick={() =>
                showPersonnel(
                  `${t("employees.stat.withDog")} — ${t("specialty.narcotics")}`,
                  stats.specialty.withDogNarcotics,
                )
              }
              onExplosivesClick={() =>
                showPersonnel(
                  `${t("employees.stat.withDog")} — ${t("specialty.explosives")}`,
                  stats.specialty.withDogExplosives,
                )
              }
            />
          }
        />
        <AgentsStatCard
          icon={UserX}
          value={stats.excluded}
          label={t("employees.stat.excluded")}
          percentage={pct(stats.excluded, stats.total)}
          iconBgClassName="bg-red-500/10 text-red-600"
          loading={isLoading}
          onDetailsClick={() => showPersonnel(t("employees.stat.excluded"), stats.excludedList)}
          footer={
            <SpecialtyBreakdownLines
              specialty={stats.specialty.excluded}
              administrative={stats.excludedAdministrative}
              loading={isLoading}
              onNarcoticsClick={() =>
                showPersonnel(
                  `${t("employees.stat.excluded")} — ${t("specialty.narcotics")}`,
                  stats.specialty.excludedNarcotics,
                )
              }
              onExplosivesClick={() =>
                showPersonnel(
                  `${t("employees.stat.excluded")} — ${t("specialty.explosives")}`,
                  stats.specialty.excludedExplosives,
                )
              }
              onAdministrativeClick={() =>
                showPersonnel(
                  `${t("employees.stat.excluded")} — ${t("employees.stat.administrative")}`,
                  stats.excludedAdministrativeList,
                )
              }
            />
          }
        />
        <AgentsStatCard
          icon={Venus}
          value={stats.female}
          label={t("employees.stat.female")}
          percentage={pct(stats.female, stats.total)}
          iconBgClassName="bg-pink-500/10 text-pink-600"
          loading={isLoading}
          onDetailsClick={() => showPersonnel(t("employees.stat.female"), stats.femaleList)}
          footer={
            <SpecialtyBreakdownLines
              specialty={stats.specialty.female}
              loading={isLoading}
              onNarcoticsClick={() =>
                showPersonnel(
                  `${t("employees.stat.female")} — ${t("specialty.narcotics")}`,
                  stats.specialty.femaleNarcotics,
                )
              }
              onExplosivesClick={() =>
                showPersonnel(
                  `${t("employees.stat.female")} — ${t("specialty.explosives")}`,
                  stats.specialty.femaleExplosives,
                )
              }
            />
          }
        />
        <AgentsStatCard
          icon={Mars}
          value={stats.male}
          label={t("employees.stat.male")}
          percentage={pct(stats.male, stats.total)}
          iconBgClassName="bg-indigo-500/10 text-indigo-600"
          loading={isLoading}
          onDetailsClick={() => showPersonnel(t("employees.stat.male"), stats.maleList)}
          footer={
            <SpecialtyBreakdownLines
              specialty={stats.specialty.male}
              loading={isLoading}
              onNarcoticsClick={() =>
                showPersonnel(
                  `${t("employees.stat.male")} — ${t("specialty.narcotics")}`,
                  stats.specialty.maleNarcotics,
                )
              }
              onExplosivesClick={() =>
                showPersonnel(
                  `${t("employees.stat.male")} — ${t("specialty.explosives")}`,
                  stats.specialty.maleExplosives,
                )
              }
            />
          }
        />
        <AgentsStatCard
          icon={Bomb}
          value={stats.explosives}
          label={t("employees.stat.explosives")}
          percentage={pct(stats.explosives, stats.total)}
          iconBgClassName="bg-orange-500/10 text-orange-600"
          loading={isLoading}
          onDetailsClick={() => showPersonnel(t("employees.stat.explosives"), stats.explosivesList)}
        />
        <AgentsStatCard
          icon={Pill}
          value={stats.narcotics}
          label={t("employees.stat.narcotics")}
          percentage={pct(stats.narcotics, stats.total)}
          iconBgClassName="bg-teal-500/10 text-teal-600"
          loading={isLoading}
          onDetailsClick={() => showPersonnel(t("employees.stat.narcotics"), stats.narcoticsList)}
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
        <div className="flex min-w-0 items-center gap-2 sm:min-w-[16rem]">
          <span className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline">
            {t("employees.sort.label")}
          </span>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as PersonnelSortKey)}
          >
            <FilterSelectTrigger
              className="min-w-[11rem] sm:min-w-[14rem]"
              aria-label={t("employees.sort.label")}
            >
              <SelectValue placeholder={t("employees.sort.label")} />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="matricule_asc">{t("employees.sort.matriculeAsc")}</SelectItem>
              <SelectItem value="matricule_desc">{t("employees.sort.matriculeDesc")}</SelectItem>
              <SelectItem value="name_asc">{t("employees.sort.nameAsc")}</SelectItem>
              <SelectItem value="name_desc">{t("employees.sort.nameDesc")}</SelectItem>
              <SelectItem value="grade_asc">{t("employees.sort.grade")}</SelectItem>
              <SelectItem value="fonction_asc">{t("employees.sort.fonction")}</SelectItem>
              <SelectItem value="section_asc">{t("employees.sort.section")}</SelectItem>
              <SelectItem value="specialty_asc">{t("employees.sort.specialty")}</SelectItem>
              <SelectItem value="availability_asc">{t("employees.sort.availability")}</SelectItem>
              <SelectItem value="marital_asc">{t("employees.sort.marital")}</SelectItem>
              <SelectItem value="gender_asc">{t("employees.sort.gender")}</SelectItem>
              {showSenioritySort ? (
                <>
                  <SelectItem value="seniority_asc">{t("employees.sort.seniorityAsc")}</SelectItem>
                  <SelectItem value="seniority_desc">{t("employees.sort.seniorityDesc")}</SelectItem>
                </>
              ) : null}
            </SelectContent>
          </Select>
        </div>
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
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <FilterSelectTrigger>
            <SelectValue placeholder={t("employees.filter.grade")} />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("employees.filter.allGrades")}</SelectItem>
            {gradeOptions.map((grade) => (
              <SelectItem key={grade} value={grade}>
                {grade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as PersonnelStatusFilter)}
        >
          <FilterSelectTrigger>
            <SelectValue placeholder={t("employees.filter.operationalStatus")} />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("employees.filter.allStatuses")}</SelectItem>
            <SelectItem value="available">{t("employees.operationalStatus.available")}</SelectItem>
            {PERSONNEL_STATUS_FILTER_TYPES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`exclusions.type.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fonctionFilter} onValueChange={setFonctionFilter}>
          <FilterSelectTrigger>
            <SelectValue placeholder={t("employees.filter.fonction")} />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("employees.filter.allFonctions")}</SelectItem>
            {PERSONNEL_FONCTIONS.map((fonction) => (
              <SelectItem key={fonction} value={fonction}>
                {t(`personnelFonction.${fonction}`)}
              </SelectItem>
            ))}
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
        <Select
          value={maritalFilter}
          onValueChange={(v) => setMaritalFilter(v as MaritalFilter)}
        >
          <FilterSelectTrigger>
            <SelectValue placeholder={t("employees.field.maritalStatus")} />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("employees.maritalStatus.filterAll")}</SelectItem>
            {MARITAL_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`employees.maritalStatus.${status}`)}
              </SelectItem>
            ))}
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
              displayed: displayList.length,
              total: agents?.length ?? 0,
            })}
          </p>
        }
        footer={
          displayList.length > 0 ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {t("employees.table.pagination", {
                  from: (page - 1) * PAGE_SIZE + 1,
                  to: Math.min(page * PAGE_SIZE, displayList.length),
                  total: displayList.length,
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
            {displayList.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t("employees.empty.title")}
                description={t("employees.empty.description")}
              />
            ) : (
              <div className="space-y-6">
                {pageAdminRows.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                      {t("employees.table.adminTitle")}
                    </h3>
                    <EnterpriseDataTable
                      data={pageAdminRows}
                      columns={adminColumns}
                      getRowId={(row) => row.id}
                      layout="fixed"
                      density="compact"
                      responsiveScroll
                    />
                  </div>
                ) : null}
                {pageOperationalRows.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                      {t("employees.table.operationalTitle")}
                    </h3>
                    <EnterpriseDataTable
                      data={pageOperationalRows}
                      columns={operationalColumns}
                      getRowId={(row) => row.id}
                      layout="fixed"
                      density="compact"
                      responsiveScroll
                    />
                  </div>
                ) : null}
              </div>
            )}
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
      <StatisticDetailsDialog
        open={details.open}
        onOpenChange={details.onOpenChange}
        payload={details.payload}
      />
    </div>
  );
}
