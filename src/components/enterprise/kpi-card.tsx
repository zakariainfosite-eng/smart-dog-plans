import type { LucideIcon } from "lucide-react";
import { Circle } from "lucide-react";

import { PageStatCard, type PageStatCardProps } from "@/components/enterprise/page-layout";

type KpiAccent = "primary" | "success" | "warning" | "danger" | "neutral";

type KpiCardProps = Omit<PageStatCardProps, "icon" | "accentBarClassName" | "iconBgClassName"> & {
  icon?: LucideIcon;
  accent?: KpiAccent;
  iconBgClassName?: string;
  accentBarClassName?: string;
  variant?: PageStatCardProps["variant"];
};

const accentStyles: Record<
  KpiAccent,
  { iconBg: string; bar: string }
> = {
  primary: {
    iconBg: "bg-[#023A84]/12 text-[#023A84] dark:bg-sky-500/15 dark:text-sky-300",
    bar: "from-[#023A84] via-[#1a5aab] to-[#4A90D9]",
  },
  success: {
    iconBg: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    bar: "from-emerald-600 via-emerald-500 to-teal-400",
  },
  warning: {
    iconBg: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
    bar: "from-amber-600 via-amber-500 to-orange-400",
  },
  danger: {
    iconBg: "bg-red-500/12 text-red-700 dark:text-red-400",
    bar: "from-red-700 via-red-500 to-rose-400",
  },
  neutral: {
    iconBg: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    bar: "from-[#023A84]/70 via-[#3d6fad] to-[#8eb6e0]",
  },
};

export function KpiCard({
  icon: Icon = Circle,
  accent = "primary",
  iconBgClassName,
  accentBarClassName,
  variant,
  label,
  ...props
}: KpiCardProps) {
  const styles = accentStyles[accent];
  return (
    <PageStatCard
      icon={Icon}
      label={label}
      variant={variant}
      iconBgClassName={iconBgClassName ?? styles.iconBg}
      accentBarClassName={accentBarClassName ?? styles.bar}
      {...props}
    />
  );
}

export { PageStatCard };
