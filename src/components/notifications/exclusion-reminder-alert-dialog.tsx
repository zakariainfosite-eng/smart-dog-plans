import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Mail, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { db } from "@/integrations/database/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { useExclusionReminderAlerts } from "@/hooks/use-exclusion-reminder-alerts";
import { createExclusionLinkedDocument } from "@/lib/notifications/exclusion-report-actions";
import { formatExclusionEndingSubject } from "@/lib/notifications/exclusion-return-messages";
import { formatExclusionReminderAlertMessage } from "@/lib/notifications/exclusion-reminder-alerts";
import type { ExclusionNotificationRecord } from "@/lib/notifications/exclusion-return-types";

function toNotificationStub(
  alert: NonNullable<ReturnType<typeof useExclusionReminderAlerts>["currentAlert"]>,
): ExclusionNotificationRecord {
  return {
    id: alert.alertKey,
    exclusion_id: alert.exclusionId,
    agent_id: alert.agentId,
    dog_id: alert.dogId,
    subject_kind: alert.subjectKind,
    notification_type: "exclusion_ending_soon",
    milestone: alert.milestone,
    end_date: alert.endDate,
    return_date: alert.endDate,
    subject_name: alert.subjectName,
    exclusion_type: alert.exclusionType,
    is_read: true,
    created_at: new Date().toISOString(),
  };
}

function exclusionTypeLabel(t: (key: string) => string, exclusionType: string): string {
  const key = `exclusions.type.${exclusionType}`;
  const label = t(key);
  return label === key ? exclusionType : label;
}

export function ExclusionReminderAlertDialog() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { open, currentAlert, dismissCurrent } = useExclusionReminderAlerts();
  const [creatingKind, setCreatingKind] = useState<"report" | "message" | null>(null);

  if (!currentAlert) return null;

  const message = formatExclusionReminderAlertMessage(currentAlert, t);
  const typeLabel = exclusionTypeLabel(t, currentAlert.exclusionType);
  const documentTitle = formatExclusionEndingSubject(
    { exclusion_type: currentAlert.exclusionType },
    t,
  );

  async function handleCreateDocument(documentKind: "report" | "message") {
    if (!currentAlert) return;
    setCreatingKind(documentKind);
    try {
      const { roleCategory, documentId } = await createExclusionLinkedDocument(
        db,
        toNotificationStub(currentAlert),
        documentKind,
        {
          title: documentTitle,
          typeLabel,
          userId: user?.id,
          userEmail: user?.email,
          userName: user?.email ?? "Utilisateur",
        },
      );
      toast.success(t("notifications.actions.documentCreated"));
      dismissCurrent();
      void navigate({
        to: "/reports-messages/$roleCategory/$documentId",
        params: { roleCategory, documentId },
      });
    } catch {
      toast.error(t("notifications.actions.documentError"));
    } finally {
      setCreatingKind(null);
    }
  }

  function handleViewExclusion() {
    dismissCurrent();
    void navigate({ to: "/exclusions" });
  }

  function handleClose() {
    dismissCurrent();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
    >
      <DialogContent
        className="max-w-md gap-5 sm:max-w-lg"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-[#0F172A]">
            {t("notifications.reminderAlert.title")}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line pt-1 text-left text-[13px] leading-relaxed text-[#334155]">
            {message}
            {"\n\n"}
            {t("notifications.reminderAlert.footer")}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            className="w-full justify-start"
            disabled={creatingKind !== null}
            onClick={() => void handleCreateDocument("report")}
          >
            <FileText className="mr-2 h-4 w-4" />
            {creatingKind === "report"
              ? t("notifications.actions.creatingDocument")
              : t("notifications.reminderAlert.createReport")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-start"
            disabled={creatingKind !== null}
            onClick={() => void handleCreateDocument("message")}
          >
            <Mail className="mr-2 h-4 w-4" />
            {creatingKind === "message"
              ? t("notifications.actions.creatingDocument")
              : t("notifications.reminderAlert.createMessage")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            disabled={creatingKind !== null}
            onClick={handleViewExclusion}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("notifications.reminderAlert.viewExclusion")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={creatingKind !== null}
            onClick={handleClose}
          >
            {t("notifications.reminderAlert.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
