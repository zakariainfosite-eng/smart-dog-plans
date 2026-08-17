import { Ban, Dog, Hash, Inbox, MapPin, Users, X } from "lucide-react";
import { useMemo } from "react";

import { SemanticBadge } from "@/components/enterprise/semantic-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";
import {
  buildStatisticDenseCells,
  buildStatisticDenseSchema,
  detectStatisticDetailsKind,
  formatStatisticCount,
  isEmptyStatisticValue,
  resolveStatisticCategory,
  splitStatisticTitle,
  statisticDenseGridMinWidth,
  statisticDenseGridTemplate,
  type StatisticDenseCell,
  type StatisticDetailsKind,
} from "@/lib/statistics/statistic-dialog-presentation";
import type {
  StatisticDetailsPayload,
  StatisticTableColumn,
} from "@/lib/statistics/statistic-details";
import { resolveSemanticBadgeTone } from "@/lib/ui/semantic-badge-tone";
import { cn } from "@/lib/utils";

type StatisticDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: StatisticDetailsPayload | null;
};

const GRID_GAP_PX = 12;

export function StatisticDetailsDialog({
  open,
  onOpenChange,
  payload,
}: StatisticDetailsDialogProps) {
  const { t } = useI18n();
  const rows = payload?.rows ?? [];
  const columns = payload?.columns ?? [];
  const total = rows.length;
  const paddedTotal = formatStatisticCount(total);
  const rawTitle = payload?.title ?? t("statisticDetails.title");
  const { title } = splitStatisticTitle(rawTitle);
  const kind = detectStatisticDetailsKind(columns);
  const Icon = detailsIcon(kind);
  const category = useMemo(
    () => resolveStatisticCategory(rawTitle, rows, columns),
    [rawTitle, rows, columns],
  );
  const schema = useMemo(() => buildStatisticDenseSchema(columns), [columns]);
  const gridTemplateColumns = useMemo(() => statisticDenseGridTemplate(schema), [schema]);
  const gridMinWidth = useMemo(() => statisticDenseGridMinWidth(schema, GRID_GAP_PX, 40), [schema]);
  const gridStyle = useMemo(
    () => ({ gridTemplateColumns, columnGap: `${GRID_GAP_PX}px` }),
    [gridTemplateColumns],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Do not add `relative` here: twMerge would override DialogContent's `fixed` and hide the panel behind the overlay. */}
      <DialogContent
        className={cn(
          "flex max-h-[min(85dvh,780px)] w-[calc(100vw-1.25rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0",
          "rounded-[20px] border border-[#023A84]/10 bg-white shadow-[0_12px_40px_-18px_rgba(15,23,42,0.28)]",
          "min-h-0 duration-200 sm:w-[calc(100vw-2rem)] dark:bg-card",
          "[&>button.absolute]:hidden",
        )}
      >
        <DialogHeader className="space-y-0 border-b border-[#023A84]/8 px-4 py-3 text-left sm:px-5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#023A84]/10 text-[#023A84] ring-1 ring-inset ring-[#023A84]/8">
              <Icon className="h-4 w-4" strokeWidth={2.1} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <DialogTitle className="font-brand text-[16px] font-semibold leading-snug tracking-tight text-[#0B1F3A] dark:text-foreground">
                    {title}
                  </DialogTitle>
                  {category ? (
                    <div className="mt-1">
                      <SemanticBadge
                        value={category}
                        kind={categoryBadgeKind(category, columns)}
                        className="px-1.5 py-0 text-[10px]"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#023A84] px-2 font-brand text-[12px] font-bold tabular-nums text-white">
                    {paddedTotal}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => onOpenChange(false)}
                    aria-label={t("statisticDetails.close")}
                    className="h-9 w-9 rounded-[10px] border-[#E5E7EB] text-[#6B7280] hover:border-[#023A84]/25 hover:bg-[#023A84]/6 hover:text-[#023A84] md:h-10 md:w-10"
                  >
                    <X />
                  </Button>
                </div>
              </div>
              <DialogDescription className="mt-1 text-[12px] leading-snug text-[#6B7280]">
                {t(descriptionKey(kind))}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 sm:px-5">
            <p className="font-brand text-[13px] font-semibold tracking-tight text-[#0B1F3A] dark:text-foreground">
              {t("statisticDetails.resultsHeading")}
            </p>
            <p className="text-[12px] font-medium tabular-nums text-[#6B7280]">
              {t("statisticDetails.results", { count: paddedTotal })}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
            {rows.length === 0 ? (
              <div className="flex min-h-[160px] flex-col items-center justify-center px-4 py-8 text-center">
                <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#023A84]/8 text-[#023A84]">
                  <Inbox className="h-4 w-4" strokeWidth={2} />
                </span>
                <p className="text-sm font-medium text-[#0B1F3A] dark:text-foreground">
                  {t("statisticDetails.noResults")}
                </p>
                <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
                  {t("statisticDetails.empty")}
                </p>
              </div>
            ) : (
              <div style={{ minWidth: gridMinWidth }}>
                <div
                  className="sticky top-0 z-10 grid items-center border-b border-[#023A84]/8 bg-white px-4 py-2 sm:px-5 dark:bg-card"
                  style={gridStyle}
                >
                  {schema.map((column) => (
                    <p
                      key={column.id}
                      className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF]"
                    >
                      {column.label}
                    </p>
                  ))}
                </div>
                <ul>
                  {rows.map((row) => (
                    <StatisticRecordItem
                      key={row.id}
                      cells={buildStatisticDenseCells(row, schema)}
                      gridStyle={gridStyle}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#023A84]/8 px-4 py-2 sm:px-5">
          <p className="text-[12px] font-medium tabular-nums text-[#6B7280]">
            {t("statisticDetails.results", { count: paddedTotal })}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-9 min-w-[80px] rounded-[10px] px-3 md:h-10"
          >
            {t("statisticDetails.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatisticRecordItem({
  cells,
  gridStyle,
}: {
  cells: StatisticDenseCell[];
  gridStyle: { gridTemplateColumns: string; columnGap: string };
}) {
  return (
    <li
      className="grid min-h-[72px] items-center border-b border-[#E5E7EB]/80 px-4 py-2 transition-colors duration-150 hover:bg-[#023A84]/[0.03] sm:px-5"
      style={gridStyle}
    >
      {cells.map((cell) => (
        <DenseField key={cell.id} cell={cell} />
      ))}
    </li>
  );
}

function DenseField({ cell }: { cell: StatisticDenseCell }) {
  const empty = isEmptyStatisticValue(cell.value);

  return (
    <div className="min-w-0" title={empty ? undefined : cell.value}>
      {empty ? (
        <span className="text-[13px] text-[#9CA3AF]">—</span>
      ) : cell.kind === "specialty" ? (
        <SemanticBadge value={cell.value} kind="specialty" className="max-w-full px-1.5 py-0 text-[10px]" />
      ) : cell.kind === "type" ? (
        <SemanticBadge value={cell.value} kind="exclusionType" className="max-w-full px-1.5 py-0 text-[10px]" />
      ) : cell.kind === "status" ? (
        <StatusPill value={cell.value} />
      ) : (
        <p
          className={cn(
            "truncate text-[13px] leading-snug text-[#374151] dark:text-foreground",
            cell.kind === "primary" && "font-brand font-semibold uppercase tracking-[0.04em] text-[#0B1F3A]",
            cell.kind === "date" && "tabular-nums",
          )}
        >
          {cell.value}
        </p>
      )}
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone = resolveSemanticBadgeTone(value, "status");
  const dot =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "danger"
        ? "bg-rose-500"
        : tone === "warning"
          ? "bg-amber-500"
          : tone === "info"
            ? "bg-sky-500"
            : "bg-slate-400";

  return (
    <SemanticBadge value={value} kind="status" className="max-w-full gap-1.5 px-1.5 py-0 text-[10px]">
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      <span className="truncate">{value}</span>
    </SemanticBadge>
  );
}

function detailsIcon(kind: StatisticDetailsKind) {
  if (kind === "dog") return Dog;
  if (kind === "personnel") return Users;
  if (kind === "exclusion") return Ban;
  if (kind === "checkpoint") return MapPin;
  return Hash;
}

function descriptionKey(kind: StatisticDetailsKind): string {
  if (kind === "dog") return "statisticDetails.descriptionDogs";
  if (kind === "personnel") return "statisticDetails.descriptionPersonnel";
  if (kind === "exclusion") return "statisticDetails.descriptionExclusions";
  if (kind === "checkpoint") return "statisticDetails.descriptionCheckpoints";
  return "statisticDetails.description";
}

function categoryBadgeKind(
  category: string,
  columns: StatisticTableColumn[],
): "specialty" | "status" | "exclusionType" | "category" {
  const ids = new Set(columns.map((column) => column.id));
  const toneHint = resolveSemanticBadgeTone(category, "category");
  if (ids.has("specialty") && (toneHint === "warning" || toneHint === "info" || toneHint === "purple")) {
    return "specialty";
  }
  if (ids.has("status")) return "status";
  if (ids.has("exclusionType")) return "exclusionType";
  return "category";
}
