import { useMemo } from "react";
import type { DogRow } from "@/integrations/database";
import { DocumentTemplate } from "@/components/reports-messages/official-document/DocumentTemplate";
import {
  buildOfficialDocumentFromTemplate,
  getDocumentTemplateConfig,
} from "@/lib/reports-messages/document-templates";
import { filterSectionsByValues } from "@/lib/reports-messages/document-templates/merge-template";
import { useEffectiveDocumentTemplate } from "@/lib/reports-messages/document-templates/use-effective-template";
import { sickDogOfficialLabelsFromT } from "@/lib/reports-messages/official-document/build-sick-dog-document";
import type { SickDogReportFormData } from "@/lib/reports-messages/sick-dog-report";
import type { RoleDocumentPayload } from "@/lib/reports-messages/types";

type SickDogReportPreviewProps = {
  data: SickDogReportFormData;
  dog: DogRow | null;
  t: (key: string, params?: Record<string, string | number>) => string;
  className?: string;
  /** Pass document payload to freeze layout for finalized docs */
  documentPayload?: RoleDocumentPayload | null;
  preferSnapshot?: boolean;
};

/**
 * Live A4 preview — uses the shared template engine + admin overrides.
 */
export function SickDogReportPreview({
  data,
  dog,
  t,
  className,
  documentPayload,
  preferSnapshot,
}: SickDogReportPreviewProps) {
  const config = getDocumentTemplateConfig("sick_dog_report");
  const { effective } = useEffectiveDocumentTemplate("sick_dog_report", {
    payload: documentPayload,
    preferSnapshot,
  });
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
      builder: "sick_dog",
      data,
      dog,
      t,
      effective,
    });
  }, [config, effective, data, dog, t]);

  const sections = useMemo(() => {
    if (!effective) return config?.sections;
    return filterSectionsByValues(effective, {
      ...data,
      dogId: data.dogId,
      attachments: data.attachments,
    });
  }, [effective, config, data]);

  if (!config || !model) return null;

  return (
    <DocumentTemplate
      model={model}
      labels={labels}
      sections={sections}
      columnLabels={{
        origin: t("reportsMessages.sickDogReport.fields.origin"),
        number: t("reportsMessages.sickDogReport.fields.number"),
        words: t("reportsMessages.sickDogReport.fields.wordCount"),
        departureDateTime: t("reportsMessages.sickDogReport.fields.departureDateTime"),
        serviceMention: t("reportsMessages.sickDogReport.fields.serviceMention"),
      }}
      ariaLabel={t("reportsMessages.sickDogReport.preview.a4Label")}
      className={className}
    />
  );
}
