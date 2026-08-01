import type { Database } from "@/integrations/database/schema-types";
import { checkpointLabel } from "@/lib/operational-case-api";

export type OperationalCaseRow = Database["public"]["Tables"]["operational_cases"]["Row"];
export type OperationalCaseSpecialty = Database["public"]["Enums"]["operational_case_specialty"];
export type SeizureType = Database["public"]["Enums"]["seizure_type"];
export type SeizureUnit = Database["public"]["Enums"]["seizure_unit"];

/** Drug types aggregated in narcotics kg statistics (legacy `cannabis` + `exta`). */
export const NARCOTICS_STAT_DRUG_TYPES = {
  cannabisKg: ["cannabis", "exta"] as const,
  hashishKg: ["hashish"] as const,
  cocaineKg: ["cocaine"] as const,
  heroinKg: ["heroin"] as const,
  syntheticDrugsKg: ["synthetic_drugs"] as const,
} as const;

export type AgentNarcoticsCaseStats = {
  totalCases: number;
  cannabisKg: number;
  cocaineKg: number;
  heroinKg: number;
  syntheticDrugsKg: number;
  hashishKg: number;
  largestSeizure: {
    caseNumber: string;
    caseDate: string;
    seizureType: SeizureType;
    quantityKg: number;
    location: string;
  } | null;
  lastCase: {
    caseNumber: string;
    caseDate: string;
    location: string;
    seizureType: SeizureType;
    quantity: number;
    unit: SeizureUnit;
  } | null;
};

export type AgentExplosivesCaseStats = {
  totalCases: number;
  totalObjects: number;
  lastCase: {
    caseNumber: string;
    caseDate: string;
    location: string;
    objectType: Database["public"]["Enums"]["explosive_object_type"];
    objectCount: number;
  } | null;
};

export type AgentCurrencyCaseStats = {
  totalCases: number;
  totalBanknotes: number;
  totalAmount: number;
  lastCase: {
    caseNumber: string;
    caseDate: string;
    location: string;
    currencyCode: string;
    totalAmount: number;
    banknoteCount: number;
    country: string;
  } | null;
};

export type AgentCaseStats =
  | { specialty: "narcotics"; stats: AgentNarcoticsCaseStats }
  | { specialty: "explosives"; stats: AgentExplosivesCaseStats }
  | { specialty: "currency"; stats: AgentCurrencyCaseStats };

export function quantityToKg(quantity: number, unit: SeizureUnit): number | null {
  if (unit === "kg") return quantity;
  if (unit === "g") return quantity / 1000;
  if (unit === "tonne") return quantity * 1000;
  return null;
}

function includesType(types: readonly SeizureType[], value: SeizureType | null): boolean {
  return value != null && (types as readonly string[]).includes(value);
}

function isWeightUnit(unit: SeizureUnit | null): boolean {
  return unit === "kg" || unit === "g" || unit === "tonne";
}

