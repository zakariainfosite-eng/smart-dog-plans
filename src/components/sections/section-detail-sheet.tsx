import { useMemo, type ReactNode } from "react";
import { ArrowLeft, Moon, Sun, UserCog, Users } from "lucide-react";

import type { AgentRow, SectionWithAgentCount } from "@/integrations/database";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import {
  isActiveCynotechnicien,
  personnelStatusLabel,
} from "@/lib/section-assignments";
import { normalizePersonnelFonction } from "@/lib/personnel-fonction";
import {
  compareSectionMemberNames,
  computeSectionOperationalStats,
  listSectionAvailableMembers,
  listSectionMembers,
  listSectionSpecialtyMembers,
  SECTION_EXCLUSION_DISPLAY_TYPES,
  groupSectionExclusionTypesByLabel,
  sumSectionExclusionBreakdown,
} from "@/lib/section-operational-stats";
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
  shiftHoursLabel: string;
  onManageAssignments: () => void;
};

function DetailFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 text-sm font-semibold text-foreground">{children}</div>
    </div>
  );
}

export function SectionDetailSheet({
  section,
  open,
  onOpenChange,
  agents,
  exclusions,
  referenceISO,
  shiftHoursLabel,
  onManageAssignments,
}: SectionDetailSheetProps) {
  const { t, locale } = useI18n();

  const members = useMemo(() => {
    if (!section) return [];
    return [...listSectionMembers(section.id, agents)].sort(compareSectionMemberNames);
  }, [agents, section]);

  const availableMembers = useMemo(() => {
    if (!section) return [];
    return listSectionAvailableMembers(section.id, agents, exclusions, referenceISO);
  }, [agents, exclusions, referenceISO, section]);

  const stats = useMemo(() => {
    if (!section) return null;
    return computeSectionOperationalStats(section.id, agents, exclusions, referenceISO);
  }, [agents, exclusions, referenceISO, section]);

  const currencyMembers = useMemo(() => {
    if (!section) return [];
    return listSectionSpecialtyMembers(section.id, agents, "currency");
  }, [agents, section]);

  const exclusionGroups = useMemo(
    () =>
      groupSectionExclusionTypesByLabel(SECTION_EXCLUSION_DISPLAY_TYPES, (type) =>
        t(`exclusions.type.${type}`),
      ),
    [t, locale],
  );

  const assignedCount = members.length;
  const availableCount = availableMembers.length;
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
                {section
                  ? t("sections.detail.namedTitle", { name: section.name })
                  : t("sections.detail.title")}
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
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {section ? (
            <div className="space-y-6">
              <section className="space-y-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#023A84]/70">
                  {t("sections.detail.sectionInfo")}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailFact label={t("sections.field.sectionName")}>{section.name}</DetailFact>
                  <DetailFact label={t("common.status")}>
                    <StatusBadge tone={section.active ? "success" : "neutral"}>
                      {section.active ? t("common.active") : t("common.inactive")}
                    </StatusBadge>
                  </DetailFact>
                  <DetailFact label={t("sections.field.shiftType")}>
                    <div className="flex items-center gap-2">
                      {isDay ? (
                        <Sun className="h-4 w-4 text-amber-600" />
                      ) : (
                        <Moon className="h-4 w-4 text-indigo-600" />
                      )}
                      <StatusBadge tone={isDay ? "warning" : "primary"}>
                        {isDay ? t("shift.day") : t("shift.night")}
                      </StatusBadge>
                    </div>
                  </DetailFact>
                  <DetailFact label={t("sections.detail.hours")}>{shiftHoursLabel}</DetailFact>
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 sm:col-span-2">
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
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#023A84]/70">
                  {t("sections.detail.personnelHeading")}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
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
                      {t("sections.stat.available")}
                    </div>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{availableCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 sm:col-span-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("sections.detail.activeCynotechniciens")}
                    </div>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{activeCynoCount}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#023A84]/70">
                  {t("sections.detail.dogsHeading")}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailFact label={t("sections.stat.narcotics")}>
                    <p className="text-xs font-normal text-muted-foreground">
                      {t("sections.stat.total")} :{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {stats?.narcoticsTotal ?? 0}
                      </span>
                    </p>
                    <p className="text-xs font-normal text-muted-foreground">
                      {t("sections.stat.operational")} :{" "}
                      <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {stats?.narcotics ?? 0}
                      </span>
                    </p>
                  </DetailFact>
                  <DetailFact label={t("sections.stat.explosives")}>
                    <p className="text-xs font-normal text-muted-foreground">
                      {t("sections.stat.total")} :{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {stats?.explosivesTotal ?? 0}
                      </span>
                    </p>
                    <p className="text-xs font-normal text-muted-foreground">
                      {t("sections.stat.operational")} :{" "}
                      <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {stats?.explosives ?? 0}
                      </span>
                    </p>
                  </DetailFact>
                  {currencyMembers.length > 0 ? (
                    <DetailFact label={t("specialty.currency")}>
                      <span className="tabular-nums">{currencyMembers.length}</span>
                    </DetailFact>
                  ) : null}
                </div>
              </section>

              {stats ? (
                <section className="space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#023A84]/70">
                    {t("sections.stat.exclusionsDetail")}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-[#023A84]/10 bg-[#023A84]/[0.02] px-3 py-2.5">
                    {exclusionGroups.map((group) => (
                      <div key={group.key} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="truncate text-muted-foreground">{group.label}</span>
                        <span className="tabular-nums font-semibold">
                          {sumSectionExclusionBreakdown(stats.byReason, group.types)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#023A84]/70">
                    {t("sections.detail.assignmentsHeading")}
                  </h3>
                  <Button type="button" size="sm" className="w-full sm:w-auto" onClick={onManageAssignments}>
                    {t("sections.detail.manageAssignments")}
                  </Button>
                </div>
                <p className="text-sm font-medium text-foreground">
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
              </section>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
