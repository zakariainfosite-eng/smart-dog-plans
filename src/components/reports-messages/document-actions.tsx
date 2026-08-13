import type { ReportTemplateDefinition, RoleDocumentRow } from "@/lib/reports-messages/types";
import { Button } from "@/components/ui/button";
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
import { useState } from "react";

type DocumentActionsProps = {
  document: RoleDocumentRow;
  canEdit: boolean;
  busy?: boolean;
  onPreview: () => void;
  onEdit?: () => void;
  onExportPdf: () => void;
  onPrint: () => void;
  onDuplicate: () => void;
  onFinalize?: () => void;
  onDelete?: () => void;
  t: (key: string) => string;
};

export function DocumentActions({
  document,
  canEdit,
  busy,
  onPreview,
  onEdit,
  onExportPdf,
  onPrint,
  onDuplicate,
  onFinalize,
  onDelete,
  t,
}: DocumentActionsProps) {
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onPreview}>
          {t("reportsMessages.actions.preview")}
        </Button>
        {canEdit && onEdit ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onEdit}>
            {t("reportsMessages.actions.edit")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onExportPdf}>
          {t("reportsMessages.actions.exportPdf")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onPrint}>
          {t("reportsMessages.actions.print")}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onDuplicate}>
          {t("reportsMessages.actions.duplicate")}
        </Button>
        {document.status === "draft" && onFinalize ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => setConfirmFinalize(true)}>
            {t("reportsMessages.actions.finalize")}
          </Button>
        ) : null}
        {document.status === "draft" && onDelete ? (
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
            {t("action.delete")}
          </Button>
        ) : null}
      </div>

      <AlertDialog open={confirmFinalize} onOpenChange={setConfirmFinalize}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reportsMessages.finalize.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("reportsMessages.finalize.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmFinalize(false);
                onFinalize?.();
              }}
            >
              {t("reportsMessages.actions.finalize")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type ReportPreviewProps = {
  document: RoleDocumentRow;
  template: ReportTemplateDefinition;
  agentLabel?: string | null;
  dogLabel?: string | null;
  sectionLabel?: string | null;
  t: (key: string) => string;
};

export function ReportPreview({
  document,
  template,
  agentLabel,
  dogLabel,
  sectionLabel,
  t,
}: ReportPreviewProps) {
  return (
    <article className="rounded-xl border border-border/60 bg-muted/15 p-5">
      <header className="border-b border-border/60 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#023A84]">CynoPlanning</p>
        <h2 className="mt-1 text-lg font-semibold">{document.title}</h2>
        {document.reference_number ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("reportsMessages.pdf.reference")} : {document.reference_number}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {t("reportsMessages.pdf.author")} : {document.created_by_name}
        </p>
      </header>
      <dl className="mt-4 space-y-3 text-sm">
        {agentLabel ? (
          <div>
            <dt className="font-medium text-muted-foreground">
              {t("reportsMessages.fields.agent")}
            </dt>
            <dd>{agentLabel}</dd>
          </div>
        ) : null}
        {dogLabel ? (
          <div>
            <dt className="font-medium text-muted-foreground">{t("reportsMessages.fields.dog")}</dt>
            <dd>{dogLabel}</dd>
          </div>
        ) : null}
        {sectionLabel ? (
          <div>
            <dt className="font-medium text-muted-foreground">
              {t("reportsMessages.fields.section")}
            </dt>
            <dd>{sectionLabel}</dd>
          </div>
        ) : null}
        {template.fields.map((field) => {
          if (field.type === "agent" || field.type === "dog" || field.type === "section")
            return null;
          const value = document.payload[field.id];
          if (!value?.trim()) return null;
          return (
            <div key={field.id}>
              <dt className="font-medium text-muted-foreground">
                {t(`reportsMessages.fields.${field.labelKey}`)}
              </dt>
              <dd className="whitespace-pre-wrap">{value}</dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}
