import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Info, Moon, Sun } from "lucide-react";
import { toast } from "sonner";

import { PageContentShell } from "@/components/enterprise/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { db } from "@/integrations/database/client";
import {
  DEFAULT_PLANNING_SETTINGS,
  PLANNING_SETTINGS_QUERY_KEY,
  canEditPlanningSettings,
  fetchPlanningSettings,
  normalizeHhmm,
  planningSettingsEqual,
  savePlanningSettings,
  validatePlanningSettings,
  type PlanningShiftField,
  type PlanningShiftHours,
  type PlanningValidationErrors,
} from "@/lib/planning-settings";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

function ReadValue({ value }: { value: string }) {
  return (
    <p className="rounded-[var(--radius)] border border-transparent bg-muted/40 px-3 py-2 text-sm tabular-nums text-foreground">
      {value}
    </p>
  );
}

function RotationRow({
  id,
  title,
  description,
  enabledLabel,
}: {
  id: string;
  title: string;
  description: string;
  enabledLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {title}
        </Label>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm text-muted-foreground">{enabledLabel}</span>
        <Switch id={id} checked disabled aria-readonly="true" />
      </div>
    </div>
  );
}

export function PlanningSettingsCard() {
  const { t } = useI18n();
  const { role } = useAuth();
  const canEdit = canEditPlanningSettings(role);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PLANNING_SETTINGS_QUERY_KEY,
    queryFn: () => fetchPlanningSettings(db),
  });

  const saved = query.data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PlanningShiftHours | null>(null);
  const [errors, setErrors] = useState<PlanningValidationErrors>({});
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (saved && !editing) setDraft(saved);
  }, [saved, editing]);

  const current = draft ?? saved;
  const dirty = Boolean(saved && draft && !planningSettingsEqual(saved, draft));

  useEffect(() => {
    if (!editing || !dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editing, dirty]);

  const persist = useMutation({
    mutationFn: (input: PlanningShiftHours) => savePlanningSettings(db, input),
    onSuccess: async (next) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PLANNING_SETTINGS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["operational-summary"] }),
      ]);
      setDraft(next);
      setEditing(false);
      setErrors({});
      setConfirmReset(false);
      toast.success(t("settings.planning.toast.saved"));
    },
    onError: () => {
      toast.error(t("settings.planning.toast.saveFailed"));
    },
  });

  const errorLabel = (field: PlanningShiftField): string | undefined => {
    const issue = errors[field];
    if (!issue) return undefined;
    return t(`settings.planning.errors.${issue}`);
  };

  const patch = (field: PlanningShiftField, value: string) => {
    setDraft((currentDraft) =>
      currentDraft ? { ...currentDraft, [field]: normalizeHhmm(value) } : currentDraft,
    );
    setErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors;
      const next = { ...currentErrors };
      delete next[field];
      return next;
    });
  };

  const startEdit = () => {
    if (!canEdit || !saved) return;
    setDraft(saved);
    setErrors({});
    setEditing(true);
  };

  const discard = () => {
    setDraft(saved ?? null);
    setErrors({});
    setEditing(false);
    setConfirmCancel(false);
  };

  const requestCancel = () => {
    if (dirty) {
      setConfirmCancel(true);
      return;
    }
    discard();
  };

  const onSave = () => {
    if (!draft) return;
    const nextErrors = validatePlanningSettings(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    persist.mutate(draft);
  };

  const onReset = () => {
    persist.mutate(DEFAULT_PLANNING_SETTINGS);
  };

  const fieldsLocked = !editing;
  const busy = persist.isPending || query.isLoading;
  const statusNote = useMemo(() => {
    if (!canEdit) return t("settings.planning.viewOnly");
    if (editing) return t("settings.planning.editingHint");
    return t("settings.planning.idleHint");
  }, [canEdit, editing, t]);

  return (
    <PageContentShell padding={false} className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary">
            <CalendarClock className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{t("settings.planning.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.planning.description")}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">{statusNote}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {canEdit && !editing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={busy}>
                {t("settings.planning.reset.action")}
              </Button>
              <Button type="button" size="sm" onClick={startEdit} disabled={busy || !saved}>
                {t("action.edit")}
              </Button>
            </>
          ) : null}
          {canEdit && editing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={requestCancel} disabled={busy}>
                {t("action.cancel")}
              </Button>
              <Button type="button" size="sm" onClick={onSave} disabled={busy}>
                {persist.isPending ? t("action.saving") : t("action.save")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="divide-y divide-border">
        {query.isError ? (
          <p className="p-5 text-sm text-destructive">{t("settings.planning.loadError")}</p>
        ) : !current ? (
          <p className="p-5 text-sm text-muted-foreground">{t("settings.planning.loading")}</p>
        ) : (
          <>
            <section className="space-y-4 p-5">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{t("settings.planning.groups.hours")}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">{t("settings.planning.groups.hoursDescription")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Sun className="h-4 w-4 text-primary" />
                    {t("shift.day")}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="planning-day-start" label={t("settings.planning.fields.start")} error={errorLabel("dayStart")}>
                      {fieldsLocked ? (
                        <ReadValue value={current.dayStart} />
                      ) : (
                        <Input
                          id="planning-day-start"
                          type="time"
                          step={60}
                          value={current.dayStart}
                          onChange={(event) => patch("dayStart", event.target.value)}
                        />
                      )}
                    </Field>
                    <Field id="planning-day-end" label={t("settings.planning.fields.end")} error={errorLabel("dayEnd")}>
                      {fieldsLocked ? (
                        <ReadValue value={current.dayEnd} />
                      ) : (
                        <Input
                          id="planning-day-end"
                          type="time"
                          step={60}
                          value={current.dayEnd}
                          onChange={(event) => patch("dayEnd", event.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Moon className="h-4 w-4 text-primary" />
                    {t("shift.night")}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      id="planning-night-start"
                      label={t("settings.planning.fields.start")}
                      error={errorLabel("nightStart")}
                    >
                      {fieldsLocked ? (
                        <ReadValue value={current.nightStart} />
                      ) : (
                        <Input
                          id="planning-night-start"
                          type="time"
                          step={60}
                          value={current.nightStart}
                          onChange={(event) => patch("nightStart", event.target.value)}
                        />
                      )}
                    </Field>
                    <Field id="planning-night-end" label={t("settings.planning.fields.end")} error={errorLabel("nightEnd")}>
                      {fieldsLocked ? (
                        <ReadValue value={current.nightEnd} />
                      ) : (
                        <Input
                          id="planning-night-end"
                          type="time"
                          step={60}
                          value={current.nightEnd}
                          onChange={(event) => patch("nightEnd", event.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4 p-5">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{t("settings.planning.groups.rotation")}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">{t("settings.planning.groups.rotationDescription")}</p>
              </div>
              <div className="space-y-4">
                <RotationRow
                  id="planning-smart-rotation"
                  title={t("settings.planning.rotation.smart.title")}
                  description={t("settings.planning.rotation.smart.description")}
                  enabledLabel={t("settings.planning.rotation.enabled")}
                />
                <RotationRow
                  id="planning-avoid-repeat"
                  title={t("settings.planning.rotation.avoidRepeat.title")}
                  description={t("settings.planning.rotation.avoidRepeat.description")}
                  enabledLabel={t("settings.planning.rotation.enabled")}
                />
                <RotationRow
                  id="planning-fair-rotation"
                  title={t("settings.planning.rotation.fair.title")}
                  description={t("settings.planning.rotation.fair.description")}
                  enabledLabel={t("settings.planning.rotation.enabled")}
                />
              </div>
            </section>

            <section className="p-5">
              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight">{t("settings.planning.groups.info")}</h3>
                  <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                    {t("settings.planning.info.nightOnly")}
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.planning.discard.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.planning.discard.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.planning.discard.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>{t("settings.planning.discard.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.planning.reset.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.planning.reset.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onReset} disabled={busy}>
              {t("settings.planning.reset.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContentShell>
  );
}
