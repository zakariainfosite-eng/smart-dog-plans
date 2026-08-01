import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Hero ─────────────────────────────────────────────────────────── */

export type PageHeroMetaItem = {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  dotClassName?: string;
  valueClassName?: string;
};

export type PageHeroAction = {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: "primary" | "secondary";
  disabled?: boolean;
};

export type PageHeroProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: PageHeroMetaItem[];
  actions?: PageHeroAction[];
  actionsSlot?: ReactNode;
  loading?: boolean;
  className?: string;
};

export function PageHero({
  icon: Icon,
  title,
  subtitle,
  meta,
  actions,
  actionsSlot,
  loading,
  className,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[20px] border border-border/50 p-8 shadow-soft",
        "bg-gradient-to-br from-primary/[0.06] via-slate-50/80 to-slate-100/60",
        "dark:from-primary/10 dark:via-muted/30 dark:to-muted/20",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/[0.04] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-sky-400/[0.06] blur-3xl" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-soft">
              <Icon className="h-6 w-6" strokeWidth={2.25} />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
              {subtitle ? (
                <p className="mt-1 max-w-xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
              ) : null}
            </div>
          </div>

          {meta && meta.length > 0 ? (
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {meta.map((item) => {
                const MetaIcon = item.icon;
                return (
                  <li key={item.label} className="flex items-center gap-2">
                    {MetaIcon ? (
                      <MetaIcon className="h-3.5 w-3.5 text-primary/70" />
                    ) : (
                      <span className={cn("h-1.5 w-1.5 rounded-full bg-primary", item.dotClassName)} />
                    )}
                    <span>
                      {item.label}:{" "}
                      <strong
                        className={cn(
                          "font-semibold tabular-nums text-foreground",
                          item.valueClassName,
                        )}
                      >
                        {loading ? "—" : item.value}
                      </strong>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {actionsSlot ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">{actionsSlot}</div>
        ) : actions && actions.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {actions.map((action) => {
              const ActionIcon = action.icon;
              const isPrimary = action.variant !== "secondary";
              return (
                <Button
                  key={action.label}
                  variant={isPrimary ? "default" : "outline"}
                  size="lg"
                  className={cn(
                    "h-11 rounded-xl px-5",
                    isPrimary && "px-6 text-base font-semibold shadow-soft transition-all hover:shadow-card",
                    !isPrimary && "border-border/70 bg-background/80 shadow-sm backdrop-blur-sm",
                  )}
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {ActionIcon ? <ActionIcon className="mr-2 h-4 w-4" /> : null}
                  {action.label}
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Convenience meta row: last updated timestamp */
export function pageHeroLastUpdatedMeta(label: string, value: string): PageHeroMetaItem {
  return { label, value, icon: Clock3 };
}

/* ── Stat cards ───────────────────────────────────────────────────── */

export type PageStatCardProps = {
  icon: LucideIcon;
  value: number | string;
  label: string;
  trend?: string;
  percentage?: string;
  iconClassName?: string;
  iconBgClassName?: string;
  loading?: boolean;
  className?: string;
};

export function PageStatCard({
  icon: Icon,
  value,
  label,
  trend,
  percentage,
  iconClassName,
  iconBgClassName = "bg-primary/10 text-primary",
  loading,
  className,
}: PageStatCardProps) {
  return (
    <article
      className={cn(
        "group relative flex h-[130px] flex-col justify-between overflow-hidden rounded-[20px] border border-border/60 bg-card p-4 shadow-soft transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105",
            iconBgClassName,
          )}
        >
          <Icon className={cn("h-5 w-5", iconClassName)} strokeWidth={2.25} />
        </span>
        {percentage ? (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {percentage}
          </span>
        ) : null}
      </div>
      <div>
        <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
          {loading ? "—" : value}
        </p>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
        {trend ? <p className="mt-1 text-[11px] font-semibold text-emerald-600">{trend}</p> : null}
      </div>
    </article>
  );
}

/* ── Filter toolbar ───────────────────────────────────────────────── */

export function PageFilterToolbar({
  children,
  resetLabel,
  onReset,
  showReset,
  className,
}: {
  children: ReactNode;
  resetLabel?: string;
  onReset?: () => void;
  showReset?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[20px] border border-border/60 bg-card p-3 shadow-soft sm:p-4",
        "lg:flex-row lg:flex-wrap lg:items-center",
        className,
      )}
    >
      {children}
      {showReset && onReset && resetLabel ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground lg:ml-auto"
          onClick={onReset}
        >
          {resetLabel}
        </Button>
      ) : null}
    </div>
  );
}

/* ── Content shells ───────────────────────────────────────────────── */

export function PageContentShell({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-soft",
        padding && "p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageTableShell({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-soft",
        className,
      )}
    >
      {header ? (
        <div className="border-b border-border/50 bg-muted/20 px-5 py-3.5 sm:px-6">{header}</div>
      ) : null}
      <div className="bg-background">{children}</div>
      {footer ? (
        <div className="border-t border-border/50 bg-muted/10 px-5 py-3 sm:px-6">{footer}</div>
      ) : null}
    </div>
  );
}

/* ── Pagination footer ────────────────────────────────────────────── */

export function PageTablePagination({
  showingLabel,
  page,
  totalPages,
  onPageChange,
  prevLabel,
  nextLabel,
}: {
  showingLabel: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  prevLabel: string;
  nextLabel: string;
}) {
  if (totalPages <= 1) {
    return <p className="text-sm text-muted-foreground">{showingLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{showingLabel}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {prevLabel}
        </Button>
        <span className="min-w-[4rem] text-center text-sm tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
