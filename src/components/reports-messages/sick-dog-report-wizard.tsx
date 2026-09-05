import { useEffect, useMemo, useState } from "react";
import { FileDown, Plus, Trash2 } from "lucide-react";
import type { DogRow } from "@/integrations/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentWorkspace } from "@/components/reports-messages/document-workspace";
import { SickDogReportPreview } from "@/components/reports-messages/sick-dog-report-preview";
import {
  exportOfficialDocumentDocxFromTemplate,
  exportOfficialDocumentFromTemplate,
  getDocumentTemplateConfig,
  validateTemplateRequiredFields,
} from "@/lib/reports-messages/document-templates";
import { buildDefaultOverrideFromConfig } from "@/lib/reports-messages/document-templates/merge-template";
import {
  useEffectiveDocumentTemplate,
  withTemplateSnapshot,
} from "@/lib/reports-messages/document-templates/use-effective-template";
import { fetchDocumentTemplatesSettingsOrDefault } from "@/lib/reports-messages/document-templates/template-overrides-store";
import { db } from "@/integrations/database/client";
import {
  SICK_DOG_WIZARD_STEPS,
  countMessageWords,
  createEmptySignatory,
  createDefaultSickDogReportFormData,
  parseSickDogReportFormData,
  serializeSickDogReportFormData,
  type SickDogPriority,
  type SickDogReportFormData,
  type SickDogWizardStep,
} from "@/lib/reports-messages/sick-dog-report";
import type { RoleDocumentPayload } from "@/lib/reports-messages/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type SickDogReportWizardProps = {
  initialPayload: RoleDocumentPayload;
  dogs: DogRow[];
  readOnly?: boolean;
  saving?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onCancel: () => void;
  onSaveDraft: (payload: RoleDocumentPayload, meta: { dogId: string; agentId: string | null; sectionId: string | null }) => void;
  onExported?: (payload: RoleDocumentPayload) => void;
};

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-border/70 pb-2 text-sm font-semibold tracking-tight text-foreground">
      {children}
    </h3>
  );
}

