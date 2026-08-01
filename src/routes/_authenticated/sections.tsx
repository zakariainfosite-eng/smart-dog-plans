import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Layers, Plus } from "lucide-react";
import { toast } from "sonner";

import { createSection, deleteSection, getSections, updateSection } from "@/integrations/database";
import type { Section, SectionWithAgentCount, ShiftType } from "@/integrations/database";
import { PageTitle } from "@/components/layout/PageTitle";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  PageContentShell,
  pageHeroLastUpdatedMeta,
} from "@/components/enterprise/page-layout";
import { formatPageLastUpdated } from "@/lib/page-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FilterBar, FilterPills } from "@/components/enterprise/filter-bar";
import { SearchField } from "@/components/enterprise/search-field";
import { FilterSelectTrigger } from "@/components/enterprise/filter-select";
import { SectionManagementCard } from "@/components/enterprise/section-management-card";
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
import { useI18n } from "@/hooks/use-i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

export const Route = createFileRoute("/_authenticated/sections")({
  head: () => ({ meta: [{ title: "Sections — Smart K9 Planning" }] }),
  component: SectionsPage,
});

function createSectionSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(2, t("validation.nameMinLength")).max(80),
    shift_type: z.enum(["day", "night"]),
    active: z.boolean(),
    commander_full_name: z.string().trim().min(1, t("validation.commanderFullNameRequired")).max(120),
    commander_grade: z.string().trim().min(1, t("validation.gradeRequired")).max(60),
    commander_mle: z.string().trim().min(1, t("validation.profNumberRequired")).max(40),
  });
}
type SectionForm = z.infer<ReturnType<typeof createSectionSchema>>;

type FilterValue = "all" | "active" | "inactive" | "day" | "night";

type SectionWithCount = SectionWithAgentCount;

function SectionsPage() {
  const { t, locale } = useI18n();
  useDocumentTitle("meta.sections.title");

  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SectionWithCount | null>(null);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["sections-with-counts"],
    queryFn: getSections,
  });

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

  const hasActiveFilters = !!search || filter !== "all";

  const resetFilters = () => {
    setSearch("");
    setFilter("all");
  };

  const lastUpdated = formatPageLastUpdated(dataUpdatedAt, locale);

  const upsert = useMutation({
    mutationFn: async (values: SectionForm & { id?: string }) => {
      if (values.id) {
        await updateSection(values.id, {
          name: values.name,
          shift_type: values.shift_type,
          active: values.active,
          commander_full_name: values.commander_full_name,
          commander_grade: values.commander_grade,
          commander_mle: values.commander_mle,
        });
      } else {
        await createSection({
          name: values.name,
          shift_type: values.shift_type,
          active: values.active,
          commander_full_name: values.commander_full_name,
          commander_grade: values.commander_grade,
          commander_mle: values.commander_mle,
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

  return (
    <div className="space-y-6">
      <PageTitle
        icon={Layers}
        title={t("sections.title")}
        description={t("sections.description")}
        loading={isLoading}
        meta={[
          pageHeroLastUpdatedMeta(t("common.page.lastUpdated"), lastUpdated),
          { label: t("nav.sections"), value: sectionCount },
        ]}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("sections.new")}
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((s) => (
              <SectionManagementCard
                key={s.id}
                name={s.name}
                shiftType={s.shift_type}
                active={s.active}
                agentCount={s.agent_count}
                createdAt={s.created_at}
                commanderFullName={s.commander_full_name}
                commanderGrade={s.commander_grade}
                commanderMle={s.commander_mle}
                shiftDayLabel={t("shift.dayShort")}
                shiftNightLabel={t("shift.nightShort")}
                activeLabel={t("common.active")}
                inactiveLabel={t("common.inactive")}
                agentsLabel={t("sections.table.assignedAgents")}
                createdLabel={t("sections.table.created")}
                commanderLabel={t("sections.field.commanderFullName")}
                gradeLabel={t("sections.field.commanderGrade")}
                mleLabel={t("sections.field.commanderMle")}
                editLabel={t("action.edit")}
                deleteLabel={t("action.delete")}
                onEdit={() => openEdit(s)}
                onDelete={() => setDeleteTarget(s)}
              />
            ))}
          </div>
        )}
      </PageContentShell>

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
  const sectionSchema = useMemo(() => createSectionSchema(t), [t]);

  const [name, setName] = useState("");
  const [shiftType, setShiftType] = useState<ShiftType>("day");
  const [active, setActive] = useState(true);
  const [commanderFullName, setCommanderFullName] = useState("");
  const [commanderGrade, setCommanderGrade] = useState("");
  const [commanderMle, setCommanderMle] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setShiftType(initial?.shift_type ?? "day");
      setActive(initial?.active ?? true);
      setCommanderFullName(initial?.commander_full_name ?? "");
      setCommanderGrade(initial?.commander_grade ?? "");
      setCommanderMle(initial?.commander_mle ?? "");
      setErrors({});
    }
  }, [open, initial]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = sectionSchema.safeParse({
      name,
      shift_type: shiftType,
      active,
      commander_full_name: commanderFullName,
      commander_grade: commanderGrade,
      commander_mle: commanderMle,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[issue.path.join(".")] = issue.message;
      setErrors(errs);
      return;
    }
    onSubmit(parsed.data);
  };

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
                  <SelectItem value="day">{t("shift.dayHours")}</SelectItem>
                  <SelectItem value="night">{t("shift.nightHours")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium text-foreground">{t("sections.commander.title")}</p>

              <div className="space-y-2">
                <Label htmlFor="commanderFullName">
                  {t("sections.field.commanderFullName")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="commanderFullName"
                  value={commanderFullName}
                  onChange={(e) => setCommanderFullName(e.target.value)}
                  placeholder={t("sections.placeholder.commanderFullName")}
                  maxLength={120}
                />
                {errors.commander_full_name && (
                  <p className="text-sm text-destructive">{errors.commander_full_name}</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="commanderGrade">
                    {t("sections.field.commanderGrade")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="commanderGrade"
                    value={commanderGrade}
                    onChange={(e) => setCommanderGrade(e.target.value)}
                    placeholder={t("sections.placeholder.commanderGrade")}
                    maxLength={60}
                  />
                  {errors.commander_grade && (
                    <p className="text-sm text-destructive">{errors.commander_grade}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commanderMle">
                    {t("sections.field.commanderMle")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="commanderMle"
                    value={commanderMle}
                    onChange={(e) => setCommanderMle(e.target.value)}
                    placeholder={t("sections.placeholder.commanderMle")}
                    maxLength={40}
                  />
                  {errors.commander_mle && (
                    <p className="text-sm text-destructive">{errors.commander_mle}</p>
                  )}
                </div>
              </div>
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
