import { differenceInDays, parseISO } from "date-fns";
import type { TFunction } from "i18next";
import type { Database } from "@/integrations/database/schema-types";
import type { OperationalCaseWithRelations } from "@/lib/operational-case-api";
import { quantityToKg } from "@/lib/operational-case-stats";

type SeizureType = Database["public"]["Enums"]["seizure_type"];
type SeizureUnit = Database["public"]["Enums"]["seizure_unit"];
type ExplosiveObjectType = Database["public"]["Enums"]["explosive_object_type"];
type ThreatLevel = Database["public"]["Enums"]["threat_level"];
type OperationalCaseSpecialty = Database["public"]["Enums"]["operational_case_specialty"];

export function drugTypeLabel(type: SeizureType | null | undefined, t: TFunction): string {
  if (!type) return "—";
  const key = `operationalCases.drugType.${type}`;
  const legacy = `operationalCases.seizureType.${type}`;
  const translated = t(key);
  return translated !== key ? translated : t(legacy);
}

export function objectTypeLabel(type: ExplosiveObjectType, t: TFunction): string {
  return t(`operationalCases.objectType.${type}`);
}

export function threatLevelLabel(level: ThreatLevel, t: TFunction): string {
  return t(`operationalCases.threatLevel.${level}`);
}

export function seizureTypeLabel(type: SeizureType | null | undefined, t: TFunction): string {
  return drugTypeLabel(type, t);
}

export function seizureUnitLabel(unit: SeizureUnit | null | undefined, t: TFunction): string {
  if (!unit) return "—";
  return t(`operationalCases.unit.${unit}`);
}

export function caseSpecialtyLabel(specialty: OperationalCaseSpecialty, t: TFunction): string {
  return t(`operationalCases.specialty.${specialty}`);
}

export function currencyCodeLabel(code: string, t: TFunction): string {
  if (code === "other") return t("operationalCases.currency.other");
  return code;
}

export function formatCaseSummary(caseRow: OperationalCaseWithRelations, t: TFunction): string {
  if (caseRow.specialty === "narcotics" && caseRow.seizure_type && caseRow.quantity != null && caseRow.unit) {
    return `${drugTypeLabel(caseRow.seizure_type, t)} — ${caseRow.quantity} ${seizureUnitLabel(caseRow.unit, t)}`;
  }
  if (caseRow.specialty === "explosives" && caseRow.object_type && caseRow.object_count != null) {
    const threat = caseRow.threat_level ? ` (${threatLevelLabel(caseRow.threat_level, t)})` : "";
    return `${objectTypeLabel(caseRow.object_type, t)} — ${caseRow.object_count}${threat}`;
  }
  if (caseRow.specialty === "currency" && caseRow.currency_code && caseRow.total_amount != null) {
    return `${currencyCodeLabel(caseRow.currency_code, t)} — ${caseRow.total_amount} (${caseRow.banknote_count ?? 0} ${t("operationalCases.unit.banknotes")}, ${caseRow.country ?? ""})`;
  }
  return "—";
}

export function formatSeizureDetails(caseRow: OperationalCaseWithRelations, t: TFunction): string {
  if (caseRow.specialty === "narcotics" && caseRow.seizure_type) {
    return drugTypeLabel(caseRow.seizure_type, t);
  }
  if (caseRow.specialty === "explosives" && caseRow.object_type) {
    const threat = caseRow.threat_level ? ` (${threatLevelLabel(caseRow.threat_level, t)})` : "";
    return `${objectTypeLabel(caseRow.object_type, t)}${threat}`;
  }
  if (caseRow.specialty === "currency" && caseRow.currency_code && caseRow.total_amount != null) {
    return `${currencyCodeLabel(caseRow.currency_code, t)} — ${caseRow.total_amount} (${caseRow.banknote_count ?? 0} ${t("operationalCases.unit.banknotes")}${caseRow.country ? `, ${caseRow.country}` : ""})`;
  }
  return "—";
}

export function formatCaseQuantity(caseRow: OperationalCaseWithRelations, t: TFunction): string | null {
  if (caseRow.specialty === "narcotics" && caseRow.quantity != null && caseRow.unit) {
    return `${caseRow.quantity} ${seizureUnitLabel(caseRow.unit, t)}`;
  }
  if (caseRow.specialty === "explosives" && caseRow.object_count != null) {
    return String(caseRow.object_count);
  }
  return null;
}

