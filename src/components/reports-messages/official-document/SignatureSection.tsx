import type { OfficialSignatory } from "@/lib/reports-messages/official-document/types";
import { MESSAGE_SIGNATURE_LAYOUT } from "@/lib/reports-messages/official-document/layout";

type Props = {
  signatories: OfficialSignatory[];
  /** columns = legacy multi-column; vertical = Message/Demande SIGNÉ rows */
  layout?: "columns" | "vertical";
};

function signatureLeftLabel(sig: OfficialSignatory): string {
  const name = sig.fullName.trim();
  // Template-configured Message / Demande: name only (no hardcoded SIGNÉ/VU).
  if (!sig.endorsement) return name;
  return `${sig.endorsement} / ${name}`.trim();
}

/**
 * Signature blocks — order preserved from the model.
 * Vertical: name + ~3 spaces + function on one line (mirrors PDF measurement).
 */
export function SignatureSection({ signatories, layout = "columns" }: Props) {
  if (signatories.length === 0) return null;

  if (layout === "vertical") {
    const { gapAfterMessageMm, rowHeightMm } = MESSAGE_SIGNATURE_LAYOUT;
    const rows = signatories
      .map((sig, index) => {
        const name = sig.fullName.trim();
        const fn = sig.functionTitle.trim();
        if (!name && !fn) return null;
        return {
          key: `${sig.fullName}-${sig.functionTitle}-${index}`,
          left: signatureLeftLabel(sig),
          fn,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    return (
      <section
        className="text-[10pt] font-normal uppercase leading-none tracking-wide"
        style={{ marginTop: `${gapAfterMessageMm}mm` }}
      >
        {/*
          Two max-content columns + ~3-space gap (0.75em ≈ three spaces in Times).
          Function starts right after the longest name — not page-right / space-between.
        */}
        <div
          className="inline-grid w-max max-w-full items-baseline"
          style={{
            gridTemplateColumns: "max-content max-content",
            columnGap: "0.75em",
            rowGap: "0.4mm",
          }}
        >
          {rows.map((row) => (
            <div key={row.key} className="contents">
              <p
                className="m-0 whitespace-nowrap font-normal"
                style={{ lineHeight: `${rowHeightMm}mm` }}
              >
                {row.left}
              </p>
              <p
                className="m-0 whitespace-nowrap text-[9.5pt] font-normal"
                style={{ lineHeight: `${rowHeightMm}mm` }}
              >
                {row.fn || "\u00A0"}
              </p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
      {signatories.map((sig, index) => (
        <div key={`${sig.fullName}-${sig.functionTitle}-${index}`} className="min-h-[26mm] text-center">
          {sig.fullName ? (
            <p className="text-[12px] font-bold uppercase">{sig.fullName}</p>
          ) : null}
          {sig.functionTitle ? (
            <p className="mt-0.5 text-[11px]">{sig.functionTitle}</p>
          ) : null}
          <div className="mx-auto mt-12 w-[70%] border-b border-neutral-900" />
        </div>
      ))}
    </section>
  );
}
