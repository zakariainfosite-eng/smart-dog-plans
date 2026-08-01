import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Shared profile / detail drawer layout (agents, dogs, cases, checkpoints). */

export function ProfileDrawerHeader({
  photo,
  title,
  subtitle,
  badges,
  actions,
  className,
}: {
  photo: ReactNode;
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/[0.04] via-card to-muted/20 px-6 py-5",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className="shrink-0">{photo}</div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
              {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
          </div>
          {badges ? <div className="flex flex-wrap gap-1.5">{badges}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function ProfileInfoCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-soft transition-shadow hover:shadow-card",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-border/50 bg-muted/20 px-4 py-3">
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </span>
        ) : null}
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ProfileFieldGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {children}
    </dl>
  );
}

export function ProfileField({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-muted/15 px-3 py-2.5 transition-colors hover:bg-muted/25",
        className,
      )}
    >
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function ProfileRelatedSection({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-primary" strokeWidth={2.25} /> : null}
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      </div>
      <div className="overflow-hidden rounded-[20px] border border-border/60 bg-card shadow-soft">
        {children}
      </div>
    </section>
  );
}
