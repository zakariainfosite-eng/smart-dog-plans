import { resolveSemanticBadgeTone } from "@/lib/ui/semantic-badge-tone";
import type { StatisticTableColumn, StatisticTableRow } from "@/lib/statistics/statistic-details";

export type StatisticDetailsKind = "dog" | "personnel" | "exclusion" | "checkpoint" | "generic";

export type StatisticRecordMetaKind = "text" | "specialty" | "status" | "type";

export type StatisticRecordMeta = {
  id: string;
  label: string;
  value: string;
  kind: StatisticRecordMetaKind;
};

export type StatisticRecordView = {
  id: string;
  title: string;
  subtitle: string | null;
  asideTitle: string | null;
  asideType: string | null;
  status: string | null;
  meta: StatisticRecordMeta[];
};

export type StatisticDenseCellKind = "primary" | "text" | "specialty" | "status" | "type" | "date";

export type StatisticDenseColumn = {
  id: string;
  label: string;
  kind: StatisticDenseCellKind;
  track: string;
  minPx: number;
  source?: "person" | "dog" | "place" | "case";
};

export type StatisticDenseCell = {
  id: string;
  label: string;
  value: string;
  kind: StatisticDenseCellKind;
};

const EMPTY = "—";
const TITLE_SEPARATOR = /\s+[—–-]\s+/;
const HERO_IDS = new Set([
  "firstName",
  "lastName",
  "fonction",
  "dogName",
  "handler",
  "checkpoint",
  "name",
  "caseNumber",
  "status",
  "exclusionType",
]);

export function formatStatisticCount(count: number): string {
  const safe = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return String(safe).padStart(2, "0");
}

