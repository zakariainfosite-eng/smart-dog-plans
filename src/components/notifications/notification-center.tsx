import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Dog, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { db } from "@/integrations/database/client";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import {
  formatExclusionReturnMessage,
} from "@/lib/notifications/exclusion-return-messages";
import {
  EXCLUSION_NOTIFICATIONS_QUERY_KEY,
  severityForMilestone,
  type ExclusionNotificationFilter,
  type ExclusionNotificationRecord,
  type ExclusionNotificationSeverity,
} from "@/lib/notifications/exclusion-return-types";
import {
  fetchExclusionNotifications,
  markAllExclusionNotificationsRead,
  markExclusionNotificationsRead,
  syncExclusionReturnNotifications,
} from "@/lib/notifications/sync-exclusion-return-notifications";

const severityStyles: Record<
  ExclusionNotificationSeverity,
  { bar: string; badge: string; soft: string }
> = {
  info: {
    bar: "bg-[#2563EB]",
    badge: "bg-[#EFF6FF] text-[#1D4ED8]",
    soft: "bg-[#EFF6FF]/70",
  },
  warning: {
    bar: "bg-[#F59E0B]",
    badge: "bg-[#FFFBEB] text-[#B45309]",
    soft: "bg-[#FFFBEB]/80",
  },
  success: {
    bar: "bg-[#16A34A]",
    badge: "bg-[#F0FDF4] text-[#15803D]",
    soft: "bg-[#F0FDF4]/80",
  },
};

const filters: ExclusionNotificationFilter[] = [
  "all",
  "personnel",
  "dogs",
  "unread",
  "read",
];

function filterNotifications(
  items: ExclusionNotificationRecord[],
  filter: ExclusionNotificationFilter,
): ExclusionNotificationRecord[] {
  switch (filter) {
    case "personnel":
      return items.filter((n) => n.subject_kind === "personnel");
    case "dogs":
      return items.filter((n) => n.subject_kind === "dog");
    case "unread":
      return items.filter((n) => !n.is_read);
    case "read":
      return items.filter((n) => n.is_read);
    default:
      return items;
  }
}

export function NotificationCenter() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ExclusionNotificationFilter>("all");

  const notificationsQuery = useQuery({
    queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      await syncExclusionReturnNotifications(db);
      return fetchExclusionNotifications(db);
    },
    staleTime: 30_000,
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );
  const visible = useMemo(
    () => filterNotifications(notifications, filter),
    [notifications, filter],
  );

  const markReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await markExclusionNotificationsRead(db, ids);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      await markAllExclusionNotificationsRead(db);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY });
    },
  });

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
      if (unreadIds.length > 0) {
        await markReadMutation.mutateAsync(unreadIds);
      }
    }
  }

  function openProfile(notification: ExclusionNotificationRecord) {
    void markExclusionNotificationsRead(db, [notification.id]).then(() => {
      void queryClient.invalidateQueries({ queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY });
    });

    if (notification.subject_kind === "dog" && notification.dog_id) {
      void navigate({
        to: "/dogs",
        search: { details: notification.dog_id },
      });
    } else if (notification.agent_id) {
      void navigate({
        to: "/employees",
        search: { details: notification.agent_id },
      });
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("action.notifications")}
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-[#E5E7EB] p-0 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#F1F5F9] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#0F172A]">
              {t("notifications.title")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("notifications.subtitle")}
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-[#023A84] hover:underline"
              onClick={() => markAllMutation.mutate()}
            >
              {t("notifications.markAllRead")}
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-[#F1F5F9] px-3 py-2.5">
          {filters.map((key) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-[#023A84] text-white"
                    : "bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
                )}
              >
                {t(`notifications.filter.${key}`)}
              </button>
            );
          })}
        </div>

        <ScrollArea className="h-[360px]">
          {notificationsQuery.isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("notifications.empty")}
            </div>
          ) : (
            <ul className="divide-y divide-[#F1F5F9]">
              {visible.map((notification) => {
                const severity = severityForMilestone(notification.milestone);
                const styles = severityStyles[severity];
                const Icon = notification.subject_kind === "dog" ? Dog : UserRound;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => openProfile(notification)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F8FAFC]",
                        !notification.is_read && styles.soft,
                      )}
                    >
                      <span
                        className={cn("mt-1 w-1 shrink-0 self-stretch rounded-full", styles.bar)}
                      />
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          styles.badge,
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[13px] font-medium leading-snug text-[#0F172A]">
                            {formatExclusionReturnMessage(notification, t, locale)}
                          </span>
                          {!notification.is_read ? (
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#023A84]" />
                          ) : null}
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className={cn("rounded-full px-1.5 py-0.5 font-medium", styles.badge)}>
                            {t(`notifications.severity.${severity}`)}
                          </span>
                          <span>{t(`notifications.kind.${notification.subject_kind}`)}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
