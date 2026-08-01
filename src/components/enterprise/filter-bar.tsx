import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

import { PageFilterToolbar } from "@/components/enterprise/page-layout";

export function FilterBar({
  children,
  className,
  resetLabel,
  onReset,
  showReset,
}: {
  children: ReactNode;
  className?: string;
  resetLabel?: string;
  onReset?: () => void;
  showReset?: boolean;
}) {
  return (
    <PageFilterToolbar
      className={cn("mb-0", className)}
      resetLabel={resetLabel}
      onReset={onReset}
      showReset={showReset}
    >
      {children}
    </PageFilterToolbar>
  );
}

export function FilterPills({
  children,
  className,
  pills,
}: {
  children?: ReactNode;
  className?: string;
  pills?: Array<{ label: string; onRemove: () => void }>;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-1",
        className,
      )}
    >
      {pills?.map((pill) => (
        <button
          key={pill.label}
          type="button"
          onClick={pill.onRemove}
          className="inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-muted-foreground hover:bg-muted/60"
        >
          {pill.label} ×
        </button>
      ))}
      {children}
    </div>
  );
}
