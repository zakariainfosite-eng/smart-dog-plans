import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/integrations/database/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageContentShell } from "@/components/enterprise/page-layout";
import { DocumentWorkspace } from "@/components/reports-messages/document-workspace";
import { DocumentTemplate } from "@/components/reports-messages/official-document/DocumentTemplate";
import { OfficialPdfPreview } from "@/components/reports-messages/official-document/OfficialPdfPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDocumentTemplateConfig } from "@/lib/reports-messages/document-templates/registry";
import {
  buildDefaultOverrideFromConfig,
  resolveEffectiveTemplate,
  validateTemplateOverride,
} from "@/lib/reports-messages/document-templates/merge-template";
import { DATABASE_FIELD_OPTIONS } from "@/lib/reports-messages/document-templates/section-catalog";
import { buildSampleOfficialDocument } from "@/lib/reports-messages/document-templates/sample-preview";
import { normalizeHeatDogBodyToSingleParagraph } from "@/lib/reports-messages/document-templates/heat-dog-report";
import {
  DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY,
  canEditDocumentTemplates,
  clearSingleTemplateOverride,
  fetchDocumentTemplatesSettingsOrDefault,
  upsertSingleTemplateOverride,
  type SingleTemplateOverride,
  type TemplateSectionOverride,
} from "@/lib/reports-messages/document-templates/template-overrides-store";
import { sickDogOfficialLabelsFromT } from "@/lib/reports-messages/official-document/build-sick-dog-document";
import { filterSectionsByValues } from "@/lib/reports-messages/document-templates/merge-template";

type Props = { templateId: string };

