import type { TFunction } from "i18next";

import {
  FEMALE_SLOT_RESERVATION_CODE,
  ROTATION_OVERRIDE_CODE,
} from "@/lib/planning/planning-warning-codes";
import { isReserveWarning, isRestWarning, translatePlanningReason } from "@/lib/planning-i18n";

export type PlanningAlertTier = "critical" | "attention" | "info";

export type PlanningAlertItem = {
  id: string;
  tier: PlanningAlertTier;
  checkpointName: string;
  specialtyKey: "narcotics" | "explosives" | null;
  headline: string;
  detail: string;
  postsUnfilled?: number;
};

const STRUCTURED_CODE_RE = /^\[([A-Z_]+)\]\s*(.*)$/;

const ATTENTION_CODES = new Set<string>([
  FEMALE_SLOT_RESERVATION_CODE,
  ROTATION_OVERRIDE_CODE,
]);

function extractCheckpointName(raw: string, messageBody: string): string {
  const fromBody = messageBody.match(/Checkpoint\s+(.+?)(?::|$)/i);
  if (fromBody?.[1]) return fromBody[1].trim();
  const understaffed = raw.match(/Checkpoint\s+(.+?)\s+is UNDERSTAFFED/i);
  if (understaffed?.[1]) return understaffed[1].trim();
  const critical = raw.match(/^CRITICAL:.*?Checkpoint\s+(.+?):/i);
  if (critical?.[1]) return critical[1].trim();
  return "";
}

function extractSpecialty(
  messageBody: string,
): "narcotics" | "explosives" | null {
  if (/\bnarcotics\b/i.test(messageBody)) return "narcotics";
  if (/\bexplosives\b/i.test(messageBody)) return "explosives";
  return null;
}

function extractUnfilledCount(raw: string): number | undefined {
  const m = raw.match(/(\d+)\s+position(s?) unfilled/i);
  if (m?.[1]) return Number(m[1]);
  const fr = raw.match(/(\d+)\s+poste(s?) non pourvu/i);
  if (fr?.[1]) return Number(fr[1]);
  return 1;
}

function specialtyLabel(
  key: "narcotics" | "explosives" | null,
  t: TFunction,
): string {
  if (key === "narcotics") return t("dailyPlanning.specialtyShort.narcotics");
  if (key === "explosives") return t("dailyPlanning.specialtyShort.explosives");
  return "";
}

function mapStructuredCode(
  code: string,
  checkpointName: string,
  specialtyKey: "narcotics" | "explosives" | null,
  t: TFunction,
): Pick<PlanningAlertItem, "headline" | "detail"> {
  const key = `dailyPlanning.alerts.codes.${code}`;
  const headline = t(`${key}.headline`, {
    defaultValue: t("dailyPlanning.alerts.codes._default.headline"),
  });
  const detail = t(`${key}.detail`, {
    checkpoint: checkpointName || t("dailyPlanning.alerts.unknownCheckpoint"),
    specialty: specialtyLabel(specialtyKey, t),
    defaultValue: t("dailyPlanning.alerts.codes._default.detail"),
  });
  return { headline, detail };
}

function normalizeWarningEntry(raw: unknown, index: number): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (raw == null) return null;
  const coerced = String(raw).trim();
  return coerced.length > 0 ? coerced : null;
}

function safeStringOp<T>(raw: string, fn: (value: string) => T, fallback: T): T {
  try {
    return fn(raw);
  } catch {
    return fallback;
  }
}

function classifyRawWarning(raw: string): PlanningAlertTier {
  if (raw.startsWith("INFO:")) return "info";
  if (isReserveWarning(raw) || isRestWarning(raw)) return "info";

  const structured = raw.match(STRUCTURED_CODE_RE);
  const code = structured?.[1];
  if (code && ATTENTION_CODES.has(code)) return "attention";

  if (
    raw.startsWith("CRITICAL:") ||
    raw.includes("UNDERSTAFFED") ||
    raw.includes("INVALID:")
  ) {
    return "critical";
  }

  if (code) {
    return ATTENTION_CODES.has(code) ? "attention" : "critical";
  }

  return "critical";
}

