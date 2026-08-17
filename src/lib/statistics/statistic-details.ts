export type StatisticTableColumn = {
  id: string;
  header: string;
  className?: string;
};

export type StatisticTableRow = {
  id: string;
  cells: Record<string, string>;
};

export type StatisticDetailsPayload = {
  title: string;
  columns: StatisticTableColumn[];
  rows: StatisticTableRow[];
};

export function dash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function formatStatisticDate(iso: string | null | undefined): string {
  const day = iso?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "—";
  const [year, month, dayNum] = day.split("-");
  return `${dayNum}/${month}/${year}`;
}
