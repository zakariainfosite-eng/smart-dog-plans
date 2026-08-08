import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { db } from "@/integrations/database/client";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { formatImminentReturnLine } from "@/lib/notifications/exclusion-return-messages";
import {
  fetchImminentReturns,
  type ImminentReturnItem,
} from "@/lib/notifications/fetch-imminent-returns";
import {
  IMMINENT_RETURNS_QUERY_KEY,
  severityForDaysUntilReturn,
} from "@/lib/notifications/exclusion-return-types";

type ImminentReturnsCardProps = {
  loading?: boolean;
};

const toneDot: Record<string, string> = {
  success: "bg-[#16A34A]",
  warning: "bg-[#F59E0B]",
  info: "bg-[#2563EB]",
};

export function ImminentReturnsCard({ loading: externalLoading }: ImminentReturnsCardProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: IMMINENT_RETURNS_QUERY_KEY,
    queryFn: () => fetchImminentReturns(db, 5),
  });

  const loading = externalLoading || query.isLoading;
  const items = query.data ?? [];

  function openItem(item: ImminentReturnItem) {
    if (item.subject_kind === "dog" && item.dog_id) {
      void navigate({ to: "/dogs", search: { details: item.dog_id } });
      return;
    }
    if (item.agent_id) {
      void navigate({ to: "/employees", search: { details: item.agent_id } });
    }
  }

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm dark:border-border dark:bg-card">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#023A84]/10 text-[#023A84]">
          <CalendarClock className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#0F172A] dark:text-foreground">
            {t("notifications.imminent.title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("notifications.imminent.subtitle")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-xl bg-muted/60"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E5E7EB] px-4 py-8 text-center text-sm text-muted-foreground">
          {t("notifications.imminent.empty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const severity = severityForDaysUntilReturn(item.days_until);
            return (
              <li key={item.exclusion_id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    "hover:bg-[#F8FAFC] dark:hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", toneDot[severity])}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#374151] dark:text-foreground">
                    {formatImminentReturnLine(item, t)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
