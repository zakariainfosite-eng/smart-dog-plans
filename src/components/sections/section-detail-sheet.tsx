import { useMemo } from "react";
import { ArrowLeft, Users, UserCog, Moon, Sun } from "lucide-react";

import type { AgentRow, SectionWithAgentCount } from "@/integrations/database";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import {
  isActiveCynotechnicien,
  personnelStatusLabel,
} from "@/lib/section-assignments";
import { normalizePersonnelFonction } from "@/lib/personnel-fonction";
import {
  resolveSectionCommanderDisplay,
  SECTION_COMMANDER_MANUAL_FILL_DOTS,
} from "@/lib/section-commander-display";
import { useI18n } from "@/hooks/use-i18n";
import { AgentAvatar } from "@/components/agents/agent-avatar";
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

type SectionDetailSheetProps = {
  section: SectionWithAgentCount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AgentRow[];
  exclusions: AgentExclusionRecord[];
  referenceISO: string;
  onManageAssignments: () => void;
};

export function SectionDetailSheet({
  section,
  open,
  onOpenChange,
  agents,
  exclusions,
  referenceISO,
  onManageAssignments,
}: SectionDetailSheetProps) {
  const { t } = useI18n();

  const members = useMemo(() => {
    if (!section) return [];
    return agents
      .filter((agent) => agent.section_id === section.id)
      .sort((a, b) => {
        const byLast = a.last_name.localeCompare(b.last_name);
        if (byLast !== 0) return byLast;
        return a.first_name.localeCompare(b.first_name);
      });
  }, [agents, section]);

  const assignedCount = members.length;
  const activeCynoCount = members.filter(isActiveCynotechnicien).length;
  const isDay = section?.shift_type === "day";

  const commanderDisplay = useMemo(() => {
    if (!section) return null;
    return resolveSectionCommanderDisplay({
      sectionId: section.id,
      agents,
      exclusions,
      fallback: {
        fullName: section.commander_full_name,
        grade: section.commander_grade,
        mle: section.commander_mle,
      },
    });
  }, [section, agents, exclusions]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none lg:w-1/2 lg:max-w-[50vw]"
      >
        <SheetHeader className="shrink-0 space-y-3 border-b border-border/60 px-6 py-5 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <SheetTitle className="truncate text-xl font-semibold tracking-tight">
                {section?.name ?? t("sections.detail.title")}
              </SheetTitle>
              <SheetDescription className="mt-1">
                {t("sections.detail.description")}
              </SheetDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => onOpenChange(false)}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {t("sections.detail.close")}
            </Button>
          </div>

          {section ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("sections.field.shiftType")}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  {isDay ? (
                    <Sun className="h-4 w-4 text-amber-600" />
                  ) : (
                    <Moon className="h-4 w-4 text-indigo-600" />
                  )}
                  <StatusBadge tone={isDay ? "warning" : "primary"}>
                    {isDay ? t("shift.day") : t("shift.night")}
                  </StatusBadge>
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {commanderDisplay?.mode === "adjoint_replacement"
                    ? t("sections.commander.adjointReplacement")
                    : t("sections.field.commanderFullName")}
                </p>
                {commanderDisplay?.needsManualFill ? (
                  <div className="mt-1.5 space-y-1">
                    <p className="truncate text-sm font-semibold tracking-widest text-muted-foreground">
                      {SECTION_COMMANDER_MANUAL_FILL_DOTS}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("sections.field.commanderGrade")} :{" "}
                      <span className="tracking-widest">{SECTION_COMMANDER_MANUAL_FILL_DOTS}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("sections.field.commanderMle")} :{" "}
                      <span className="tracking-widest">{SECTION_COMMANDER_MANUAL_FILL_DOTS}</span>
                    </p>
                  </div>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {commanderDisplay?.fullName.trim() ||
                        section.commander_full_name.trim() ||
                        "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("sections.field.commanderGrade")} :{" "}
                      <span className="font-medium text-foreground">
                        {commanderDisplay?.grade || "—"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("sections.field.commanderMle")} :{" "}
                      <span className="font-medium text-foreground">
                        {commanderDisplay?.mle || "—"}
                      </span>
                    </p>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {t("sections.detail.assignedPersonnel")}
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{assignedCount}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <UserCog className="h-3.5 w-3.5" />
                  {t("sections.detail.activeCynotechniciens")}
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{activeCynoCount}</p>
              </div>
            </div>
          ) : null}

          <Button type="button" className="w-full sm:w-auto" onClick={onManageAssignments}>
            {t("sections.detail.manageAssignments")}
          </Button>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-3 text-sm font-medium text-foreground">
            {t("sections.detail.personnelList")}
          </p>
          {members.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
              {t("sections.detail.emptyMembers")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table className="min-w-full table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">{t("sections.detail.photo")}</TableHead>
                    <TableHead className="whitespace-nowrap">{t("employees.field.firstName")}</TableHead>
                    <TableHead className="whitespace-nowrap">{t("employees.field.lastName")}</TableHead>
                    <TableHead>{t("employees.field.professionalNumber")}</TableHead>
                    <TableHead>{t("field.grade")}</TableHead>
                    <TableHead>{t("employees.field.fonction")}</TableHead>
                    <TableHead>{t("employees.field.assignedDog")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((agent) => {
                    const fonction = normalizePersonnelFonction(agent.fonction);
                    const status = personnelStatusLabel(
                      agent,
                      exclusions,
                      referenceISO,
                      t,
                    );
                    return (
                      <TableRow key={agent.id}>
                        <TableCell>
                          <AgentAvatar
                            firstName={agent.first_name}
                            lastName={agent.last_name}
                            photoUrl={agent.photo_url}
                            className="h-8 w-8"
                          />
                        </TableCell>
                        <TableCell className="max-w-none overflow-visible whitespace-nowrap font-medium">
                          {agent.first_name}
                        </TableCell>
                        <TableCell className="max-w-none overflow-visible whitespace-nowrap font-medium">
                          {agent.last_name}
                        </TableCell>
                        <TableCell className="max-w-none overflow-visible whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {agent.professional_number}
                        </TableCell>
                        <TableCell className="max-w-none overflow-visible whitespace-nowrap">
                          {agent.grade}
                        </TableCell>
                        <TableCell className="max-w-none overflow-visible whitespace-nowrap">
                          {t(`personnelFonction.${fonction}`)}
                        </TableCell>
                        <TableCell className="max-w-none overflow-visible whitespace-nowrap">
                          {agent.dogs?.name ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-none overflow-visible">
                          <StatusBadge
                            tone={
                              status === t("employees.operationalStatus.available")
                                ? "success"
                                : status === t("common.inactive")
                                  ? "neutral"
                                  : "warning"
                            }
                          >
                            {status}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
