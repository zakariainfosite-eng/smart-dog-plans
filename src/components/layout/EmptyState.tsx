import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Tighter padding for card-embedded empty states. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "page-enter flex flex-col items-center justify-center text-center",
        compact
          ? "px-4 py-10"
          : "rounded-xl border border-dashed border-[#E5E7EB] bg-white px-6 py-12 shadow-none",
        className,
      )}
    >
      <div
        className={cn(
          "mb-3 flex items-center justify-center rounded-full bg-[#023A84]/8 text-[#023A84]",
          compact ? "h-11 w-11" : "h-12 w-12",
        )}
      >
        <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} strokeWidth={2} />
      </div>
      <h3 className="text-sm font-semibold tracking-tight text-[#0F172A]">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[#6B7280]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
