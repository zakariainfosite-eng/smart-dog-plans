import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";

export type EnterpriseDataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  getRowId?: (row: TData) => string;
  renderSubRow?: (row: Row<TData>) => ReactNode | null;
  isSubRowOpen?: (row: Row<TData>) => boolean;
  className?: string;
  emptyState?: ReactNode;
  /** auto = content-sized columns; fixed = shared CSS grid columns via meta.width */
  layout?: "auto" | "fixed";
  /** compact = 56px rows; comfortable = 64–72px rows with generous padding */
  density?: "default" | "compact" | "comfortable";
  /** Horizontal scroll only below 1200px viewport */
  responsiveScroll?: boolean;
  /** card = spaced rounded rows with soft shadow */
  variant?: "default" | "card";
  zebraStriping?: boolean;
  onRowClick?: (row: Row<TData>) => void;
  /** Reserved for callers that gate empty/loading UI externally. */
  loading?: boolean;
};

function buildGridTemplateColumns<TData>(columnDefs: ColumnDef<TData, unknown>[]): string {
  return columnDefs
    .map((col) => {
      const width = col.meta?.width;
      if (!width) return "minmax(0, 1fr)";
      if (width.endsWith("%") || width.endsWith("fr")) return `minmax(0, ${width})`;
      return width;
    })
    .join(" ");
}

