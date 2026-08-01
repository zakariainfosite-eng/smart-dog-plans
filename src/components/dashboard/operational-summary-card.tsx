import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/enterprise/status-badge";
import type { OperationalSummary } from "@/lib/dashboard/fetch-operational-summary";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type OperationalSummaryCardProps = {
  summary: OperationalSummary;
  loading?: boolean;
};

type SummaryRow = {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger" | "neutral";
};

function SummaryLine({ label, value, tone = "default" }: SummaryRow) {
  const isNumeric = typeof value === "number";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {isNumeric && tone !== "default" ? (
        <StatusBadge tone={tone === "neutral" ? "neutral" : tone}>
          {value}
        </StatusBadge>
      ) : (
        <span className={cn("text-right text-sm font-medium tabular-nums", !isNumeric && "max-w-[55%] truncate")}>
          {value}
        </span>
      )}
    </div>
  );
}

export function OperationalSummaryCard({ summary, loading }: OperationalSummaryCardProps) {
  const { t } = useI18n();

  const commanderDisplay = summary.commanderName
    ? [summary.commanderName, summary.commanderGrade, summary.commanderMle]
        .filter(Boolean)
        .join(" — ")
    : t("dashboard.operationalSummary.commanderMissing");

  const sectionLabel = summary.hasActiveSection
    ? summary.sectionName
    : t("dashboard.operationalSummary.noSection");

  const rows: SummaryRow[] = [
    { label: t("dashboard.operationalSummary.activeSection"), value: sectionLabel },
    {
      label: t("dashboard.operationalSummary.currentShift"),
      value: t(`shift.${summary.shift}`),
    },
    { label: t("dashboard.operationalSummary.sectionChief"), value: commanderDisplay },
    {
      label: t("dashboard.operationalSummary.agentsMaladie"),
      value: summary.agentsMaladie,
      tone: summary.agentsMaladie > 0 ? "danger" : "neutral",
    },
    {
      label: t("dashboard.operationalSummary.agentsFormation"),
      value: summary.agentsFormation,
      tone: summary.agentsFormation > 0 ? "warning" : "neutral",
    },
    {
      label: t("dashboard.operationalSummary.agentsConge"),
      value: summary.agentsConge,
      tone: summary.agentsConge > 0 ? "warning" : "neutral",
    },
    {
      label: t("dashboard.operationalSummary.unavailableDogs"),
      value: summary.unavailableDogs,
      tone: summary.unavailableDogs > 0 ? "warning" : "neutral",
    },
  ];

  return (
    <Card className="hover-lift overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>{t("dashboard.operationalSummary.title")}</CardTitle>
            <CardDescription className="mt-0.5">
              {t("dashboard.operationalSummary.subtitle")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
        ) : (
          <div className="space-y-3">
            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {summary.hasPlanning
                ? t("dashboard.operationalSummary.planningReady")
                : t("dashboard.operationalSummary.noPlanning")}
            </p>
            <div className="space-y-2">
              {rows.map((row) => (
                <SummaryLine key={row.label} {...row} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
