import { useMemo } from "react";

import type { AgentRow } from "@/integrations/database";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import { deriveDogOperationalStatus } from "@/lib/dog-operational-status";
import { personnelStatusLabel } from "@/lib/section-assignments";
import {
  compareSectionMemberNames,
  listSectionAvailableMembers,
  listSectionMembers,
  listSectionOperationalSpecialtyMembers,
  listSectionSpecialtyMembers,
  type SectionSpecialtyKind,
} from "@/lib/section-operational-stats";
import { useI18n } from "@/hooks/use-i18n";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { StatusBadge } from "@/components/enterprise/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SectionStatDialogKind = "assigned" | "available" | "narcotics" | "explosives";

type SectionStatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: SectionStatDialogKind | null;
  sectionName: string | null;
  sectionId: string | null;
  agents: AgentRow[];
  exclusions: AgentExclusionRecord[];
  referenceISO: string;
};

function specialtyI18nKey(specialty: string | null | undefined): string {
  const token = (specialty ?? "").trim().toLowerCase();
  if (token === "narcotics" || token === "stupéfiants" || token === "stupefiants") {
    return "specialty.narcotics";
  }
  if (token === "explosives" || token === "explosifs") {
    return "specialty.explosives";
  }
  if (token === "currency" || token === "devises" || token === "monnaie") {
    return "specialty.currency";
  }
  return "";
}

function dogStatusI18nKey(status: string | null | undefined): string {
  const token = (status ?? "").trim().toLowerCase();
  if (token === "available" || token === "sick" || token === "heat") {
    return `dogStatus.${token}`;
  }
  return "";
}

export function SectionStatDialog({
  open,
  onOpenChange,
  kind,
  sectionName,
  sectionId,
  agents,
  exclusions,
  referenceISO,
}: SectionStatDialogProps) {
  const { t } = useI18n();
  const name = sectionName?.trim() || t("sections.detail.title");

  const members = useMemo(() => {
    if (!sectionId || !kind) return [];
    const list =
      kind === "assigned"
        ? listSectionMembers(sectionId, agents)
        : kind === "available"
          ? listSectionAvailableMembers(sectionId, agents, exclusions, referenceISO)
          : listSectionSpecialtyMembers(
              sectionId,
              agents,
              kind as SectionSpecialtyKind,
            );
    return [...list].sort(compareSectionMemberNames);
  }, [agents, exclusions, kind, referenceISO, sectionId]);

  const operationalCount = useMemo(() => {
    if (!sectionId || (kind !== "narcotics" && kind !== "explosives")) return 0;
    return listSectionOperationalSpecialtyMembers(
      sectionId,
      agents,
      exclusions,
      kind,
      referenceISO,
    ).length;
  }, [agents, exclusions, kind, referenceISO, sectionId]);

  const title =
    kind === "assigned"
      ? t("sections.statDialog.assignedTitle", { name })
      : kind === "available"
        ? t("sections.statDialog.availableTitle", { name })
        : kind === "narcotics"
          ? t("sections.statDialog.narcoticsTitle", { name })
          : kind === "explosives"
            ? t("sections.statDialog.explosivesTitle", { name })
            : t("sections.detail.title");

  const summary =
    kind === "assigned"
      ? t("sections.statDialog.assignedCount", { count: members.length })
      : kind === "available"
        ? t("sections.statDialog.availableCount", { count: members.length })
        : t("sections.statDialog.specialtySummary", {
            total: members.length,
            operational: operationalCount,
          });

  const emptyLabel =
    kind === "available"
      ? t("sections.statDialog.emptyAvailable")
      : kind === "narcotics" || kind === "explosives"
        ? t("sections.statDialog.emptyDogs")
        : t("sections.detail.emptyMembers");

  const showDogFocus = kind === "narcotics" || kind === "explosives";

  return (
    <Dialog open={open && Boolean(kind && sectionId)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-1.25rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-2 border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="pr-8 text-base leading-snug sm:text-lg">{title}</DialogTitle>
          <DialogDescription asChild>
            {kind === "narcotics" || kind === "explosives" ? (
              <div className="space-y-1 text-sm font-medium text-foreground">
                <p>
                  {t("sections.stat.total")} :{" "}
                  <span className="tabular-nums">{members.length}</span>
                </p>
                <p>
                  {t("sections.stat.operational")} :{" "}
                  <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                    {operationalCount}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-sm font-medium text-foreground">{summary}</p>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {members.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((agent) => {
                const status = personnelStatusLabel(agent, exclusions, referenceISO, t);
                const dog = agent.dogs;
                const specialtyKey = specialtyI18nKey(dog?.specialty);
                const dogStatusKey = dogStatusI18nKey(dog?.status);
                const dogOperational = dog?.id
                  ? deriveDogOperationalStatus(dog.id, exclusions, referenceISO)
                  : null;
                const dogOperationalLabel = dogOperational
                  ? dogOperational.kind === "available"
                    ? t("employees.operationalStatus.available")
                    : t(`exclusions.type.${dogOperational.exclusionType}`)
                  : null;

                return (
                  <li
                    key={agent.id}
                    className="rounded-xl border border-[#023A84]/10 bg-[#023A84]/[0.02] px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <AgentAvatar
                        firstName={agent.first_name}
                        lastName={agent.last_name}
                        photoUrl={agent.photo_url}
                        className="mt-0.5 h-9 w-9 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-sm font-semibold text-[#0B1F3A] dark:text-foreground">
                            {showDogFocus && dog?.name
                              ? dog.name
                              : `${agent.last_name} ${agent.first_name}`.trim()}
                          </p>
                          <StatusBadge
                            tone={
                              status === t("employees.operationalStatus.available")
                                ? "success"
                                : status === t("common.inactive")
                                  ? "neutral"
                                  : "warning"
                            }
                            className="h-5 px-1.5 text-[10px]"
                          >
                            {status}
                          </StatusBadge>
                        </div>
                        {showDogFocus ? (
                          <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {t("sections.statDialog.handler", {
                              name: `${agent.last_name} ${agent.first_name}`.trim(),
                            })}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                          <span className="font-medium text-foreground/80">{agent.grade}</span>
                          <span className="mx-1.5 text-[#023A84]/30">·</span>
                          <span className="font-mono tabular-nums">{agent.professional_number}</span>
                        </p>
                        {dog?.name && !showDogFocus ? (
                          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                            {dog.name}
                            {specialtyKey ? ` · ${t(specialtyKey)}` : null}
                          </p>
                        ) : null}
                        {showDogFocus ? (
                          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                            {specialtyKey ? t(specialtyKey) : t("sections.stat.total")}
                            {dogStatusKey ? ` · ${t(dogStatusKey)}` : null}
                            {dogOperationalLabel ? ` · ${dogOperationalLabel}` : null}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 px-5 py-3">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            {t("sections.detail.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
