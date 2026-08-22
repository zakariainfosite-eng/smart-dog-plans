import type { OfficialRadioDepartTable } from "@/lib/reports-messages/official-document/types";
import { radioTableRowsFromCells } from "@/lib/reports-messages/official-document/radio-table-cells";

type Props = {
  table: OfficialRadioDepartTable;
  columnLabels: {
    origin: string;
    number: string;
    words: string;
    departureDateTime: string;
    serviceMention: string;
  };
};

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-neutral-900 bg-white">
      <div className="border-b border-neutral-900 px-1 py-1 text-center text-[8.5px] font-bold uppercase leading-tight tracking-wide">
        {label}
      </div>
      <div className="flex min-h-[2.1rem] items-center justify-center px-1 py-1.5 text-center text-[11px] font-semibold leading-tight">
        {value || "\u00A0"}
      </div>
    </div>
  );
}

/** Radio Départ information table with visible borders. */
export function RadioDepartTable({ table, columnLabels }: Props) {
  const customRows =
    table.cells && table.cells.length > 0 ? radioTableRowsFromCells(table.cells) : null;

  if (customRows) {
    return (
      <div className="mt-3">
        {customRows.map((row, rowIndex) => (
          <section key={rowIndex} className="grid grid-cols-5 gap-0">
            {row.map((cell, cellIndex) => (
              <Cell key={`${rowIndex}-${cellIndex}`} label={cell.label} value={cell.value} />
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <section className="mt-3 grid grid-cols-5 gap-0">
      <Cell label={columnLabels.origin} value={table.origin} />
      <Cell label={columnLabels.number} value={table.number} />
      <Cell label={columnLabels.words} value={table.words} />
      <Cell label={columnLabels.departureDateTime} value={table.departureDateTime} />
      <Cell label={columnLabels.serviceMention} value={table.serviceMention} />
    </section>
  );
}
