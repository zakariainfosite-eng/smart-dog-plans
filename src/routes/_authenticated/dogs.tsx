import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import {
  Dog as DogIcon,
  Plus,
  Bomb,
  Pill,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import { RowActionButtons } from "@/components/enterprise/row-action-buttons";
import {
  createDog,
  deleteDog,
  getAgents,
  getDog,
  getDogs,
  updateDog,
  type DogRow,
  type Gender,
} from "@/integrations/database";
import { dogSexSearchTokens, formatDogSexLabel, normalizeDogSex } from "@/lib/dog-sex";
import {
  ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY,
  DOG_EXCLUSION_FORM_TYPES,
  fetchActiveExclusionsForDate,
  todayISODate,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import {
  deriveDogOperationalStatus,
  dogOperationalStatusKey,
  dogOperationalStatusLabelKey,
} from "@/lib/dog-operational-status";
import { PageTitle } from "@/components/layout/PageTitle";
import {
  PageTableShell,
  PageTablePagination,
  pageHeroLastUpdatedMeta,
} from "@/components/enterprise/page-layout";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";
import { KpiCard } from "@/components/enterprise/kpi-card";
import { StatisticDetailsDialog } from "@/components/statistics/statistic-details-dialog";
import { useStatisticDetailsDialog } from "@/hooks/use-statistic-details-dialog";
import { dogStatisticColumns } from "@/lib/statistics/statistic-detail-columns";
import { mapDogDetailRows } from "@/lib/statistics/map-statistic-detail-rows";
import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { SearchField } from "@/components/enterprise/search-field";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { EnterpriseDataTable } from "@/components/enterprise/data-table";
import { StatusBadge as EnterpriseStatusBadge } from "@/components/enterprise/status-badge";
import { CellTooltip } from "@/components/enterprise/cell-tooltip";
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
import { DogAvatar } from "@/components/dogs/dog-avatar";
import { DogDetailsDrawer } from "@/components/dogs/dog-details-drawer";
import { DogFormDialog, type DogFormValues } from "@/components/dogs/dog-form-dialog";
import { DogStatusBadge } from "@/components/dogs/dog-status-badge";
import { DogsStatusStatsCards } from "@/components/dogs/dogs-status-stats-cards";
import { deleteDogPhotoByUrl, uploadDogPhoto, validateDogPhotoFile } from "@/lib/dog-photo-api";
import { formatDogAgeLabel } from "@/lib/dog-ui";
import { formatPageLastUpdated, paginate, totalPages } from "@/lib/page-ui";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { buildDogsListPdfData, dogsListFilename } from "@/lib/documents/build-dogs-list-pdf-data";
import { shouldAnnounceBrowserPdfExport } from "@/lib/documents/export-binary";
import { downloadDogsListPdfWithLogo } from "@/lib/documents/feuille-presence-pdf";
import { EntityPdfTableTemplateDialog } from "@/components/reports-messages/entity-pdf-table-template-dialog";
import { canEditEntityPdfTable, fetchChienPdfTemplate } from "@/lib/reports-messages/entity-pdf-table-store";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dogs")({
  head: () => ({ meta: [{ title: "Chiens — CynoPlanning" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    details: typeof search.details === "string" ? search.details : undefined,
  }),
  component: DogsPage,
});

function createDogSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().max(60),
    gender: z.enum(["male", "female"]),
    specialty: z.enum(["narcotics", "explosives"]),
    /** Legacy column — operational status comes from exclusions, not this field. */
    status: z.literal("available"),
    agent_id: z.string().nullable(),
    active: z.boolean(),
    breed: z.string().trim().max(80),
    microchip_number: z.string().trim().max(40),
    date_of_birth: z.string(),
    training_level: z.string().trim().max(80),
    veterinary_notes: z.string().trim().max(1000),
    observations: z.string().trim().max(500, t("validation.observationsMax")),
    assignment_date: z.string(),
    vaccination_info: z.string().trim().max(500),
    health_status: z.string().trim().max(120),
  });
}