export function splitStatisticTitle(title: string): { title: string; category: string | null } {
  const trimmed = title.trim();
  const parts = trimmed.split(TITLE_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { title: trimmed, category: null };
  return { title: parts[0], category: parts.slice(1).join(" — ") };
}

export function detectStatisticDetailsKind(columns: StatisticTableColumn[]): StatisticDetailsKind {
  const ids = new Set((columns ?? []).map((column) => column.id));
  if (ids.has("checkpoint") || ids.has("nightOnly") || ids.has("required")) return "checkpoint";
  if (ids.has("startDate") && ids.has("exclusionType")) return "exclusion";
  if (ids.has("dogName") && ids.has("handler")) return "dog";
  if (ids.has("firstName") && ids.has("fonction")) return "personnel";
  if (ids.has("dogName")) return "dog";
  if (ids.has("firstName")) return "personnel";
  return "generic";
}

export function isEmptyStatisticValue(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return !trimmed || trimmed === EMPTY;
}

export function statisticCell(row: StatisticTableRow, id: string): string | null {
  const value = row.cells?.[id];
  if (isEmptyStatisticValue(value)) return null;
  return value.trim();
}

export function personDisplayName(row: StatisticTableRow): string | null {
  const first = statisticCell(row, "firstName");
  const last = statisticCell(row, "lastName");
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

export function unanimousColumnValue(
  rows: StatisticTableRow[],
  columnId: string,
): string | null {
  const values = new Set<string>();
  for (const row of rows) {
    const value = statisticCell(row, columnId);
    if (!value) continue;
    values.add(value);
    if (values.size > 1) return null;
  }
  if (values.size !== 1) return null;
  return [...values][0];
}

export function resolveStatisticCategory(
  title: string,
  rows: StatisticTableRow[],
  columns: StatisticTableColumn[],
): string | null {
  const split = splitStatisticTitle(title);
  if (split.category) return split.category;

  const ids = new Set(columns.map((column) => column.id));
  if (ids.has("specialty")) {
    const specialty = unanimousColumnValue(rows, "specialty");
    if (specialty) return specialty;
  }
  if (ids.has("status")) {
    const status = unanimousColumnValue(rows, "status");
    if (status) return status;
  }
  if (ids.has("exclusionType")) {
    const exclusionType = unanimousColumnValue(rows, "exclusionType");
    if (exclusionType) return exclusionType;
  }

  const selfTone = resolveSemanticBadgeTone(split.title, "category");
  if (selfTone !== "primary") return split.title;
  return null;
}

function headerFor(columns: StatisticTableColumn[], id: string): string {
  return columns.find((column) => column.id === id)?.header ?? id;
}

function metaKindFor(columnId: string): StatisticRecordMetaKind {
  if (columnId === "specialty") return "specialty";
  if (columnId === "status") return "status";
  if (columnId === "exclusionType" || columnId === "type") return "type";
  return "text";
}

export function buildStatisticRecordView(
  row: StatisticTableRow,
  columns: StatisticTableColumn[],
): StatisticRecordView {
  const person = personDisplayName(row);
  const dog = statisticCell(row, "dogName");
  const handler = statisticCell(row, "handler");
  const fonction = statisticCell(row, "fonction");
  const checkpoint = statisticCell(row, "checkpoint");
  const name = statisticCell(row, "name");
  const place = checkpoint ?? name;
  const caseNumber = statisticCell(row, "caseNumber");
  const exclusionType = statisticCell(row, "exclusionType");
  const type = statisticCell(row, "type");
  const status = statisticCell(row, "status");

  const consumed = new Set<string>();
  const consume = (...ids: string[]) => {
    for (const id of ids) consumed.add(id);
  };

  let title = person ?? dog ?? place ?? caseNumber ?? "";
  let subtitle: string | null = null;
  let asideTitle: string | null = null;
  let asideType: string | null = null;

  if (person) {
    consume("firstName", "lastName");
    subtitle = fonction;
    if (fonction) consume("fonction");
    asideTitle = dog;
    if (dog) consume("dogName");
    asideType = exclusionType;
    if (exclusionType) consume("exclusionType");
  } else if (dog) {
    consume("dogName");
    subtitle = handler;
    if (handler) consume("handler");
    asideType = exclusionType;
    if (exclusionType) consume("exclusionType");
  } else if (place) {
    consume("checkpoint");
    if (name && name === place) consume("name");
    subtitle = type;
    if (type) consume("type");
  } else if (caseNumber) {
    consume("caseNumber");
    subtitle = handler;
    if (handler) consume("handler");
    asideTitle = dog;
    if (dog) consume("dogName");
  }

  if (status) consume("status");

  if (!title) {
    const fallback = columns.find((column) => statisticCell(row, column.id));
    title = fallback ? (statisticCell(row, fallback.id) as string) : EMPTY;
    if (fallback) consume(fallback.id);
  }

  const preferredMetaOrder = [
    "specialty",
    "exclusionType",
    "type",
    "section",
    "startDate",
    "endDate",
    "date",
    "handler",
    "fonction",
    "dogName",
    "nightOnly",
    "required",
    "checkpoint",
    "name",
  ];

  const meta: StatisticRecordMeta[] = [];
  const pushMeta = (id: string) => {
    if (consumed.has(id)) return;
    const value = statisticCell(row, id);
    if (!value) return;
    consume(id);
    meta.push({
      id,
      label: headerFor(columns, id),
      value,
      kind: metaKindFor(id),
    });
  };

  for (const id of preferredMetaOrder) pushMeta(id);
  for (const column of columns) {
    if (HERO_IDS.has(column.id)) continue;
    pushMeta(column.id);
  }

  return {
    id: row.id,
    title,
    subtitle,
    asideTitle,
    asideType,
    status,
    meta,
  };
}

export function buildStatisticRecordViews(
  rows: StatisticTableRow[],
  columns: StatisticTableColumn[],
): StatisticRecordView[] {
  return rows.map((row) => buildStatisticRecordView(row, columns));
}

const DENSE_TRACKS: Record<StatisticDenseCellKind, { track: string; minPx: number }> = {
  primary: { track: "minmax(168px, 1.4fr)", minPx: 168 },
  text: { track: "minmax(112px, 1fr)", minPx: 112 },
  specialty: { track: "minmax(148px, 1.2fr)", minPx: 148 },
  type: { track: "minmax(156px, 1.3fr)", minPx: 156 },
  date: { track: "minmax(148px, 1.15fr)", minPx: 148 },
  status: { track: "minmax(92px, 0.7fr)", minPx: 92 },
};

function denseKindForId(id: string): StatisticDenseCellKind {
  if (id === "title") return "primary";
  if (id === "specialty") return "specialty";
  if (id === "exclusionType" || id === "type") return "type";
  if (id === "status") return "status";
  if (id === "dates" || id === "startDate" || id === "endDate" || id === "date") return "date";
  return "text";
}

function denseTrackFor(id: string, kind: StatisticDenseCellKind): { track: string; minPx: number } {
  if (id === "dogName") return { track: "minmax(108px, 0.9fr)", minPx: 108 };
  return DENSE_TRACKS[kind];
}

export function buildStatisticDenseSchema(columns: StatisticTableColumn[]): StatisticDenseColumn[] {
  const has = (id: string) => columns.some((column) => column.id === id);
  const kind = detectStatisticDetailsKind(columns);
  const ids: string[] = [];
  const push = (id: string) => {
    if (ids.includes(id)) return;
    if (id === "title") {
      ids.push("title");
      return;
    }
    if (id === "dates") {
      if (has("startDate") || has("endDate") || has("date")) ids.push("dates");
      return;
    }
    if (has(id)) ids.push(id);
  };

  if (kind === "exclusion") {
    push("title");
    push("dogName");
    push("specialty");
    push("exclusionType");
    push("dates");
    push("status");
  } else if (kind === "personnel") {
    push("title");
    push("fonction");
    push("dogName");
    push("specialty");
    push("section");
    push("status");
  } else if (kind === "dog") {
    push("title");
    push("handler");
    push("specialty");
    push("exclusionType");
    push("status");
  } else if (kind === "checkpoint") {
    push("title");
    push("type");
    push("specialty");
    push("nightOnly");
    push("required");
    push("status");
  } else {
    push("title");
    for (const column of columns) {
      if (
        column.id === "firstName" ||
        column.id === "lastName" ||
        column.id === "startDate" ||
        column.id === "endDate" ||
        column.id === "date" ||
        column.id === "name"
      ) {
        continue;
      }
      push(column.id);
    }
    push("dates");
  }

  const covered = new Set<string>(ids);
  if (ids.includes("title")) {
    if (has("firstName") || has("lastName")) {
      covered.add("firstName");
      covered.add("lastName");
    } else if (kind === "dog" && has("dogName")) {
      covered.add("dogName");
    } else if (has("checkpoint") || has("name")) {
      covered.add("checkpoint");
      covered.add("name");
    } else if (has("caseNumber")) {
      covered.add("caseNumber");
    } else if (has("dogName")) {
      covered.add("dogName");
    }
  }
  if (ids.includes("dates")) {
    covered.add("startDate");
    covered.add("endDate");
    covered.add("date");
  }

  for (const column of columns) {
    if (covered.has(column.id) || column.id === "name") continue;
    push(column.id);
    covered.add(column.id);
  }

  const titleSource: StatisticDenseColumn["source"] = has("firstName") || has("lastName")
    ? "person"
    : kind === "dog" && has("dogName")
      ? "dog"
      : has("checkpoint") || has("name")
        ? "place"
        : has("caseNumber")
          ? "case"
          : has("dogName")
            ? "dog"
            : undefined;

  const titleLabel =
    titleSource === "person"
      ? headerFor(columns, "firstName") || headerFor(columns, "lastName")
      : titleSource === "dog"
        ? headerFor(columns, "dogName")
        : titleSource === "place"
          ? headerFor(columns, "checkpoint") || headerFor(columns, "name")
          : titleSource === "case"
            ? headerFor(columns, "caseNumber")
            : headerFor(columns, ids[0] ?? "name");

  return ids.map((id) => {
    const cellKind = denseKindForId(id);
    const sizing = denseTrackFor(id, cellKind);
    const label =
      id === "title"
        ? titleLabel
        : id === "dates"
          ? headerFor(columns, "startDate") || headerFor(columns, "date") || headerFor(columns, "endDate")
          : headerFor(columns, id);
    return {
      id,
      label,
      kind: cellKind,
      track: sizing.track,
      minPx: sizing.minPx,
      source: id === "title" ? titleSource : undefined,
    };
  });
}

export function statisticDenseGridTemplate(schema: StatisticDenseColumn[]): string {
  return schema.map((column) => column.track).join(" ");
}

export function statisticDenseGridMinWidth(schema: StatisticDenseColumn[], gapPx = 12, paddingPx = 40): number {
  if (schema.length === 0) return paddingPx;
  const tracks = schema.reduce((sum, column) => sum + column.minPx, 0);
  return tracks + gapPx * Math.max(0, schema.length - 1) + paddingPx;
}

function denseCellValue(row: StatisticTableRow, column: StatisticDenseColumn): string {
  if (column.source === "person") return personDisplayName(row) ?? EMPTY;
  if (column.source === "dog") return statisticCell(row, "dogName") ?? EMPTY;
  if (column.source === "place") {
    return statisticCell(row, "checkpoint") ?? statisticCell(row, "name") ?? EMPTY;
  }
  if (column.source === "case") return statisticCell(row, "caseNumber") ?? EMPTY;
  if (column.id === "dates") {
    const start = statisticCell(row, "startDate");
    const end = statisticCell(row, "endDate");
    const date = statisticCell(row, "date");
    if (start && end) return `${start} → ${end}`;
    if (start) return start;
    if (end) return end;
    if (date) return date;
    return EMPTY;
  }
  if (column.id === "title") {
    return (
      personDisplayName(row) ??
      statisticCell(row, "dogName") ??
      statisticCell(row, "checkpoint") ??
      statisticCell(row, "name") ??
      statisticCell(row, "caseNumber") ??
      EMPTY
    );
  }
  return statisticCell(row, column.id) ?? EMPTY;
}

export function buildStatisticDenseCells(
  row: StatisticTableRow,
  schema: StatisticDenseColumn[],
): StatisticDenseCell[] {
  return schema.map((column) => ({
    id: column.id,
    label: column.label,
    kind: column.kind,
    value: denseCellValue(row, column),
  }));
}
