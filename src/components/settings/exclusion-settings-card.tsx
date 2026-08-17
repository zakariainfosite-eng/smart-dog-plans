import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Bell, Info, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { PageContentShell } from "@/components/enterprise/page-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { exclusionTypeI18nKey, type ExclusionType } from "@/lib/agent-exclusions";
import {
  DEFAULT_EXCLUSION_SETTINGS,
  EXCLUSION_REMINDER_KEYS,
  EXCLUSION_SETTINGS_CATALOG,
  EXCLUSION_SETTINGS_QUERY_KEY,
  canEditExclusionSettings,
  exclusionSettingsEqual,
  fetchExclusionSettings,
  isExclusionTypeEnabledForCreation,
  saveExclusionSettings,
  setExclusionTypeEnabled,
  type ExclusionReminderKey,
  type ExclusionSettings,
} from "@/lib/exclusion-settings";
import { EXCLUSION_REMINDER_ALERTS_QUERY_KEY } from "@/lib/notifications/exclusion-reminder-alerts";
import {
  EXCLUSION_NOTIFICATIONS_QUERY_KEY,
  IMMINENT_RETURNS_QUERY_KEY,
} from "@/lib/notifications/exclusion-return-types";
import { EXCLUSION_NOTIFICATION_SYNC_QUERY_KEY } from "@/lib/notifications/run-exclusion-notification-sync";

function typeLabel(type: ExclusionType, t: (key: string) => string): string {
  const key = exclusionTypeI18nKey(type);
  const translated = t(key);
  return translated === key ? type : translated;
}