function parseWarning(raw: string, index: number, t: TFunction): PlanningAlertItem {
  const tier = classifyRawWarning(raw);
  const structured = raw.match(STRUCTURED_CODE_RE);

  if (structured) {
    const code = structured[1];
    const body = structured[2];
    const checkpointName = extractCheckpointName(raw, body);
    const specialtyKey = extractSpecialty(body);
    const { headline, detail } = mapStructuredCode(code, checkpointName, specialtyKey, t);

    return {
      id: `${code}-${checkpointName}-${index}`,
      tier,
      checkpointName: checkpointName || t("dailyPlanning.alerts.unknownCheckpoint"),
      specialtyKey,
      headline,
      detail,
      postsUnfilled: tier === "critical" ? extractUnfilledCount(body) ?? 1 : undefined,
    };
  }

  if (raw.includes("UNDERSTAFFED")) {
    const checkpointName = extractCheckpointName(raw, raw);
    const translated = translatePlanningReason(raw, t);
    return {
      id: `understaffed-${checkpointName}-${index}`,
      tier: "critical",
      checkpointName: checkpointName || t("dailyPlanning.alerts.unknownCheckpoint"),
      specialtyKey: null,
      headline: t("dailyPlanning.alerts.understaffed.headline"),
      detail: translated,
      postsUnfilled: extractUnfilledCount(raw),
    };
  }

  const checkpointName = extractCheckpointName(raw, raw);
  const specialtyKey = extractSpecialty(raw);

  return {
    id: `legacy-${index}`,
    tier,
    checkpointName: checkpointName || "—",
    specialtyKey,
    headline:
      tier === "attention"
        ? t("dailyPlanning.alerts.attentionGeneric.headline")
        : t("dailyPlanning.alerts.criticalGeneric.headline"),
    detail: translatePlanningReason(raw, t),
    postsUnfilled: tier === "critical" ? 1 : undefined,
  };
}

export function coercePlanningWarningStrings(
  warnings: readonly unknown[] | null | undefined,
): string[] {
  if (!Array.isArray(warnings)) return [];
  const out: string[] = [];
  for (let index = 0; index < warnings.length; index++) {
    const normalized = normalizeWarningEntry(warnings[index], index);
    if (normalized) out.push(normalized);
  }
  return out;
}

export function bucketPlanningDisplayWarnings(
  warnings: readonly unknown[] | null | undefined,
  t: TFunction,
): {
  critical: PlanningAlertItem[];
  attention: PlanningAlertItem[];
  info: PlanningAlertItem[];
  reserveLines: string[];
  restLines: string[];
} {
  const critical: PlanningAlertItem[] = [];
  const attention: PlanningAlertItem[] = [];
  const info: PlanningAlertItem[] = [];
  const reserveLines: string[] = [];
  const restLines: string[] = [];

  const list = coercePlanningWarningStrings(warnings);
  const fallbackHeadline = t("dailyPlanning.alerts.criticalGeneric.headline");
  const fallbackDetail = t("dailyPlanning.alerts.codes._default.detail");

  list.forEach((raw, index) => {
    if (safeStringOp(raw, isReserveWarning, false)) {
      reserveLines.push(safeStringOp(raw, (w) => translatePlanningReason(w, t), raw));
      return;
    }
    if (safeStringOp(raw, isRestWarning, false)) {
      restLines.push(safeStringOp(raw, (w) => translatePlanningReason(w, t), raw));
      return;
    }

    if (raw.startsWith("INFO:")) {
      info.push({
        id: `info-${index}`,
        tier: "info",
        checkpointName: "—",
        specialtyKey: null,
        headline: t("dailyPlanning.alerts.infoGeneric.headline"),
        detail: safeStringOp(raw, (w) => translatePlanningReason(w, t), raw),
      });
      return;
    }

    let parsed: PlanningAlertItem;
    try {
      parsed = parseWarning(raw, index, t);
    } catch {
      parsed = {
        id: `fallback-${index}`,
        tier: "critical",
        checkpointName: "—",
        specialtyKey: null,
        headline: fallbackHeadline,
        detail: fallbackDetail,
      };
    }
    if (parsed.tier === "attention") attention.push(parsed);
    else if (parsed.tier === "info") info.push(parsed);
    else critical.push(parsed);
  });

  return { critical, attention, info, reserveLines, restLines };
}

/** Display label e.g. « Point 17 » (not the raw engine checkpoint string). */
export function formatCheckpointPointLabel(
  checkpointName: string,
  t: TFunction,
): string | null {
  if (!checkpointName || checkpointName === "—") return null;
  const pointWord = t("dailyPlanning.alerts.unknownCheckpoint");
  if (checkpointName.startsWith(`${pointWord} `)) return checkpointName;
  return `${pointWord} ${checkpointName}`;
}

/**
 * Segments after the checkpoint prefix for one compact UI line (no engine text / no duplicate detail).
 */
export function compactAlertTrailingParts(item: PlanningAlertItem, t: TFunction): string[] {
  if (item.tier === "critical") {
    const parts: string[] = [item.headline];
    const spec = specialtyLabel(item.specialtyKey, t);
    if (spec) parts.push(spec);
    if (item.postsUnfilled != null && item.postsUnfilled > 0) {
      parts.push(t("dailyPlanning.alerts.postsUnfilled", { count: item.postsUnfilled }));
    }
    return parts;
  }
  if (item.tier === "attention") {
    return [item.headline];
  }
  const text = (item.detail || item.headline).trim();
  return text ? [text] : [];
}
