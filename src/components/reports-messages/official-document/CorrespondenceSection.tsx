import type { OfficialCorrespondence } from "@/lib/reports-messages/official-document/types";

type Props = {
  correspondence: OfficialCorrespondence;
  labels: {
    expediteur: string;
    a: string;
    destinataire: string;
    diffusion: string;
  };
};

/** Expéditeur / destinataire — standard or Message/Demande official layout. */
export function CorrespondenceSection({ correspondence, labels }: Props) {
  if (correspondence.layout === "message_demande" && correspondence.recipientLines?.length) {
    const senderLines = (correspondence.sender || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return (
      <section className="mt-4 space-y-1 text-[12px] leading-[1.45]">
        <div className="space-y-0.5">
          {senderLines.length === 0 ? (
            <p>
              <span className="font-normal uppercase">{labels.expediteur} :</span>
            </p>
          ) : (
            senderLines.map((line, index) =>
              index === 0 ? (
                <p key={`exp-${index}`}>
                  <span className="font-normal uppercase">{labels.expediteur} :</span>{" "}
                  <span className="font-normal uppercase">{line}</span>
                </p>
              ) : (
                <p key={`exp-${index}`} className="font-normal uppercase">
                  {line}
                </p>
              ),
            )
          )}
        </div>
        <div className="mt-2 space-y-0.5">
          {correspondence.recipientLines.map((line, index) => (
            <div
              key={`${line.left}-${index}`}
              className="flex items-baseline justify-between gap-4"
            >
              <span className="min-w-0 flex-1 uppercase">{line.left}</span>
              {line.right ? (
                <span className="shrink-0 text-right font-semibold uppercase tracking-wide">
                  {line.right}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-4 space-y-1.5 text-[12px] leading-snug">
      <p>
        <span className="font-bold uppercase">{labels.expediteur} :</span>{" "}
        {correspondence.sender || "\u00A0"}
      </p>
      <p>
        <span className="font-bold uppercase">{labels.a} :</span>{" "}
        {correspondence.to || "\u00A0"}
      </p>
      <p>
        <span className="font-bold uppercase">{labels.destinataire} :</span>{" "}
        {correspondence.recipient || "\u00A0"}
      </p>
      {correspondence.city.trim() ? (
        <p className="font-bold uppercase tracking-wide">{correspondence.city}</p>
      ) : null}
      {correspondence.diffusion.length > 0 ? (
        <div className="pt-1">
          <p className="font-bold uppercase">{labels.diffusion} :</p>
          <ul className="mt-0.5 list-none space-y-0.5 pl-2">
            {correspondence.diffusion.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
