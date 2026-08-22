import type {
  OfficialRadioDepartTable,
  OfficialRadioTableCell,
} from "@/lib/reports-messages/official-document/types";

/** Same 5-column fractions as the current Radio Départ PDF row. */
export const RADIO_TABLE_COLUMN_FRACTIONS = [0.16, 0.14, 0.1, 0.34, 0.26] as const;
export const RADIO_TABLE_COLUMN_COUNT = RADIO_TABLE_COLUMN_FRACTIONS.length;

/** Hardcoded French headers — identical to the current official PDF table. */
export const DEFAULT_RADIO_TABLE_LABELS = {
  origin: "Origine",
  number: "Numéro",
  words: "Mots",
  departureDateTime: "Date et heure de départ",
  serviceMention: "Mention de servi",
} as const;

const EMPTY_CELL: OfficialRadioTableCell = { label: "", value: "" };

export function defaultRadioTableCellsFromKeys(
  table: OfficialRadioDepartTable,
): OfficialRadioTableCell[] {
  return [
    { label: DEFAULT_RADIO_TABLE_LABELS.origin, value: table.origin },
    { label: DEFAULT_RADIO_TABLE_LABELS.number, value: table.number },
    { label: DEFAULT_RADIO_TABLE_LABELS.words, value: table.words },
    {
      label: DEFAULT_RADIO_TABLE_LABELS.departureDateTime,
      value: table.departureDateTime,
    },
    { label: DEFAULT_RADIO_TABLE_LABELS.serviceMention, value: table.serviceMention },
  ];
}

/** Pad each row to 5 cells so the official full-width table chrome is unchanged. */
export function radioTableRowsFromCells(
  cells: OfficialRadioTableCell[],
): OfficialRadioTableCell[][] {
  if (cells.length === 0) return [];
  const rows: OfficialRadioTableCell[][] = [];
  for (let i = 0; i < cells.length; i += RADIO_TABLE_COLUMN_COUNT) {
    const slice = cells.slice(i, i + RADIO_TABLE_COLUMN_COUNT);
    while (slice.length < RADIO_TABLE_COLUMN_COUNT) {
      slice.push({ ...EMPTY_CELL });
    }
    rows.push(slice);
  }
  return rows;
}

export function radioTableRowsForOfficialTable(
  table: OfficialRadioDepartTable,
): OfficialRadioTableCell[][] {
  const cells =
    table.cells && table.cells.length > 0
      ? table.cells
      : defaultRadioTableCellsFromKeys(table);
  return radioTableRowsFromCells(cells);
}