type DogStatusFilter = "all" | "available" | "excluded" | (typeof DOG_EXCLUSION_FORM_TYPES)[number];

type DogForm = z.infer<ReturnType<typeof createDogSchema>>;

const PAGE_SIZE = 15;
const KNOWN_DOG_SPECIALTIES = ["narcotics", "explosives", "currency"] as const;

const emptyForm: DogFormValues = {
  name: "",
  gender: "male",
  specialty: "narcotics",
  status: "available",
  agent_id: null,
  active: true,
  breed: "",
  microchip_number: "",
  date_of_birth: "",
  training_level: "",
  veterinary_notes: "",
  observations: "",
  assignment_date: "",
  vaccination_info: "",
  health_status: "",
};

function toDateInputValue(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return value.slice(0, 10);
}

function formValuesFromDog(dog: DogRow, agentId: string | null): DogFormValues {
  return {
    name: dog.name,
    gender: dog.gender,
    specialty: dog.specialty,
    status: "available",
    active: dog.active,
    agent_id: agentId,
    breed: dog.breed ?? "",
    microchip_number: dog.microchip_number ?? "",
    date_of_birth: toDateInputValue(dog.date_of_birth),
    training_level: dog.training_level ?? "",
    veterinary_notes: dog.veterinary_notes ?? "",
    observations: dog.observations ?? "",
    assignment_date: toDateInputValue(dog.assignment_date),
    vaccination_info: dog.vaccination_info ?? "",
    health_status: dog.health_status ?? "",
  };
}

function resolveAssignedAgentId(
  dog: Pick<DogRow, "id" | "agent">,
  agents: { id: string; dog_id: string | null }[] | undefined,
): string | null {
  return dog.agent?.id ?? agents?.find((agent) => agent.dog_id === dog.id)?.id ?? null;
}

function toDogPayload(values: DogForm) {
  return {
    name: values.name,
    gender: values.gender,
    specialty: values.specialty,
    // Operational status is derived from exclusions — never duplicate it here.
    status: "available" as const,
    active: values.active,
    breed: values.breed.trim() || null,
    microchip_number: values.microchip_number.trim() || null,
    date_of_birth: values.date_of_birth || null,
    training_level: values.training_level.trim() || null,
    veterinary_notes: values.veterinary_notes.trim() || null,
    observations: values.observations.trim() || null,
    assignment_date: values.agent_id && values.assignment_date ? values.assignment_date : null,
    vaccination_info: values.vaccination_info.trim() || null,
    health_status: values.health_status.trim() || null,
  };
}

