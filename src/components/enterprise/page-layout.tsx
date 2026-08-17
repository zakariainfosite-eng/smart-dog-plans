import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Hero ─────────────────────────────────────────────────────────── */

export type PageHeroBreadcrumbItem = {
  label: string;
};

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
  /** Compact trail shown above the title, e.g. CynoPlanning / Fonctionnaires */
  breadcrumb?: PageHeroBreadcrumbItem[];
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
  breadcrumb,
  meta,
  actions,
  actionsSlot,
  loading,
  className,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        "cyno-page-hero",
        /* Bleed into AppLayout padding so content scrolls cleanly underneath. */
        "-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        "py-4 sm:py-5",
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          {breadcrumb && breadcrumb.length > 0 ? (
            <nav aria-label="Breadcrumb" className="mb-1.5">
              <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-[#94A3B8]">
                {breadcrumb.map((item, index) => (
                  <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
                    {index > 0 ? (
                      <span aria-hidden className="text-[#CBD5E1]">
                        /
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        index === breadcrumb.length - 1
                          ? "font-medium text-[#64748B]"
                          : "text-[#94A3B8]",
                      )}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#023A84]/8 text-[#023A84] ring-1 ring-inset ring-[#023A84]/10">
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight text-[#0F172A] dark:text-foreground">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748B]">
                  {subtitle}
                </p>
              ) : null}

              {meta && meta.length > 0 ? (
                <ul className="mt-2.5 flex flex-wrap gap-2">
                  {meta.map((item) => {
                    const MetaIcon = item.icon;
                    return (
                      <li
                        key={item.label}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]/80 px-2.5 py-1 text-[12px] text-[#64748B] dark:border-border dark:bg-muted/40"
                      >
                        {MetaIcon ? (
                          <MetaIcon className="h-3.5 w-3.5 text-[#023A84]/70" strokeWidth={2.25} />
                        ) : (
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full bg-[#023A84]",
                              item.dotClassName,
                            )}
                          />
                        )}
                        <span>{item.label}</span>
                        <strong
                          className={cn(
                            "font-semibold tabular-nums text-[#0F172A] dark:text-foreground",
                            item.valueClassName,
                          )}
                        >
                          {loading ? "—" : item.value}
                        </strong>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </div>

        {actionsSlot ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {actionsSlot}
          </div>
        ) : actions && actions.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {actions.map((action) => {
              const ActionIcon = action.icon;
              const isPrimary = action.variant !== "secondary";
                return (
                  <Button
                    key={action.label}
                    variant={isPrimary ? "default" : "secondary"}
                    onClick={action.onClick}
                    disabled={action.disabled}
                  >
                    {ActionIcon ? <ActionIcon className="h-4 w-4" /> : null}
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
  /** Top accent bar (gradient). Defaults to CynoPlanning blue. */
  accentBarClassName?: string;
  /**
   * `minimal` — 90px, single accent, subtle border, no gradient/shadow.
   * Used by premium list pages (Exclusions, etc.).
   */
  variant?: "default" | "minimal";
  loading?: boolean;
  className?: string;
  /** Compact extra lines under the label (e.g. specialty breakdown). */
  footer?: ReactNode;
  /** Opens statistic details. Makes the main number/label an accessible button. */
  onDetailsClick?: () => void;
  detailsAriaLabel?: string;
};

function PageStatCardBody({
  Icon,
  value,
  label,
  trend,
  percentage,
  iconClassName,
  iconBgClassName,
  minimal,
  loading,
}: {
  Icon: LucideIcon;
  value: number | string;
  label: string;
  trend?: string;
  percentage?: string;
  iconClassName?: string;
  iconBgClassName: string;
  minimal: boolean;
  loading?: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          minimal
            ? "h-9 w-9 bg-[#023A84]/10 text-[#023A84]"
            : cn(
                "mt-0.5 h-9 w-9 shadow-sm ring-1 ring-inset ring-black/5 transition-transform duration-200 group-hover:scale-105",
                iconBgClassName,
              ),
        )}
      >
        <Icon className={cn("h-4 w-4", iconClassName)} strokeWidth={2.25} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-brand text-[32px] font-bold leading-none tracking-tight text-[#0B1F3A] tabular-nums dark:text-foreground">
            {loading ? "—" : value}
          </p>
          {percentage ? (
            <span className="mt-1 shrink-0 rounded-full bg-[#023A84]/8 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[#023A84]">
              {percentage}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-[13px] font-medium leading-tight text-[#6B7280]">
          {label}
        </p>
        {!minimal && trend ? (
          <p className="mt-1 whitespace-pre-line text-[10px] font-medium uppercase tracking-[0.06em] text-[#023A84]/75">
            {trend}
          </p>
        ) : null}
      </div>
    </>
  );
}

export function PageStatCard({
  icon: Icon,
  value,
  label,
  trend,
  percentage,
  iconClassName,
  iconBgClassName = "bg-[#023A84]/12 text-[#023A84]",
  accentBarClassName = "from-[#023A84] via-[#1a5aab] to-[#4A90D9]",
  variant = "default",
  loading,
  className,
  footer,
  onDetailsClick,
  detailsAriaLabel,
}: PageStatCardProps) {
  const minimal = variant === "minimal";
  const hasFooter = Boolean(footer);
  const clickable = Boolean(onDetailsClick);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden bg-white dark:bg-card",
        clickable &&
          "cursor-pointer transition-colors hover:border-[#023A84]/35 focus-within:ring-2 focus-within:ring-ring",
        minimal
          ? cn(
              "rounded-xl border border-[#E5E7EB] px-4 shadow-none",
              hasFooter ? "min-h-[90px] justify-start py-3" : "h-[90px] justify-center",
            )
          : [
              hasFooter ? "min-h-[122px]" : "h-[122px]",
              "rounded-[18px] border border-[#023A84]/10 px-4 pb-2.5 pt-3.5",
              "shadow-[0_3px_14px_-4px_rgba(2,58,132,0.10)]",
              "transition-all duration-200 ease-out",
              "hover:-translate-y-0.5 hover:border-[#023A84]/25 hover:shadow-[0_8px_20px_-6px_rgba(2,58,132,0.16)]",
            ],
        className,
      )}
    >
      {!minimal ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r opacity-90 transition-opacity duration-200 group-hover:opacity-100",
            accentBarClassName,
          )}
        />
      ) : null}

      <div className="relative flex min-h-0 items-center gap-3">
        {clickable ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none"
            onClick={onDetailsClick}
            aria-label={detailsAriaLabel ?? label}
          >
            <PageStatCardBody
              Icon={Icon}
              value={value}
              label={label}
              trend={trend}
              percentage={percentage}
              iconClassName={iconClassName}
              iconBgClassName={iconBgClassName}
              minimal={minimal}
              loading={loading}
            />
          </button>
        ) : (
          <PageStatCardBody
            Icon={Icon}
            value={value}
            label={label}
            trend={trend}
            percentage={percentage}
            iconClassName={iconClassName}
            iconBgClassName={iconBgClassName}
            minimal={minimal}
            loading={loading}
          />
        )}
      </div>

      {hasFooter ? <div className="relative mt-1.5 min-w-0">{footer}</div> : null}

      {!minimal && !trend && !hasFooter ? (
        <div className="mt-1.5 h-[22px] shrink-0" aria-hidden />
      ) : null}
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
        "cyno-content-shell overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-soft",
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
