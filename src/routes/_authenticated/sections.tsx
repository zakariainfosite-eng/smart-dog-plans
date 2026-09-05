import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Activity, Layers, Plus } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import {
  createSection,
  deleteSection,
  getAgents,
  getSections,
  updateSection,
} from "@/integrations/database";
import type { Section, SectionWithAgentCount, ShiftType } from "@/integrations/database";
import { PageTitle } from "@/components/layout/PageTitle";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  PageContentShell,
  pageHeroLastUpdatedMeta,
} from "@/components/enterprise/page-layout";
import { formatPageLastUpdated } from "@/lib/page-ui";
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { usePlanningSettings } from "@/hooks/use-planning-settings";
import { shiftHoursI18nParams } from "@/lib/planning-settings";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { SearchField } from "@/components/enterprise/search-field";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { SectionManagementCard } from "@/components/enterprise/section-management-card";
import { SectionDetailSheet } from "@/components/sections/section-detail-sheet";
import { SectionAssignmentsDialog } from "@/components/sections/section-assignments-dialog";
import { SectionExclusionsSheet } from "@/components/sections/section-exclusions-sheet";
import {
  SectionStatDialog,
  type SectionStatDialogKind,
} from "@/components/sections/section-stat-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY,
  fetchActiveExclusionsForDate,
  todayISODate,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import type { ExclusionType } from "@/lib/agent-exclusions";
import {
  SECTION_EXCLUSION_DISPLAY_TYPES,
  computeSectionOperationalStats,
  emptySectionExclusionBreakdown,
  groupSectionExclusionTypesByLabel,
} from "@/lib/section-operational-stats";
import {
  resolveSectionCommanderDisplay,
  SECTION_COMMANDER_MANUAL_FILL_DOTS,
  type SectionCommanderDisplay,
} from "@/lib/section-commander-display";

const EMPTY_SECTION_BREAKDOWN = emptySectionExclusionBreakdown();

export const Route = createFileRoute("/_authenticated/sections")({
  head: () => ({ meta: [{ title: "Sections — CynoPlanning" }] }),
  component: SectionsPage,
});

function createSectionSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().max(80),
    shift_type: z.enum(["day", "night"]),
    active: z.boolean(),
    // Commander identity is owned by Personnel (Chef de section) — never edited here.
    commander_full_name: z.string().trim().max(120).optional().default(""),
    commander_grade: z.string().trim().max(60).optional().default(""),
    commander_mle: z.string().trim().max(40).optional().default(""),
  });
}
type SectionForm = z.infer<ReturnType<typeof createSectionSchema>>;

type FilterValue = "all" | "active" | "inactive" | "day" | "night";

type SectionWithCount = SectionWithAgentCount;

function SectionsPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.sections.title");
  const { hours: planningHours } = usePlanningSettings();
  const shiftHourLabels = shiftHoursI18nParams(planningHours);

  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SectionWithCount | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const [exclusionsSectionId, setExclusionsSectionId] = useState<string | null>(null);
  const [exclusionsBreakdownTypes, setExclusionsBreakdownTypes] = useState<
    ExclusionType[] | null
  >(null);
  const [exclusionsBreakdownLabel, setExclusionsBreakdownLabel] = useState<
    string | null
  >(null);
  const [statDialog, setStatDialog] = useState<{
    sectionId: string;
    kind: SectionStatDialogKind;
  } | null>(null);

  const statusReferenceISO = todayISODate();

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["sections-with-counts"],
    queryFn: getSections,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-full"],
    queryFn: getAgents,
  });

  const { data: todayExclusions = [] } = useQuery({
    queryKey: [...ACTIVE_EXCLUSIONS_TODAY_QUERY_KEY, statusReferenceISO],
    queryFn: () => fetchActiveExclusionsForDate(db, statusReferenceISO),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    staleTime: 0,
  });

  const exclusions = todayExclusions as AgentExclusionRecord[];

  const sectionExclusionDisplayGroups = useMemo(
    () =>
      groupSectionExclusionTypesByLabel(SECTION_EXCLUSION_DISPLAY_TYPES, (type) =>
        t(`exclusions.type.${type}`),
      ),
    [t, locale],
  );

  const statsBySectionId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeSectionOperationalStats>>();
    for (const section of data ?? []) {
      map.set(
        section.id,
        computeSectionOperationalStats(section.id, agents, exclusions, statusReferenceISO),
      );
    }
    return map;
  }, [data, agents, exclusions, statusReferenceISO]);

  const commanderBySectionId = useMemo(() => {
    const map = new Map<string, SectionCommanderDisplay>();
    for (const section of data ?? []) {
      map.set(
        section.id,
        resolveSectionCommanderDisplay({
          sectionId: section.id,
          agents,
          exclusions,
          fallback: {
            fullName: section.commander_full_name,
            grade: section.commander_grade,
            mle: section.commander_mle,
          },
        }),
      );
    }
    return map;
  }, [data, agents, exclusions]);

  const selectedSection = useMemo(() => {
    if (!selectedSectionId) return null;
    return (data ?? []).find((s) => s.id === selectedSectionId) ?? null;
  }, [data, selectedSectionId]);

  const exclusionsSection = useMemo(() => {
    if (!exclusionsSectionId) return null;
    return (data ?? []).find((s) => s.id === exclusionsSectionId) ?? null;
  }, [data, exclusionsSectionId]);

  const statDialogSection = useMemo(() => {
    if (!statDialog) return null;
    return (data ?? []).find((s) => s.id === statDialog.sectionId) ?? null;
  }, [data, statDialog]);

  const filtered = useMemo(() => {
    const list = data ?? [];
    return list.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "active") return s.active;
      if (filter === "inactive") return !s.active;
      if (filter === "day") return s.shift_type === "day";
      if (filter === "night") return s.shift_type === "night";
      return true;
    });
  }, [data, search, filter]);

  const sectionCount = useMemo(() => (data ?? []).length, [data]);
  const activeSectionCount = useMemo(
    () => (data ?? []).filter((s) => s.active).length,
    [data],
  );

  const hasActiveFilters = !!search || filter !== "all";

  const resetFilters = () => {
    setSearch("");
    setFilter("all");
  };

  const lastUpdated = formatPageLastUpdated(dataUpdatedAt, locale);

  const upsert = useMutation({
    mutationFn: async (values: SectionForm & { id?: string }) => {
      if (values.id) {
        // Preserve commander fields — they are synced from Chef de section personnel.
        const existing = (data ?? []).find((s) => s.id === values.id);
        await updateSection(values.id, {
          name: values.name,
          shift_type: values.shift_type,
          active: values.active,
          commander_full_name: existing?.commander_full_name ?? "",
          commander_grade: existing?.commander_grade ?? "",
          commander_mle: existing?.commander_mle ?? "",
        });
      } else {
        await createSection({
          name: values.name,
          shift_type: values.shift_type,
          active: values.active,
          commander_full_name: "",
          commander_grade: "",
          commander_mle: "",
        });
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? t("sections.toast.updated") : t("sections.toast.created"));
      setDialogOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["sections-with-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (section: SectionWithCount) => {
      if (section.agent_count > 0) {
        throw new Error(t("sections.error.hasAgents"));
      }
      await deleteSection(section.id);
    },
    onSuccess: () => {
      toast.success(t("sections.toast.deleted"));
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["sections-with-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (s: Section) => { setEditing(s); setDialogOpen(true); };
  const openDetail = (s: SectionWithCount) => {
    setSelectedSectionId(s.id);
    setDetailOpen(true);
  };
  const openAssignments = () => {
    setAssignmentsOpen(true);
  };

  useEffect(() => {
    if (!detailOpen && !assignmentsOpen) {
      setSelectedSectionId(null);
    }
  }, [detailOpen, assignmentsOpen]);

  const openSectionExclusions = (
    sectionId: string,
    breakdownTypes: ExclusionType[] | null = null,
    breakdownLabel: string | null = null,
  ) => {
    setExclusionsBreakdownTypes(breakdownTypes);
    setExclusionsBreakdownLabel(breakdownLabel);
    setExclusionsSectionId(sectionId);
  };

  return (
    <div className="space-y-6">
      <PageTitle
        icon={Layers}
        title={t("sections.title")}
        description={t("sections.description")}
        loading={isLoading}
        breadcrumb={[
          { label: t("auth.brandName") },
          { label: t("nav.sections") },
        ]}
        meta={[
          {
            label: t("sections.hero.totalSections"),
            value: sectionCount,
            icon: Layers,
          },
          pageHeroLastUpdatedMeta(t("common.page.lastUpdated"), lastUpdated),
          {
            label: t("sections.hero.activeSections"),
            value: activeSectionCount,
            icon: Activity,
            valueClassName: "text-emerald-700",
          },
        ]}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t("sections.new")}
          </Button>
        }
      />

      <FilterBar
        showReset={hasActiveFilters}
        onReset={resetFilters}
        resetLabel={t("common.page.filterReset")}
      >
        <SearchField
          className="min-w-0 flex-1 lg:max-w-md"
          placeholder={t("common.searchByName")}
          value={search}
          onChange={setSearch}
        />
        <FilterPills>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
            <FilterSelectTrigger><SelectValue /></FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.allSections")}</SelectItem>
              <SelectItem value="active">{t("common.active")}</SelectItem>
              <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
              <SelectItem value="day">{t("sections.filter.dayShift")}</SelectItem>
              <SelectItem value="night">{t("sections.filter.nightShift")}</SelectItem>
            </SelectContent>
          </Select>
        </FilterPills>
      </FilterBar>

      <PageContentShell>
        {isLoading ? (
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[320px] rounded-[18px]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={search || filter !== "all" ? t("sections.empty.noMatch") : t("sections.empty.none")}
            description={
              search || filter !== "all"
                ? t("common.tryAdjustFilters")
                : t("sections.empty.createFirst")
            }
          />
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3.5">
            {filtered.map((s) => {
              const stats = statsBySectionId.get(s.id) ?? {
                assigned: s.agent_count,
                available: s.agent_count,
                unavailable: 0,
                activeExclusions: 0,
                byReason: EMPTY_SECTION_BREAKDOWN,
                narcotics: 0,
                narcoticsTotal: 0,
                explosives: 0,
                explosivesTotal: 0,
              };
              const commander = commanderBySectionId.get(s.id);
              const commanderManualFill = commander?.needsManualFill ?? false;
              const commanderMode = commander?.mode ?? "chief";
              return (
                <SectionManagementCard
                  key={s.id}
                  name={s.name}
                  shiftType={s.shift_type}
                  active={s.active}
                  agentCount={stats.assigned}
                  availableCount={stats.available}
                  exclusionBreakdown={stats.byReason}
                  breakdownLabels={sectionExclusionDisplayGroups.map((group) => ({
                    key: group.key,
                    label: group.label,
                    types: group.types,
                  }))}
                  narcoticsOperational={stats.narcotics}
                  narcoticsTotal={stats.narcoticsTotal}
                  explosivesOperational={stats.explosives}
                  explosivesTotal={stats.explosivesTotal}
                  narcoticsLabel={t("sections.stat.narcotics")}
                  explosivesLabel={t("sections.stat.explosives")}
                  operationalLabel={t("sections.stat.operational")}
                  totalLabel={t("sections.stat.total")}
                  commanderFullName={
                    commanderManualFill
                      ? SECTION_COMMANDER_MANUAL_FILL_DOTS
                      : commander?.fullName || s.commander_full_name
                  }
                  commanderGrade={
                    commanderManualFill
                      ? SECTION_COMMANDER_MANUAL_FILL_DOTS
                      : commander?.grade || s.commander_grade
                  }
                  commanderMle={
                    commanderManualFill
                      ? SECTION_COMMANDER_MANUAL_FILL_DOTS
                      : commander?.mle || s.commander_mle
                  }
                  commanderManualFill={commanderManualFill}
                  shiftDayLabel={t("shift.dayShort", shiftHourLabels)}
                  shiftNightLabel={t("shift.nightShort", shiftHourLabels)}
                  activeLabel={t("common.active")}
                  inactiveLabel={t("common.inactive")}
                  agentsLabel={t("sections.stat.assigned")}
                  availableLabel={t("sections.stat.available")}
                  exclusionsDetailLabel={t("sections.stat.exclusionsDetail")}
                  commanderLabel={
                    commanderMode === "adjoint_replacement"
                      ? t("sections.commander.adjointReplacement")
                      : t("sections.field.commanderFullName")
                  }
                  gradeLabel={t("sections.field.commanderGrade")}
                  mleLabel={t("sections.field.commanderMle")}
                  editLabel={t("action.edit")}
                  deleteLabel={t("action.delete")}
                  openLabel={t("sections.detail.open")}
                  onOpen={() => openDetail(s)}
                  onAssignedClick={() => setStatDialog({ sectionId: s.id, kind: "assigned" })}
                  onAvailableClick={() => setStatDialog({ sectionId: s.id, kind: "available" })}
                  onNarcoticsClick={() => setStatDialog({ sectionId: s.id, kind: "narcotics" })}
                  onExplosivesClick={() => setStatDialog({ sectionId: s.id, kind: "explosives" })}
                  onExclusionsClick={() => openSectionExclusions(s.id)}
                  onExclusionTypeClick={(types, label) =>
                    openSectionExclusions(s.id, types, label)
                  }
                  onEdit={() => openEdit(s)}
                  onDelete={() => setDeleteTarget(s)}
                />
              );
            })}
          </div>
        )}
      </PageContentShell>

      <SectionDetailSheet
        section={selectedSection}
        open={detailOpen && !!selectedSection}
        onOpenChange={setDetailOpen}
        agents={agents}
        exclusions={exclusions}
        referenceISO={statusReferenceISO}
        shiftHoursLabel={
          selectedSection
            ? selectedSection.shift_type === "day"
              ? t("shift.dayHours", shiftHourLabels)
              : t("shift.nightHours", shiftHourLabels)
            : ""
        }
        onManageAssignments={openAssignments}
      />

      <SectionStatDialog
        open={!!statDialogSection}
        onOpenChange={(open) => {
          if (!open) setStatDialog(null);
        }}
        kind={statDialog?.kind ?? null}
        sectionName={statDialogSection?.name ?? null}
        sectionId={statDialogSection?.id ?? null}
        agents={agents}
        exclusions={exclusions}
        referenceISO={statusReferenceISO}
      />

      <SectionAssignmentsDialog
        open={assignmentsOpen && !!selectedSection}
        onOpenChange={setAssignmentsOpen}
        section={selectedSection}
        sections={data ?? []}
        agents={agents}
        exclusions={exclusions}
        referenceISO={statusReferenceISO}
      />

      <SectionExclusionsSheet
        open={!!exclusionsSection}
        onOpenChange={(open) => {
          if (!open) {
            setExclusionsSectionId(null);
            setExclusionsBreakdownTypes(null);
            setExclusionsBreakdownLabel(null);
          }
        }}
        sectionName={exclusionsSection?.name ?? null}
        sectionId={exclusionsSection?.id ?? null}
        agents={agents}
        exclusions={exclusions}
        referenceISO={statusReferenceISO}
        breakdownTypes={exclusionsBreakdownTypes}
        breakdownLabel={exclusionsBreakdownLabel}
      />

      <SectionDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        initial={editing}
        onSubmit={(v) => upsert.mutate({ ...v, id: editing?.id })}
        submitting={upsert.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sections.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.agent_count > 0
                ? t("sections.delete.hasAgents", {
                    name: deleteTarget.name,
                    count: deleteTarget.agent_count,
                  })
                : deleteTarget
                  ? t("sections.delete.confirm", { name: deleteTarget.name })
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || deleteTarget.agent_count > 0 || remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) remove.mutate(deleteTarget);
              }}
              className={buttonVariants({ variant: "danger" })}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionDialog({
  open, onOpenChange, initial, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Section | null;
  onSubmit: (v: SectionForm) => void;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const { hours: planningHours } = usePlanningSettings();
  const shiftHourLabels = shiftHoursI18nParams(planningHours);
  const sectionSchema = useMemo(() => createSectionSchema(t), [t]);

  const [name, setName] = useState("");
  const [shiftType, setShiftType] = useState<ShiftType>("day");
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setShiftType(initial?.shift_type ?? "day");
      setActive(initial?.active ?? true);
      setErrors({});
    }
  }, [open, initial]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = sectionSchema.safeParse({
      name,
      shift_type: shiftType,
      active,
      commander_full_name: initial?.commander_full_name ?? "",
      commander_grade: initial?.commander_grade ?? "",
      commander_mle: initial?.commander_mle ?? "",
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[issue.path.join(".")] = issue.message;
      setErrors(errs);
      return;
    }
    onSubmit(parsed.data);
  };

  const hasLinkedCommander = Boolean(initial?.commander_full_name?.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{initial ? t("sections.dialog.editTitle") : t("sections.dialog.newTitle")}</DialogTitle>
            <DialogDescription>
              {initial ? t("sections.dialog.editDesc") : t("sections.dialog.newDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                {t("sections.field.sectionName")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("sections.placeholder.name")}
                maxLength={80}
                autoFocus
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("sections.field.shiftType")}</Label>
              <Select value={shiftType} onValueChange={(v) => setShiftType(v as ShiftType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t("shift.dayHours", shiftHourLabels)}</SelectItem>
                  <SelectItem value="night">{t("shift.nightHours", shiftHourLabels)}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/20 p-3">
              <p className="text-sm font-medium text-foreground">{t("sections.commander.title")}</p>
              {hasLinkedCommander ? (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    {initial?.commander_full_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("sections.field.commanderGrade")}:{" "}
                    <span className="font-medium text-foreground">
                      {initial?.commander_grade || "—"}
                    </span>
                    {" · "}
                    {t("sections.field.commanderMle")}:{" "}
                    <span className="font-medium text-foreground">
                      {initial?.commander_mle || "—"}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("sections.commander.linkedFromPersonnel")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("sections.commander.autoHint")}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="active">{t("field.active")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("sections.hint.inactiveHidden")}
                </p>
              </div>
              <Switch id="active" checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("action.saving")
                : initial
                  ? t("action.saveChanges")
                  : t("sections.submit.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
