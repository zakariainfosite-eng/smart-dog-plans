import type { OfficialRadioDepartHeader } from "@/lib/reports-messages/official-document/types";

type Props = {
  header: OfficialRadioDepartHeader;
  continuation?: boolean;
};

/** Official agency / RADIO DEPART header — left / right administrative layout. */
export function OfficialDocumentHeader({ header, continuation = false }: Props) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="text-left text-[10px] font-bold uppercase leading-[1.25] tracking-[0.06em]">
        {header.agencyLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {continuation ? (
          <p className="mt-1 text-[9px] font-normal normal-case tracking-normal text-neutral-700">
            (suite)
          </p>
        ) : null}
      </div>
      <p className="text-right text-[13px] font-bold uppercase tracking-[0.14em]">
        {header.radioTitle}
      </p>
    </header>
  );
}
