import { useMemo, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  FileText,
  MapPin,
  Target,
  Package,
  Scale,
  Dog,
  MessageSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { AgentOperationalCase } from "@/lib/agent-details";
import { checkpointLabel } from "@/lib/operational-case-api";
import {
  caseSpecialtyBadgeTone,
  caseSpecialtyLabel,
  formatCaseQuantity,
  formatSeizureDetails,
} from "@/lib/operational-cases";
import { useI18n } from "@/hooks/use-i18n";
import { StatusBadge } from "@/components/enterprise/status-badge";

type AgentOperationalCasesHistoryProps = {
  cases: AgentOperationalCase[];
  onCaseClick: (caseRow: AgentOperationalCase) => void;
};

function sortCases(rows: AgentOperationalCase[]): AgentOperationalCase[] {
  return [...rows].sort((a, b) => {
    const dateCmp = b.case_date.localeCompare(a.case_date);
    if (dateCmp !== 0) return dateCmp;
    return b.created_at.localeCompare(a.created_at);
  });
}

export function AgentOperationalCasesHistory({
  cases,
  onCaseClick,
}: AgentOperationalCasesHistoryProps) {
  const { t } = useI18n();
  const sorted = useMemo(() => sortCases(cases), [cases]);

  if (cases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("agentDetails.history.emptyCases")}</p>
    );
  }

  return (
    <div className="space-y-4">
      {sorted.map((caseRow) => (
        <OperationalCaseCard key={caseRow.id} caseRow={caseRow} onClick={() => onCaseClick(caseRow)} />
      ))}
    </div>
  );
}

function OperationalCaseCard({
  caseRow,
  onClick,
}: {
  caseRow: AgentOperationalCase;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const specialtyLabel = caseSpecialtyLabel(caseRow.specialty, t);
  const seizureDetails = formatSeizureDetails(caseRow, t);
  const quantity = formatCaseQuantity(caseRow, t);
  const observations = caseRow.observations?.trim() ? caseRow.observations.trim() : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer rounded-xl border border-border/70 bg-background/80 p-4 shadow-soft transition-all hover:border-primary/30 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-start gap-4">
          <CardBlock
            icon={CalendarDays}
            title={t("agentDetails.cases.card.date")}
            className="min-w-[140px]"
          >
            <p className="text-sm font-medium">{format(parseISO(caseRow.case_date), "dd/MM/yyyy")}</p>
          </CardBlock>

          <CardBlock icon={FileText} title={t("agentDetails.cases.card.caseNumber")}>
            <p className="font-mono text-sm font-semibold">{caseRow.case_number}</p>
          </CardBlock>
        </div>

        <StatusBadge tone={caseSpecialtyBadgeTone(caseRow.specialty)}>{specialtyLabel}</StatusBadge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CardBlock icon={MapPin} title={t("agentDetails.cases.card.checkpoint")}>
          <p className="text-sm leading-snug">{checkpointLabel(caseRow)}</p>
        </CardBlock>

        <CardBlock icon={Target} title={t("agentDetails.cases.card.specialty")}>
          <p className="text-sm font-medium leading-snug">{specialtyLabel}</p>
        </CardBlock>

        <CardBlock icon={Package} title={t("agentDetails.cases.card.seizureDetails")}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{seizureDetails}</p>
        </CardBlock>

        {quantity ? (
          <CardBlock icon={Scale} title={t("agentDetails.cases.card.quantity")}>
            <p className="text-sm font-medium">{quantity}</p>
          </CardBlock>
        ) : null}

        <CardBlock icon={Dog} title={t("agentDetails.cases.card.assignedDog")}>
          <p className="text-sm">{caseRow.dog?.name ?? t("common.none")}</p>
        </CardBlock>

        <CardBlock icon={MessageSquare} title={t("agentDetails.cases.card.notes")}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {observations ?? t("common.none")}
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
