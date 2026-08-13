import { format, parseISO } from "date-fns";
import { FileText } from "lucide-react";
import type { RoleDocumentRow } from "@/lib/reports-messages/types";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReportHistoryPanelProps = {
  documents: RoleDocumentRow[];
  emptyLabel: string;
  onOpen: (document: RoleDocumentRow) => void;
  templateTitle: (templateId: string) => string;
  t: (key: string) => string;
  className?: string;
};

export function ReportHistoryPanel({
  documents,
  emptyLabel,
  onOpen,
  templateTitle,
  t,
  className,
}: ReportHistoryPanelProps) {
  if (documents.length === 0) {
    return (
      <p
        className={cn(
          "rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {documents.map((document) => (
        <li
          key={document.id}
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#023A84]/10 text-[#023A84]">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{document.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {templateTitle(document.template_id)}
              {document.reference_number ? ` · ${document.reference_number}` : ""}
              {" · "}
              {format(parseISO(document.updated_at), "dd/MM/yyyy HH:mm")}
            </p>
          </div>
          <StatusBadge tone={document.status === "finalized" ? "success" : "warning"}>
            {t(`reportsMessages.status.${document.status}`)}
          </StatusBadge>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpen(document)}>
            {t("reportsMessages.actions.open")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