export function caseSpecialtyBadgeTone(
  specialty: OperationalCaseSpecialty,
): "success" | "warning" | "danger" | "neutral" | "primary" | "purple" {
  switch (specialty) {
    case "narcotics":
      return "success";
    case "explosives":
      return "danger";
    case "currency":
      return "purple";
    default:
      return "primary";
  }
}

export type CaseDisplayStatus = "closed" | "in_progress" | "draft";

function isCaseIncomplete(caseRow: OperationalCaseWithRelations): boolean {
  if (caseRow.specialty === "narcotics") {
    return !caseRow.seizure_type || caseRow.quantity == null || !caseRow.unit;
  }
  if (caseRow.specialty === "explosives") {
    return !caseRow.object_type || caseRow.object_count == null;
  }
  if (caseRow.specialty === "currency") {
    return !caseRow.currency_code || caseRow.total_amount == null;
  }
  return false;
}

export function caseDisplayStatus(caseRow: OperationalCaseWithRelations): CaseDisplayStatus {
  if (isCaseIncomplete(caseRow)) return "draft";
  try {
    const days = differenceInDays(new Date(), parseISO(caseRow.case_date));
    if (days <= 14) return "in_progress";
  } catch {
    /* keep closed */
  }
  return "closed";
}

export function caseStatusLabel(status: CaseDisplayStatus, t: TFunction): string {
  return t(`operationalCases.caseStatus.${status}`);
}

export function caseStatusTone(status: CaseDisplayStatus): "success" | "warning" | "info" {
  switch (status) {
    case "closed":
      return "success";
    case "in_progress":
      return "warning";
    case "draft":
      return "info";
  }
}

export function caseObjectLabel(caseRow: OperationalCaseWithRelations, t: TFunction): string {
  if (caseRow.specialty === "narcotics" && caseRow.seizure_type) {
    return drugTypeLabel(caseRow.seizure_type, t);
  }
  if (caseRow.specialty === "explosives" && caseRow.object_type) {
    return objectTypeLabel(caseRow.object_type, t);
  }
  if (caseRow.specialty === "currency" && caseRow.currency_code) {
    return currencyCodeLabel(caseRow.currency_code, t);
  }
  return "—";
}

export type CaseQuantityDisplay = {
  quantity: string;
  threat: string | null;
};

export function caseQuantityDisplay(caseRow: OperationalCaseWithRelations, t: TFunction): CaseQuantityDisplay {
  if (caseRow.specialty === "narcotics" && caseRow.quantity != null && caseRow.unit) {
    return {
      quantity: `${caseRow.quantity} ${seizureUnitLabel(caseRow.unit, t)}`,
      threat: null,
    };
  }
  if (caseRow.specialty === "explosives" && caseRow.object_count != null) {
    return {
      quantity: String(caseRow.object_count),
      threat: caseRow.threat_level ? threatLevelLabel(caseRow.threat_level, t) : null,
    };
  }
  if (caseRow.specialty === "currency" && caseRow.total_amount != null) {
    return {
      quantity: caseRow.total_amount.toLocaleString(),
      threat:
        caseRow.banknote_count != null
          ? `${caseRow.banknote_count} ${t("operationalCases.unit.banknotes")}`
          : null,
    };
  }
  return { quantity: "—", threat: null };
}

export function computeOperationalCasesStats(cases: OperationalCaseWithRelations[]) {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  let totalNarcoticsKg = 0;
  let totalExplosiveObjects = 0;
  let totalCurrencyAmount = 0;

  for (const row of cases) {
    if (row.specialty === "narcotics" && row.quantity != null && row.unit) {
      const kg = quantityToKg(Number(row.quantity), row.unit);
      if (kg != null) totalNarcoticsKg += kg;
    }
    if (row.specialty === "explosives" && row.object_count != null) {
      totalExplosiveObjects += row.object_count;
    }
    if (row.specialty === "currency" && row.total_amount != null) {
      totalCurrencyAmount += Number(row.total_amount);
    }
  }

  return {
    total: cases.length,
    thisMonth: cases.filter((c) => c.case_date.startsWith(monthPrefix)).length,
    narcotics: cases.filter((c) => c.specialty === "narcotics").length,
    explosives: cases.filter((c) => c.specialty === "explosives").length,
    currency: cases.filter((c) => c.specialty === "currency").length,
    totalNarcoticsKg,
    totalExplosiveObjects,
    totalCurrencyAmount,
  };
}

export function formatCaseDetailLabel(caseRow: OperationalCaseWithRelations, t: TFunction): string {
  return formatCaseSummary(caseRow, t);
}
