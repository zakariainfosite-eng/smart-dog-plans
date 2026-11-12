import { format, parseISO } from "date-fns";

import type { ExclusionNotificationSubjectKind } from "@/lib/notifications/exclusion-return-types";
import { daysUntilReturn } from "@/lib/notifications/exclusion-return-dates";

export const EXCLUSION_SAVED_TITLE = "⚠️ Nouvelle exclusion enregistrée";

export type SmartNativeMilestoneKind = "saved" | "daily" | "return-tomorrow" | "return-today";

function formatFrDay(iso: string): string {
  try {
    return format(parseISO(iso.slice(0, 10)), "dd/MM/yyyy");
  } catch {
    return iso.slice(0, 10);
  }
}

/** Confirmation immédiate après création. */
export function formatExclusionSavedConfirmationMessage(input: {
  subjectKind: ExclusionNotificationSubjectKind;
  subjectName: string;
  startDateISO: string;
  endDateISO: string | null;
}): string {
  const name = input.subjectName.trim() || "—";
  const start = formatFrDay(input.startDateISO);
  const end =
    input.endDateISO && input.endDateISO.trim()
      ? formatFrDay(input.endDateISO)
      : "fin non définie";
  return `${name} est indisponible du ${start} au ${end}.`;
}

export function formatExclusionDailyNotification(input: {
  subjectKind: ExclusionNotificationSubjectKind;
  subjectName: string;
  fireDayISO: string;
  returnDateISO: string;
}): { title: string; body: string } {
  const name = input.subjectName.trim() || "—";
  const days = daysUntilReturn(input.returnDateISO, input.fireDayISO);
  const count = Number.isFinite(days) ? Math.max(0, days) : 0;

  if (input.subjectKind === "dog") {
    const title = "🐕 Exclusion en cours";
  const body =
      count <= 0
        ? `${name} est toujours indisponible.\n⏳ Retour au service prévu aujourd'hui.`
        : count === 1
          ? `${name} est toujours indisponible.\n⏳ Il reste 1 jour avant son retour au service.`
          : `${name} est toujours indisponible.\n⏳ Il reste ${count} jours avant son retour au service.`;
    return { title, body };
  }

  const title = "👮 Exclusion en cours";
  const body =
    count <= 0
      ? `${name} est toujours indisponible.\n⏳ Reprise du travail prévue aujourd'hui.`
      : count === 1
        ? `${name} est toujours indisponible.\n⏳ Il reste 1 jour avant sa reprise du travail.`
        : `${name} est toujours indisponible.\n⏳ Il reste ${count} jours avant sa reprise du travail.`;
  return { title, body };
}

export function formatExclusionReturnTomorrowNotification(input: {
  subjectKind: ExclusionNotificationSubjectKind;
  subjectName: string;
}): { title: string; body: string } {
  const name = input.subjectName.trim() || "—";
  const title = "🟠 Retour demain";
  const body =
    input.subjectKind === "dog"
      ? `${name} sera de nouveau disponible demain.`
      : `${name} reprend le travail demain.`;
  return { title, body };
}

export function formatExclusionReturnTodayNotification(input: {
  subjectKind: ExclusionNotificationSubjectKind;
  subjectName: string;
}): { title: string; body: string } {
  const name = input.subjectName.trim() || "—";
  if (input.subjectKind === "dog") {
    return {
      title: "🟢 Retour au service",
      body: `${name} est de nouveau disponible pour le service aujourd'hui.`,
    };
  }
  return {
    title: "🟢 Retour au travail",
    body: `${name} peut reprendre le service aujourd'hui.`,
  };
}