export function computeAgentCaseStats(
  cases: OperationalCaseRow[],
  specialty: OperationalCaseSpecialty,
): AgentCaseStats {
  const sorted = [...cases].sort((a, b) => {
    const dateCmp = b.case_date.localeCompare(a.case_date);
    if (dateCmp !== 0) return dateCmp;
    return b.created_at.localeCompare(a.created_at);
  });

  const lastCaseRow = sorted[0] ?? null;

  if (specialty === "narcotics") {
    const totals = {
      cannabisKg: 0,
      hashishKg: 0,
      cocaineKg: 0,
      heroinKg: 0,
      syntheticDrugsKg: 0,
    };

    let largestSeizure: AgentNarcoticsCaseStats["largestSeizure"] = null;
    let lastCase: AgentNarcoticsCaseStats["lastCase"] = null;

    if (lastCaseRow?.specialty === "narcotics" && lastCaseRow.seizure_type && lastCaseRow.unit && lastCaseRow.quantity != null) {
      lastCase = {
        caseNumber: lastCaseRow.case_number,
        caseDate: lastCaseRow.case_date,
        location: checkpointLabel(lastCaseRow as unknown as Parameters<typeof checkpointLabel>[0]),
        seizureType: lastCaseRow.seizure_type,
        quantity: Number(lastCaseRow.quantity),
        unit: lastCaseRow.unit,
      };
    }

    for (const row of cases) {
      if (row.specialty !== "narcotics" || !row.seizure_type || row.unit == null || row.quantity == null) continue;
      const qty = Number(row.quantity);
      const kg = quantityToKg(qty, row.unit);
      if (kg == null) continue;

      if (includesType(NARCOTICS_STAT_DRUG_TYPES.cannabisKg, row.seizure_type)) totals.cannabisKg += kg;
      if (includesType(NARCOTICS_STAT_DRUG_TYPES.hashishKg, row.seizure_type)) totals.hashishKg += kg;
      if (includesType(NARCOTICS_STAT_DRUG_TYPES.cocaineKg, row.seizure_type)) totals.cocaineKg += kg;
      if (includesType(NARCOTICS_STAT_DRUG_TYPES.heroinKg, row.seizure_type)) totals.heroinKg += kg;
      if (includesType(NARCOTICS_STAT_DRUG_TYPES.syntheticDrugsKg, row.seizure_type)) totals.syntheticDrugsKg += kg;

      if (isWeightUnit(row.unit) && (!largestSeizure || kg > largestSeizure.quantityKg)) {
        largestSeizure = {
          caseNumber: row.case_number,
          caseDate: row.case_date,
          seizureType: row.seizure_type,
          quantityKg: kg,
          location: checkpointLabel(row as unknown as Parameters<typeof checkpointLabel>[0]),
        };
      }
    }

    return {
      specialty: "narcotics",
      stats: {
        totalCases: cases.filter((c) => c.specialty === "narcotics").length,
        ...totals,
        largestSeizure,
        lastCase,
      },
    };
  }

  if (specialty === "explosives") {
    let totalObjects = 0;
    let lastCase: AgentExplosivesCaseStats["lastCase"] = null;

    if (lastCaseRow?.specialty === "explosives" && lastCaseRow.object_type && lastCaseRow.object_count != null) {
      lastCase = {
        caseNumber: lastCaseRow.case_number,
        caseDate: lastCaseRow.case_date,
        location: checkpointLabel(lastCaseRow as unknown as Parameters<typeof checkpointLabel>[0]),
        objectType: lastCaseRow.object_type,
        objectCount: lastCaseRow.object_count,
      };
    }

    for (const row of cases) {
      if (row.specialty !== "explosives" || row.object_count == null) continue;
      totalObjects += row.object_count;
    }

    return {
      specialty: "explosives",
      stats: {
        totalCases: cases.filter((c) => c.specialty === "explosives").length,
        totalObjects,
        lastCase,
      },
    };
  }

  let totalBanknotes = 0;
  let totalAmount = 0;
  let lastCase: AgentCurrencyCaseStats["lastCase"] = null;

  if (lastCaseRow?.specialty === "currency" && lastCaseRow.currency_code && lastCaseRow.total_amount != null) {
    lastCase = {
      caseNumber: lastCaseRow.case_number,
      caseDate: lastCaseRow.case_date,
      location: checkpointLabel(lastCaseRow as unknown as Parameters<typeof checkpointLabel>[0]),
      currencyCode: lastCaseRow.currency_code,
      totalAmount: Number(lastCaseRow.total_amount),
      banknoteCount: lastCaseRow.banknote_count ?? 0,
      country: lastCaseRow.country ?? "",
    };
  }

  for (const row of cases) {
    if (row.specialty !== "currency") continue;
    if (row.banknote_count != null) totalBanknotes += row.banknote_count;
    if (row.total_amount != null) totalAmount += Number(row.total_amount);
  }

  return {
    specialty: "currency",
    stats: {
      totalCases: cases.filter((c) => c.specialty === "currency").length,
      totalBanknotes,
      totalAmount,
      lastCase,
    },
  };
}

export function formatKg(value: number): string {
  if (value === 0) return "0";
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
