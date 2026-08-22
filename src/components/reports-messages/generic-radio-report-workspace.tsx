import { useEffect, useMemo, useState } from "react";
import { FileDown, Plus } from "lucide-react";
import { toast } from "sonner";
import type { DogRow } from "@/integrations/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentWorkspace } from "@/components/reports-messages/document-workspace";
import { DocumentTemplate } from "@/components/reports-messages/official-document/DocumentTemplate";
import {
  buildOfficialDocumentFromTemplate,
  createDefaultGenericRadioFormData,
  exportOfficialDocumentFromTemplate,
  genericRadioValuesForValidation,
  getDocumentTemplateConfig,
  parseGenericRadioFormData,
  serializeGenericRadioFormData,
  validateTemplateRequiredFields,
  type DocumentTemplateConfig,
  type GenericRadioReportFormData,
} from "@/lib/reports-messages/document-templates";
import { randomId } from "@/lib/random-id";
import { filterSectionsByValues } from "@/lib/reports-messages/document-templates/merge-template";
import { useEffectiveDocumentTemplate } from "@/lib/reports-messages/document-templates/use-effective-template";
import { sickDogOfficialLabelsFromT } from "@/lib/reports-messages/official-document/build-sick-dog-document";
import type { RoleDocumentPayload } from "@/lib/reports-messages/types";

type Props = {
  templateId: string;
  initialPayload: RoleDocumentPayload;
  dogs: DogRow[];
  readOnly?: boolean;
  saving?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onCancel: () => void;
  onSaveDraft: (
    payload: RoleDocumentPayload,
    meta: { dogId: string; agentId: string | null; sectionId: string | null },
  ) => void;
  onExported?: (payload: RoleDocumentPayload) => void;
};

