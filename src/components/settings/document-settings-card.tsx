import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ImagePlus, Info, Languages, LayoutTemplate, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { PageContentShell } from "@/components/enterprise/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { db } from "@/integrations/database/client";
import {
  DOCUMENT_LOGO_ACCEPT,
  DOCUMENT_LOGO_MAX_BYTES,
  deleteDocumentLogo,
  documentLogoPreviewSrc,
  uploadDocumentLogo,
  validateDocumentLogoFile,
} from "@/lib/document-logo-api";
import {
  DEFAULT_DOCUMENT_SETTINGS,
  DOCUMENT_SETTINGS_QUERY_KEY,
  canEditDocumentSettings,
  documentSettingsEqual,
  fetchDocumentSettings,
  saveDocumentSettings,
  type DocumentLocale,
  type DocumentOrientation,
  type DocumentSettings,
} from "@/lib/document-settings";
import { FP_OFFICIAL_LOGO_URL, FP_MARGIN } from "@/lib/documents/feuille-presence-layout";
import {
  ORGANIZATION_SETTINGS_QUERY_KEY,
  fetchOrganizationSettings,
  type OrganizationSettings,
} from "@/lib/organization-settings";
import { cn } from "@/lib/utils";

function Field({
  id,
  label,
  description,
  children,
}: {
  id?: string;
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      {description ? <p className="text-[13px] leading-snug text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}

function ReadValue({ value }: { value: string }) {
  return (
    <p className="rounded-[var(--radius)] border border-transparent bg-muted/40 px-3 py-2 text-sm text-foreground">
      {value.trim() ? value : "—"}
    </p>
  );
}

export function DocumentSettingsCard() {
  const { t } = useI18n();
  const { role } = useAuth();
  const canEdit = canEditDocumentSettings(role);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: DOCUMENT_SETTINGS_QUERY_KEY,
    queryFn: () => fetchDocumentSettings(db),
  });
  const organizationQuery = useQuery({
    queryKey: ORGANIZATION_SETTINGS_QUERY_KEY,
    queryFn: () => fetchOrganizationSettings(db),
  });

  const saved = query.data;
  const organization = organizationQuery.data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DocumentSettings | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [storedPreview, setStoredPreview] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (saved && !editing) setDraft(saved);
  }, [saved, editing]);

  useEffect(() => {
    if (!pendingFile) {
      setPendingPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const current = draft ?? saved;
  const dirty = Boolean(
    saved &&
      draft &&
      (!documentSettingsEqual(saved, draft) || pendingFile !== null || removeLogo),
  );

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      const src = await documentLogoPreviewSrc(db, current);
      if (cancelled) {
        if (src.startsWith("blob:")) URL.revokeObjectURL(src);
        return;
      }
      created = src.startsWith("blob:") ? src : null;
      setStoredPreview(src);
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [current?.logoUrl]);

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
    mutationFn: async (input: DocumentSettings) => {
      let next = input;
      if (removeLogo) {
        await deleteDocumentLogo(db, saved?.logoUrl);
        next = { ...next, logoUrl: null };
      } else if (pendingFile) {
        const logoUrl = await uploadDocumentLogo(db, pendingFile);
        next = { ...next, logoUrl };
      }
      return saveDocumentSettings(db, next);
    },
    onSuccess: async (next) => {
      await queryClient.invalidateQueries({ queryKey: DOCUMENT_SETTINGS_QUERY_KEY });
      setDraft(next);
      setPendingFile(null);
      setRemoveLogo(false);
      setEditing(false);
      toast.success(t("settings.documents.toast.saved"));
    },
    onError: () => {
      toast.error(t("settings.documents.toast.saveFailed"));
    },
  });

  const startEdit = () => {
    if (!canEdit || !saved) return;
    setDraft(saved);
    setPendingFile(null);
    setRemoveLogo(false);
    setEditing(true);
  };

  const discard = () => {
    setDraft(saved ?? null);
    setPendingFile(null);
    setRemoveLogo(false);
    setEditing(false);
    setConfirmCancel(false);
    if (fileRef.current) fileRef.current.value = "";
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

  const patch = <K extends keyof DocumentSettings>(field: K, value: DocumentSettings[K]) => {
    setDraft((currentDraft) => (currentDraft ? { ...currentDraft, [field]: value } : currentDraft));
  };

  const onPickLogo = (file: File | null) => {
    if (!file) return;
    const issue = validateDocumentLogoFile(file);
    if (issue) {
      toast.error(t(`settings.documents.logo.errors.${issue}`, { maxMb: DOCUMENT_LOGO_MAX_BYTES / (1024 * 1024) }));
      return;
    }
    setRemoveLogo(false);
    setPendingFile(file);
  };

  const onRemoveLogo = () => {
    setPendingFile(null);
    setRemoveLogo(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  const fieldsLocked = !editing;
  const busy = persist.isPending || query.isLoading;
  const statusNote = useMemo(() => {
    if (!canEdit) return t("settings.documents.viewOnly");
    if (editing) return t("settings.documents.editingHint");
    return t("settings.documents.idleHint");
  }, [canEdit, editing, t]);

  const logoSrc = removeLogo ? FP_OFFICIAL_LOGO_URL : (pendingPreview ?? storedPreview ?? FP_OFFICIAL_LOGO_URL);
  const usingOfficialLogo = removeLogo || (!pendingFile && !current?.logoUrl);

  return (
    <PageContentShell padding={false} className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary">
            <FileText className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{t("settings.documents.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.documents.description")}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">{statusNote}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)} disabled={!current}>
            {t("settings.documents.preview.action")}
          </Button>
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
                {persist.isPending ? t("action.saving") : t("action.save")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="divide-y divide-border">
        {query.isError ? (
          <p className="p-5 text-sm text-destructive">{t("settings.documents.loadError")}</p>
        ) : !current ? (
          <p className="p-5 text-sm text-muted-foreground">{t("settings.documents.loading")}</p>
        ) : (
          <>
            <section className="space-y-4 p-5">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{t("settings.documents.groups.identity")}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">{t("settings.documents.groups.identityDescription")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="doc-org-name" label={t("settings.organization.fields.unitName.label")}>
                  <ReadValue value={organization?.unitName ?? ""} />
                </Field>
                <Field id="doc-org-service" label={t("settings.organization.fields.serviceName.label")}>
                  <ReadValue value={organization?.serviceName ?? ""} />
                </Field>
                <Field id="doc-org-city" label={t("settings.organization.fields.city.label")}>
                  <ReadValue value={organization?.city ?? ""} />
                </Field>
                <Field id="doc-org-address" label={t("settings.organization.fields.address.label")}>
                  <ReadValue value={organization?.address ?? ""} />
                </Field>
                <Field id="doc-org-phone" label={t("settings.organization.fields.phone.label")}>
                  <ReadValue value={organization?.phone ?? ""} />
                </Field>
                <Field id="doc-org-email" label={t("settings.organization.fields.email.label")}>
                  <ReadValue value={organization?.email ?? ""} />
                </Field>
              </div>
            </section>

            <section className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight">{t("settings.documents.groups.logo")}</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">{t("settings.documents.groups.logoDescription")}</p>
                </div>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/20 p-3">
                  <img
                    src={logoSrc}
                    alt={t("settings.documents.logo.previewAlt")}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-[13px] text-muted-foreground">
                    {usingOfficialLogo
                      ? t("settings.documents.logo.officialInUse")
                      : t("settings.documents.logo.customInUse")}
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={DOCUMENT_LOGO_ACCEPT}
                    className="hidden"
                    onChange={(event) => onPickLogo(event.target.files?.[0] ?? null)}
                  />
                  {canEdit && editing ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5" />
                        {usingOfficialLogo ? t("settings.documents.logo.upload") : t("settings.documents.logo.replace")}
                      </Button>
                      {!usingOfficialLogo ? (
                        <Button type="button" variant="outline" size="sm" onClick={onRemoveLogo}>
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("settings.documents.logo.remove")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <LayoutTemplate className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight">{t("settings.documents.groups.layout")}</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">{t("settings.documents.groups.layoutDescription")}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="doc-format" label={t("settings.documents.fields.pageFormat")} description={t("settings.documents.fields.pageFormatDescription")}>
                  <Select value={current.pageFormat} disabled>
                    <SelectTrigger id="doc-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a4">A4</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="doc-orientation" label={t("settings.documents.fields.orientation")} description={t("settings.documents.fields.orientationDescription")}>
                  {fieldsLocked ? (
                    <ReadValue
                      value={
                        current.orientation === "landscape"
                          ? t("settings.documents.orientation.landscape")
                          : t("settings.documents.orientation.portrait")
                      }
                    />
                  ) : (
                    <Select
                      value={current.orientation}
                      onValueChange={(value) => patch("orientation", value as DocumentOrientation)}
                    >
                      <SelectTrigger id="doc-orientation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portrait">{t("settings.documents.orientation.portrait")}</SelectItem>
                        <SelectItem value="landscape">{t("settings.documents.orientation.landscape")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{t("settings.documents.fields.margins")}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">{t("settings.documents.fields.marginsDescription")}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <ReadValue value={`${t("settings.documents.margins.top")} ${FP_MARGIN.top} mm`} />
                  <ReadValue value={`${t("settings.documents.margins.bottom")} ${FP_MARGIN.bottom} mm`} />
                  <ReadValue value={`${t("settings.documents.margins.left")} ${FP_MARGIN.left} mm`} />
                  <ReadValue value={`${t("settings.documents.margins.right")} ${FP_MARGIN.right} mm`} />
                </div>
              </div>
            </section>

            <section className="space-y-4 p-5">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{t("settings.documents.groups.footer")}</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">{t("settings.documents.groups.footerDescription")}</p>
              </div>
              <Field id="doc-footer" label={t("settings.documents.fields.footerText")}>
                {fieldsLocked ? (
                  <ReadValue value={current.footerText} />
                ) : (
                  <Textarea
                    id="doc-footer"
                    rows={2}
                    value={current.footerText}
                    onChange={(event) => patch("footerText", event.target.value)}
                    placeholder={t("settings.documents.fields.footerPlaceholder")}
                  />
                )}
              </Field>
              <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Label htmlFor="doc-page-numbers" className="text-sm font-medium">
                    {t("settings.documents.fields.pageNumbers")}
                  </Label>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {t("settings.documents.fields.pageNumbersDescription")}
                  </p>
                </div>
                <Switch
                  id="doc-page-numbers"
                  checked={current.pageNumbers}
                  disabled={fieldsLocked}
                  onCheckedChange={(checked) => patch("pageNumbers", checked)}
                />
              </div>
            </section>

            <section className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <Languages className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold tracking-tight">{t("settings.documents.groups.language")}</h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">{t("settings.documents.groups.languageDescription")}</p>
                </div>
              </div>
              <Field id="doc-locale" label={t("settings.documents.fields.documentLanguage")}>
                {fieldsLocked ? (
                  <ReadValue
                    value={
                      current.documentLocale === "ar" ? t("language.arabic") : t("language.french")
                    }
                  />
                ) : (
                  <Select
                    value={current.documentLocale}
                    onValueChange={(value) => patch("documentLocale", value as DocumentLocale)}
                  >
                    <SelectTrigger id="doc-locale">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr">{t("language.french")}</SelectItem>
                      <SelectItem value="ar">{t("language.arabic")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </section>

            <section className="p-5">
              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-[13px] leading-snug text-muted-foreground">{t("settings.documents.info.futureOnly")}</p>
              </div>
            </section>
          </>
        )}
      </div>

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        settings={current}
        organization={organization}
        logoSrc={logoSrc}
      />

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.documents.discard.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.documents.discard.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.documents.discard.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>{t("settings.documents.discard.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContentShell>
  );
}

function DocumentPreviewDialog({
  open,
  onOpenChange,
  settings,
  organization,
  logoSrc,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DocumentSettings | undefined;
  organization: OrganizationSettings | undefined;
  logoSrc: string;
}) {
  const { t } = useI18n();
  if (!settings) return null;
  const landscape = settings.orientation === "landscape";
  const footer = settings.footerText.trim();
  const rtl = settings.documentLocale === "ar";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("settings.documents.preview.title")}</DialogTitle>
          <DialogDescription>{t("settings.documents.preview.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center bg-muted/30 p-4">
          <div
            dir={rtl ? "rtl" : "ltr"}
            className={cn(
              "flex flex-col overflow-hidden rounded-sm border border-border bg-white text-zinc-900 shadow-sm",
              landscape ? "h-[220px] w-full max-w-[420px]" : "h-[300px] w-[210px]",
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div className="min-w-0 text-[11px] leading-snug">
                <p className="font-semibold">{organization?.unitName || "—"}</p>
                <p>{organization?.serviceName || "—"}</p>
                <p className="text-zinc-500">{organization?.city || "—"}</p>
              </div>
              <img src={logoSrc} alt="" className="h-10 w-10 object-contain" />
            </div>
            <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-zinc-400">
              A4 ·{" "}
              {landscape
                ? t("settings.documents.orientation.landscape")
                : t("settings.documents.orientation.portrait")}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-4 py-2 text-[10px] text-zinc-500">
              <span className="truncate">{footer || t("settings.documents.preview.emptyFooter")}</span>
              <span>
                {settings.pageNumbers ? t("settings.documents.preview.pageNumber", { page: 1, total: 1 }) : ""}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
