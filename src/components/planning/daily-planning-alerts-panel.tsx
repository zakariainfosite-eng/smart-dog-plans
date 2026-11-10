import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Moon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  bucketPlanningDisplayWarnings,
  compactAlertTrailingParts,
  formatCheckpointPointLabel,
  type PlanningAlertItem,
} from "@/lib/planning/planning-warning-presentation";

type DailyPlanningAlertsPanelProps = {
  warnings: readonly unknown[] | null | undefined;
  t: TFunction;
};

function CompactListSection({
  title,
  subtitle,
  count,
  icon: Icon,
  borderAccent,
  badgeVariant,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  icon: typeof AlertTriangle;
  borderAccent: string;
  badgeVariant: "destructive" | "secondary" | "outline";
  children: ReactNode;
}) {
  if (count === 0) return null;

  return (
    <Card className={cn("border-border/70 shadow-soft", borderAccent)}>
      <CardHeader className="space-y-1 pb-2 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            {title}
          </CardTitle>
          <Badge variant={badgeVariant} className="shrink-0 tabular-nums">
            {count}
          </Badge>
        </div>
        {subtitle ? <CardDescription className="text-sm">{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        <ul className="divide-y divide-border/50">{children}</ul>
      </CardContent>
    </Card>
  );
}

function CompactLine({
  icon: Icon,
  children,
}: {
  icon: typeof Info;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-2 py-1.5 text-sm leading-snug text-foreground/90">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function StructuredAlertLine({
  item,
  icon,
  t,
}: {
  item: PlanningAlertItem;
  icon: typeof AlertCircle;
  t: TFunction;
}) {
  const point = formatCheckpointPointLabel(item.checkpointName, t);
  const trailing = compactAlertTrailingParts(item, t).join(" · ");

  if (!point) {
    return (
      <CompactLine icon={icon}>
        <span>{trailing}</span>
      </CompactLine>
    );
  }

  return (
    <CompactLine icon={icon}>
      <span className="font-semibold">{point}</span>
      {trailing ? (
        <>
          <span className="text-muted-foreground"> — </span>
          <span>{trailing}</span>
        </>
      ) : null}
    </CompactLine>
  );
}

function PlainTextLine({ text, icon }: { text: string; icon: typeof Info }) {
  return (
    <CompactLine icon={icon}>
      <span>{text}</span>
    </CompactLine>
  );
}

export function DailyPlanningAlertsPanel({ warnings, t }: DailyPlanningAlertsPanelProps) {
  const { critical, attention, info, reserveLines, restLines } =
    bucketPlanningDisplayWarnings(warnings, t);

  const infoLineCount = info.length + reserveLines.length + restLines.length;

  const totalIssues =
    critical.length + attention.length + infoLineCount;

  if (totalIssues === 0) {
    return (
      <Card className="border-emerald-500/25 bg-emerald-500/5 shadow-soft">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2 pt-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
          <div>
            <CardTitle className="text-base">{t("dailyPlanning.complete.title")}</CardTitle>
            <CardDescription>{t("dailyPlanning.complete.description")}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <CompactListSection
        title={t("dailyPlanning.alerts.criticalSection.title")}
        subtitle={t("dailyPlanning.alerts.criticalSection.subtitle")}
        count={critical.length}
        icon={AlertTriangle}
        borderAccent="border-l-[3px] border-l-destructive/70"
        badgeVariant="destructive"
      >
        {critical.map((item) => (
          <StructuredAlertLine key={item.id} item={item} icon={AlertCircle} t={t} />
        ))}
      </CompactListSection>

      <CompactListSection
        title={t("dailyPlanning.alerts.attentionSection.title")}
        subtitle={t("dailyPlanning.alerts.attentionSection.subtitle")}
        count={attention.length}
        icon={AlertCircle}
        borderAccent="border-l-[3px] border-l-amber-500/70"
        badgeVariant="secondary"
      >
        {attention.map((item) => (
          <StructuredAlertLine key={item.id} item={item} icon={AlertCircle} t={t} />
        ))}
      </CompactListSection>

      <CompactListSection
        title={t("dailyPlanning.alerts.infoSection.title")}
        count={infoLineCount}
        icon={Info}
        borderAccent="border-l-[3px] border-l-sky-500/50"
        badgeVariant="outline"
      >
        {info.map((item) => (
          <StructuredAlertLine key={item.id} item={item} icon={Info} t={t} />
        ))}
        {reserveLines.map((line, i) => (
          <PlainTextLine key={`653-${i}`} text={line} icon={Info} />
        ))}
        {restLines.map((line, i) => (
          <PlainTextLine key={`rest-${i}`} text={line} icon={Moon} />
        ))}
      </CompactListSection>
    </div>
  );
}
