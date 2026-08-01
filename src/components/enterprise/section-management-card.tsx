import { format } from "date-fns";
import { Layers, Moon, Pencil, Sun, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { cn } from "@/lib/utils";

type SectionManagementCardProps = {
  name: string;
  shiftType: "day" | "night";
  active: boolean;
  agentCount: number;
  createdAt: string;
  commanderFullName: string;
  commanderGrade: string;
  commanderMle: string;
  shiftDayLabel: string;
  shiftNightLabel: string;
  activeLabel: string;
  inactiveLabel: string;
  agentsLabel: string;
  createdLabel: string;
  commanderLabel: string;
  gradeLabel: string;
  mleLabel: string;
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
};

export function SectionManagementCard({
  name,
  shiftType,
  active,
  agentCount,
  createdAt,
  commanderFullName,
  commanderGrade,
  commanderMle,
  shiftDayLabel,
  shiftNightLabel,
  activeLabel,
  inactiveLabel,
  agentsLabel,
  createdLabel,
  commanderLabel,
  gradeLabel,
  mleLabel,
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
  className,
}: SectionManagementCardProps) {
  const isDay = shiftType === "day";

  return (
    <article
      className={cn(
        "enterprise-card hover-lift group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20",
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-border/60 bg-muted/20 px-4 py-4">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-soft",
            isDay ? "bg-amber-500/10 text-amber-600" : "bg-indigo-500/10 text-indigo-600",
          )}
        >
          {isDay ? <Sun className="h-5 w-5" strokeWidth={2} /> : <Moon className="h-5 w-5" strokeWidth={2} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-tight text-foreground">{name}</h3>
            <StatusBadge tone={active ? "success" : "neutral"}>
              {active ? activeLabel : inactiveLabel}
            </StatusBadge>
          </div>
          <StatusBadge tone={isDay ? "warning" : "primary"} className="mt-2">
            {isDay ? shiftDayLabel : shiftNightLabel}
          </StatusBadge>
        </div>
        <Layers className="h-4 w-4 shrink-0 text-muted-foreground/40" strokeWidth={1.75} />
      </div>

      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {commanderLabel}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">{commanderFullName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {gradeLabel}: <span className="font-medium text-foreground">{commanderGrade}</span>
          {" · "}
          {mleLabel}: <span className="font-medium text-foreground">{commanderMle}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 py-4">
        <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {agentsLabel}
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{agentCount}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">{createdLabel}</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {format(new Date(createdAt), "MMM d, yyyy")}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-end gap-1 border-t border-border/60 bg-muted/10 px-3 py-2 opacity-90 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2.5" onClick={onEdit} aria-label={editLabel}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {editLabel}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-lg px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          aria-label={deleteLabel}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {deleteLabel}
        </Button>
      </div>
    </article>
  );
}
