import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { db } from "@/integrations/database/client";
import {
  AGENT_HISTORY_EVENT_TYPES,
  agentHistoryEventTypeI18nKey,
  createAgentHistoryEntry,
  createEmptyAgentHistoryForm,
  toAgentHistoryForm,
  updateAgentHistoryEntry,
  validateAgentHistoryForm,
  type AgentAdministrativeHistoryRow,
  type AgentHistoryFormErrors,
  type AgentHistoryFormValues,
} from "@/lib/agent-history";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AgentHistoryDialogProps = {
  agentId: string;
  entry: AgentAdministrativeHistoryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AgentHistoryDialog({
  agentId,
  entry,
  open,
  onOpenChange,
}: AgentHistoryDialogProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AgentHistoryFormValues>(createEmptyAgentHistoryForm);
  const [errors, setErrors] = useState<AgentHistoryFormErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(entry ? toAgentHistoryForm(entry) : createEmptyAgentHistoryForm());
    setErrors({});
  }, [open, entry]);

  const saveMutation = useMutation({
    mutationFn: async (values: AgentHistoryFormValues) => {
      const input = {
        ...values,
        agent_id: agentId,
        created_by: entry?.created_by ?? user?.email ?? null,
      };
      if (entry) {
        await updateAgentHistoryEntry(db, entry.id, input);
      } else {
        await createAgentHistoryEntry(db, input);
      }
    },
    onSuccess: async () => {
      toast.success(
        entry
          ? t("agentDetails.adminHistory.toast.updated")
          : t("agentDetails.adminHistory.toast.created"),
      );
      await queryClient.invalidateQueries({ queryKey: ["agent-details", agentId] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSubmit = () => {
    const nextErrors = validateAgentHistoryForm(form, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    saveMutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {entry
              ? t("agentDetails.adminHistory.dialog.editTitle")
              : t("agentDetails.adminHistory.dialog.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("agentDetails.adminHistory.dialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field
            label={t("agentDetails.adminHistory.field.type")}
            error={errors.event_type}
          >
            <Select
              value={form.event_type}
              onValueChange={(value) =>
                setForm({ ...form, event_type: value as AgentHistoryFormValues["event_type"] })
              }
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_HISTORY_EVENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(agentHistoryEventTypeI18nKey(type))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("agentDetails.adminHistory.field.startDate")}
              error={errors.start_date}
              htmlFor="agent-history-start"
            >
              <Input
                id="agent-history-start"
                type="date"
                className="h-10"
                value={form.start_date}
                onChange={(event) => setForm({ ...form, start_date: event.target.value })}
              />
            </Field>
            <Field
              label={t("agentDetails.adminHistory.field.endDate")}
              error={errors.end_date}
              htmlFor="agent-history-end"
            >
              <Input
                id="agent-history-end"
                type="date"
                className="h-10"
                min={form.start_date || undefined}
                value={form.end_date}
                onChange={(event) => setForm({ ...form, end_date: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("agentDetails.adminHistory.field.reason")}
              htmlFor="agent-history-reason"
            >
              <Input
                id="agent-history-reason"
                className="h-10"
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
              />
            </Field>
            <Field
              label={t("agentDetails.adminHistory.field.reference")}
              htmlFor="agent-history-reference"
            >
              <Input
                id="agent-history-reference"
                className="h-10"
                value={form.reference}
                onChange={(event) => setForm({ ...form, reference: event.target.value })}
              />
            </Field>
          </div>

          <Field
            label={t("agentDetails.adminHistory.field.observation")}
            htmlFor="agent-history-observation"
          >
            <Textarea
              id="agent-history-observation"
              rows={3}
              value={form.observation}
              onChange={(event) => setForm({ ...form, observation: event.target.value })}
            />
          </Field>

          <p className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {t("agentDetails.adminHistory.dialog.hint")}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saveMutation.isPending}>
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