export function ExclusionSettingsCard() {
  const { t } = useI18n();
  const { role } = useAuth();
  const canEdit = canEditExclusionSettings(role);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: EXCLUSION_SETTINGS_QUERY_KEY,
    queryFn: () => fetchExclusionSettings(db),
  });

  const saved = query.data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExclusionSettings | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (saved && !editing) setDraft(saved);
  }, [saved, editing]);

  const current = draft ?? saved;
  const dirty = Boolean(saved && draft && !exclusionSettingsEqual(saved, draft));

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
    mutationFn: (input: ExclusionSettings) => saveExclusionSettings(db, input),
    onSuccess: async (next) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: EXCLUSION_SETTINGS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: EXCLUSION_NOTIFICATION_SYNC_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: EXCLUSION_REMINDER_ALERTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: IMMINENT_RETURNS_QUERY_KEY }),
      ]);
      setDraft(next);
      setEditing(false);
      setConfirmReset(false);
      toast.success(t("settings.exclusions.toast.saved"));
    },
    onError: () => {
      toast.error(t("settings.exclusions.toast.saveFailed"));
    },
  });

  const startEdit = () => {
    if (!canEdit || !saved) return;
    setDraft(saved);
    setEditing(true);
  };

  const discard = () => {
    setDraft(saved ?? null);
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
    persist.mutate(draft);
  };

  const onReset = () => {
    persist.mutate(DEFAULT_EXCLUSION_SETTINGS);
  };

  const toggleType = (type: ExclusionType, enabled: boolean) => {
    setDraft((currentDraft) =>
      currentDraft ? setExclusionTypeEnabled(currentDraft, type, enabled) : currentDraft,
    );
  };

  const toggleReminder = (key: ExclusionReminderKey, enabled: boolean) => {
    setDraft((currentDraft) =>
      currentDraft
        ? { ...currentDraft, reminders: { ...currentDraft.reminders, [key]: enabled } }
        : currentDraft,
    );
  };

  const fieldsLocked = !editing;
  const busy = persist.isPending || query.isLoading;
  const statusNote = useMemo(() => {
    if (!canEdit) return t("settings.exclusions.viewOnly");
    if (editing) return t("settings.exclusions.editingHint");
    return t("settings.exclusions.idleHint");
  }, [canEdit, editing, t]);

  return (
    <PageContentShell padding={false} className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary">
            <UserX className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{t("settings.exclusions.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.exclusions.description")}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">{statusNote}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {canEdit && !editing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={busy}>
                {t("settings.exclusions.reset.action")}
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
          <p className="p-5 text-sm text-destructive">{t("settings.exclusions.loadError")}</p>
        ) : !current ? (
          <p className="p-5 text-sm text-muted-foreground">{t("settings.exclusions.loading")}</p>
        ) : (
          <>
            <section className="space-y-4 p-5">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{t("settings.exclusions.groups.types")}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {t("settings.exclusions.groups.typesDescription")}
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full min-w-[36rem] table-fixed caption-bottom text-sm">
                  <thead className="bg-muted/40">
                    <tr className="border-b border-border/70">
                      <th className="px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("settings.exclusions.columns.type")}
                      </th>
                      <th className="w-[7.5rem] px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("settings.exclusions.columns.category")}
                      </th>
                      <th className="w-[8.5rem] px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("settings.exclusions.columns.duration")}
                      </th>
                      <th className="w-[7rem] px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("settings.exclusions.columns.status")}
                      </th>
                      <th className="w-[6.5rem] px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("settings.exclusions.columns.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {EXCLUSION_SETTINGS_CATALOG.map((row) => {
                      const enabled = isExclusionTypeEnabledForCreation(row.type, current);
                      return (
                        <tr key={row.type} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2.5 font-medium text-foreground">{typeLabel(row.type, t)}</td>
                          <td className="px-3 py-2.5">
                            <Badge variant={row.category === "dog" ? "info" : "secondary"}>
                              {t(`settings.exclusions.category.${row.category}`)}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={row.duration === "openEnded" ? "warning" : "outline"}>
                              {t(`settings.exclusions.duration.${row.duration}`)}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={enabled ? "success" : "secondary"}>
                              {enabled
                                ? t("settings.exclusions.status.enabled")
                                : t("settings.exclusions.status.disabled")}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <Switch
                                id={`exclusion-type-${row.type}`}
                                checked={enabled}
                                disabled={fieldsLocked}
                                onCheckedChange={(checked) => toggleType(row.type, checked)}
                                aria-label={t("settings.exclusions.actions.toggleType", {
                                  type: typeLabel(row.type, t),
                                })}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight">
                    {t("settings.exclusions.groups.reminders")}
                  </h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {t("settings.exclusions.groups.remindersDescription")}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {EXCLUSION_REMINDER_KEYS.map((key) => (
                  <div
                    key={key}
                    className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0">
                      <Label htmlFor={`exclusion-reminder-${key}`} className="text-sm font-medium text-foreground">
                        {t(`settings.exclusions.reminders.${key}.title`)}
                      </Label>
                      <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                        {t(`settings.exclusions.reminders.${key}.description`)}
                      </p>
                    </div>
                    <Switch
                      id={`exclusion-reminder-${key}`}
                      checked={current.reminders[key]}
                      disabled={fieldsLocked}
                      onCheckedChange={(checked) => toggleReminder(key, checked)}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3 p-5">
              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-2">
                  <h3 className="text-sm font-semibold tracking-tight">{t("settings.exclusions.groups.rules")}</h3>
                  <p className="text-[13px] leading-snug text-muted-foreground">
                    {t("settings.exclusions.rules.openEnded")}
                  </p>
                  <p className="text-[13px] leading-snug text-muted-foreground">
                    {t("settings.exclusions.rules.disableCreationOnly")}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3 p-5">
              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-2">
                  <h3 className="text-sm font-semibold tracking-tight">{t("settings.exclusions.groups.info")}</h3>
                  <p className="text-[13px] leading-snug text-muted-foreground">
                    {t("settings.exclusions.info.activeStatus")}
                  </p>
                  <p className="text-[13px] leading-snug text-muted-foreground">
                    {t("settings.exclusions.info.dataSafety")}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight">
                    {t("settings.exclusions.customTypes.title")}
                  </h3>
                  <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                    {t("settings.exclusions.customTypes.description")}
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
            <AlertDialogTitle>{t("settings.exclusions.discard.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.exclusions.discard.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.exclusions.discard.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>{t("settings.exclusions.discard.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.exclusions.reset.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.exclusions.reset.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onReset} disabled={busy}>
              {t("settings.exclusions.reset.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContentShell>
  );
}