export function DocumentTemplateEditorPage({ templateId }: Props) {
  const { t } = useI18n();
  const { role } = useAuth();
  const canEdit = canEditDocumentTemplates(role);
  const queryClient = useQueryClient();
  const base = getDocumentTemplateConfig(templateId);

  const { data: settings } = useQuery({
    queryKey: DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY,
    queryFn: () => fetchDocumentTemplatesSettingsOrDefault(db),
  });

  const [draft, setDraft] = useState<SingleTemplateOverride | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (!base || !settings) return;
    const stored = settings.byId[templateId];
    const defaults = buildDefaultOverrideFromConfig(base);
    if (!stored) {
      setDraft(defaults);
      return;
    }
    const clone = structuredClone(stored);
    const rawBody =
      (clone.reportBodyTemplate?.trim() ?? "").length > 0
        ? clone.reportBodyTemplate
        : defaults.reportBodyTemplate;
    setDraft({
      ...defaults,
      ...clone,
      header: { ...defaults.header, ...clone.header },
      signatureSlots:
        clone.signatureSlots.length > 0 ? clone.signatureSlots : defaults.signatureSlots,
      destinataireLines:
        (clone.destinataireLines?.length ?? 0) > 0
          ? clone.destinataireLines
          : defaults.destinataireLines,
      expediteurLines:
        (clone.expediteurLines?.length ?? 0) > 0
          ? clone.expediteurLines
          : defaults.expediteurLines,
      // Heat report: Objet stays empty; body is always one continuous paragraph.
      subjectOverride: base.builder === "heat_dog" ? "" : clone.subjectOverride,
      reportBodyTemplate:
        base.builder === "heat_dog"
          ? normalizeHeatDogBodyToSingleParagraph(rawBody)
          : rawBody,
      heatDogTableFields: [],
    });
  }, [base, settings, templateId]);

  const effective = useMemo(() => {
    if (!base || !draft) return null;
    return resolveEffectiveTemplate(templateId, { byId: { [templateId]: draft } }, draft);
  }, [base, draft, templateId]);

  const previewModel = useMemo(() => {
    if (!base || !effective) return null;
    return buildSampleOfficialDocument(base, effective, t);
  }, [base, effective, t]);

  const previewSections = useMemo(() => {
    if (!effective || !previewModel) return [];
    // Sample values for conditional visibility in editor
    const sampleValues: Record<string, unknown> = {
      dogId: "sample",
      treatment: "Repos",
      medication: "AINS",
      restPeriod: "7 jours",
      clinicalObservations: "ok",
      attachments: ["Annexe"],
    };
    return filterSectionsByValues(effective, sampleValues);
  }, [effective, previewModel]);

  const labels = useMemo(() => {
    const baseLabels = sickDogOfficialLabelsFromT(t);
    if (!effective) return baseLabels;
    return {
      ...baseLabels,
      agencyLine1: effective.header.organizationName || baseLabels.agencyLine1,
      agencyLine2: effective.header.department || baseLabels.agencyLine2,
      radioTitle: effective.header.radioTitle || baseLabels.radioTitle,
    };
  }, [effective, t]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("No draft");
      const errors = validateTemplateOverride(draft);
      if (errors.length > 0) {
        throw new Error(t("reportsMessages.templateManagement.errors.invalidConfig"));
      }
      const toSave: SingleTemplateOverride =
        base?.builder === "heat_dog"
          ? {
              ...draft,
              subjectOverride: "",
              reportBodyTemplate: normalizeHeatDogBodyToSingleParagraph(
                draft.reportBodyTemplate || "",
              ),
              heatDogTableFields: [],
            }
          : { ...draft, heatDogTableFields: [] };
      return upsertSingleTemplateOverride(db, templateId, toSave);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY });
      toast.success(t("reportsMessages.templateManagement.toast.saved"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!base) throw new Error("Unknown template");
      await clearSingleTemplateOverride(db, templateId);
      return buildDefaultOverrideFromConfig(base);
    },
    onSuccess: (defaults) => {
      setDraft(defaults);
      queryClient.invalidateQueries({ queryKey: DOCUMENT_TEMPLATES_SETTINGS_QUERY_KEY });
      toast.success(t("reportsMessages.templateManagement.toast.reset"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!base) {
    return (
      <PageContentShell>
        <p className="text-sm text-muted-foreground">
          {t("reportsMessages.documentTemplates.errors.unknownTemplate")}
        </p>
      </PageContentShell>
    );
  }

  if (!draft || !effective || !previewModel) {
    return (
      <PageContentShell>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageContentShell>
    );
  }

  const selectedSection =
    draft.sections.find((s) => s.id === selectedSectionId) ?? draft.sections[0] ?? null;

  const moveSection = (index: number, direction: -1 | 1) => {
    if (!canEdit) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.sections.length) return;
    const next = [...draft.sections];
    const [row] = next.splice(index, 1);
    next.splice(nextIndex, 0, row);
    setDraft({ ...draft, sections: next });
  };

  const patchSection = (id: string, patch: Partial<TemplateSectionOverride>) => {
    if (!canEdit) return;
    setDraft({
      ...draft,
      sections: draft.sections.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };

  return (
    <div className="space-y-6">
      <PageTitle
        title={t(base.titleKey)}
        description={t("reportsMessages.templateManagement.editorDescription")}
        breadcrumb={[
          { label: t("auth.brandName") },
          { label: t("nav.reportsMessages") },
          { label: t("reportsMessages.templateManagement.title") },
          { label: t(base.titleKey) },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/reports-messages/templates">
                {t("reportsMessages.templateManagement.actions.backToList")}
              </Link>
            </Button>
            {canEdit ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={resetMutation.isPending}
                  onClick={() => resetMutation.mutate()}
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  {t("reportsMessages.templateManagement.actions.reset")}
                </Button>
                <Button
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  {t("reportsMessages.templateManagement.actions.save")}
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <PageContentShell className="p-4 sm:p-6">
        {!canEdit ? (
          <p className="mb-4 text-sm text-muted-foreground">
            {t("reportsMessages.templateManagement.viewOnly")}
          </p>
        ) : null}

        <DocumentWorkspace
          form={
            <div className="space-y-6">
              <section className="space-y-3 rounded-xl border border-border/70 p-4">
                <h3 className="text-sm font-semibold">
                  {t("reportsMessages.templateManagement.sections.general")}
                </h3>
                <div className="flex items-center justify-between gap-3">
                  <Label>{t("reportsMessages.templateManagement.fields.active")}</Label>
                  <Switch
                    checked={draft.active}
                    disabled={!canEdit}
                    onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
                  />
                </div>
                {base.builder === "heat_dog" ? (
                  <p className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {t("reportsMessages.templateManagement.heatDogNoObjetHint")}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <Label>{t("reportsMessages.templateManagement.fields.subjectOverride")}</Label>
                    <Input
                      value={draft.subjectOverride}
                      disabled={!canEdit}
                      placeholder={t(base.subjectKey)}
                      onChange={(e) => setDraft({ ...draft, subjectOverride: e.target.value })}
                    />
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-xl border border-border/70 p-4">
                <h3 className="text-sm font-semibold">
                  {t("reportsMessages.templateManagement.sections.header")}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("reportsMessages.templateManagement.fields.organization")}>
                    <Input
                      value={draft.header.organizationName}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          header: { ...draft.header, organizationName: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label={t("reportsMessages.templateManagement.fields.department")}>
                    <Input
                      value={draft.header.department}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          header: { ...draft.header, department: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label={t("reportsMessages.templateManagement.fields.radioTitle")}>
                    <Input
                      value={draft.header.radioTitle}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          header: { ...draft.header, radioTitle: e.target.value },
                        })
                      }
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-border/70 p-4">
                <h3 className="text-sm font-semibold">
                  {t("reportsMessages.templateManagement.sections.sectionsList")}
                </h3>
                <ol className="space-y-2">
                  {draft.sections.map((section, index) => (
                    <li
                      key={section.id}
                      className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                        selectedSection?.id === section.id
                          ? "border-primary bg-primary/5"
                          : "border-border/60"
                      }`}
                    >
                      <span className="w-6 text-xs tabular-nums text-muted-foreground">
                        {index + 1}.
                      </span>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left text-sm font-medium"
                        onClick={() => setSelectedSectionId(section.id)}
                      >
                        {section.title || section.id}
                      </button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!canEdit}
                        onClick={() => patchSection(section.id, { visible: !section.visible })}
                        aria-label={
                          section.visible
                            ? t("reportsMessages.templateManagement.actions.hide")
                            : t("reportsMessages.templateManagement.actions.show")
                        }
                      >
                        {section.visible ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!canEdit || index === 0}
                        onClick={() => moveSection(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!canEdit || index === draft.sections.length - 1}
                        onClick={() => moveSection(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedSectionId(section.id)}
                      >
                        {t("reportsMessages.templateManagement.actions.edit")}
                      </Button>
                    </li>
                  ))}
                </ol>
              </section>

              {selectedSection ? (
                <section className="space-y-3 rounded-xl border border-border/70 p-4">
                  <h3 className="text-sm font-semibold">
                    {t("reportsMessages.templateManagement.sections.sectionEditor")} —{" "}
                    {selectedSection.title}
                  </h3>
                  <Field label={t("reportsMessages.templateManagement.fields.sectionTitle")}>
                    <Input
                      value={selectedSection.title}
                      disabled={!canEdit}
                      onChange={(e) =>
                        patchSection(selectedSection.id, { title: e.target.value })
                      }
                    />
                  </Field>
                  <div className="flex items-center justify-between gap-3">
                    <Label>{t("reportsMessages.templateManagement.fields.showTitle")}</Label>
                    <Switch
                      checked={selectedSection.showTitle}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        patchSection(selectedSection.id, { showTitle: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label>{t("reportsMessages.templateManagement.fields.visible")}</Label>
                    <Switch
                      checked={selectedSection.visible}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        patchSection(selectedSection.id, { visible: checked })
                      }
                    />
                  </div>
                  <Field label={t("reportsMessages.templateManagement.fields.defaultText")}>
                    <Textarea
                      rows={3}
                      value={selectedSection.defaultText}
                      disabled={!canEdit}
                      placeholder={t(
                        "reportsMessages.templateManagement.placeholders.fixedText",
                      )}
                      onChange={(e) =>
                        patchSection(selectedSection.id, { defaultText: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t("reportsMessages.templateManagement.fields.hideWhenEmpty")}>
                    <Input
                      value={selectedSection.hideWhenEmptyFieldIds.join(", ")}
                      disabled={!canEdit}
                      placeholder="treatment, medication"
                      onChange={(e) =>
                        patchSection(selectedSection.id, {
                          hideWhenEmptyFieldIds: e.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                  <Field label={t("reportsMessages.templateManagement.fields.showWhenFilled")}>
                    <Input
                      value={selectedSection.showWhenFieldFilled ?? ""}
                      disabled={!canEdit}
                      placeholder="dogId"
                      onChange={(e) =>
                        patchSection(selectedSection.id, {
                          showWhenFieldFilled: e.target.value.trim() || undefined,
                        })
                      }
                    />
                  </Field>

                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("reportsMessages.templateManagement.sections.fieldsInSection")}
                    </h4>
                    {draft.fields
                      .filter((field) => field.section === selectedSection.id)
                      .map((field) => (
                        <div
                          key={field.id}
                          className="space-y-2 rounded-lg border border-border/50 p-3"
                        >
                          <p className="text-sm font-medium">{field.id}</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field label={t("reportsMessages.templateManagement.fields.label")}>
                              <Input
                                value={field.label ?? ""}
                                disabled={!canEdit}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    fields: draft.fields.map((row) =>
                                      row.id === field.id
                                        ? { ...row, label: e.target.value }
                                        : row,
                                    ),
                                  })
                                }
                              />
                            </Field>
                            <Field label={t("reportsMessages.templateManagement.fields.source")}>
                              <Select
                                value={field.source ?? "manual"}
                                disabled={!canEdit}
                                onValueChange={(value) =>
                                  setDraft({
                                    ...draft,
                                    fields: draft.fields.map((row) =>
                                      row.id === field.id
                                        ? {
                                            ...row,
                                            source: value as
                                              | "manual"
                                              | "database"
                                              | "fixed"
                                              | "calculated",
                                          }
                                        : row,
                                    ),
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manual">
                                    {t("reportsMessages.templateManagement.sources.manual")}
                                  </SelectItem>
                                  <SelectItem value="database">
                                    {t("reportsMessages.templateManagement.sources.database")}
                                  </SelectItem>
                                  <SelectItem value="fixed">
                                    {t("reportsMessages.templateManagement.sources.fixed")}
                                  </SelectItem>
                                  <SelectItem value="calculated">
                                    {t("reportsMessages.templateManagement.sources.calculated")}
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                            {field.source === "database" ? (
                              <Field
                                label={t("reportsMessages.templateManagement.fields.binding")}
                              >
                                <Select
                                  value={field.binding ?? ""}
                                  disabled={!canEdit}
                                  onValueChange={(value) =>
                                    setDraft({
                                      ...draft,
                                      fields: draft.fields.map((row) =>
                                        row.id === field.id ? { ...row, binding: value } : row,
                                      ),
                                    })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {DATABASE_FIELD_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.group} ·{" "}
                                        {t(`reportsMessages.documentTemplates.fields.${opt.labelKey}`)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>
                            ) : null}
                            {field.source === "fixed" ? (
                              <Field
                                label={t("reportsMessages.templateManagement.fields.fixedText")}
                                className="sm:col-span-2"
                              >
                                <Textarea
                                  rows={2}
                                  value={field.fixedText ?? ""}
                                  disabled={!canEdit}
                                  onChange={(e) =>
                                    setDraft({
                                      ...draft,
                                      fields: draft.fields.map((row) =>
                                        row.id === field.id
                                          ? { ...row, fixedText: e.target.value }
                                          : row,
                                      ),
                                    })
                                  }
                                />
                              </Field>
                            ) : null}
                            <div className="flex items-center justify-between gap-2">
                              <Label>
                                {t("reportsMessages.templateManagement.fields.required")}
                              </Label>
                              <Switch
                                checked={Boolean(field.required)}
                                disabled={!canEdit}
                                onCheckedChange={(checked) =>
                                  setDraft({
                                    ...draft,
                                    fields: draft.fields.map((row) =>
                                      row.id === field.id ? { ...row, required: checked } : row,
                                    ),
                                  })
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <Label>
                                {t("reportsMessages.templateManagement.fields.multiline")}
                              </Label>
                              <Switch
                                checked={Boolean(field.multiline)}
                                disabled={!canEdit}
                                onCheckedChange={(checked) =>
                                  setDraft({
                                    ...draft,
                                    fields: draft.fields.map((row) =>
                                      row.id === field.id ? { ...row, multiline: checked } : row,
                                    ),
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              ) : null}

              {base.builder === "heat_dog" ? (
                <section className="space-y-3 rounded-xl border border-border/70 p-4">
                  <h3 className="text-sm font-semibold">
                    {t("reportsMessages.templateManagement.sections.reportBody")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("reportsMessages.templateManagement.reportBodyHint")}
                  </p>
                  <Field label={t("reportsMessages.templateManagement.fields.reportBodyTemplate")}>
                    <Textarea
                      rows={10}
                      value={draft.reportBodyTemplate ?? ""}
                      disabled={!canEdit}
                      className="font-mono text-xs leading-relaxed"
                      onChange={(e) =>
                        setDraft({ ...draft, reportBodyTemplate: e.target.value })
                      }
                      onBlur={() =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                reportBodyTemplate: normalizeHeatDogBodyToSingleParagraph(
                                  prev.reportBodyTemplate || "",
                                ),
                              }
                            : prev,
                        )
                      }
                    />
                  </Field>
                  <p className="text-[11px] text-muted-foreground">
                    {t("reportsMessages.templateManagement.reportBodyPlaceholders")}
                  </p>
                </section>
              ) : null}

              {base.builder === "message_demande" || base.builder === "heat_dog" ? (
                <section className="space-y-3 rounded-xl border border-border/70 p-4">
                  <h3 className="text-sm font-semibold">
                    {t("reportsMessages.templateManagement.sections.expediteur")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("reportsMessages.templateManagement.expediteurHint")}
                  </p>
                  {(draft.expediteurLines ?? []).map((line, index) => (
                    <div
                      key={`exp-${index}`}
                      className="grid gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[1fr_auto]"
                    >
                      <Field
                        label={
                          index === 0
                            ? t("reportsMessages.templateManagement.fields.expediteurFirstLine")
                            : t("reportsMessages.templateManagement.fields.expediteurLine")
                        }
                      >
                        <Input
                          value={line.text}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const next = [...(draft.expediteurLines ?? [])];
                            next[index] = { text: e.target.value };
                            setDraft({ ...draft, expediteurLines: next });
                          }}
                        />
                      </Field>
                      {canEdit ? (
                        <div className="flex items-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={index === 0}
                            onClick={() => {
                              const next = [...(draft.expediteurLines ?? [])];
                              const tmp = next[index - 1];
                              next[index - 1] = next[index];
                              next[index] = tmp;
                              setDraft({ ...draft, expediteurLines: next });
                            }}
                            aria-label={t("reportsMessages.templateManagement.actions.moveUp")}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={index === (draft.expediteurLines?.length ?? 0) - 1}
                            onClick={() => {
                              const next = [...(draft.expediteurLines ?? [])];
                              const tmp = next[index + 1];
                              next[index + 1] = next[index];
                              next[index] = tmp;
                              setDraft({ ...draft, expediteurLines: next });
                            }}
                            aria-label={t("reportsMessages.templateManagement.actions.moveDown")}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={(draft.expediteurLines?.length ?? 0) <= 1}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                expediteurLines: (draft.expediteurLines ?? []).filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                            aria-label={t(
                              "reportsMessages.templateManagement.actions.removeExpediteurLine",
                            )}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          expediteurLines: [...(draft.expediteurLines ?? []), { text: "" }],
                        })
                      }
                    >
                      {t("reportsMessages.templateManagement.actions.addExpediteurLine")}
                    </Button>
                  ) : null}
                </section>
              ) : null}

              {base.builder === "message_demande" || base.builder === "heat_dog" ? (
                <section className="space-y-3 rounded-xl border border-border/70 p-4">
                  <h3 className="text-sm font-semibold">
                    {t("reportsMessages.templateManagement.sections.destinataire")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("reportsMessages.templateManagement.destinataireHint")}
                  </p>
                  {(draft.destinataireLines ?? []).map((line, index) => (
                    <div
                      key={`dest-${index}`}
                      className="grid gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[1fr_10rem_auto]"
                    >
                      <Field label={t("reportsMessages.templateManagement.fields.destinataireLeft")}>
                        <Input
                          value={line.left}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const next = [...(draft.destinataireLines ?? [])];
                            next[index] = { ...line, left: e.target.value };
                            setDraft({ ...draft, destinataireLines: next });
                          }}
                        />
                      </Field>
                      <Field label={t("reportsMessages.templateManagement.fields.destinataireRight")}>
                        <Input
                          value={line.right}
                          disabled={!canEdit}
                          placeholder="RABAT"
                          onChange={(e) => {
                            const next = [...(draft.destinataireLines ?? [])];
                            next[index] = { ...line, right: e.target.value };
                            setDraft({ ...draft, destinataireLines: next });
                          }}
                        />
                      </Field>
                      {canEdit ? (
                        <div className="flex items-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={index === 0}
                            onClick={() => {
                              const next = [...(draft.destinataireLines ?? [])];
                              const tmp = next[index - 1];
                              next[index - 1] = next[index];
                              next[index] = tmp;
                              setDraft({ ...draft, destinataireLines: next });
                            }}
                            aria-label={t("reportsMessages.templateManagement.actions.moveUp")}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={index === (draft.destinataireLines?.length ?? 0) - 1}
                            onClick={() => {
                              const next = [...(draft.destinataireLines ?? [])];
                              const tmp = next[index + 1];
                              next[index + 1] = next[index];
                              next[index] = tmp;
                              setDraft({ ...draft, destinataireLines: next });
                            }}
                            aria-label={t("reportsMessages.templateManagement.actions.moveDown")}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={(draft.destinataireLines?.length ?? 0) <= 1}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                destinataireLines: (draft.destinataireLines ?? []).filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                            aria-label={t(
                              "reportsMessages.templateManagement.actions.removeDestinataireLine",
                            )}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          destinataireLines: [
                            ...(draft.destinataireLines ?? []),
                            { left: "", right: "" },
                          ],
                        })
                      }
                    >
                      {t("reportsMessages.templateManagement.actions.addDestinataireLine")}
                    </Button>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-3 rounded-xl border border-border/70 p-4">
                <h3 className="text-sm font-semibold">
                  {t("reportsMessages.templateManagement.sections.signatures")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("reportsMessages.templateManagement.signaturesHint")}
                </p>
                {draft.signatureSlots.map((slot, index) => (
                  <div
                    key={`sig-${index}`}
                    className="grid gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <Field label={t("reportsMessages.templateManagement.fields.sigName")}>
                      <Input
                        value={slot.nameHint}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const next = [...draft.signatureSlots];
                          next[index] = { ...slot, nameHint: e.target.value };
                          setDraft({ ...draft, signatureSlots: next });
                        }}
                      />
                    </Field>
                    <Field label={t("reportsMessages.templateManagement.fields.sigFunction")}>
                      <Input
                        value={slot.functionHint}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const next = [...draft.signatureSlots];
                          next[index] = { ...slot, functionHint: e.target.value };
                          setDraft({ ...draft, signatureSlots: next });
                        }}
                      />
                    </Field>
                    {canEdit ? (
                      <div className="flex items-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...draft.signatureSlots];
                            const tmp = next[index - 1];
                            next[index - 1] = next[index];
                            next[index] = tmp;
                            setDraft({ ...draft, signatureSlots: next });
                          }}
                          aria-label={t("reportsMessages.templateManagement.actions.moveUp")}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === draft.signatureSlots.length - 1}
                          onClick={() => {
                            const next = [...draft.signatureSlots];
                            const tmp = next[index + 1];
                            next[index + 1] = next[index];
                            next[index] = tmp;
                            setDraft({ ...draft, signatureSlots: next });
                          }}
                          aria-label={t("reportsMessages.templateManagement.actions.moveDown")}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={draft.signatureSlots.length <= 1}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              signatureSlots: draft.signatureSlots.filter((_, i) => i !== index),
                            })
                          }
                          aria-label={t("reportsMessages.templateManagement.actions.removeSignature")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        signatureSlots: [
                          ...draft.signatureSlots,
                          { nameHint: "", functionHint: "" },
                        ],
                      })
                    }
                  >
                    {t("reportsMessages.templateManagement.actions.addSignature")}
                  </Button>
                ) : null}
              </section>
            </div>
          }
          preview={
            base.builder === "message_demande" || base.builder === "heat_dog" ? (
              <OfficialPdfPreview
                model={previewModel}
                labels={labels}
                title={t("reportsMessages.sickDogReport.preview.a4Label")}
              />
            ) : (
              <DocumentTemplate
                model={previewModel}
                labels={labels}
                sections={previewSections}
                columnLabels={{
                  origin: t("reportsMessages.sickDogReport.fields.origin"),
                  number: t("reportsMessages.sickDogReport.fields.number"),
                  words: t("reportsMessages.sickDogReport.fields.wordCount"),
                  departureDateTime: t(
                    "reportsMessages.sickDogReport.fields.departureDateTime",
                  ),
                  serviceMention: t("reportsMessages.sickDogReport.fields.serviceMention"),
                }}
              />
            )
          }
        />
      </PageContentShell>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