export function GenericRadioReportWorkspace({
  templateId,
  initialPayload,
  dogs,
  readOnly = false,
  saving = false,
  t,
  onCancel,
  onSaveDraft,
  onExported,
}: Props) {
  const config = getDocumentTemplateConfig(templateId) as DocumentTemplateConfig | undefined;
  const { effective } = useEffectiveDocumentTemplate(templateId);
  const blobKey = config?.payloadBlobKey ?? `${templateId}_v1`;
  const [data, setData] = useState<GenericRadioReportFormData>(() =>
    parseGenericRadioFormData(initialPayload, blobKey),
  );
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setData(parseGenericRadioFormData(initialPayload, blobKey));
  }, [initialPayload, blobKey]);

  const selectedDog = useMemo(
    () => dogs.find((dog) => dog.id === data.dogId) ?? null,
    [dogs, data.dogId],
  );

  const patch = (partial: Partial<GenericRadioReportFormData>) => {
    if (readOnly) return;
    setData((prev) => ({ ...prev, ...partial }));
  };

  const labels = useMemo(() => {
    const base = sickDogOfficialLabelsFromT(t);
    if (!effective) return base;
    return {
      ...base,
      agencyLine1: effective.header.organizationName || base.agencyLine1,
      agencyLine2: effective.header.department || base.agencyLine2,
      radioTitle: effective.header.radioTitle || base.radioTitle,
    };
  }, [effective, t]);
  const model = useMemo(() => {
    if (!config) return null;
    return buildOfficialDocumentFromTemplate({
      config: effective ? { ...config, sections: effective.visibleSections } : config,
      builder: "generic_radio",
      data,
      dog: selectedDog,
      t,
      effective,
    });
  }, [config, effective, data, selectedDog, t]);

  const previewSections = useMemo(() => {
    if (!effective) return config?.sections;
    return filterSectionsByValues(effective, { ...data, dogId: data.dogId });
  }, [effective, config, data]);

  const saveDraft = () => {
    if (!config) return;
    onSaveDraft(
      serializeGenericRadioFormData(data, config.payloadBlobKey, {
        agentId: selectedDog?.agent?.id ?? null,
        sectionId: selectedDog?.agent?.section?.id ?? null,
      }),
      {
        dogId: data.dogId,
        agentId: selectedDog?.agent?.id ?? null,
        sectionId: selectedDog?.agent?.section?.id ?? null,
      },
    );
  };

  const exportPdf = async () => {
    if (!config || exporting) return;
    const issues = validateTemplateRequiredFields(config, genericRadioValuesForValidation(data));
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
          builder: "generic_radio",
          data,
          dog: selectedDog,
          t,
          effective,
        },
        `${config.templateKey}-${selectedDog?.name || "brouillon"}.pdf`,
      );
      onExported?.(
        serializeGenericRadioFormData(data, config.payloadBlobKey, {
          agentId: selectedDog?.agent?.id ?? null,
          sectionId: selectedDog?.agent?.section?.id ?? null,
        }),
      );
    } catch (error) {
      console.error(error);
      toast.error(t("reportsMessages.documentTemplates.errors.exportPdf"));
    } finally {
      setExporting(false);
    }
  };

  if (!config || !model) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("reportsMessages.documentTemplates.errors.unknownTemplate")}
      </p>
    );
  }

  return (
    <DocumentWorkspace
      toolbar={
        <>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving || exporting}>
            {t("action.cancel")}
          </Button>
          {!readOnly ? (
            <Button type="button" variant="secondary" onClick={saveDraft} disabled={saving || exporting}>
              {t("reportsMessages.actions.saveDraft")}
            </Button>
          ) : null}
          <Button type="button" onClick={() => void exportPdf()} disabled={exporting || saving}>
            <FileDown className="mr-1.5 h-4 w-4" />
            {t("reportsMessages.sickDogReport.actions.exportPdf")}
          </Button>
        </>
      }
      form={
        <div className="space-y-5 rounded-xl border border-border/70 bg-card p-4 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">{t(config.titleKey)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t(config.descriptionKey)}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("reportsMessages.sickDogReport.fields.origin")}>
              <Input
                value={data.origin}
                disabled={readOnly}
                onChange={(e) => patch({ origin: e.target.value })}
              />
            </Field>
            <Field label={t("reportsMessages.sickDogReport.fields.number")}>
              <Input
                value={data.number}
                disabled={readOnly}
                onChange={(e) => patch({ number: e.target.value })}
              />
            </Field>
            <Field label={t("reportsMessages.sickDogReport.fields.departureDateTime")}>
              <Input
                type="datetime-local"
                value={data.departureDateTime}
                disabled={readOnly}
                onChange={(e) => patch({ departureDateTime: e.target.value })}
              />
            </Field>
            <Field label={t("reportsMessages.sickDogReport.fields.priority")}>
              <Select
                value={data.priority}
                disabled={readOnly}
                onValueChange={(value) =>
                  patch({ priority: value === "URGENT" ? "URGENT" : "NORMAL" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">
                    {t("reportsMessages.sickDogReport.priority.normal")}
                  </SelectItem>
                  <SelectItem value="URGENT">
                    {t("reportsMessages.sickDogReport.priority.urgent")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("reportsMessages.sickDogReport.fields.senderUnit")}>
              <Input
                value={data.senderUnit}
                disabled={readOnly}
                onChange={(e) => patch({ senderUnit: e.target.value })}
              />
            </Field>
            <Field label={t("reportsMessages.sickDogReport.fields.recipient")}>
              <Input
                value={data.recipient}
                disabled={readOnly}
                onChange={(e) => patch({ recipient: e.target.value })}
              />
            </Field>
            <Field label={t("reportsMessages.sickDogReport.fields.city")}>
              <Input
                value={data.city}
                disabled={readOnly}
                onChange={(e) => patch({ city: e.target.value })}
              />
            </Field>
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {selectedDog ? (
              <div className="sm:col-span-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <p>
                  <span className="text-muted-foreground">
                    {t("reportsMessages.documentTemplates.fields.specialty")}:
                  </span>{" "}
                  {t(`specialty.${selectedDog.specialty}`)}
                </p>
                <p>
                  <span className="text-muted-foreground">
                    {t("reportsMessages.documentTemplates.fields.handler")}:
                  </span>{" "}
                  {selectedDog.agent
                    ? `${selectedDog.agent.first_name} ${selectedDog.agent.last_name}`
                    : "—"}
                </p>
              </div>
            ) : null}
            <Field label={t("reportsMessages.sickDogReport.fields.examDate")}>
              <Input
                type="date"
                value={data.examDate}
                disabled={readOnly}
                onChange={(e) => patch({ examDate: e.target.value })}
              />
            </Field>
            <Field label={t("reportsMessages.sickDogReport.fields.veterinarianName")}>
              <Input
                value={data.veterinarianName}
                disabled={readOnly}
                onChange={(e) => patch({ veterinarianName: e.target.value })}
              />
            </Field>
          </div>

          <Field label={t("reportsMessages.sickDogReport.fields.examReason")}>
            <Textarea
              rows={2}
              value={data.examReason}
              disabled={readOnly}
              onChange={(e) => patch({ examReason: e.target.value })}
            />
          </Field>
          <Field label={t("reportsMessages.sickDogReport.fields.clinicalObservations")}>
            <Textarea
              rows={3}
              value={data.clinicalObservations}
              disabled={readOnly}
              onChange={(e) => patch({ clinicalObservations: e.target.value })}
            />
          </Field>
          <Field label={t("reportsMessages.sickDogReport.fields.treatment")}>
            <Textarea
              rows={3}
              value={data.treatment}
              disabled={readOnly}
              onChange={(e) => patch({ treatment: e.target.value })}
            />
          </Field>
          <Field label={t("reportsMessages.documentTemplates.fields.messageBody")}>
            <Textarea
              rows={8}
              value={data.messageBody}
              disabled={readOnly}
              className="font-serif"
              onChange={(e) => patch({ messageBody: e.target.value })}
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("reportsMessages.documentTemplates.fields.signatories")}</Label>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch({
                      signatories: [
                        ...data.signatories,
                        {
                          id: randomId(),
                          name: "",
                          functionTitle: "",
                          order: data.signatories.length + 1,
                          enabled: true,
                        },
                      ],
                    })
                  }
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("reportsMessages.sickDogReport.actions.addSignatory")}
                </Button>
              ) : null}
            </div>
            {data.signatories.map((row, index) => (
              <div key={row.id} className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={row.name}
                  disabled={readOnly}
                  placeholder={t("reportsMessages.sickDogReport.fields.signatoryName")}
                  onChange={(e) => {
                    const next = [...data.signatories];
                    next[index] = { ...row, name: e.target.value };
                    patch({ signatories: next });
                  }}
                />
                <Input
                  value={row.functionTitle}
                  disabled={readOnly}
                  placeholder={t("reportsMessages.sickDogReport.fields.signatoryFunction")}
                  onChange={(e) => {
                    const next = [...data.signatories];
                    next[index] = { ...row, functionTitle: e.target.value };
                    patch({ signatories: next });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      }
      preview={
        <DocumentTemplate
          model={model}
          labels={labels}
          sections={previewSections}
          columnLabels={{
            origin: t("reportsMessages.sickDogReport.fields.origin"),
            number: t("reportsMessages.sickDogReport.fields.number"),
            words: t("reportsMessages.sickDogReport.fields.wordCount"),
            departureDateTime: t("reportsMessages.sickDogReport.fields.departureDateTime"),
            serviceMention: t("reportsMessages.sickDogReport.fields.serviceMention"),
          }}
        />
      }
    />
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Exported for create-path defaults. */
export function buildGenericRadioCreatePayload(
  templateId: string,
  context?: { userName?: string; userEmail?: string },
): RoleDocumentPayload {
  const config = getDocumentTemplateConfig(templateId);
  const data = createDefaultGenericRadioFormData({ userName: context?.userName });
  const payload = serializeGenericRadioFormData(
    data,
    config?.payloadBlobKey ?? `${templateId}_v1`,
  );
  if (context?.userEmail) payload.author_email = context.userEmail;
  return payload;
}
