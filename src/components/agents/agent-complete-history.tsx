import { useMemo, useState } from "react";

import {
  AGENT_TIMELINE_CATEGORIES,
  buildAgentCompleteHistory,
  groupAgentTimelineByYear,
  type AgentTimelineCategory,
  type AgentTimelineEvent,
} from "@/lib/agent-history-timeline";
import { formatHistoryDate, type AgentAdministrativeHistoryRow } from "@/lib/agent-history";
import type {
  AgentExclusionHistoryItem,
  AgentOperationalCase,
  AgentRotationHistoryItem,
} from "@/lib/agent-details";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/enterprise/status-badge";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

const CATEGORY_TONE: Record<AgentTimelineCategory, StatusTone> = {
  administrative: "primary",
  exclusion_agent: "warning",
  exclusion_dog: "purple",
  operational_case: "success",
  rotation: "info",
};

const CATEGORY_DOT: Record<AgentTimelineCategory, string> = {
  administrative: "bg-primary",
  exclusion_agent: "bg-warning",
  exclusion_dog: "bg-violet-500",
  operational_case: "bg-success",
  rotation: "bg-sky-500",
};

type AgentCompleteHistoryProps = {
  administrativeEvents: AgentAdministrativeHistoryRow[];
  agentExclusions: AgentExclusionHistoryItem[];
  dogExclusions: AgentExclusionHistoryItem[];
  operationalCases: AgentOperationalCase[];
  rotations: AgentRotationHistoryItem[];
};

export function AgentCompleteHistory({
  administrativeEvents,
  agentExclusions,
  dogExclusions,
  operationalCases,
  rotations,
}: AgentCompleteHistoryProps) {
  const { t } = useI18n();
  const [category, setCategory] = useState<AgentTimelineCategory | "all">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const hqReserveLabel = t("dailyPlanning.point653.name");

  const allEvents = useMemo(
    () =>
      buildAgentCompleteHistory({
        administrativeEvents,
        agentExclusions,
        dogExclusions,
        operationalCases,
        rotations,
        hqReserveLabel,
      }),
    [
      administrativeEvents,
      agentExclusions,
      dogExclusions,
      operationalCases,
      rotations,
      hqReserveLabel,
    ],
  );

  const filtered = useMemo(
    () => (category === "all" ? allEvents : allEvents.filter((e) => e.category === category)),
    [allEvents, category],
  );

  const visible = filtered.slice(0, visibleCount);
  const groups = useMemo(() => groupAgentTimelineByYear(visible), [visible]);

  if (allEvents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("agentDetails.completeHistory.empty")}</p>
    );
  }

  const availableCategories = AGENT_TIMELINE_CATEGORIES.filter((value) =>
    allEvents.some((event) => event.category === value),
  );

  const selectCategory = (value: AgentTimelineCategory | "all") => {
    setCategory(value);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          active={category === "all"}
          label={t("agentDetails.completeHistory.filter.all")}
          onClick={() => selectCategory("all")}
        />
        {availableCategories.map((value) => (
          <FilterChip
            key={value}
            active={category === value}
            label={t(`agentDetails.completeHistory.category.${value}`)}
            onClick={() => selectCategory(value)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("agentDetails.completeHistory.emptyFilter")}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.year} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.year}
              </p>
              <ol className="relative space-y-3 border-l border-border/60 pl-4">
                {group.events.map((event) => (
                  <TimelineRow key={event.key} event={event} />
                ))}
              </ol>
            </section>
          ))}

          {filtered.length > visible.length ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              {t("agentDetails.completeHistory.showMore")}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TimelineRow({ event }: { event: AgentTimelineEvent }) {
  const { t } = useI18n();
  const label = translateOrFallback(t, event.labelKey, event.labelFallback);
  const period = event.endDate
    ? `${formatHistoryDate(event.startDate)} → ${formatHistoryDate(event.endDate)}`
    : formatHistoryDate(event.startDate);

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-background",
          CATEGORY_DOT[event.category],
        )}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">{period}</span>
        <StatusBadge tone={CATEGORY_TONE[event.category]}>
          {t(`agentDetails.completeHistory.category.${event.category}`)}
        </StatusBadge>
      </div>
      <p className="mt-0.5 text-sm leading-snug text-foreground">{label}</p>
      {event.reason ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{event.reason}</p>
      ) : null}
      {event.observation ? (
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {event.observation}
        </p>
      ) : null}
      {event.reference ? (
        <p className="text-[11px] text-muted-foreground">
          {t("agentDetails.adminHistory.field.reference")}: {event.reference}
        </p>
      ) : null}
    </li>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/70 bg-background text-muted-foreground hover:bg-muted/50",
      )}
    >
      {label}
    </button>
  );
}

function translateOrFallback(t: (key: string) => string, key: string, fallback: string): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}