export function EnterpriseDataTable<TData>({
  data,
  columns,
  getRowId,
  renderSubRow,
  isSubRowOpen,
  className,
  emptyState,
  layout = "auto",
  density = "default",
  responsiveScroll = false,
  variant = "default",
  zebraStriping = false,
  onRowClick,
  loading: _loading,
}: EnterpriseDataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });

  const gridTemplateColumns = useMemo(
    () => (layout === "fixed" ? buildGridTemplateColumns(columns) : undefined),
    [layout, columns],
  );

  const gridStyle = useMemo<CSSProperties | undefined>(
    () => (gridTemplateColumns ? { gridTemplateColumns } : undefined),
    [gridTemplateColumns],
  );

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const compact = density === "compact";
  const comfortable = density === "comfortable";
  const cellPad = comfortable ? "px-4 py-3" : compact ? "px-2 py-2" : "px-3 py-2.5";
  const rowH = comfortable ? "min-h-[68px]" : compact ? "h-14" : "h-[68px]";
  const headH = comfortable ? "h-11" : compact ? "h-9" : "h-11";
  const headBg = comfortable ? "bg-muted/50" : "bg-card/95";

  const scrollClass = responsiveScroll
    ? "max-[1199px]:overflow-x-auto min-[1200px]:overflow-x-hidden"
    : "overflow-x-auto";

  const cardVariant = variant === "card";
  const bodyPad = cardVariant ? "space-y-2 p-2 sm:p-3" : "";

  if (layout === "fixed" && gridStyle) {
    return (
      <div className={cn(scrollClass, className)}>
        <div className={cn("min-w-[1100px] w-full text-sm", cardVariant && "bg-muted/20")} role="table">
          <div
            className={cn(
              "sticky top-0 z-10 grid border-b border-border/60 backdrop-blur-sm",
              headH,
              headBg,
              cardVariant && "mx-2 mt-2 rounded-t-xl border-x border-t sm:mx-3",
            )}
            style={gridStyle}
            role="row"
          >
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const sticky = header.column.columnDef.meta?.sticky;
              const align = header.column.columnDef.meta?.align ?? "left";
              return (
                <div
                  key={header.id}
                  role="columnheader"
                  className={cn(
                    cellPad,
                    "flex w-full min-w-0 items-center overflow-hidden text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]",
                    align === "center" && "justify-center text-center",
                    align === "right" && "justify-end text-right",
                    sticky === "right" &&
                      cn(headBg, "sticky right-0 z-20 shadow-[-4px_0_8px_-4px_rgb(0_0_0/0.06)]"),
                    header.column.columnDef.meta?.className,
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              );
            })}
          </div>

          <div className={bodyPad} role="rowgroup">
          {table.getRowModel().rows.map((row, rowIndex) => {
            const subOpen = isSubRowOpen?.(row) ?? false;
            return (
              <Fragment key={row.id}>
                <div
                  role="row"
                  className={cn(
                    "group grid transition-all duration-150",
                    rowH,
                    cardVariant
                      ? cn(
                          "rounded-xl border border-border/50 bg-card shadow-soft hover:border-primary/20 hover:shadow-card",
                          zebraStriping && rowIndex % 2 === 1 && "bg-muted/30",
                        )
                      : cn(
                          "border-b border-border/40",
                          comfortable ? "hover:bg-muted/40" : "hover:bg-primary/[0.04]",
                          zebraStriping && rowIndex % 2 === 1 && "bg-muted/20",
                        ),
                    onRowClick && "cursor-pointer",
                  )}
                  style={gridStyle}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const sticky = cell.column.columnDef.meta?.sticky;
                    const align = cell.column.columnDef.meta?.align ?? "left";
                    return (
                      <div
                        key={cell.id}
                        role="cell"
                        className={cn(
                          cellPad,
                          "flex w-full min-w-0 items-center overflow-hidden text-sm",
                          align === "center" && "justify-center text-center",
                          align === "right" && "justify-end text-right",
                          sticky === "right" &&
                            cn(
                              "sticky right-0 z-10 bg-card shadow-[-4px_0_8px_-4px_rgb(0_0_0/0.06)]",
                              comfortable ? "group-hover:bg-muted/40" : "group-hover:bg-primary/[0.04]",
                            ),
                          cell.column.columnDef.meta?.className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    );
                  })}
                </div>
                {renderSubRow && (
                  <div className="border-b border-border/40 bg-muted/20" role="row">
                    <div
                      className={cn(
                        "col-span-full grid transition-[grid-template-rows,opacity] duration-200 ease-in-out",
                        subOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                      )}
                      style={{ gridColumn: "1 / -1" }}
                    >
                      <div className="overflow-hidden">{renderSubRow(row)}</div>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(scrollClass, className)}>
      <table className="w-full border-collapse text-sm table-auto">
        <thead className={cn("sticky top-0 z-10 backdrop-blur-sm", headBg)}>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border/60">
              {headerGroup.headers.map((header) => {
                const sticky = header.column.columnDef.meta?.sticky;
                const align = header.column.columnDef.meta?.align ?? "left";
                return (
                  <th
                    key={header.id}
                    className={cn(
                      headH,
                      cellPad,
                      "overflow-hidden align-middle text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]",
                      "whitespace-nowrap",
                      align === "center" && "text-center",
                      align === "right" && "text-right",
                      sticky === "right" &&
                        cn(headBg, "sticky right-0 z-20 shadow-[-4px_0_8px_-4px_rgb(0_0_0/0.06)]"),
                      header.column.columnDef.meta?.className,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const subOpen = isSubRowOpen?.(row) ?? false;
            return (
              <Fragment key={row.id}>
                <tr
                  className={cn(
                    "group border-b border-border/40 transition-colors duration-150",
                    rowH,
                    comfortable ? "hover:bg-muted/40" : "hover:bg-primary/[0.04]",
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const sticky = cell.column.columnDef.meta?.sticky;
                    const align = cell.column.columnDef.meta?.align ?? "left";
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          cellPad,
                          "max-w-0 overflow-hidden align-middle text-sm",
                          align === "center" && "text-center",
                          align === "right" && "text-right",
                          sticky === "right" &&
                            cn(
                              "sticky right-0 z-10 bg-card shadow-[-4px_0_8px_-4px_rgb(0_0_0/0.06)]",
                              comfortable ? "group-hover:bg-muted/40" : "group-hover:bg-primary/[0.04]",
                            ),
                          cell.column.columnDef.meta?.className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
                {renderSubRow && (
                  <tr className="border-b border-border/40 bg-muted/20 hover:bg-muted/20">
                    <td colSpan={row.getVisibleCells().length} className="p-0">
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out",
                          subOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <div className="overflow-hidden">{renderSubRow(row)}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    className?: string;
    width?: string;
    sticky?: "right";
    align?: "left" | "center" | "right";
  }
}