export function SickDogReportWizard({
  initialPayload,
  dogs,
  readOnly = false,
  saving = false,
  t,
  onCancel,
  onSaveDraft,
  onExported,
}: SickDogReportWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<SickDogReportFormData>(() =>
    parseSickDogReportFormData(initialPayload),
  );

  useEffect(() => {
    setData(parseSickDogReportFormData(initialPayload));
  }, [initialPayload]);

  const step = SICK_DOG_WIZARD_STEPS[stepIndex] ?? "messageInfo";
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === SICK_DOG_WIZARD_STEPS.length - 1;

  const selectedDog = useMemo(
    () => dogs.find((dog) => dog.id === data.dogId) ?? null,
    [dogs, data.dogId],
  );

  const specialtyLabel = selectedDog ? t(`specialty.${selectedDog.specialty}`) : "";

  const handlerLabel = selectedDog?.agent
    ? `${selectedDog.agent.first_name} ${selectedDog.agent.last_name}`.trim()
    : "";

  const sectionLabel = selectedDog?.agent?.section?.name?.trim() || undefined;

  const patch = (partial: Partial<SickDogReportFormData>) => {
    if (readOnly) return;
    setData((prev) => ({ ...prev, ...partial }));
  };

  const buildPayload = () =>
    serializeSickDogReportFormData(data, {
      agentId: selectedDog?.agent?.id ?? null,
      sectionId: selectedDog?.agent?.section?.id ?? null,
    });

  const saveDraft = () => {
    onSaveDraft(buildPayload(), {
      dogId: data.dogId,
      agentId: selectedDog?.agent?.id ?? null,
      sectionId: selectedDog?.agent?.section?.id ?? null,
    });
  };

  const goNext = () => {
    if (isLast) {
      saveDraft();
      return;
    }
    setStepIndex((value) => Math.min(value + 1, SICK_DOG_WIZARD_STEPS.length - 1));
  };

  const goBack = () => {
    setStepIndex((value) => Math.max(value - 1, 0));
  };

  const { effective } = useEffectiveDocumentTemplate("sick_dog_report");

  const exportPdf = async () => {
    if (exporting) return;
    const config = getDocumentTemplateConfig("sick_dog_report");
    if (!config) return;

    const issues = validateTemplateRequiredFields(config, {
      ...data,
      dogId: data.dogId,
      signatories: data.signatories,
      attachments: data.attachments,
    });
    if (issues.length > 0) {
      toast.error(t(issues[0].messageKey, issues[0].params));
      return;
    }

    setExporting(true);
    try {
      await exportOfficialDocumentFromTemplate(
        {
          config: effective
            ? { ...config, sections: effective.visibleSections }
            : config,
          builder: "sick_dog",
          data,
          dog: selectedDog,
          t,
          effective,
        },
        `rapport-chien-malade-${(selectedDog?.name || "brouillon")
          .toLowerCase()
          .replace(/\s+/g, "-")}.pdf`,
      );
      const settings = await fetchDocumentTemplatesSettingsOrDefault(db);
      const override =
        settings.byId.sick_dog_report ?? buildDefaultOverrideFromConfig(config);
      const payload = withTemplateSnapshot(buildPayload(), override);
      onExported?.(payload);
    } catch (error) {
      console.error(error);
      toast.error(t("reportsMessages.sickDogReport.errors.exportPdf"));
    } finally {
      setExporting(false);
    }
  };

  const exportWord = async () => {
    if (exporting) return;
    const config = getDocumentTemplateConfig("sick_dog_report");
    if (!config) return;

    const issues = validateTemplateRequiredFields(config, {
      ...data,
      dogId: data.dogId,
      signatories: data.signatories,
      attachments: data.attachments,
    });
    if (issues.length > 0) {
      toast.error(t(issues[0].messageKey, issues[0].params));
      return;
    }

    setExporting(true);
    try {
      await exportOfficialDocumentDocxFromTemplate(
        {
          config: effective
            ? { ...config, sections: effective.visibleSections }
            : config,
          builder: "sick_dog",
          data,
          dog: selectedDog,
          t,
          effective,
        },
        `rapport-chien-malade-${(selectedDog?.name || "brouillon")
          .toLowerCase()
          .replace(/\s+/g, "-")}.docx`,
      );
      const settings = await fetchDocumentTemplatesSettingsOrDefault(db);
      const override =
        settings.byId.sick_dog_report ?? buildDefaultOverrideFromConfig(config);
      const payload = withTemplateSnapshot(buildPayload(), override);
      onExported?.(payload);
    } catch (error) {
      console.error(error);
      toast.error(t("reportsMessages.sickDogReport.errors.exportWord"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t("reportsMessages.sickDogReport.wizardTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("reportsMessages.sickDogReport.wizardDescription")}
          </p>
        </div>

        <nav aria-label={t("reportsMessages.sickDogReport.stepsNav")} className="overflow-x-auto">
          <ol className="flex min-w-max gap-2">
            {SICK_DOG_WIZARD_STEPS.map((key, index) => {
              const active = index === stepIndex;
              const done = index < stepIndex;
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={readOnly && !active}
                    onClick={() => setStepIndex(index)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active && "border-primary bg-primary/10 text-primary",
                      done && !active && "border-emerald-600/30 bg-emerald-500/10 text-emerald-800",
                      !active && !done && "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {index + 1}. {t(`reportsMessages.sickDogReport.steps.${key}`)}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <DocumentWorkspace
        form={
      <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-6">
        {step === "messageInfo" ? (
          <div className="space-y-6">
            <SectionTitle>{t("reportsMessages.sickDogReport.sections.radioDepartHeader")}</SectionTitle>
            <p className="text-sm text-muted-foreground">
              {t("reportsMessages.sickDogReport.hints.radioDepartHeader")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label={t("reportsMessages.sickDogReport.fields.origin")} htmlFor="sd-origin">
                <Input
                  id="sd-origin"
                  value={data.origin}
                  disabled={readOnly}
                  onChange={(e) => patch({ origin: e.target.value })}
                />
              </Field>
              <Field label={t("reportsMessages.sickDogReport.fields.number")} htmlFor="sd-number">
                <Input
                  id="sd-number"
                  value={data.number}
                  disabled={readOnly}
                  onChange={(e) => patch({ number: e.target.value })}
                />
              </Field>
              <Field
                label={t("reportsMessages.sickDogReport.fields.wordCount")}
                htmlFor="sd-words"
                hint={t("reportsMessages.sickDogReport.hints.wordCountAuto", {
                  count: countMessageWords(data.messageBody),
                })}
              >
                <Input
                  id="sd-words"
                  value={data.wordCount}
                  disabled={readOnly}
                  placeholder={String(countMessageWords(data.messageBody) || "")}
                  onChange={(e) => patch({ wordCount: e.target.value })}
                />
              </Field>
              <Field
                label={t("reportsMessages.sickDogReport.fields.departureDateTime")}
                htmlFor="sd-depart"
              >
                <Input
                  id="sd-depart"
                  type="datetime-local"
                  value={data.departureDateTime}
                  disabled={readOnly}
                  onChange={(e) => patch({ departureDateTime: e.target.value })}
                />
              </Field>
              <Field
                label={t("reportsMessages.sickDogReport.fields.serviceMention")}
                htmlFor="sd-service"
              >
                <Input
                  id="sd-service"
                  value={data.serviceMention}
                  disabled={readOnly}
                  onChange={(e) => patch({ serviceMention: e.target.value })}
                />
              </Field>
            </div>

            <Field label={t("reportsMessages.sickDogReport.fields.priority")}>
              <Select
                value={data.priority}
                disabled={readOnly}
                onValueChange={(value) => patch({ priority: value as SickDogPriority })}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="URGENT">
                    {t("reportsMessages.sickDogReport.priority.urgent")}
                  </SelectItem>
                  <SelectItem value="NORMAL">
                    {t("reportsMessages.sickDogReport.priority.normal")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <SectionTitle>{t("reportsMessages.sickDogReport.sections.senderRecipient")}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("reportsMessages.sickDogReport.fields.senderUnit")}
                htmlFor="sd-sender"
              >
                <Input
                  id="sd-sender"
                  value={data.senderUnit}
                  disabled={readOnly}
                  onChange={(e) => patch({ senderUnit: e.target.value })}
                />
              </Field>
              <Field
                label={t("reportsMessages.sickDogReport.fields.recipient")}
                htmlFor="sd-recipient"
              >
                <Input
                  id="sd-recipient"
                  value={data.recipient}
                  disabled={readOnly}
                  onChange={(e) => patch({ recipient: e.target.value })}
                />
              </Field>
              <Field label={t("reportsMessages.sickDogReport.fields.city")} htmlFor="sd-city">
                <Input
                  id="sd-city"
                  value={data.city}
                  disabled={readOnly}
                  onChange={(e) => patch({ city: e.target.value })}
                />
              </Field>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle>{t("reportsMessages.sickDogReport.sections.diffusion")}</SectionTitle>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch({ diffusion: [...data.diffusion, ""] })}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t("reportsMessages.sickDogReport.actions.addDiffusion")}
                  </Button>
                ) : null}
              </div>
              <div className="space-y-2">
                {data.diffusion.map((item, index) => (
                  <div key={`diffusion-${index}`} className="flex gap-2">
                    <Input
                      value={item}
                      disabled={readOnly}
                      placeholder={t("reportsMessages.sickDogReport.placeholders.diffusion")}
                      onChange={(e) => {
                        const next = [...data.diffusion];
                        next[index] = e.target.value;
                        patch({ diffusion: next });
                      }}
                    />
                    {!readOnly && data.diffusion.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("action.delete")}
                        onClick={() =>
                          patch({
                            diffusion: data.diffusion.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === "dogVeterinary" ? (
          <div className="space-y-6">
            <SectionTitle>{t("reportsMessages.sickDogReport.sections.dog")}</SectionTitle>
            <Field label={t("reportsMessages.sickDogReport.fields.dog")}>
              <Select
                value={data.dogId || undefined}
                disabled={readOnly}
                onValueChange={(value) => patch({ dogId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("reportsMessages.form.selectDog")} />
                </SelectTrigger>
                <SelectContent>
                  {dogs.map((dog) => (
                    <SelectItem key={dog.id} value={dog.id}>
                      {dog.name}
                      {dog.agent
                        ? ` — ${dog.agent.first_name} ${dog.agent.last_name}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {selectedDog ? (
              <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-2">
                <ReadOnlyRow
                  label={t("reportsMessages.sickDogReport.fields.dogName")}
                  value={selectedDog.name}
                />
                <ReadOnlyRow
                  label={t("reportsMessages.sickDogReport.fields.specialty")}
                  value={specialtyLabel || "—"}
                />
                <ReadOnlyRow
                  label={t("reportsMessages.sickDogReport.fields.handler")}
                  value={handlerLabel || "—"}
                />
                {sectionLabel ? (
                  <ReadOnlyRow
                    label={t("reportsMessages.sickDogReport.fields.section")}
                    value={sectionLabel}
                  />
                ) : null}
                {selectedDog.breed ? (
                  <ReadOnlyRow
                    label={t("reportsMessages.sickDogReport.fields.breed")}
                    value={selectedDog.breed}
                  />
                ) : null}
                {selectedDog.microchip_number ? (
                  <ReadOnlyRow
                    label={t("reportsMessages.sickDogReport.fields.microchip")}
                    value={selectedDog.microchip_number}
                  />
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("reportsMessages.sickDogReport.hints.selectDog")}
              </p>
            )}

            <SectionTitle>{t("reportsMessages.sickDogReport.sections.veterinary")}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("reportsMessages.sickDogReport.fields.examDate")} htmlFor="sd-exam">
                <Input
                  id="sd-exam"
                  type="date"
                  value={data.examDate}
                  disabled={readOnly}
                  onChange={(e) => patch({ examDate: e.target.value })}
                />
              </Field>
              <Field
                label={t("reportsMessages.sickDogReport.fields.veterinarianName")}
                htmlFor="sd-vet"
              >
                <Input
                  id="sd-vet"
                  value={data.veterinarianName}
                  disabled={readOnly}
                  onChange={(e) => patch({ veterinarianName: e.target.value })}
                />
              </Field>
              <Field
                label={t("reportsMessages.sickDogReport.fields.examReason")}
                htmlFor="sd-reason"
              >
                <Input
                  id="sd-reason"
                  value={data.examReason}
                  disabled={readOnly}
                  onChange={(e) => patch({ examReason: e.target.value })}
                />
              </Field>
              <Field
                label={t("reportsMessages.sickDogReport.fields.restPeriod")}
                htmlFor="sd-rest"
              >
                <Input
                  id="sd-rest"
                  value={data.restPeriod}
                  disabled={readOnly}
                  onChange={(e) => patch({ restPeriod: e.target.value })}
                />
              </Field>
            </div>
            <Field
              label={t("reportsMessages.sickDogReport.fields.clinicalObservations")}
              htmlFor="sd-clinical"
            >
              <Textarea
                id="sd-clinical"
                rows={3}
                value={data.clinicalObservations}
                disabled={readOnly}
                onChange={(e) => patch({ clinicalObservations: e.target.value })}
              />
            </Field>
            <Field label={t("reportsMessages.sickDogReport.fields.diagnosis")} htmlFor="sd-diag">
              <Textarea
                id="sd-diag"
                rows={3}
                value={data.diagnosis}
                disabled={readOnly}
                onChange={(e) => patch({ diagnosis: e.target.value })}
              />
            </Field>
            <Field label={t("reportsMessages.sickDogReport.fields.treatment")} htmlFor="sd-treat">
              <Textarea
                id="sd-treat"
                rows={3}
                value={data.treatment}
                disabled={readOnly}
                onChange={(e) => patch({ treatment: e.target.value })}
              />
            </Field>
            <Field
              label={t("reportsMessages.documentTemplates.fields.medication")}
              htmlFor="sd-med"
            >
              <Textarea
                id="sd-med"
                rows={2}
                value={data.medication}
                disabled={readOnly}
                onChange={(e) => patch({ medication: e.target.value })}
              />
            </Field>
            <Field
              label={t("reportsMessages.sickDogReport.fields.additionalObservations")}
              htmlFor="sd-addobs"
            >
              <Textarea
                id="sd-addobs"
                rows={3}
                value={data.additionalObservations}
                disabled={readOnly}
                onChange={(e) => patch({ additionalObservations: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {step === "messageBody" ? (
          <div className="space-y-4">
            <SectionTitle>{t("reportsMessages.sickDogReport.sections.messageBody")}</SectionTitle>
            <p className="text-sm text-muted-foreground">
              {t("reportsMessages.sickDogReport.hints.messageBody")}
            </p>
            <Textarea
              rows={14}
              value={data.messageBody}
              disabled={readOnly}
              className="min-h-[18rem] font-serif text-[15px] leading-relaxed"
              placeholder={t("reportsMessages.sickDogReport.placeholders.messageBody")}
              onChange={(e) => patch({ messageBody: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t("reportsMessages.sickDogReport.hints.wordCountAuto", {
                count: countMessageWords(data.messageBody),
              })}
            </p>
          </div>
        ) : null}

        {step === "signatures" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>{t("reportsMessages.sickDogReport.sections.signatures")}</SectionTitle>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch({
                      signatories: [
                        ...data.signatories,
                        createEmptySignatory(data.signatories.length + 1),
                      ],
                    })
                  }
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("reportsMessages.sickDogReport.actions.addSignatory")}
                </Button>
              ) : null}
            </div>

            <div className="space-y-3">
              {data.signatories.map((row, index) => (
                <div
                  key={row.id}
                  className="grid gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-[1fr_1fr_5.5rem_auto_auto]"
                >
                  <Field label={t("reportsMessages.sickDogReport.fields.signatoryName")}>
                    <Input
                      value={row.name}
                      disabled={readOnly}
                      onChange={(e) => {
                        const next = [...data.signatories];
                        next[index] = { ...row, name: e.target.value };
                        patch({ signatories: next });
                      }}
                    />
                  </Field>
                  <Field label={t("reportsMessages.sickDogReport.fields.signatoryFunction")}>
                    <Input
                      value={row.functionTitle}
                      disabled={readOnly}
                      onChange={(e) => {
                        const next = [...data.signatories];
                        next[index] = { ...row, functionTitle: e.target.value };
                        patch({ signatories: next });
                      }}
                    />
                  </Field>
                  <Field label={t("reportsMessages.sickDogReport.fields.signatoryOrder")}>
                    <Input
                      type="number"
                      min={1}
                      value={row.order}
                      disabled={readOnly}
                      onChange={(e) => {
                        const next = [...data.signatories];
                        next[index] = {
                          ...row,
                          order: Number(e.target.value) || index + 1,
                        };
                        patch({ signatories: next });
                      }}
                    />
                  </Field>
                  <div className="flex items-end gap-2 pb-1">
                    <Switch
                      checked={row.enabled}
                      disabled={readOnly}
                      onCheckedChange={(checked) => {
                        const next = [...data.signatories];
                        next[index] = { ...row, enabled: checked };
                        patch({ signatories: next });
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {row.enabled
                        ? t("status.enabled")
                        : t("common.inactive")}
                    </span>
                  </div>
                  {!readOnly && data.signatories.length > 1 ? (
                    <div className="flex items-end justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("action.delete")}
                        onClick={() =>
                          patch({
                            signatories: data.signatories.filter((item) => item.id !== row.id),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{t("reportsMessages.documentTemplates.fields.attachments")}</Label>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch({ attachments: [...data.attachments, ""] })}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t("reportsMessages.documentTemplates.actions.addAttachment")}
                  </Button>
                ) : null}
              </div>
              {data.attachments.map((item, index) => (
                <div key={`att-${index}`} className="flex gap-2">
                  <Input
                    value={item}
                    disabled={readOnly}
                    onChange={(e) => {
                      const next = [...data.attachments];
                      next[index] = e.target.value;
                      patch({ attachments: next });
                    }}
                  />
                  {!readOnly && data.attachments.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        patch({
                          attachments: data.attachments.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === "preview" ? (
          <div className="space-y-3">
            <SectionTitle>{t("reportsMessages.sickDogReport.steps.preview")}</SectionTitle>
            <p className="text-sm text-muted-foreground">
              {t("reportsMessages.sickDogReport.hints.preview")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void exportPdf()}
                disabled={exporting || saving}
              >
                <FileDown className="mr-1.5 h-4 w-4" />
                {t("reportsMessages.sickDogReport.actions.exportPdf")}
              </Button>
              <Button
                type="button"
                onClick={() => void exportWord()}
                disabled={exporting || saving}
              >
                <FileDown className="mr-1.5 h-4 w-4" />
                {t("reportsMessages.sickDogReport.actions.exportWord")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
        }
        preview={
          <SickDogReportPreview data={data} dog={selectedDog} t={t} />
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving || exporting}>
            {t("action.cancel")}
          </Button>
          {!readOnly ? (
            <Button
              type="button"
              variant="secondary"
              onClick={saveDraft}
              disabled={saving || exporting}
            >
              {t("reportsMessages.actions.saveDraft")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => void exportPdf()}
            disabled={exporting || saving}
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            {t("reportsMessages.sickDogReport.actions.exportPdf")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void exportWord()}
            disabled={exporting || saving}
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            {t("reportsMessages.sickDogReport.actions.exportWord")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={isFirst || saving || exporting}
          >
            {t("reportsMessages.sickDogReport.actions.back")}
          </Button>
          <Button type="button" onClick={goNext} disabled={saving || exporting}>
            {isLast
              ? t("reportsMessages.actions.saveDraft")
              : t("reportsMessages.sickDogReport.actions.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

/** Exported for create-path default payload. */
export function buildSickDogCreatePayload(context?: {
  userName?: string;
  userEmail?: string;
}): RoleDocumentPayload {
  const data = createDefaultSickDogReportFormData({ userName: context?.userName });
  const payload = serializeSickDogReportFormData(data);
  if (context?.userEmail) payload.author_email = context.userEmail;
  return payload;
}

export type { SickDogWizardStep };
