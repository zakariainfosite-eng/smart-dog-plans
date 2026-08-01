import { useMemo, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import {
  Ban,
  CalendarDays,
  MessageSquare,
  User,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { isAgentExclusionActive } from "@/lib/agent-exclusions";
import type { AgentExclusionHistoryItem } from "@/lib/agent-details";
import { exclusionLabel } from "@/routes/_authenticated/exclusions";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/enterprise/status-badge";

type ExclusionStatusFilter = "all" | "active" | "ended";

type AgentExclusionsHistoryProps = {
  exclusions: AgentExclusionHistoryItem[];
};

function sortExclusions(rows: AgentExclusionHistoryItem[]): AgentExclusionHistoryItem[] {
  return [...rows].sort((a, b) => {
    const startCmp = b.start_date.localeCompare(a.start_date);
    if (startCmp !== 0) return startCmp;
    return b.created_at.localeCompare(a.created_at);
  });
}

export function AgentExclusionsHistory({ exclusions }: AgentExclusionsHistoryProps) {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<ExclusionStatusFilter>("all");

  const sorted = useMemo(() => sortExclusions(exclusions), [exclusions]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return sorted;
    if (statusFilter === "active") {
      return sorted.filter((row) => isAgentExclusionActive(row));
    }
    return sorted.filter((row) => !isAgentExclusionActive(row));
  }, [sorted, statusFilter]);

  if (exclusions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("agentDetails.exclusions.empty")}</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["all", "active", "ended"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={statusFilter === value ? "default" : "outline"}
            onClick={() => setStatusFilter(value)}
          >
            {t(`agentDetails.exclusions.filter.${value}`)}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("agentDetails.exclusions.emptyFilter")}</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((row) => (
            <ExclusionCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExclusionCard({ row }: { row: AgentExclusionHistoryItem }) {
  const { t } = useI18n();
  const active = isAgentExclusionActive(row);
  const typeLabel = exclusionLabel(row.exclusion_type, t);
  const notes = row.notes?.trim() ? row.notes.trim() : null;

  return (
    <article className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-soft transition-shadow hover:shadow-card sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <CardBlock
          icon={CalendarDays}
          title={t("agentDetails.exclusions.card.period")}
          className="flex-1 min-w-[200px]"
        >
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">{t("agentDetails.exclusions.card.from")} </span>
              <span className="font-medium">{format(parseISO(row.start_date), "dd/MM/yyyy")}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{t("agentDetails.exclusions.card.to")} </span>
              <span className="font-medium">{format(parseISO(row.end_date), "dd/MM/yyyy")}</span>
            </p>
          </div>
        </CardBlock>

        <StatusBadge tone={active ? "success" : "neutral"}>
          {active
            ? t("agentDetails.exclusions.status.active")
            : t("agentDetails.exclusions.status.ended")}
        </StatusBadge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CardBlock icon={Ban} title={t("agentDetails.exclusions.card.exclusionType")}>
          <p className="text-sm font-medium leading-snug">{typeLabel}</p>
        </CardBlock>

        <CardBlock icon={FileText} title={t("agentDetails.exclusions.card.reason")}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{typeLabel}</p>
        </CardBlock>

        <CardBlock icon={User} title={t("agentDetails.exclusions.card.createdBy")}>
          <p className="text-sm text-muted-foreground">{t("common.none")}</p>
        </CardBlock>

        <CardBlock icon={MessageSquare} title={t("agentDetails.exclusions.card.notes")}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {notes ?? t("common.none")}
          </p>
        </CardBlock>
      </div>
    </article>
  );
}

function CardBlock({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} />
        {title}
      </div>
      {children}
    </div>
  );
}
