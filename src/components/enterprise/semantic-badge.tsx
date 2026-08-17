import type { ReactNode } from "react";

import { StatusBadge } from "@/components/enterprise/status-badge";
import {
  resolveSemanticBadgeTone,
  type SemanticBadgeKind,
} from "@/lib/ui/semantic-badge-tone";
import { cn } from "@/lib/utils";

export function SemanticBadge({
  value,
  kind = "category",
  className,
  children,
}: {
  value: string;
  kind?: SemanticBadgeKind;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <StatusBadge
      tone={resolveSemanticBadgeTone(value, kind)}
      className={cn("max-w-full truncate px-2 py-0.5 text-[10px] tracking-wide", className)}
    >
      {children ?? value}
    </StatusBadge>
  );
}
