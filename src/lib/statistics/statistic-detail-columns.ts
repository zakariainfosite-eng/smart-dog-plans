import type { TFunction } from "i18next";

import { exclusionTypeI18nKey } from "@/lib/agent-exclusions";
import type { AgentAvailability } from "@/lib/agent-ui";
import { dash, formatStatisticDate, type StatisticTableColumn } from "@/lib/statistics/statistic-details";

export function personnelStatisticColumns(t: TFunction): StatisticTableColumn[] {
  return [
    { id: "firstName", header: t("statisticDetails.columns.firstName") },
    { id: "lastName", header: t("statisticDetails.columns.lastName") },
    { id: "fonction", header: t("statisticDetails.columns.fonction") },
    { id: "specialty", header: t("statisticDetails.columns.specialty") },
    { id: "status", header: t("statisticDetails.columns.status") },
    { id: "section", header: t("statisticDetails.columns.section") },
    { id: "dogName", header: t("statisticDetails.columns.dogName") },
  ];
}

export function dogStatisticColumns(t: TFunction): StatisticTableColumn[] {
  return [
    { id: "dogName", header: t("statisticDetails.columns.dogName") },
    { id: "handler", header: t("statisticDetails.columns.handler") },
    { id: "specialty", header: t("statisticDetails.columns.specialty") },
    { id: "status", header: t("statisticDetails.columns.status") },
    { id: "exclusionType", header: t("statisticDetails.columns.exclusionType") },
  ];
}

export function exclusionStatisticColumns(t: TFunction): StatisticTableColumn[] {
  return [
    { id: "firstName", header: t("statisticDetails.columns.firstName") },
    { id: "lastName", header: t("statisticDetails.columns.lastName") },
    { id: "dogName", header: t("statisticDetails.columns.dogName") },
    { id: "exclusionType", header: t("statisticDetails.columns.exclusionType") },
    { id: "specialty", header: t("statisticDetails.columns.specialty") },
    { id: "startDate", header: t("statisticDetails.columns.startDate") },
    { id: "endDate", header: t("statisticDetails.columns.endDate") },
    { id: "status", header: t("statisticDetails.columns.status") },
  ];
}

export function checkpointStatisticColumns(t: TFunction): StatisticTableColumn[] {
  return [
    { id: "checkpoint", header: t("statisticDetails.columns.checkpoint") },
    { id: "name", header: t("statisticDetails.columns.name") },
    { id: "type", header: t("statisticDetails.columns.type") },
    { id: "specialty", header: t("statisticDetails.columns.specialty") },
    { id: "status", header: t("statisticDetails.columns.status") },
    { id: "nightOnly", header: t("statisticDetails.columns.nightOnly") },
    { id: "required", header: t("statisticDetails.columns.required") },
  ];
}

export function planningTeamStatisticColumns(t: TFunction): StatisticTableColumn[] {
  return [
    { id: "firstName", header: t("statisticDetails.columns.firstName") },
    { id: "lastName", header: t("statisticDetails.columns.lastName") },
    { id: "dogName", header: t("statisticDetails.columns.dogName") },
    { id: "specialty", header: t("statisticDetails.columns.specialty") },
    { id: "status", header: t("statisticDetails.columns.status") },
  ];
}

export function caseStatisticColumns(t: TFunction): StatisticTableColumn[] {
  return [
    { id: "date", header: t("statisticDetails.columns.date") },
    { id: "caseNumber", header: t("statisticDetails.columns.caseNumber") },
    { id: "handler", header: t("statisticDetails.columns.handler") },
    { id: "dogName", header: t("statisticDetails.columns.dogName") },
    { id: "checkpoint", header: t("statisticDetails.columns.checkpoint") },
    { id: "specialty", header: t("statisticDetails.columns.specialty") },
    { id: "status", header: t("statisticDetails.columns.status") },
  ];
}

export function fonctionLabel(t: TFunction, fonction: string | null | undefined): string {
  if (!fonction) return "—";
  const key = `personnelFonction.${fonction}`;
  const label = t(key);
  return label === key ? fonction : label;
}

export function specialtyLabel(t: TFunction, specialty: string | null | undefined): string {
  if (!specialty) return "—";
  const key = `specialty.${specialty}`;
  const label = t(key);
  return label === key ? specialty : label;
}

export function exclusionTypeLabel(t: TFunction, type: string | null | undefined): string {
  if (!type) return "—";
  const key = exclusionTypeI18nKey(type);
  const label = t(key);
  return label === key ? type : label;
}

export function availabilityStatusLabel(t: TFunction, availability: AgentAvailability): string {
  if (availability.status === "available") return t("employees.operationalStatus.available");
  return exclusionTypeLabel(t, availability.exclusionType);
}

export function formatPersonName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return dash([firstName, lastName].filter(Boolean).join(" "));
}

export { dash, formatStatisticDate };
