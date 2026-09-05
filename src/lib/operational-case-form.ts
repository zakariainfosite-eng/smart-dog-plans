import type { TFunction } from "i18next";
import { z } from "zod";

import type { OperationalCaseWithRelations } from "@/lib/operational-case-api";
import type { Database } from "@/integrations/database/schema-types";

export type OperationalCaseSpecialty = Database["public"]["Enums"]["operational_case_specialty"];
export type SeizureType = Database["public"]["Enums"]["seizure_type"];
export type SeizureUnit = Database["public"]["Enums"]["seizure_unit"];
export type ExplosiveObjectType = Database["public"]["Enums"]["explosive_object_type"];
export type ThreatLevel = Database["public"]["Enums"]["threat_level"];

export const NARCOTICS_DRUG_TYPES = [
  "exta",
  "hashish",
  "cocaine",
  "heroin",
  "synthetic_drugs",
  "pofa",
  "other",
] as const satisfies readonly SeizureType[];

export const NARCOTICS_UNITS = ["kg", "g", "tonne"] as const satisfies readonly SeizureUnit[];

export const EXPLOSIVE_OBJECT_TYPES = [
  "firearm",
  "bladed_weapon",
  "grenade",
  "homemade_explosive",
  "ammunition",
  "detonator",
  "explosive_material",
  "other",
] as const satisfies readonly ExplosiveObjectType[];

export const THREAT_LEVELS = ["low", "medium", "high"] as const satisfies readonly ThreatLevel[];

export const CURRENCY_CODES = ["MAD", "EUR", "USD", "GBP", "CHF", "SAR", "AED", "other"] as const;

export type OperationalCaseFormValues = {
  case_date: string;
  case_number: string;
  agent_id: string;
  dog_id: string;
  specialty: OperationalCaseSpecialty;
  checkpoint_id: string;
  observations: string;
  drug_type: SeizureType | "";
  quantity: number;
  unit: SeizureUnit | "";
  object_type: ExplosiveObjectType | "";
  object_count: number;
  threat_level: ThreatLevel | "";
  currency_code: string;
  total_amount: number;
  banknote_count: number;
  country: string;
};

const baseSchema = () =>
  z.object({
    case_date: z.string(),
    case_number: z.string().max(80).optional().or(z.literal("")),
    agent_id: z.string(),
    dog_id: z.string().optional().or(z.literal("")),
    specialty: z.enum(["narcotics", "explosives", "currency"]),
    checkpoint_id: z.string(),
    observations: z.string().max(1000).optional().or(z.literal("")),
    drug_type: z.string().optional().or(z.literal("")),
    quantity: z.coerce.number().optional(),
    unit: z.string().optional().or(z.literal("")),
    object_type: z.string().optional().or(z.literal("")),
    object_count: z.coerce.number().optional(),
    threat_level: z.string().optional().or(z.literal("")),
    currency_code: z.string().optional().or(z.literal("")),
    total_amount: z.coerce.number().optional(),
    banknote_count: z.coerce.number().optional(),
    country: z.string().optional().or(z.literal("")),
  });

export function validateOperationalCaseForm(
  t: TFunction,
  values: OperationalCaseFormValues,
): { success: true; data: OperationalCaseFormValues } | { success: false; errors: Partial<Record<keyof OperationalCaseFormValues, string>> } {
  const parsed = baseSchema().safeParse(values);
  if (!parsed.success) {
    const errors: Partial<Record<keyof OperationalCaseFormValues, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof OperationalCaseFormValues;
      if (!errors[key]) errors[key] = issue.message;
    }
    return { success: false, errors };
  }

  const errors: Partial<Record<keyof OperationalCaseFormValues, string>> = {};
  const v = parsed.data as OperationalCaseFormValues;

  if (v.quantity != null && !Number.isNaN(v.quantity) && v.quantity < 0) {
    errors.quantity = t("operationalCases.validation.quantityPositive");
  }
  if (v.object_count != null && !Number.isNaN(v.object_count) && v.object_count < 0) {
    errors.object_count = t("operationalCases.validation.objectCountPositive");
  }
  if (v.total_amount != null && !Number.isNaN(v.total_amount) && v.total_amount < 0) {
    errors.total_amount = t("operationalCases.validation.totalAmountRequired");
  }
  if (v.banknote_count != null && !Number.isNaN(v.banknote_count) && v.banknote_count < 0) {
    errors.banknote_count = t("operationalCases.validation.banknoteCountRequired");
  }

  if (Object.keys(errors).length > 0) return { success: false, errors };
  return { success: true, data: v };
}

