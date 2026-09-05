import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Eye,
  FileText,
  Mail,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageTitle } from "@/components/layout/PageTitle";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageContentShell, PageTableShell } from "@/components/enterprise/page-layout";
import { DataTableShell } from "@/components/enterprise/data-table-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/hooks/use-i18n";
import { db } from "@/integrations/database/client";
import { ORGANIZATION_SETTINGS_QUERY_KEY, fetchOrganizationSettings } from "@/lib/organization-settings";
import { shouldAnnounceBrowserPdfExport } from "@/lib/documents/export-binary";
import { exportRapportMessageDocx, exportRapportMessagePdf, rapportMessageExportLabels } from "@/lib/rapport-message/export";
import { formatRapportMessageDate } from "@/lib/rapport-message/format";
import { canAccessRapportMessagePage } from "@/lib/rapport-message/permissions";
import { buildRapportMessagePreviewHtml, printRapportMessage } from "@/lib/rapport-message/preview";
import {
  createEmptyDraft,
  deleteRapportMessage,
  fetchRapportMessages,
  saveRapportMessage,
  validateRapportMessageDraft,
} from "@/lib/rapport-message/store";
import { RAPPORT_MESSAGE_QUERY_KEY } from "@/lib/rapport-message/types";
import type { RapportMessage, RapportMessageDraft } from "@/lib/rapport-message/types";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function RapportMessagePage() {
  const { t } = useI18n();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const allowed = canAccessRapportMessagePage(role);

  const [draft, setDraft] = useState<RapportMessageDraft>(() => createEmptyDraft(user));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId && user && !draft.sender) {
      setDraft(createEmptyDraft(user));
    }
  }, [user, editingId, draft.sender]);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: [...RAPPORT_MESSAGE_QUERY_KEY, user?.id, role],
    queryFn: () => fetchRapportMessages(db, user),
    enabled: allowed && Boolean(user),
  });

  const { data: organization } = useQuery({
    queryKey: ORGANIZATION_SETTINGS_QUERY_KEY,
    queryFn: () => fetchOrganizationSettings(db),
    enabled: allowed,
  });

  const labels = useMemo(
    () => rapportMessageExportLabels(t, organization?.unitName || organization?.serviceName),
    [t, organization?.unitName, organization?.serviceName],
  );

  const previewHtml = useMemo(
    () => buildRapportMessagePreviewHtml(draft, labels),
    [draft, labels],
  );

  const saveMutation = useMutation({
    mutationFn: () => saveRapportMessage(db, draft, user, editingId),
    onSuccess: (saved) => {
      setEditingId(saved.id);
      setDraft({
        title: saved.title,
        date: saved.date,
        recipient: saved.recipient,
        sender: saved.sender,
        reference: saved.reference,
        body: saved.body,
        signature: saved.signature,
      });
      void queryClient.invalidateQueries({ queryKey: RAPPORT_MESSAGE_QUERY_KEY });
      toast.success(t("rapportMessage.toasts.saved"));
    },
    onError: (error: Error) => {
      const field = error.message;
      const fieldKey = `rapportMessage.errors.${field}`;
      const translated = t(fieldKey);
      toast.error(translated === fieldKey ? t("rapportMessage.toasts.saveError") : translated);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRapportMessage(db, id, user),
    onSuccess: (_, id) => {
      if (editingId === id) {
        setEditingId(null);
        setDraft(createEmptyDraft(user));
      }
      setDeleteId(null);
      void queryClient.invalidateQueries({ queryKey: RAPPORT_MESSAGE_QUERY_KEY });
      toast.success(t("rapportMessage.toasts.deleted"));
    },
    onError: () => toast.error(t("rapportMessage.toasts.deleteError")),
  });

  const patch = (key: keyof RapportMessageDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const loadDocument = (document: RapportMessage) => {
    setEditingId(document.id);
    setDraft({
      title: document.title,
      date: document.date,
      recipient: document.recipient,
      sender: document.sender,
      reference: document.reference,
      body: document.body,
      signature: document.signature,
    });
  };

  const handleNew = () => {
    setEditingId(null);
    setDraft(createEmptyDraft(user));
  };

  const handleSave = () => {
    const invalid = validateRapportMessageDraft(draft);
    if (invalid) {
      toast.error(t(`rapportMessage.errors.${invalid}`));
      return;
    }
    saveMutation.mutate();
  };

  const handleExportDocx = async (source: RapportMessageDraft) => {
    const invalid = validateRapportMessageDraft(source);
    if (invalid) {
      toast.error(t(`rapportMessage.errors.${invalid}`));
      return;
    }
    try {
      const result = await exportRapportMessageDocx(source, t);
      if (!result.canceled) toast.success(t("rapportMessage.toasts.docxExported"));
    } catch {
      toast.error(t("rapportMessage.toasts.docxError"));
    }
  };

  const handleExportPdf = async () => {
    const invalid = validateRapportMessageDraft(draft);
    if (invalid) {
      toast.error(t(`rapportMessage.errors.${invalid}`));
      return;
    }
    try {
      await exportRapportMessagePdf(draft, t);
      if (shouldAnnounceBrowserPdfExport()) {
        toast.success(t("rapportMessage.toasts.pdfExported"));
      }
    } catch {
      toast.error(t("rapportMessage.toasts.pdfError"));
    }
  };

  if (!allowed) {
    return (
      <EmptyState
        icon={Mail}
        title={t("rapportMessage.forbidden.title")}
        description={t("rapportMessage.forbidden.description")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        icon={Mail}
        title={t("rapportMessage.title")}
        description={t("rapportMessage.description")}
        breadcrumb={[{ label: t("auth.brandName") }, { label: t("nav.rapportMessage") }]}
        actions={
          <Button onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("rapportMessage.actions.new")}
          </Button>
        }
      />

      <PageContentShell>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="rm-title" label={t("rapportMessage.fields.title")}>
            <Input
              id="rm-title"
              value={draft.title}
              onChange={(event) => patch("title", event.target.value)}
              placeholder={t("rapportMessage.placeholders.title")}
            />
          </Field>
          <Field id="rm-date" label={t("rapportMessage.fields.date")}>
            <Input
              id="rm-date"
              type="date"
              value={draft.date}
              onChange={(event) => patch("date", event.target.value)}
            />
          </Field>
          <Field id="rm-recipient" label={t("rapportMessage.fields.recipient")}>
            <Input
              id="rm-recipient"
              value={draft.recipient}
              onChange={(event) => patch("recipient", event.target.value)}
              placeholder={t("rapportMessage.placeholders.recipient")}
            />
          </Field>
          <Field id="rm-sender" label={t("rapportMessage.fields.sender")}>
            <Input
              id="rm-sender"
              value={draft.sender}
              onChange={(event) => patch("sender", event.target.value)}
              placeholder={t("rapportMessage.placeholders.sender")}
            />
          </Field>
          <Field
            id="rm-reference"
            label={t("rapportMessage.fields.reference")}
            hint={t("rapportMessage.fields.referenceHint")}
          >
            <Input
              id="rm-reference"
              value={draft.reference}
              onChange={(event) => patch("reference", event.target.value)}
              placeholder={t("rapportMessage.placeholders.reference")}
            />
          </Field>
          <Field id="rm-signature" label={t("rapportMessage.fields.signature")}>
            <Input
              id="rm-signature"
              value={draft.signature}
              onChange={(event) => patch("signature", event.target.value)}
              placeholder={t("rapportMessage.placeholders.signature")}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field id="rm-body" label={t("rapportMessage.fields.body")} hint={t("rapportMessage.fields.bodyHint")}>
            <Textarea
              id="rm-body"
              value={draft.body}
              onChange={(event) => patch("body", event.target.value)}
              placeholder={t("rapportMessage.placeholders.body")}
              className="min-h-[240px] resize-y text-base leading-relaxed md:text-[15px]"
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {editingId ? t("rapportMessage.actions.saveChanges") : t("rapportMessage.actions.save")}
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-2">
            <Eye className="h-4 w-4" />
            {t("rapportMessage.actions.preview")}
          </Button>
          <Button
            variant="outline"
            onClick={() => printRapportMessage(draft, labels)}
            className="gap-2"
          >
            <Printer className="h-4 w-4" />
            {t("rapportMessage.actions.print")}
          </Button>
          <Button variant="outline" onClick={() => void handleExportPdf()} className="gap-2">
            <FileText className="h-4 w-4" />
            {t("rapportMessage.actions.exportPdf")}
          </Button>
          <Button variant="outline" onClick={() => void handleExportDocx(draft)} className="gap-2">
            <Download className="h-4 w-4" />
            {t("rapportMessage.actions.exportWord")}
          </Button>
          {editingId ? (
            <Button
              variant="destructive"
              onClick={() => setDeleteId(editingId)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {t("rapportMessage.actions.delete")}
            </Button>
          ) : null}
        </div>
      </PageContentShell>

      <PageTableShell
        header={
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t("rapportMessage.history.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("rapportMessage.history.description")}</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {t("rapportMessage.history.count", { count: documents.length })}
            </span>
          </div>
        }
      >
        <DataTableShell isLoading={isLoading}>
          {documents.length === 0 ? (
            <EmptyState
              compact
              icon={Mail}
              title={t("rapportMessage.history.emptyTitle")}
              description={t("rapportMessage.history.emptyDescription")}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">{t("rapportMessage.history.date")}</TableHead>
                    <TableHead>{t("rapportMessage.history.subject")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("rapportMessage.history.recipient")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("rapportMessage.history.author")}</TableHead>
                    <TableHead className="w-[220px] text-right">{t("rapportMessage.history.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((document) => (
                    <TableRow key={document.id} data-state={editingId === document.id ? "selected" : undefined}>
                      <TableCell>{formatRapportMessageDate(document.date)}</TableCell>
                      <TableCell className="font-medium">{document.title}</TableCell>
                      <TableCell className="hidden sm:table-cell">{document.recipient}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {document.createdByName || document.sender}
                      </TableCell>
                      <TableCell className="max-w-none overflow-visible">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => loadDocument(document)}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            {t("rapportMessage.actions.view")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => loadDocument(document)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            {t("rapportMessage.actions.edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => void handleExportDocx(document)}
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            {t("rapportMessage.actions.word")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-destructive"
                            onClick={() => setDeleteId(document.id)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            {t("rapportMessage.actions.delete")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DataTableShell>
      </PageTableShell>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-[min(940px,calc(100vw-1.5rem))] flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{t("rapportMessage.actions.preview")}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-[#e5e7eb]">
            <iframe
              title={t("rapportMessage.actions.preview")}
              className="h-[70vh] w-full border-0 bg-[#e5e7eb]"
              srcDoc={previewHtml}
            />
          </div>
          <DialogFooter className="gap-2 px-6 py-4 sm:justify-end">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button onClick={() => printRapportMessage(draft, labels)} className="gap-2">
              <Printer className="h-4 w-4" />
              {t("rapportMessage.actions.print")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rapportMessage.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("rapportMessage.delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteMutation.mutate(deleteId);
              }}
            >
              {t("action.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
