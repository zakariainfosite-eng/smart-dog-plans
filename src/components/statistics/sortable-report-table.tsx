import { useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { cn } from "@/lib/utils";
import { exportTableExcel, exportTablePdf } from "@/lib/statistics/export-table";
import { useI18n } from "@/hooks/use-i18n";

export type SortableReportTableProps<TData> = {
  title: string;
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  getRowId: (row: TData) => string;
  isLoading?: boolean;
  exportFilenamePrefix: string;
  exportHeaders: string[];
  exportRows: (rows: TData[]) => (string | number)[][];
  footer?: ReactNode;
};

export function SortableReportTable<TData>({
  title,
  data,
  columns,
  getRowId,
  isLoading,
  exportFilenamePrefix,
  exportHeaders,
  exportRows,
  footer,
}: SortableReportTableProps<TData>) {
  const { t } = useI18n();
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => getRowId(row),
  });

  const sortedRows = table.getRowModel().rows.map((row) => row.original);

  const handleExportExcel = () => {
    try {
      exportTableExcel(
        title,
        exportHeaders,
        exportRows(sortedRows),
        `${exportFilenamePrefix}-${Date.now()}.xlsx`,
      );
      toast.success(t("statistics.export.excelSuccess"));
    } catch {
      toast.error(t("statistics.export.error"));
    }
  };

  const handleExportPdf = () => {
    try {
      exportTablePdf(
        title,
        exportHeaders,
        exportRows(sortedRows),
        `${exportFilenamePrefix}-${Date.now()}.pdf`,
      );
      toast.success(t("statistics.export.pdfSuccess"));
    } catch {
      toast.error(t("statistics.export.error"));
    }
  };

  const SortIcon = ({ columnId }: { columnId: string }) => {
    const sorted = sorting.find((s) => s.id === columnId);
    if (!sorted) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sorted.desc ? (
      <ArrowDown className="ml-1 h-3 w-3" />
    ) : (
      <ArrowUp className="ml-1 h-3 w-3" />
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={isLoading || data.length === 0}>
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            {t("statistics.export.excel")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isLoading || data.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("statistics.export.pdf")}
          </Button>
        </div>
      </div>

      <DataTableShell isLoading={isLoading}>
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="border-b border-border/60 bg-muted/30">
                  {group.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                          canSort && "cursor-pointer select-none hover:bg-muted/50",
                        )}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <span className="inline-flex items-center">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort ? <SortIcon columnId={header.id} /> : null}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/40 last:border-b-0",
                    index % 2 === 1 && "bg-muted/10",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {footer ? <tfoot>{footer}</tfoot> : null}
          </table>
        </div>
      </DataTableShell>
    </div>
  );
}

export function reportNum(value: number) {
  return <span className="font-semibold tabular-nums">{value}</span>;
}

export function reportPct(value: number) {
  return <span className="font-semibold tabular-nums">{value}%</span>;
}

export function reportDecimal(value: number) {
  return <span className="font-semibold tabular-nums">{value.toFixed(1)}</span>;
}