export function defaultOperationalCaseForm(agentId = "", specialty: OperationalCaseSpecialty = "narcotics"): OperationalCaseFormValues {
  return {
    case_date: new Date().toISOString().slice(0, 10),
    case_number: "",
    agent_id: agentId,
    dog_id: "",
    specialty,
    checkpoint_id: "",
    observations: "",
    drug_type: "",
    quantity: 0,
    unit: "",
    object_type: "",
    object_count: 0,
    threat_level: "",
    currency_code: "",
    total_amount: 0,
    banknote_count: 0,
    country: "",
  };
}

export function specialtyDefaults(specialty: OperationalCaseSpecialty): Partial<OperationalCaseFormValues> {
  if (specialty === "narcotics") {
    return { drug_type: "", quantity: 0, unit: "", object_type: "", object_count: 0, threat_level: "", currency_code: "", total_amount: 0, banknote_count: 0, country: "" };
  }
  if (specialty === "explosives") {
    return { drug_type: "", quantity: 0, unit: "", object_type: "", object_count: 0, threat_level: "", currency_code: "", total_amount: 0, banknote_count: 0, country: "" };
  }
  return { drug_type: "", quantity: 0, unit: "", object_type: "", object_count: 0, threat_level: "", currency_code: "", total_amount: 0, banknote_count: 0, country: "" };
}

export function operationalCaseToForm(row: OperationalCaseWithRelations): OperationalCaseFormValues {
  const base = {
    case_date: row.case_date,
    case_number: row.case_number,
    agent_id: row.agent_id,
    dog_id: row.dog_id ?? "",
    specialty: row.specialty,
    checkpoint_id: row.checkpoint_id ?? "",
    observations: row.observations ?? "",
  };

  if (row.specialty === "explosives") {
    return {
      ...base,
      ...specialtyDefaults("explosives"),
      object_type: row.object_type ?? "",
      object_count: row.object_count ?? 0,
      threat_level: row.threat_level ?? "",
    } as OperationalCaseFormValues;
  }

  if (row.specialty === "currency") {
    return {
      ...base,
      ...specialtyDefaults("currency"),
      currency_code: row.currency_code ?? "",
      total_amount: Number(row.total_amount ?? 0),
      banknote_count: row.banknote_count ?? 0,
      country: row.country ?? "",
    } as OperationalCaseFormValues;
  }

  return {
    ...base,
    ...specialtyDefaults("narcotics"),
    drug_type: row.seizure_type ?? "",
    quantity: Number(row.quantity ?? 0),
    unit: row.unit ?? "",
  } as OperationalCaseFormValues;
}

export function formToDbPayload(values: OperationalCaseFormValues) {
  const positiveOrNull = (value: number | null | undefined) =>
    value != null && !Number.isNaN(value) && value > 0 ? value : null;
  const nonNegativeOrNull = (value: number | null | undefined) =>
    value != null && !Number.isNaN(value) && value >= 0 ? value : null;

  const base = {
    case_date: values.case_date,
    agent_id: values.agent_id,
    dog_id: values.dog_id?.trim() ? values.dog_id : null,
    specialty: values.specialty,
    checkpoint_id: values.checkpoint_id?.trim() ? values.checkpoint_id : null,
    location: null,
    observations: values.observations?.trim() ? values.observations.trim() : null,
    seizure_type: null as SeizureType | null,
    quantity: null as number | null,
    unit: null as SeizureUnit | null,
    object_type: null as ExplosiveObjectType | null,
    object_count: null as number | null,
    threat_level: null as ThreatLevel | null,
    currency_code: null as string | null,
    total_amount: null as number | null,
    banknote_count: null as number | null,
    country: null as string | null,
  };

  if (values.specialty === "narcotics") {
    return {
      ...base,
      seizure_type: values.drug_type ? (values.drug_type as SeizureType) : null,
      quantity: positiveOrNull(values.quantity),
      unit: values.unit ? (values.unit as SeizureUnit) : null,
    };
  }

  if (values.specialty === "explosives") {
    return {
      ...base,
      object_type: values.object_type ? (values.object_type as ExplosiveObjectType) : null,
      object_count: positiveOrNull(values.object_count),
      threat_level: values.threat_level ? (values.threat_level as ThreatLevel) : null,
    };
  }

  return {
    ...base,
    currency_code: values.currency_code.trim() || null,
    total_amount: nonNegativeOrNull(values.total_amount),
    banknote_count: nonNegativeOrNull(values.banknote_count),
    country: values.country.trim() || null,
  };
}
