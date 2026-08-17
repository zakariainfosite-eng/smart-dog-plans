import { useMemo } from "react";
import { differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { Ban, Dog, Users } from "lucide-react";

import type { AgentRow } from "@/integrations/database";
import {
  isDogLevelExclusionType,
  isOpenEndedExclusionType,
  planningDayISO,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import type { ExclusionType } from "@/lib/agent-exclusions";
import { getActiveExclusionsForSection } from "@/lib/section-operational-stats";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/enterprise/status-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SectionExclusionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionName: string | null;
  sectionId: string | null;
  agents: AgentRow[];
  exclusions: AgentExclusionRecord[];
  referenceISO: string;
  /** When set, list only exclusions for this section-card counter. */
  breakdownTypes?: readonly ExclusionType[] | null;
  /** Localized label for the breakdown row (e.g. « Maladie »). */
  breakdownLabel?: string | null;
};

type ExclusionUrgency = "active" | "expiring_soon" | "ends_today";

type SectionExclusionDisplayRow = {
  key: string;
  kind: "personnel" | "dog";
  name: string;
  identifier: string;
  handlerName?: string;
  exclusionType: string;
  startDate: string;
  endDate: string | null;
  remainingDays: number | null;
  urgency: ExclusionUrgency;
};

function exclusionUrgency(remainingDays: number): ExclusionUrgency {
  if (remainingDays <= 0) return "ends_today";
  if (remainingDays <= 3) return "expiring_soon";
  return "active";
}

function remainingDaysUntilEnd(endDateISO: string | null | undefined, referenceISO: string): number | null {
  if (!endDateISO?.trim()) return null;
  const end = startOfDay(parseISO(endDateISO.slice(0, 10)));
  const today = startOfDay(parseISO(planningDayISO(referenceISO)));
  return differenceInCalendarDays(end, today);
}

export function SectionExclusionsSheet({
  open,
  onOpenChange,
  sectionName,
  sectionId,
  agents,
  exclusions,
  referenceISO,
  breakdownTypes = null,
  breakdownLabel = null,
}: SectionExclusionsSheetProps) {
  const { t } = useI18n();

  const { personnelRows, dogRows } = useMemo(() => {
    if (!sectionId) {
      return { personnelRows: [] as SectionExclusionDisplayRow[], dogRows: [] as SectionExclusionDisplayRow[] };
    }

    const active = getActiveExclusionsForSection(
      sectionId,
      agents,
      exclusions,
      referenceISO,
      breakdownTypes,
    );
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const agentByDogId = new Map(
      agents
        .filter((agent) => agent.dog_id || agent.dogs?.id)
        .map((agent) => [agent.dog_id ?? agent.dogs!.id, agent] as const),
    );

    const rows: SectionExclusionDisplayRow[] = active.map((exclusion, index) => {
      const openEnded = isOpenEndedExclusionType(exclusion.exclusion_type);
      const remainingDays = openEnded
        ? null
        : remainingDaysUntilEnd(exclusion.end_date, referenceISO);
      const urgency = remainingDays == null ? "active" : exclusionUrgency(remainingDays);
      const dogExclusion = isDogLevelExclusionType(exclusion.exclusion_type);

      if (dogExclusion) {
        const handler =
          (exclusion.dog_id ? agentByDogId.get(exclusion.dog_id) : undefined) ??
          (exclusion.agent_id ? agentById.get(exclusion.agent_id) : undefined);
        const dogName = handler?.dogs?.name?.trim() || t("sections.exclusionsSheet.dogFallback");
        const dogId = exclusion.dog_id ?? handler?.dogs?.id ?? handler?.dog_id ?? "—";
        return {
          key: `dog-${exclusion.dog_id ?? "x"}-${exclusion.exclusion_type}-${exclusion.start_date}-${exclusion.end_date}-${index}`,
          kind: "dog" as const,
          name: dogName,
          identifier: dogId,
          handlerName: handler
            ? `${handler.first_name} ${handler.last_name}`.trim()
            : undefined,
          exclusionType: exclusion.exclusion_type,
          startDate: exclusion.start_date,
          endDate: exclusion.end_date,
          remainingDays,
          urgency,
        };
      }

      const agent = exclusion.agent_id ? agentById.get(exclusion.agent_id) : undefined;
      return {
        key: `agent-${exclusion.agent_id ?? "x"}-${exclusion.exclusion_type}-${exclusion.start_date}-${exclusion.end_date}-${index}`,
        kind: "personnel" as const,
        name: agent
          ? `${agent.first_name} ${agent.last_name}`.trim()
          : t("sections.exclusionsSheet.personnelFallback"),
        identifier: agent?.professional_number ?? "—",
        exclusionType: exclusion.exclusion_type,
        startDate: exclusion.start_date,
        endDate: exclusion.end_date,
        remainingDays,
        urgency,
      };
    });

    const sortRows = (a: SectionExclusionDisplayRow, b: SectionExclusionDisplayRow) => {
      if (a.remainingDays !== b.remainingDays) return a.remainingDays - b.remainingDays;
      return a.name.localeCompare(b.name, "fr");
    };

    return {
      personnelRows: rows.filter((row) => row.kind === "personnel").sort(sortRows),
      dogRows: rows.filter((row) => row.kind === "dog").sort(sortRows),
    };
  }, [sectionId, agents, exclusions, referenceISO, breakdownTypes, t]);

  const total = personnelRows.length + dogRows.length;
  const title = breakdownLabel
    ? t("sections.exclusionsSheet.titleFiltered", { type: breakdownLabel })
    : t("sections.exclusionsSheet.title");
  const description = breakdownLabel
    ? sectionName
      ? t("sections.exclusionsSheet.descriptionFiltered", {
          name: sectionName,
          type: breakdownLabel,
        })
      : t("sections.exclusionsSheet.descriptionFilteredFallback", {
          type: breakdownLabel,
        })
    : sectionName
      ? t("sections.exclusionsSheet.description", { name: sectionName })
      : t("sections.exclusionsSheet.descriptionFallback");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 space-y-2 border-b border-[#F1F5F9] px-6 py-5 text-left">
          <SheetTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Ban className="h-5 w-5 text-[#DC2626]" />
            {title}
          </SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {total === 0 ? (
            <p className="py-8 text-center text-sm text-[#6B7280]">
              {t("sections.exclusionsSheet.empty")}
            </p>
          ) : (
            <>
              <ExclusionGroup
                icon={Users}
                title={t("sections.exclusionsSheet.groupPersonnel")}
                count={personnelRows.length}
                rows={personnelRows}
                emptyLabel={t("sections.exclusionsSheet.emptyPersonnel")}
                t={t}
              />
              <ExclusionGroup
                icon={Dog}
                title={t("sections.exclusionsSheet.groupDogs")}
                count={dogRows.length}
                rows={dogRows}
                emptyLabel={t("sections.exclusionsSheet.emptyDogs")}
                t={t}
              />
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-[#F1F5F9] px-6 py-4">
          <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
            {t("sections.detail.close")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ExclusionGroup({
  icon: Icon,
  title,
  count,
  rows,
  emptyLabel,
  t,
}: {
  icon: typeof Users;
  title: string;
  count: number;
  rows: SectionExclusionDisplayRow[];
  emptyLabel: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#023A84]/10 text-[#023A84]">
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">{title}</h3>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F1F5F9] px-1.5 text-[11px] font-semibold tabular-nums text-[#374151]">
          {count}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E5E7EB] px-3 py-4 text-center text-[13px] text-[#6B7280]">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <ExclusionCard key={row.key} row={row} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ExclusionCard({
  row,
  t,
}: {
  row: SectionExclusionDisplayRow;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const urgencyTone =
    row.urgency === "ends_today"
      ? "danger"
      : row.urgency === "expiring_soon"
        ? "warning"
        : "success";

  const urgencyLabel =
    row.urgency === "ends_today"
      ? t("sections.exclusionsSheet.status.endsToday")
      : row.urgency === "expiring_soon"
        ? t("sections.exclusionsSheet.status.expiringSoon")
        : t("sections.exclusionsSheet.status.active");

  const remainingLabel =
    row.remainingDays == null
      ? "—"
      : row.remainingDays <= 0
        ? t("sections.exclusionsSheet.remaining.today")
        : row.remainingDays === 1
          ? t("sections.exclusionsSheet.remaining.one")
          : t("sections.exclusionsSheet.remaining.other", { count: row.remainingDays });

  return (
    <li
      className={cn(
        "rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3",
        "shadow-none",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#0F172A]">{row.name}</p>
          <p className="mt-0.5 font-mono text-[12px] text-[#6B7280]">
            {row.kind === "personnel"
              ? t("sections.exclusionsSheet.matricule", { value: row.identifier })
              : t("sections.exclusionsSheet.dogId", { value: row.identifier })}
          </p>
          {row.kind === "dog" && row.handlerName ? (
            <p className="mt-0.5 text-[12px] text-[#94A3B8]">
              {t("sections.exclusionsSheet.handler", { name: row.handlerName })}
            </p>
          ) : null}
        </div>
        <StatusBadge tone={urgencyTone} className="shrink-0 text-[11px]">
          {urgencyLabel}
        </StatusBadge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        <Meta
          label={t("sections.exclusionsSheet.type")}
          value={t(`exclusions.type.${row.exclusionType}`)}
        />
        <Meta
          label={t("sections.exclusionsSheet.start")}
          value={format(parseISO(row.startDate), "dd/MM/yyyy")}
        />
        <Meta
          label={t("sections.exclusionsSheet.end")}
          value={
            isOpenEndedExclusionType(row.exclusionType) || !row.endDate
              ? "—"
              : format(parseISO(row.endDate), "dd/MM/yyyy")
          }
        />
        <Meta label={t("sections.exclusionsSheet.remainingLabel")} value={remainingLabel} />
      </div>
    </li>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#94A3B8]">
        {label}
      </p>
      <p className="mt-0.5 truncate font-medium text-[#374151]">{value}</p>
    </div>
  );
}
