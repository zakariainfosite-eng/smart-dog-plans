import { cn } from "@/lib/utils";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "primary" | "info" | "purple";

const toneStyles: Record<StatusTone, string> = {
  success: "border-success/20 bg-success/10 text-[#15803d]",
  warning: "border-warning/20 bg-warning/10 text-[#b45309]",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/20 bg-primary/10 text-primary",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-violet-200 bg-violet-50 text-violet-700",
};

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
