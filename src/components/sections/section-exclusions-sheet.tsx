import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Ban } from "lucide-react";

import type { AgentRow } from "@/integrations/database";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import { getActiveExclusionsForSection } from "@/lib/section-operational-stats";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/enterprise/status-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SectionExclusionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionName: string | null;
  sectionId: string | null;
  agents: AgentRow[];
  exclusions: AgentExclusionRecord[];
  referenceISO: string;
};

export function SectionExclusionsSheet({
  open,
  onOpenChange,
  sectionName,
  sectionId,
  agents,
  exclusions,
  referenceISO,
}: SectionExclusionsSheetProps) {
  const { t } = useI18n();

  const rows = useMemo(() => {
    if (!sectionId) return [];
    const active = getActiveExclusionsForSection(
      sectionId,
      agents,
      exclusions,
      referenceISO,
    );
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));

    return active
      .map((exclusion) => {
        const agent = exclusion.agent_id ? agentById.get(exclusion.agent_id) : undefined;
        return { exclusion, agent };
      })
      .sort((a, b) => {
        const byStart = b.exclusion.start_date.localeCompare(a.exclusion.start_date);
        if (byStart !== 0) return byStart;
        const nameA = a.agent
          ? `${a.agent.last_name} ${a.agent.first_name}`
          : "";
        const nameB = b.agent
          ? `${b.agent.last_name} ${b.agent.first_name}`
          : "";
        return nameA.localeCompare(nameB);
      });
  }, [sectionId, agents, exclusions, referenceISO]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 space-y-2 border-b border-border/60 px-6 py-5 text-left">
          <SheetTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Ban className="h-5 w-5 text-destructive" />
            {t("sections.exclusionsSheet.title")}
          </SheetTitle>
          <SheetDescription>
            {sectionName
              ? t("sections.exclusionsSheet.description", { name: sectionName })
              : t("sections.exclusionsSheet.descriptionFallback")}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("sections.exclusionsSheet.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sections.exclusionsSheet.personnel")}</TableHead>
                  <TableHead>{t("sections.exclusionsSheet.type")}</TableHead>
                  <TableHead>{t("sections.exclusionsSheet.period")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ exclusion, agent }) => (
                  <TableRow key={`${exclusion.agent_id}-${exclusion.exclusion_type}-${exclusion.start_date}-${exclusion.end_date}`}>
                    <TableCell className="font-medium">
                      {agent
                        ? `${agent.first_name} ${agent.last_name}`
                        : t("dogs.sex.unspecified")}
                      {agent?.professional_number ? (
                        <p className="font-mono text-xs text-muted-foreground">
                          {agent.professional_number}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone="warning" className="text-[11px]">
                        {t(`exclusions.type.${exclusion.exclusion_type}`)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(parseISO(exclusion.start_date), "dd/MM/yyyy")}
                      {" → "}
                      {format(parseISO(exclusion.end_date), "dd/MM/yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="shrink-0 border-t border-border/60 px-6 py-4">
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            {t("sections.detail.close")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
