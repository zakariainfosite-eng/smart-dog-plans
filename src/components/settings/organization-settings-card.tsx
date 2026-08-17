import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

import { PageContentShell } from "@/components/enterprise/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  ORGANIZATION_SETTINGS_QUERY_KEY,
  canEditOrganizationSettings,
  fetchOrganizationSettings,
  organizationSettingsEqual,
  saveOrganizationSettings,
  validateOrganizationSettings,
  type OrganizationField,
  type OrganizationSettings,
  type OrganizationValidationErrors,
} from "@/lib/organization-settings";
import { cn } from "@/lib/utils";

function Field({
  id,
  label,
  description,
  error,
  children,
}: {
  id: string;
  label: string;
  description: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      <p className="text-[13px] leading-snug text-muted-foreground">{description}</p>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

function ReadValue({ value }: { value: string }) {
  return (
    <p className="w-full min-w-0 break-words rounded-[var(--radius)] border border-transparent bg-muted/40 px-3 py-2 text-sm text-foreground">
      {value.trim() ? value : "—"}
    </p>
  );
}

export function OrganizationSettingsCard() {
  const { t } = useI18n();
  const { role } = useAuth();
  const canEdit = canEditOrganizationSettings(role);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ORGANIZATION_SETTINGS_QUERY_KEY,
    queryFn: () => fetchOrganizationSettings(db),
  });

  const saved = query.data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OrganizationSettings | null>(null);
  const [errors, setErrors] = useState<OrganizationValidationErrors>({});
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (saved && !editing) setDraft(saved);
  }, [saved, editing]);

  const current = draft ?? saved;
  const dirty = Boolean(saved && draft && !organizationSettingsEqual(saved, draft));

  useEffect(() => {
    if (!editing || !dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editing, dirty]);

  const saveMutation = useMutation({
    mutationFn: (input: OrganizationSettings) => saveOrganizationSettings(db, input),
    onSuccess: async (next) => {
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_SETTINGS_QUERY_KEY });
      setDraft(next);
      setEditing(false);
      setErrors({});
      toast.success(t("settings.organization.toast.saved"));
    },
    onError: () => {
      toast.error(t("settings.organization.toast.saveFailed"));
    },
  });

  const errorLabel = (field: OrganizationField): string | undefined => {
    const issue = errors[field];
    if (!issue) return undefined;
    return t(`settings.organization.errors.${issue}`);
  };

  const patch = (field: OrganizationField, value: string) => {
    setDraft((currentDraft) =>
      currentDraft ? { ...currentDraft, [field]: value } : currentDraft,
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
    const nextErrors = validateOrganizationSettings(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    saveMutation.mutate(draft);
  };

  const fieldsLocked = !editing;
  const busy = saveMutation.isPending || query.isLoading;

  const statusNote = useMemo(() => {
    if (!canEdit) return t("settings.organization.viewOnly");
    if (editing) return t("settings.organization.editingHint");
    return t("settings.organization.idleHint");
  }, [canEdit, editing, t]);

  return (
    <PageContentShell padding={false} className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-muted via-muted/80 to-muted/60 text-muted-foreground">
            <Building2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{t("settings.organization.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.organization.description")}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">{statusNote}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {canEdit && !editing ? (
            <Button type="button" size="sm" onClick={startEdit} disabled={busy || !saved}>
              {t("action.edit")}
            </Button>
          ) : null}
          {canEdit && editing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={requestCancel} disabled={busy}>
                {t("action.cancel")}
              </Button>
              <Button type="button" size="sm" onClick={onSave} disabled={busy}>
                {saveMutation.isPending ? t("action.saving") : t("action.save")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="p-5">
        {query.isError ? (
          <p className="text-sm text-destructive">{t("settings.organization.loadError")}</p>
        ) : !current ? (
          <p className="text-sm text-muted-foreground">{t("settings.organization.loading")}</p>
        ) : (
          <div className="grid w-full min-w-0 grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              id="org-unit-name"
              label={t("settings.organization.fields.unitName.label")}
              description={t("settings.organization.fields.unitName.description")}
              error={errorLabel("unitName")}
            >
              {fieldsLocked ? (
                <ReadValue value={current.unitName} />
              ) : (
                <Input
                  id="org-unit-name"
                  value={current.unitName}
                  onChange={(event) => patch("unitName", event.target.value)}
                  autoComplete="organization"
                />
              )}
            </Field>

            <Field
              id="org-service-name"
              label={t("settings.organization.fields.serviceName.label")}
              description={t("settings.organization.fields.serviceName.description")}
              error={errorLabel("serviceName")}
            >
              {fieldsLocked ? (
                <ReadValue value={current.serviceName} />
              ) : (
                <Input
                  id="org-service-name"
                  value={current.serviceName}
                  onChange={(event) => patch("serviceName", event.target.value)}
                />
              )}
            </Field>

            <Field
              id="org-city"
              label={t("settings.organization.fields.city.label")}
              description={t("settings.organization.fields.city.description")}
              error={errorLabel("city")}
            >
              {fieldsLocked ? (
                <ReadValue value={current.city} />
              ) : (
                <Input
                  id="org-city"
                  value={current.city}
                  onChange={(event) => patch("city", event.target.value)}
                  autoComplete="address-level2"
                />
              )}
            </Field>

            <Field
              id="org-country"
              label={t("settings.organization.fields.country.label")}
              description={t("settings.organization.fields.country.description")}
              error={errorLabel("country")}
            >
              {fieldsLocked ? (
                <ReadValue value={current.country} />
              ) : (
                <Input
                  id="org-country"
                  value={current.country}
                  onChange={(event) => patch("country", event.target.value)}
                  autoComplete="country-name"
                />
              )}
            </Field>

            <div className="min-w-0 md:col-span-2">
              <Field
                id="org-address"
                label={t("settings.organization.fields.address.label")}
                description={t("settings.organization.fields.address.description")}
                error={errorLabel("address")}
              >
                {fieldsLocked ? (
                  <ReadValue value={current.address} />
                ) : (
                  <Input
                    id="org-address"
                    value={current.address}
                    onChange={(event) => patch("address", event.target.value)}
                    autoComplete="street-address"
                  />
                )}
              </Field>
            </div>

            <Field
              id="org-phone"
              label={t("settings.organization.fields.phone.label")}
              description={t("settings.organization.fields.phone.description")}
              error={errorLabel("phone")}
            >
              {fieldsLocked ? (
                <ReadValue value={current.phone} />
              ) : (
                <div className="relative">
                  <Phone className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
                  <Input
                    id="org-phone"
                    className="ltr:pl-9 rtl:pr-9"
                    value={current.phone}
                    onChange={(event) => patch("phone", event.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>
              )}
            </Field>

            <Field
              id="org-email"
              label={t("settings.organization.fields.email.label")}
              description={t("settings.organization.fields.email.description")}
              error={errorLabel("email")}
            >
              {fieldsLocked ? (
                <ReadValue value={current.email} />
              ) : (
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
                  <Input
                    id="org-email"
                    className="ltr:pl-9 rtl:pr-9"
                    value={current.email}
                    onChange={(event) => patch("email", event.target.value)}
                    type="email"
                    autoComplete="email"
                  />
                </div>
              )}
            </Field>

            <div className="min-w-0 md:col-span-2">
              <Field
                id="org-notes"
                label={t("settings.organization.fields.notes.label")}
                description={t("settings.organization.fields.notes.description")}
                error={errorLabel("notes")}
              >
                {fieldsLocked ? (
                  <ReadValue value={current.notes} />
                ) : (
                  <Textarea
                    id="org-notes"
                    value={current.notes}
                    onChange={(event) => patch("notes", event.target.value)}
                    rows={4}
                    className={cn("min-h-[96px] w-full min-w-0 rounded-[var(--radius)] bg-card shadow-soft")}
                  />
                )}
              </Field>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.organization.discard.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.organization.discard.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.organization.discard.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>{t("settings.organization.discard.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContentShell>
  );
}
