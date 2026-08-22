import { CorrespondenceSection } from "@/components/reports-messages/official-document/CorrespondenceSection";
import { OfficialDocumentBodySection } from "@/components/reports-messages/official-document/OfficialDocumentBodySection";
import { OfficialDocumentHeader } from "@/components/reports-messages/official-document/OfficialDocumentHeader";
import { OfficialPriorityMark } from "@/components/reports-messages/official-document/OfficialPriorityMark";
import { RadioDepartTable } from "@/components/reports-messages/official-document/RadioDepartTable";
import { SignatureSection } from "@/components/reports-messages/official-document/SignatureSection";
import type { TemplateSectionId } from "@/lib/reports-messages/document-templates/types";
import type {
  OfficialDocumentBuildContext,
  OfficialDocumentModel,
} from "@/lib/reports-messages/official-document/types";
import { cn } from "@/lib/utils";

type Props = {
  model: OfficialDocumentModel;
  labels: OfficialDocumentBuildContext["labels"];
  columnLabels: {
    origin: string;
    number: string;
    words: string;
    departureDateTime: string;
    serviceMention: string;
  };
  /** Ordered sections from template config — controls composition */
  sections?: TemplateSectionId[];
  ariaLabel?: string;
  className?: string;
};

function has(sections: TemplateSectionId[] | undefined, id: TemplateSectionId): boolean {
  return !sections || sections.includes(id);
}

/**
 * Reusable official A4 document template composition.
 * Section order follows the template configuration when provided.
 */
export function DocumentTemplate({
  model,
  labels,
  columnLabels,
  sections,
  ariaLabel,
  className,
}: Props) {
  return (
    <article
      className={cn(
        "mx-auto w-full max-w-[210mm] bg-white text-black shadow-[0_8px_30px_rgba(0,0,0,0.08)] ring-1 ring-neutral-300 print:shadow-none print:ring-0",
        className,
      )}
      aria-label={ariaLabel}
    >
      <div className="min-h-[297mm] px-[16mm] py-[14mm] font-[Times_New_Roman,Times,serif] text-[12.5px] leading-[1.35]">
        {has(sections, "official_header") ? (
          <OfficialDocumentHeader header={model.header} />
        ) : null}
        {has(sections, "radio_depart_table") ? (
          <RadioDepartTable table={model.table} columnLabels={columnLabels} />
        ) : null}
        {has(sections, "sender") || has(sections, "recipient") ? (
          <CorrespondenceSection
            correspondence={model.correspondence}
            labels={{
              expediteur: labels.de,
              a: labels.a,
              destinataire: labels.destinataire,
              diffusion: labels.diffusion,
            }}
          />
        ) : null}
        {has(sections, "priority") ? (
          <OfficialPriorityMark priority={model.priority} />
        ) : null}
        <OfficialDocumentBodySection
          body={model.body}
          sections={sections}
          attachmentLabel={labels.factLabels.attachments || "PIÈCES JOINTES"}
          justifyMessage={
            model.kind === "generic_message" || model.kind === "heat_dog_report"
          }
        />
        {has(sections, "signatures") ? (
          <SignatureSection
            signatories={model.signatories}
            layout={model.signatureLayout ?? "columns"}
          />
        ) : null}
      </div>
    </article>
  );
}