function DogsPage() {
  const { t, locale } = useI18n();
  const { role } = useAuth();
  const canManagePdf = canEditEntityPdfTable(role);
  useDocumentTitle("meta.dogs.title");
  const dogSchema = useMemo(() => createDogSchema(t), [t]);
  const { details: detailsFromSearch } = Route.useSearch();

  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<"all" | Gender>("all");
  const [sexSort, setSexSort] = useState<"none" | "asc" | "desc">("none");
  const [statusFilter, setStatusFilter] = useState<DogStatusFilter>("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "retired">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DogRow | null>(null);
  const [originalAgentId, setOriginalAgentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DogRow | null>(null);
  const [detailsDogId, setDetailsDogId] = useState<string | null>(detailsFromSearch ?? null);
  const [form, setForm] = useState<DogFormValues>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof DogFormValues, string>>>({});
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfTemplateOpen, setPdfTemplateOpen] = useState(false);
  const details = useStatisticDetailsDialog();

  useEffect(() => {
    if (detailsFromSearch) {
      setDetailsDogId(detailsFromSearch);
    }
  }, [detailsFromSearch]);

  const {
    data: dogs,
    isLoading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["dogs-with-agent"],
    queryFn: () => getDogs(),
  });

  const { data: todayExclusions = [] } = useQuery({
    queryKey: [...ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY, todayISODate()],
    queryFn: () => fetchActiveExclusionsForDate(db, todayISODate()),
  });

  const { data: agents } = useQuery({
    queryKey: ["agents-basic"],
    queryFn: async () => {
      const rows = await getAgents();
      return rows
        .map((agent) => ({
          id: agent.id,
          first_name: agent.first_name,
          last_name: agent.last_name,
          dog_id: agent.dog_id,
          active: agent.active,
        }))
        .sort((a, b) => a.last_name.localeCompare(b.last_name));
    },
  });

  const currentAgentId = useMemo(() => {
    if (!editing) return null;
    return resolveAssignedAgentId(editing, agents) ?? originalAgentId;
  }, [editing, agents, originalAgentId]);

  useEffect(() => {
    if (!dialogOpen || !editing || form.agent_id) return;
    const agentId = resolveAssignedAgentId(editing, agents);
    if (!agentId) return;
    setOriginalAgentId((prev) => prev ?? agentId);
    setForm((prev) => ({ ...prev, agent_id: agentId }));
  }, [dialogOpen, editing, agents, form.agent_id]);

  const exclusions = todayExclusions as AgentExclusionRecord[];

  const dogStatusOf = (dogId: string) => deriveDogOperationalStatus(dogId, exclusions);

  const stats = useMemo(() => {
    const list = dogs ?? [];
    const statuses = new Map(
      list.map((dog) => [dog.id, deriveDogOperationalStatus(dog.id, exclusions)]),
    );
    const activeDogs = list.filter((dog) => statuses.get(dog.id)?.kind !== "excluded");
    const excludedDogs = list.filter((dog) => statuses.get(dog.id)?.kind === "excluded");

    const isNarcoticsGroup = (specialty: string) =>
      specialty === "narcotics" || specialty === "currency";

    const activeNarcoticsDogs = activeDogs.filter((dog) => isNarcoticsGroup(dog.specialty));
    const activeExplosivesDogs = activeDogs.filter((dog) => dog.specialty === "explosives");
    const excludedNarcoticsDogs = excludedDogs.filter((dog) => isNarcoticsGroup(dog.specialty));
    const excludedExplosivesDogs = excludedDogs.filter((dog) => dog.specialty === "explosives");

    const specialtyKeys = new Set<string>(KNOWN_DOG_SPECIALTIES);
    list.forEach((dog) => specialtyKeys.add(dog.specialty));
    const specialties = [...specialtyKeys].map((specialty) => ({
      specialty,
      count: list.filter((dog) => dog.specialty === specialty).length,
    }));

    const exclusionTypes = new Set<string>(DOG_EXCLUSION_FORM_TYPES);
    excludedDogs.forEach((dog) => {
      const status = statuses.get(dog.id);
      if (status?.kind === "excluded") exclusionTypes.add(status.exclusionType);
    });
    const exclusionReasons = [...exclusionTypes].map((exclusionType) => ({
      exclusionType,
      count: excludedDogs.filter((dog) => {
        const status = statuses.get(dog.id);
        return status?.kind === "excluded" && status.exclusionType === exclusionType;
      }).length,
    }));

    return {
      total: list.length,
      list,
      active: activeDogs.length,
      activeDogs,
      excluded: excludedDogs.length,
      excludedDogs,
      activeNarcotics: activeNarcoticsDogs.length,
      activeNarcoticsDogs,
      activeExplosives: activeExplosivesDogs.length,
      activeExplosivesDogs,
      excludedNarcotics: excludedNarcoticsDogs.length,
      excludedNarcoticsDogs,
      excludedExplosives: excludedExplosivesDogs.length,
      excludedExplosivesDogs,
      specialties,
      exclusionReasons,
    };
  }, [dogs, exclusions]);

  const filtered = useMemo(() => {
    const list = (dogs ?? []).filter((dog) => {
      const query = search.trim().toLowerCase();
      const operational = deriveDogOperationalStatus(dog.id, exclusions);
      if (query) {
        const statusLabel = t(dogOperationalStatusLabelKey(operational)).toLowerCase();
        const hay = [
          dog.name,
          dog.breed ?? "",
          dog.microchip_number ?? "",
          dogSexSearchTokens(dog.gender, t),
          statusLabel,
          dogOperationalStatusKey(operational),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (specialtyFilter !== "all" && dog.specialty !== specialtyFilter) return false;
      if (genderFilter !== "all" && dog.gender !== genderFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "excluded") {
          if (operational.kind !== "excluded") return false;
        } else if (dogOperationalStatusKey(operational) !== statusFilter) {
          return false;
        }
      }
      if (activeFilter === "active" && !dog.active) return false;
      if (activeFilter === "retired" && dog.active) return false;
      return true;
    });

    if (sexSort === "none") return list;

    const rank = (gender: DogRow["gender"]) => {
      const sex = normalizeDogSex(gender);
      if (sex === "male") return 0;
      if (sex === "female") return 1;
      return 2;
    };

    return [...list].sort((a, b) => {
      const diff = rank(a.gender) - rank(b.gender);
      return sexSort === "asc" ? diff : -diff;
    });
  }, [
    dogs,
    exclusions,
    search,
    specialtyFilter,
    genderFilter,
    statusFilter,
    activeFilter,
    sexSort,
    t,
  ]);

  const hasFilters =
    search.trim() !== "" ||
    specialtyFilter !== "all" ||
    genderFilter !== "all" ||
    statusFilter !== "all" ||
    activeFilter !== "all" ||
    sexSort !== "none";

  const resetFilters = () => {
    setSearch("");
    setSpecialtyFilter("all");
    setGenderFilter("all");
    setSexSort("none");
    setStatusFilter("all");
    setActiveFilter("all");
    setPage(1);
  };

  const filterBySpecialty = (specialty: string) => {
    setSearch("");
    setSpecialtyFilter(specialty);
    setGenderFilter("all");
    setSexSort("none");
    setStatusFilter("all");
    setActiveFilter("all");
    setPage(1);
  };

  const filterByOperationalStatus = (status: DogStatusFilter) => {
    setSearch("");
    setSpecialtyFilter("all");
    setGenderFilter("all");
    setSexSort("none");
    setStatusFilter(status);
    setActiveFilter("all");
    setPage(1);
  };

  const specialtyLabel = (specialty: string) => {
    if (KNOWN_DOG_SPECIALTIES.includes(specialty as (typeof KNOWN_DOG_SPECIALTIES)[number])) {
      return t(`specialty.${specialty}`);
    }
    return specialty.replace(/[_-]+/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  };

  const cycleSexSort = () => {
    setSexSort((prev) => (prev === "none" ? "asc" : prev === "asc" ? "desc" : "none"));
    setPage(1);
  };

  const handleExportPdf = async () => {
    if (filtered.length === 0 || exportingPdf) return;
    setExportingPdf(true);
    try {
      const template = await fetchChienPdfTemplate(db);
      const data = buildDogsListPdfData(
        filtered,
        new Date(),
        template.fields,
        template.sexFilter,
        template.minAgeYears,
      );
      await downloadDogsListPdfWithLogo({
        data,
        filename: dogsListFilename(),
      });
      if (shouldAnnounceBrowserPdfExport()) {
        toast.success(t("dogs.export.pdfSuccess"));
      }
    } catch (error) {
      console.error("[dogs] PDF export failed:", error);
      toast.error(t("dogs.export.pdfError"));
    } finally {
      setExportingPdf(false);
    }
  };

  const filteredTotal = filtered.length;
  const pages = totalPages(filteredTotal, PAGE_SIZE);
  const paginated = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [search, specialtyFilter, genderFilter, statusFilter, activeFilter]);

  const resetPhotoState = () => {
    setPendingPhotoFile(null);
    setRemovePhoto(false);
    setPhotoError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setOriginalAgentId(null);
    setForm(emptyForm);
    setErrors({});
    resetPhotoState();
    setDialogOpen(true);
  };

  const openEdit = async (dog: DogRow) => {
    try {
      const fresh = await getDog(dog.id);
      if (!fresh) {
        throw new Error(t("dogs.error.loadFailed"));
      }
      const agentId = resolveAssignedAgentId(fresh, agents);
      setEditing(fresh);
      setOriginalAgentId(agentId);
      setForm(formValuesFromDog(fresh, agentId));
      setErrors({});
      resetPhotoState();
      setDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dogs.error.loadFailed"));
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (values: DogForm) => {
      const payload = toDogPayload(values);

      if (pendingPhotoFile) {
        const validationKey = validateDogPhotoFile(pendingPhotoFile);
        if (validationKey) {
          throw new Error(t(`dogs.photo.error.${validationKey}`, { maxMb: 5 }));
        }
      }

      if (editing) {
        let photoUrl = editing.photo_url;

        if (removePhoto) {
          if (editing.photo_url) await deleteDogPhotoByUrl(db, editing.photo_url);
          photoUrl = null;
        } else if (pendingPhotoFile) {
          if (editing.photo_url) await deleteDogPhotoByUrl(db, editing.photo_url);
          photoUrl = await uploadDogPhoto(db, editing.id, pendingPhotoFile);
        }

        const updateInput = {
          ...payload,
          photo_url: photoUrl,
        };
        if (values.agent_id !== originalAgentId) {
          Object.assign(updateInput, {
            agent_id: values.agent_id ?? null,
            previous_agent_id: originalAgentId,
          });
        }
        await updateDog(editing.id, updateInput);
        return;
      }

      const created = await createDog({
        ...payload,
        agent_id: values.agent_id ?? null,
      });

      if (pendingPhotoFile) {
        const photoUrl = await uploadDogPhoto(db, created.id, pendingPhotoFile);
        await updateDog(created.id, { ...payload, photo_url: photoUrl });
      }
    },
    onSuccess: () => {
      toast.success(editing ? t("dogs.toast.updated") : t("dogs.toast.created"));
      queryClient.invalidateQueries({ queryKey: ["dogs-with-agent"] });
      queryClient.invalidateQueries({ queryKey: ["agents-basic"] });
      if (editing) {
        queryClient.invalidateQueries({ queryKey: ["dog-details", editing.id] });
      }
      setDialogOpen(false);
      setEditing(null);
      setOriginalAgentId(null);
      resetPhotoState();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (dog: DogRow) => {
      if (dog.photo_url) await deleteDogPhotoByUrl(db, dog.photo_url);
      await deleteDog(dog.id);
    },
    onSuccess: () => {
      toast.success(t("dogs.toast.deleted"));
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["dogs-with-agent"] });
      queryClient.invalidateQueries({ queryKey: ["agents-basic"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = () => {
    const parsed = dogSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof DogFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof DogFormValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    if (photoError) return;
    saveMutation.mutate(parsed.data);
  };

  const columns = useMemo<ColumnDef<DogRow>[]>(
    () => [
      {
        id: "photo",
        header: t("dogs.table.photo"),
        meta: { width: "56px", align: "center" },
        cell: ({ row }) => (
          <DogAvatar
            name={row.original.name}
            photoUrl={row.original.photo_url}
            specialty={row.original.specialty}
            className="mx-auto h-9 w-9"
          />
        ),
      },
      {
        id: "dog",
        header: t("dogs.field.dogName"),
        meta: { width: "15%" },
        cell: ({ row }) => {
          const dog = row.original;
          return (
            <button
              type="button"
              onClick={() => setDetailsDogId(dog.id)}
              className="block truncate text-left text-sm font-semibold leading-tight text-foreground transition-colors hover:text-primary"
            >
              {dog.name}
            </button>
          );
        },
      },
      {
        id: "sex",
        header: () => (
          <button
            type="button"
            onClick={cycleSexSort}
            className="inline-flex items-center gap-1 text-left hover:text-foreground"
            aria-label={t("dogs.sex.sortAria")}
          >
            <span>{t("dogs.field.sex")}</span>
            {sexSort === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : sexSort === "desc" ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
            )}
          </button>
        ),
        meta: { width: "11%" },
        cell: ({ row }) => {
          const sex = normalizeDogSex(row.original.gender);
          const label = formatDogSexLabel(row.original.gender, t);
          return (
            <CellTooltip label={label}>
              <span
                className={`truncate text-sm ${sex ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </CellTooltip>
          );
        },
      },
      {
        id: "breed",
        header: t("dogs.field.breed"),
        meta: { width: "12%" },
        cell: ({ row }) => (
          <span className="truncate text-sm text-muted-foreground">
            {row.original.breed?.trim() || "—"}
          </span>
        ),
      },
      {
        id: "microchip",
        header: t("dogs.field.microchip"),
        meta: { width: "11%" },
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.microchip_number?.trim() || "—"}
          </span>
        ),
      },
      {
        id: "age",
        header: t("dogs.field.age"),
        meta: { width: "10%" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDogAgeLabel(row.original.date_of_birth, t)}
          </span>
        ),
      },
      {
        id: "handler",
        header: t("dogs.table.currentAgent"),
        meta: { width: "15%" },
        cell: ({ row }) => {
          const agent = row.original.agent;
          if (!agent) {
            return (
              <span className="text-sm text-muted-foreground">{t("dogs.select.unassigned")}</span>
            );
          }
          return (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {agent.first_name} {agent.last_name}
              </p>
              <p className="truncate text-xs text-muted-foreground">{agent.section?.name ?? "—"}</p>
            </div>
          );
        },
      },
      {
        id: "specialty",
        header: t("field.specialty"),
        meta: { width: "13%" },
        cell: ({ row }) => (
          <EnterpriseStatusBadge
            tone="primary"
            className="max-w-full truncate px-2 py-0.5 text-[11px]"
          >
            {t(`specialty.${row.original.specialty}`)}
          </EnterpriseStatusBadge>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        meta: { width: "10%", align: "center" },
        cell: ({ row }) => (
          <div className="flex justify-center">
            <DogStatusBadge status={dogStatusOf(row.original.id)} />
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        meta: { width: "96px", sticky: "right", align: "center" },
        cell: ({ row }) => {
          const dog = row.original;
          return (
            <RowActionButtons
              className="justify-center"
              editLabel={t("aria.edit")}
              deleteLabel={t("aria.delete")}
              onEdit={() => openEdit(dog)}
              onDelete={() => setDeleteTarget(dog)}
            />
          );
        },
      },
    ],
    [t, sexSort, exclusions],
  );

  const specialtyCount = (specialty: string) =>
    stats.specialties.find((entry) => entry.specialty === specialty)?.count ?? 0;

  const showDogs = (title: string, rows: DogRow[]) => {
    details.showDetails({
      title,
      columns: dogStatisticColumns(t),
      rows: mapDogDetailRows(rows, t, exclusions),
    });
  };

  return (
    <div className="space-y-6">
      <PageTitle
        icon={DogIcon}
        title={t("dogs.title")}
        description={t("dogs.description")}
        loading={isLoading}
        meta={[
          { label: t("dogs.stat.total"), value: stats.total },
          pageHeroLastUpdatedMeta(
            t("common.page.lastUpdated"),
            formatPageLastUpdated(dataUpdatedAt, locale),
          ),
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManagePdf ? (
              <Button variant="outline" onClick={() => setPdfTemplateOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" /> {t("entityPdfTable.manageAction")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => void handleExportPdf()}
              disabled={filtered.length === 0 || exportingPdf}
            >
              <FileText className="mr-2 h-4 w-4" /> {t("dogs.export.pdfLabel")}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> {t("dogs.addDog")}
            </Button>
          </div>
        }
      />

      {canManagePdf ? (
        <EntityPdfTableTemplateDialog
          kind="chien"
          open={pdfTemplateOpen}
          onOpenChange={setPdfTemplateOpen}
        />
      ) : null}

      <section aria-labelledby="dogs-overview-title" className="space-y-3">
        <h2 id="dogs-overview-title" className="text-sm font-semibold text-foreground">
          {t("dogs.statistics.overview")}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            icon={DogIcon}
            label={t("dogs.stat.total")}
            value={stats.total}
            accent="primary"
            loading={isLoading}
            className="h-full"
            onDetailsClick={() => showDogs(t("dogs.stat.total"), stats.list)}
          />
          <KpiCard
            icon={Pill}
            label={t("dogs.stat.narcotics")}
            value={specialtyCount("narcotics")}
            accent="warning"
            loading={isLoading}
            className="h-full"
            onDetailsClick={() =>
              showDogs(
                t("dogs.stat.narcotics"),
                stats.list.filter((dog) => dog.specialty === "narcotics"),
              )
            }
          />
          <KpiCard
            icon={Bomb}
            label={t("dogs.stat.explosives")}
            value={specialtyCount("explosives")}
            accent="danger"
            loading={isLoading}
            className="h-full"
            onDetailsClick={() =>
              showDogs(
                t("dogs.stat.explosives"),
                stats.list.filter((dog) => dog.specialty === "explosives"),
              )
            }
          />
        </div>
      </section>

      <section
        aria-labelledby="dogs-status-stats-title"
        className="space-y-3"
      >
        <h2 id="dogs-status-stats-title" className="sr-only">
          {t("dogs.statistics.statusBreakdown")}
        </h2>
        <DogsStatusStatsCards
          loading={isLoading}
          active={{
            narcotics: stats.activeNarcotics,
            explosives: stats.activeExplosives,
            total: stats.active,
          }}
          excluded={{
            narcotics: stats.excludedNarcotics,
            explosives: stats.excludedExplosives,
            total: stats.excluded,
          }}
          onActiveNarcoticsClick={() =>
            showDogs(`${t("dogs.stat.active")} — ${t("dogs.stat.narcotics")}`, stats.activeNarcoticsDogs)
          }
          onActiveExplosivesClick={() =>
            showDogs(`${t("dogs.stat.active")} — ${t("dogs.stat.explosives")}`, stats.activeExplosivesDogs)
          }
          onActiveTotalClick={() => showDogs(t("dogs.statistics.totalActive"), stats.activeDogs)}
          onExcludedNarcoticsClick={() =>
            showDogs(`${t("dogs.stat.excluded")} — ${t("dogs.stat.narcotics")}`, stats.excludedNarcoticsDogs)
          }
          onExcludedExplosivesClick={() =>
            showDogs(`${t("dogs.stat.excluded")} — ${t("dogs.stat.explosives")}`, stats.excludedExplosivesDogs)
          }
          onExcludedTotalClick={() => showDogs(t("dogs.statistics.totalExcluded"), stats.excludedDogs)}
        />
      </section>

      <FilterBar
        showReset={hasFilters}
        onReset={resetFilters}
        resetLabel={t("common.page.filterReset")}
      >
        <SearchField
          className="min-w-0 flex-1 lg:max-w-md"
          placeholder={t("dogs.search")}
          value={search}
          onChange={setSearch}
        />
        <FilterPills>
          <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
            <FilterSelectTrigger>
              <SelectValue placeholder={t("field.specialty")} />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("specialty.all")}</SelectItem>
              {stats.specialties.map(({ specialty }) => (
                <SelectItem key={specialty} value={specialty}>
                  {specialtyLabel(specialty)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={genderFilter}
            onValueChange={(value) => setGenderFilter(value as typeof genderFilter)}
          >
            <FilterSelectTrigger>
              <SelectValue placeholder={t("dogs.field.sex")} />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dogs.sex.filterAll")}</SelectItem>
              <SelectItem value="male">{t("dogs.sex.filterMale")}</SelectItem>
              <SelectItem value="female">{t("dogs.sex.filterFemale")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as DogStatusFilter)}
          >
            <FilterSelectTrigger>
              <SelectValue />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
              <SelectItem value="available">{t("dogStatus.available")}</SelectItem>
              <SelectItem value="excluded">{t("dogs.stat.excluded")}</SelectItem>
              {stats.exclusionReasons.map(({ exclusionType }) => (
                <SelectItem key={exclusionType} value={exclusionType}>
                  {t(`exclusions.type.${exclusionType}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={activeFilter}
            onValueChange={(value) => setActiveFilter(value as typeof activeFilter)}
          >
            <FilterSelectTrigger>
              <SelectValue />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dogs.filter.activeAndRetired")}</SelectItem>
              <SelectItem value="active">{t("dogs.filter.activeOnly")}</SelectItem>
              <SelectItem value="retired">{t("dogs.filter.retiredOnly")}</SelectItem>
            </SelectContent>
          </Select>
        </FilterPills>
      </FilterBar>

      <PageTableShell
        header={
          <p className="text-sm font-medium text-foreground">
            {t("common.page.showing", { displayed: filteredTotal, total: stats.total })}
          </p>
        }
        footer={
          <PageTablePagination
            showingLabel={t("common.page.showing", {
              displayed: paginated.length,
              total: filteredTotal,
            })}
            page={page}
            totalPages={pages}
            onPageChange={setPage}
            prevLabel={t("common.page.prev")}
            nextLabel={t("common.page.next")}
          />
        }
      >
        <DataTableShell isLoading={isLoading} variant="readable">
          <EnterpriseDataTable
            data={paginated}
            columns={columns}
            getRowId={(row) => row.id}
            layout="fixed"
            density="comfortable"
            responsiveScroll
            emptyState={
              <EmptyState
                icon={DogIcon}
                title={dogs?.length ? t("dogs.empty.noMatch") : t("dogs.empty.noProfiles")}
                description={
                  dogs?.length ? t("common.tryAdjustFilters") : t("dogs.empty.registerFirst")
                }
              />
            }
          />
        </DataTableShell>
      </PageTableShell>

      <DogDetailsDrawer
        dogId={detailsDogId}
        dogRow={dogs?.find((dog) => dog.id === detailsDogId) ?? null}
        todayExclusions={exclusions}
        open={!!detailsDogId}
        onOpenChange={(next) => {
          if (!next) setDetailsDogId(null);
        }}
        onEdit={(dog) => {
          setDetailsDogId(null);
          openEdit(dog as DogRow);
        }}
      />

      <DogFormDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) {
            setEditing(null);
            setOriginalAgentId(null);
            resetPhotoState();
          }
        }}
        editing={editing}
        form={form}
        setForm={setForm}
        errors={errors}
        agents={agents ?? []}
        currentAgentId={currentAgentId}
        operationalStatus={editing ? dogStatusOf(editing.id) : { kind: "available" }}
        pendingPhotoFile={pendingPhotoFile}
        removePhoto={removePhoto}
        onPendingPhotoFileChange={setPendingPhotoFile}
        onRemovePhotoChange={setRemovePhoto}
        photoError={photoError}
        onPhotoError={setPhotoError}
        onSubmit={submit}
        isSaving={saveMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dogs.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? t("dogs.delete.description", { name: deleteTarget.name }) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || remove.isPending}
              onClick={(event) => {
                event.preventDefault();
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

// Re-export for backward compatibility with dogs.$id route if needed
export { DogStatusBadge as StatusBadge };
