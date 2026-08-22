import type { OfficialDocumentBody } from "@/lib/reports-messages/official-document/types";
import type { TemplateSectionId } from "@/lib/reports-messages/document-templates/types";
import { JustifiedMessageBody } from "@/components/reports-messages/official-document/JustifiedMessageBody";

type Props = {
  body: OfficialDocumentBody;
  sections?: TemplateSectionId[];
  attachmentLabel?: string;
  /** Message / Demande: justified body matching PDF export */
  justifyMessage?: boolean;
};

/**
 * Document subject, optional structured facts, user message, attachments.
 * Empty facts/attachments are already filtered out of the model.
 * Empty subject / introduction / message are omitted (no blank labels).
 */
export function OfficialDocumentBodySection({
  body,
  sections,
  attachmentLabel = "PIÈCES JOINTES",
  justifyMessage = false,
}: Props) {
  const showSubject =
    (!sections || sections.includes("subject")) && Boolean(body.subject.trim());
  const showFacts =
    (!sections ||
      sections.some((id) =>
        ["dog_information", "veterinary", "observation", "treatment", "rest_period"].includes(id),
      )) &&
    body.facts.length > 0;
  const showMessage =
    (!sections || sections.includes("user_message")) && Boolean(body.messageBody.trim());
  const showIntro =
    (!sections || sections.includes("introduction")) && Boolean(body.introduction?.trim());
  const showAttachments =
    (!sections || sections.includes("attachments")) &&
    Boolean(body.attachments && body.attachments.length > 0);

  return (
    <section className="mt-4 space-y-3">
      {showSubject ? (
        <p className="text-center text-[12.5px] font-bold uppercase underline underline-offset-4">
          {body.subject}
        </p>
      ) : null}

      {showIntro ? (
        <p className="whitespace-pre-wrap text-[12px] leading-relaxed">{body.introduction}</p>
      ) : null}

      {showFacts ? (
        <table className="w-full border-collapse border border-neutral-900 text-[11px]">
          <tbody>
            {body.facts.map((fact) => (
              <tr key={`${fact.label}-${fact.value.slice(0, 24)}`}>
                <th className="w-[34%] border border-neutral-900 px-2 py-1.5 text-left align-top font-bold">
                  {fact.label}
                </th>
                <td className="border border-neutral-900 px-2 py-1.5 whitespace-pre-wrap align-top">
                  {fact.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {showMessage ? (
        justifyMessage ? (
          <JustifiedMessageBody text={body.messageBody} />
        ) : (
          <div className="whitespace-pre-wrap pt-1 text-[12.5px] leading-relaxed">
            {body.messageBody}
          </div>
        )
      ) : null}

      {showAttachments ? (
        <div className="pt-2 text-[11px]">
          <p className="font-bold uppercase">{attachmentLabel} :</p>
          <ul className="mt-1 list-none space-y-0.5 pl-1">
            {body.attachments!.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
