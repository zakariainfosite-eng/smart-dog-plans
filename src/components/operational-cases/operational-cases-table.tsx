import { useMemo, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  Eye,
  FileText,
  MapPin,
  MoreVertical,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";

import { AgentAvatar } from "@/components/agents/agent-avatar";
import { DogAvatar } from "@/components/dogs/dog-avatar";
import { EnterpriseDataTable } from "@/components/enterprise/data-table";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/use-i18n";
import { checkpointLabel, type OperationalCaseWithRelations } from "@/lib/operational-case-api";
import {
  caseDisplayStatus,
  caseObjectLabel,
  caseQuantityDisplay,
  caseSpecialtyBadgeTone,
  caseSpecialtyLabel,
  caseStatusLabel,
  caseStatusTone,
} from "@/lib/operational-cases";

type OperationalCasesTableProps = {
  data: OperationalCaseWithRelations[];
  loading?: boolean;
  emptyState?: ReactNode;
  onRowClick?: (row: OperationalCaseWithRelations) => void;
  onView: (row: OperationalCaseWithRelations) => void;
  onEdit: (row: OperationalCaseWithRelations) => void;
  onDelete: (row: OperationalCaseWithRelations) => void;
  onPrint: (row: OperationalCaseWithRelations) => void;
};

export function OperationalCasesTable({
  data,
  loading,
  emptyState,
  onRowClick,
  onView,
  onEdit,
  onDelete,
  onPrint,
}: OperationalCasesTableProps) {
  const { t } = useI18n();

  const columns = useMemo<ColumnDef<OperationalCaseWithRelations>[]>(
    () => [
      {
        id: "date",
        header: () => (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 opacity-60" />
            {t("operationalCases.table.date")}
          </span>
        ),
        meta: { width: "8%" },
        cell: ({ row }) => {
          const d = format(parseISO(row.original.case_date), "dd/MM/yyyy");
          return (
            <div className="min-w-0">
              <p className="text-sm font-medium tabular-nums">{d}</p>
              <p className="text-[10px] text-muted-foreground">{format(parseISO(row.original.case_date), "yyyy")}</p>
            </div>
          );
        },
      },
      {
        id: "caseNumber",
        header: () => (
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 opacity-60" />
            {t("operationalCases.table.caseNumber")}
          </span>
        ),
        meta: { width: "9%" },
        cell: ({ row }) => (
          <span className="truncate font-mono text-xs font-semibold tracking-tight text-foreground">
            {row.original.case_number}
          </span>
        ),
      },
      {
        id: "agent",
        header: t("operationalCases.table.agent"),
        meta: { width: "14%" },
        cell: ({ row }) => {
          const agent = row.original.agent;
          if (!agent) return <span className="text-sm text-muted-foreground">—</span>;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <AgentAvatar
                firstName={agent.first_name}
                lastName={agent.last_name}
                photoUrl={agent.photo_url}
                className="h-9 w-9 shrink-0"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">
                  {agent.first_name} {agent.last_name}
                </p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{agent.professional_number}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: "dog",
        header: t("operationalCases.table.dog"),
        meta: { width: "10%" },
        cell: ({ row }) => {
          const dog = row.original.dog;
          if (!dog) return <span className="text-sm text-muted-foreground">—</span>;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <DogAvatar
                name={dog.name}
                photoUrl={dog.photo_url}
                specialty={dog.specialty ?? undefined}
                className="h-8 w-8 shrink-0"
              />
              <span className="truncate text-sm font-medium">{dog.name}</span>
            </div>
          );
        },
      },
      {
        id: "checkpoint",
        header: t("operationalCases.table.checkpoint"),
        meta: { width: "10%" },
        cell: ({ row }) => {
          const label = checkpointLabel(row.original);
          return (
            <StatusBadge tone="neutral" className="max-w-full gap-1 px-2 py-0.5 text-[10px]">
              <MapPin className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate">{label}</span>
            </StatusBadge>
          );
        },
      },
      {
        id: "specialty",
        header: t("operationalCases.table.specialty"),
        meta: { width: "10%" },
        cell: ({ row }) => (
          <StatusBadge
            tone={caseSpecialtyBadgeTone(row.original.specialty)}
            className="max-w-full truncate px-2 py-0.5 text-[10px]"
          >
            {caseSpecialtyLabel(row.original.specialty, t)}
          </StatusBadge>
        ),
      },
      {
        id: "seizure",
        header: t("operationalCases.table.seizureType"),
        meta: { width: "11%" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("operationalCases.table.objectLabel")}
            </p>
            <p className="truncate text-sm font-medium">{caseObjectLabel(row.original, t)}</p>
          </div>
        ),
      },
      {
        id: "quantity",
        header: t("operationalCases.table.quantity"),
        meta: { width: "11%" },
        cell: ({ row }) => {
          const { quantity, threat } = caseQuantityDisplay(row.original, t);
          return (
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-sm font-semibold tabular-nums">{quantity}</p>
              {threat ? (
                <p className="truncate text-[10px] text-muted-foreground">
                  {row.original.specialty === "explosives"
                    ? `${t("operationalCases.table.threatLabel")}: ${threat}`
                    : threat}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "status",
        header: t("common.status"),
        meta: { width: "9%" },
        cell: ({ row }) => {
          const status = caseDisplayStatus(row.original);
          return (
            <StatusBadge tone={caseStatusTone(status)} className="px-2 py-0.5 text-[10px]">
              {caseStatusLabel(status, t)}
            </StatusBadge>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{t("common.actions")}</span>,
        meta: { width: "52px", sticky: "right", align: "center" },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
                aria-label={t("operationalCases.action.menu")}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onView(row.original);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                {t("operationalCases.action.viewShort")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(row.original);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t("action.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onPrint(row.original);
                }}
              >
                <Printer className="mr-2 h-4 w-4" />
                {t("operationalCases.action.print")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(row.original);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("action.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [t, onView, onEdit, onDelete, onPrint],
  );

  if (!loading && data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <EnterpriseDataTable
      columns={columns}
      data={data}
      layout="fixed"
      density="comfortable"
      variant="card"
      zebraStriping
      responsiveScroll
      onRowClick={onRowClick ? (row) => onRowClick(row.original) : undefined}
      emptyState={emptyState}
    />
  );
}
