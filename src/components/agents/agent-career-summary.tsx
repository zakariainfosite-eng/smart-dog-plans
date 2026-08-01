import {
  Briefcase,
  UserX,
  CalendarDays,
  GraduationCap,
  HeartPulse,
  Dog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { AgentCareerSummary } from "@/lib/agent-career";
import { useI18n } from "@/hooks/use-i18n";

type AgentCareerSummaryProps = {
  summary: AgentCareerSummary | null;
};

export function AgentCareerSummarySection({ summary }: AgentCareerSummaryProps) {
  const { t } = useI18n();

  if (!summary) return null;

  const items: Array<{ icon: LucideIcon; label: string; value: number }> = [
    {
      icon: Briefcase,
      label: t("agentDetails.careerSummary.totalCases"),
      value: summary.totalOperationalCases,
    },
    {
      icon: UserX,
      label: t("agentDetails.careerSummary.totalExclusions"),
      value: summary.totalExclusions,
    },
    {
      icon: CalendarDays,
      label: t("agentDetails.careerSummary.totalLeave"),
      value: summary.totalLeavePeriods,
    },
    {
      icon: GraduationCap,
      label: t("agentDetails.careerSummary.totalTraining"),
      value: summary.totalTrainingExclusions,
    },
    {
      icon: HeartPulse,
      label: t("agentDetails.careerSummary.totalMedical"),
      value: summary.totalMedicalLeave,
    },
    {
      icon: Dog,
      label: t("agentDetails.careerSummary.totalDogRelated"),
      value: summary.totalDogRelatedExclusions,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/80 p-3"
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums leading-none">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
