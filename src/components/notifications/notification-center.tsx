import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Dog, ExternalLink, FileText, Mail, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { db } from "@/integrations/database/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { daysUntilEnd } from "@/lib/notifications/exclusion-return-dates";
import {
  formatExclusionEndingSubject,
  formatExclusionRemainingDays,
  formatExclusionReturnMessage,
  isRenderableExclusionNotification,
  isUpcomingExclusionNotification,
} from "@/lib/notifications/exclusion-return-messages";
import { createExclusionLinkedDocument } from "@/lib/notifications/exclusion-report-actions";
import {
  EXCLUSION_NOTIFICATIONS_QUERY_KEY,
  isActiveEndMilestone,
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
import { todayISODate } from "@/lib/agent-exclusions";

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

function exclusionTypeLabel(t: (key: string) => string, exclusionType: string): string {
  const key = `exclusions.type.${exclusionType}`;
  const label = t(key);
  return label === key ? exclusionType : label;
}

function formatEndDate(iso: string, locale: string): string {
  const day = iso?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "—";
  const [year, month, dayNum] = day.split("-");
  if (locale.startsWith("fr")) return `${dayNum}/${month}/${year}`;
  return `${month}/${dayNum}/${year}`;
}

type NotificationCardProps = {
  notification: ExclusionNotificationRecord;
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  onViewExclusion: (notification: ExclusionNotificationRecord) => void;
  onCreateDocument: (
    notification: ExclusionNotificationRecord,
    kind: "report" | "message",
  ) => void;
  creatingKey: string | null;
};

function NotificationCard({
  notification,
  locale,
  t,
  onViewExclusion,
  onCreateDocument,
  creatingKey,
}: NotificationCardProps) {
  const severity = severityForMilestone(notification.milestone);
  const styles = severityStyles[severity];
  const Icon = notification.subject_kind === "dog" ? Dog : UserRound;
  const typeLabel = exclusionTypeLabel(t, notification.exclusion_type);
  const endDateLabel = formatEndDate(notification.end_date, locale);
  const remainingLabel = formatExclusionRemainingDays(notification.end_date, t);
  const createKey = (kind: "report" | "message") => `${notification.id}:${kind}`;

  return (
    <li
      className={cn(
        "px-4 py-3",
        !notification.is_read && styles.soft,
      )}
    >
      <div className="flex gap-3">
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
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-semibold leading-snug text-[#0F172A]">
              {formatExclusionEndingSubject(notification, t)}
            </p>
            {!notification.is_read ? (
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#023A84]" />
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[#334155]">
            {formatExclusionReturnMessage(notification, t, locale)}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <div>
              <dt className="font-medium text-[#64748B]">{t("notifications.ending.subjectLabel")}</dt>
              <dd className="truncate text-[#0F172A]">{notification.subject_name}</dd>
            </div>
            <div>
              <dt className="font-medium text-[#64748B]">{t("notifications.ending.exclusionType")}</dt>
              <dd className="truncate text-[#0F172A]">{typeLabel}</dd>
            </div>
            <div>
              <dt className="font-medium text-[#64748B]">{t("notifications.ending.daysRemaining")}</dt>
              <dd className="text-[#0F172A]">{remainingLabel}</dd>
            </div>
            <div>
              <dt className="font-medium text-[#64748B]">{t("notifications.ending.endDate")}</dt>
              <dd className="text-[#0F172A]">{endDateLabel}</dd>
            </div>
          </dl>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => onViewExclusion(notification)}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              {t("notifications.actions.viewExclusion")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={creatingKey !== null}
              onClick={() => onCreateDocument(notification, "report")}
            >
              <FileText className="mr-1 h-3 w-3" />
              {creatingKey === createKey("report")
                ? t("notifications.actions.creatingDocument")
                : t("notifications.actions.createReport")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={creatingKey !== null}
              onClick={() => onCreateDocument(notification, "message")}
            >
              <Mail className="mr-1 h-3 w-3" />
              {creatingKey === createKey("message")
                ? t("notifications.actions.creatingDocument")
                : t("notifications.actions.createMessage")}
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function NotificationCenter() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ExclusionNotificationFilter>("all");
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const todayISO = todayISODate();

  const notificationsQuery = useQuery({
    queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      await syncExclusionReturnNotifications(db);
      return fetchExclusionNotifications(db);
    },
    staleTime: 30_000,
  });

  const notifications = notificationsQuery.data ?? [];
  const expiringNotifications = useMemo(
    () =>
      notifications.filter((n) => {
        if (!isRenderableExclusionNotification(n)) return false;
        const daysRemaining = daysUntilEnd(n.end_date, todayISO);
        if (!Number.isFinite(daysRemaining)) return false;
        return (
          isUpcomingExclusionNotification(n, todayISO) &&
          (isActiveEndMilestone(n.milestone) || daysRemaining <= 2)
        );
      }),
    [notifications, todayISO],
  );
  const unreadCount = useMemo(
    () => expiringNotifications.filter((n) => !n.is_read).length,
    [expiringNotifications],
  );
  const visible = useMemo(
    () => filterNotifications(expiringNotifications, filter),
    [expiringNotifications, filter],
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
      const unreadIds = expiringNotifications.filter((n) => !n.is_read).map((n) => n.id);
      if (unreadIds.length > 0) {
        await markReadMutation.mutateAsync(unreadIds);
      }
    }
  }

  function markNotificationRead(notification: ExclusionNotificationRecord) {
    if (notification.is_read) return;
    void markExclusionNotificationsRead(db, [notification.id]).then(() => {
      void queryClient.invalidateQueries({ queryKey: EXCLUSION_NOTIFICATIONS_QUERY_KEY });
    });
  }

  function handleViewExclusion(notification: ExclusionNotificationRecord) {
    markNotificationRead(notification);
    void navigate({ to: "/exclusions" });
    setOpen(false);
  }

  async function handleCreateDocument(
    notification: ExclusionNotificationRecord,
    documentKind: "report" | "message",
  ) {
    const key = `${notification.id}:${documentKind}`;
    setCreatingKey(key);
    markNotificationRead(notification);
    try {
      const typeLabel = exclusionTypeLabel(t, notification.exclusion_type);
      const title = formatExclusionEndingSubject(notification, t);
      const { roleCategory, documentId } = await createExclusionLinkedDocument(
        db,
        notification,
        documentKind,
        {
          title,
          typeLabel,
          userId: user?.id,
          userEmail: user?.email,
          userName: user?.email ?? "Utilisateur",
        },
      );
      toast.success(t("notifications.actions.documentCreated"));
      void navigate({
        to: "/reports-messages/$roleCategory/$documentId",
        params: { roleCategory, documentId },
      });
      setOpen(false);
    } catch {
      toast.error(t("notifications.actions.documentError"));
    } finally {
      setCreatingKey(null);
    }
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
        className="w-[420px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-[#E5E7EB] p-0 shadow-lg"
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

        <ScrollArea className="h-[420px]">
          {notificationsQuery.isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t("notifications.empty")}
            </div>
          ) : (
            <div>
              <p className="border-b border-[#F1F5F9] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                {t("notifications.section.expiring")}
              </p>
              <ul className="divide-y divide-[#F1F5F9]">
                {visible.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    locale={locale}
                    t={t}
                    onViewExclusion={handleViewExclusion}
                    onCreateDocument={handleCreateDocument}
                    creatingKey={creatingKey}
                  />
                ))}
              </ul>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
