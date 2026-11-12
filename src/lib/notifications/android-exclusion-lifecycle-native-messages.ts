import { format, parseISO } from "date-fns";

import type { ExclusionLifecycleRow } from "@/lib/notifications/exclusion-lifecycle-events";
import { exclusionApplyTarget } from "@/lib/agent-exclusions";
import type { ExclusionNotificationSubjectKind } from "@/lib/notifications/exclusion-return-types";
import type { NativeLifecycleMilestoneKind } from "@/lib/notifications/android-exclusion-local-notifications";

function formatFrDay(iso: string): string {
  try {
    return format(parseISO(iso.slice(0, 10)), "dd/MM/yyyy");
  } catch {
    return iso.slice(0, 10);
  }
}

function subjectKindForRow(row: ExclusionLifecycleRow): ExclusionNotificationSubjectKind {
  return exclusionApplyTarget(row.exclusion_type, row.dog_id) === "dog" ? "dog" : "personnel";
}

const TYPE_LABELS: Record<string, string> = {
  annual_leave: "Congé",
  sickness: "Maladie",
  dog_sick: "Maladie (chien)",
  female_dog_heat: "Chaleurs",
};

function typeLabel(exclusionType: string): string {
  return TYPE_LABELS[exclusionType] ?? exclusionType;
}

export function buildAndroidLifecycleNativeTitleBody(
  row: ExclusionLifecycleRow,
  kind: NativeLifecycleMilestoneKind,
  subjectName: string,
): { title: string; body: string } {
  const subjectKind = subjectKindForRow(row);
  const name = subjectName.trim() || "—";
  const type = typeLabel(row.exclusion_type);
  const startFr = formatFrDay(row.start_date);

  if (kind === "start") {
    return subjectKind === "dog"
      ? {
          title: "Exclusion du chien commencée",
          body: `Le chien ${name} entre en ${type} le ${startFr}.`,
        }
      : {
          title: "Exclusion commencée",
          body: `${name} entre en ${type} le ${startFr}.`,
        };
  }

  if (kind === "d2") {
    return {
      title: "Retour prochainement",
      body:
        subjectKind === "dog"
          ? `L'exclusion du chien ${name} (${type}) se termine dans 2 jours.`
          : `Le congé de ${name} (${type}) se termine dans 2 jours.`,
    };
  }

  return subjectKind === "dog"
    ? {
        title: "Chien de nouveau disponible",
        body: `Le chien ${name} est de nouveau disponible pour le service.`,
      }
    : {
        title: "De nouveau disponible",
        body: `${name} est de nouveau disponible.`,
      };
}
