import type { LucideIcon } from "lucide-react";
import { Circle } from "lucide-react";

import { PageStatCard, type PageStatCardProps } from "@/components/enterprise/page-layout";

type KpiCardProps = Omit<PageStatCardProps, "icon"> & {
  icon?: LucideIcon;
  accent?: "primary" | "success" | "warning" | "danger" | "neutral";
};

const accentIconBg: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600",
  warning: "bg-amber-500/10 text-amber-600",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

/** @deprecated Prefer PageStatCard for new pages */
export function KpiCard({
  icon: Icon = Circle,
  accent = "primary",
  iconBgClassName,
  label,
  ...props
}: KpiCardProps) {
  return (
    <PageStatCard
      icon={Icon}
      label={label}
      iconBgClassName={iconBgClassName ?? accentIconBg[accent]}
      {...props}
    />
  );
}

export { PageStatCard };
