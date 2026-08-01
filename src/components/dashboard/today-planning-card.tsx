import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { useI18n } from "@/hooks/use-i18n";

export type TodayPlanningRow = {
  id: string;
  shift: string;
  validated: boolean;
  sections: { name: string } | null;
};

type TodayPlanningCardProps = {
  planning: TodayPlanningRow[];
  loading?: boolean;
};

const KNOWN_SHIFTS = ["day", "night", "rest"] as const;

export function TodayPlanningCard({ planning, loading }: TodayPlanningCardProps) {
  const { t } = useI18n();

  const planningTotal = planning.length;
  const validatedCount = planning.filter((row) => row.validated).length;
  const validationProgress =
    planningTotal > 0 ? Math.round((validatedCount / planningTotal) * 100) : 0;

  return (
    <Card className="hover-lift overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>{t("dashboard.todayPlanning")}</CardTitle>
            <CardDescription className="mt-0.5">
              {planningTotal > 0
                ? t("dashboard.validationProgress", {
                    validated: validatedCount,
                    total: planningTotal,
                  })
                : t("dashboard.noPlanningToday")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("status.validated")}</span>
                <span className="font-semibold tabular-nums">{validationProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-success transition-all duration-500 ease-out"
                  style={{ width: `${validationProgress}%` }}
                />
              </div>
            </div>

            {planningTotal === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                {t("dashboard.noPlanningToday")}
              </div>
            ) : (
              <ul className="space-y-3">
                {planning.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {row.sections?.name ?? t("dashboard.sectionFallback")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {KNOWN_SHIFTS.includes(row.shift as (typeof KNOWN_SHIFTS)[number])
                          ? t(`shift.${row.shift}`)
                          : row.shift}
                      </p>
                    </div>
                    <StatusBadge tone={row.validated ? "success" : "warning"}>
                      {t(`status.${row.validated ? "validated" : "draft"}`)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
