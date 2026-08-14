import type { DbClient } from "@/integrations/database/client";
import {
  exclusionApplyTarget,
  planningDayISO,
  type ExclusionType,
} from "@/lib/agent-exclusions";
import {
  daysUntilEnd,
  milestoneForDaysUntilEnd,
} from "@/lib/notifications/exclusion-return-dates";
import { loadActiveExclusionsInReminderWindow } from "@/lib/notifications/exclusion-reminder-candidates";
import type {
  ExclusionNotificationSubjectKind,
  ExclusionReturnMilestone,
} from "@/lib/notifications/exclusion-return-types";

export const EXCLUSION_REMINDER_ALERTS_STORAGE_KEY = "cynoplanning.exclusion-reminder-alerts.v1";
export const EXCLUSION_REMINDER_ALERTS_QUERY_KEY = ["exclusion-reminder-alerts"] as const;

export type ExclusionReminderAlert = {
  exclusionId: string;
  agentId: string | null;
  dogId: string | null;
  subjectKind: ExclusionNotificationSubjectKind;
  subjectName: string;
  exclusionType: ExclusionType | string;
  endDate: string;
  milestone: ExclusionReturnMilestone;
  daysRemaining: number;
  alertKey: string;
};

type ExclusionRow = {
  id: string;
  agent_id: string | null;
  dog_id: string | null;
  exclusion_type: ExclusionType | string;
  end_date: string;
  active: boolean;
};

type AgentNameRow = { id: string; first_name: string; last_name: string };
type DogNameRow = { id: string; name: string };

type ShownAlertStore = {
  shown: string[];
};

function getLocalStorage(): Storage | null {
  if (typeof globalThis === "undefined") return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStore(): ShownAlertStore {
  const storage = getLocalStorage();
  if (!storage) return { shown: [] };
  try {
    const raw = storage.getItem(EXCLUSION_REMINDER_ALERTS_STORAGE_KEY);
    if (!raw) return { shown: [] };
    const parsed = JSON.parse(raw) as ShownAlertStore;
    if (!Array.isArray(parsed.shown)) return { shown: [] };
    return { shown: parsed.shown.filter((key) => typeof key === "string") };
  } catch {
    return { shown: [] };
  }
}

function writeStore(store: ShownAlertStore): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(EXCLUSION_REMINDER_ALERTS_STORAGE_KEY, JSON.stringify(store));
}

export function buildExclusionReminderAlertKey(
  exclusionId: string,
  milestone: ExclusionReturnMilestone,
  endDate: string,
): string {
  return `${exclusionId}::${milestone}::${endDate.slice(0, 10)}`;
}

export function readShownExclusionReminderKeys(): Set<string> {
  return new Set(readStore().shown);
}

export function markExclusionReminderShown(alertKey: string): void {
  const store = readStore();
  if (store.shown.includes(alertKey)) return;
  store.shown.push(alertKey);
  writeStore(store);
}

/** Drop shown keys that no longer correspond to an active pending alert. */
export function pruneShownExclusionReminderKeys(validKeys: ReadonlySet<string>): void {
  const store = readStore();
  const next = store.shown.filter((key) => validKeys.has(key));
  if (next.length === store.shown.length) return;
  writeStore({ shown: next });
}

export function filterUnshownExclusionReminderAlerts(
  alerts: ExclusionReminderAlert[],
  shown: ReadonlySet<string>,
): ExclusionReminderAlert[] {
  return alerts.filter((alert) => !shown.has(alert.alertKey));
}

export function sortExclusionReminderAlerts(
  alerts: ExclusionReminderAlert[],
): ExclusionReminderAlert[] {
  return [...alerts].sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
    if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
    return a.subjectName.localeCompare(b.subjectName, "fr");
  });
}

export type ReminderAlertTranslate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export function formatExclusionReminderAlertMessage(
  alert: Pick<ExclusionReminderAlert, "subjectName" | "exclusionType" | "daysRemaining">,
  t: ReminderAlertTranslate,
): string {
  const typeKey = `exclusions.type.${alert.exclusionType}`;
  const typeLabel = t(typeKey);
  const exclusionType = typeLabel === typeKey ? alert.exclusionType : typeLabel;

  if (alert.daysRemaining <= 0) {
    return t("notifications.reminderAlert.messageToday", {
      name: alert.subjectName,
      type: exclusionType,
    });
  }
  if (alert.daysRemaining === 1) {
    return t("notifications.reminderAlert.messageTomorrow", {
      name: alert.subjectName,
      type: exclusionType,
    });
  }
  return t("notifications.reminderAlert.messageInDays", {
    name: alert.subjectName,
    type: exclusionType,
    count: alert.daysRemaining,
  });
}

async function loadCandidateExclusions(
  db: DbClient,
  reference: Date | string = new Date(),
) {
  return loadActiveExclusionsInReminderWindow(db, reference);
}

function formatAgentName(agent: AgentNameRow): string {
  return `${agent.first_name} ${agent.last_name}`.trim();
}

async function resolveSubjectName(
  db: DbClient,
  exclusion: ExclusionRow,
  subjectKind: ExclusionNotificationSubjectKind,
  agentCache: Map<string, string>,
  dogCache: Map<string, string>,
): Promise<string> {
  if (subjectKind === "dog" && exclusion.dog_id) {
    const cached = dogCache.get(exclusion.dog_id);
    if (cached) return cached;
    const { data, error } = await db
      .from("dogs")
      .select("id, name")
      .eq("id", exclusion.dog_id)
      .maybeSingle();
    if (error) throw error;
    const name = (data as DogNameRow | null)?.name?.trim() || "—";
    dogCache.set(exclusion.dog_id, name);
    return name;
  }

  if (exclusion.agent_id) {
    const cached = agentCache.get(exclusion.agent_id);
    if (cached) return cached;
    const { data, error } = await db
      .from("agents")
      .select("id, first_name, last_name")
      .eq("id", exclusion.agent_id)
      .maybeSingle();
    if (error) throw error;
    const name = data ? formatAgentName(data as AgentNameRow) : "—";
    agentCache.set(exclusion.agent_id, name);
    return name;
  }

  return "—";
}

/** Active exclusions within the 2-day / 1-day / today reminder window. */
export async function fetchPendingExclusionReminderAlerts(
  db: DbClient,
  reference: Date | string = new Date(),
): Promise<ExclusionReminderAlert[]> {
  const todayISO = planningDayISO(reference);
  const exclusions = await loadCandidateExclusions(db, reference);

  const agentCache = new Map<string, string>();
  const dogCache = new Map<string, string>();
  const alerts: ExclusionReminderAlert[] = [];

  for (const exclusion of exclusions) {
    const endDate = exclusion.end_date.slice(0, 10);
    const daysRemaining = daysUntilEnd(endDate, todayISO);
    const milestone = milestoneForDaysUntilEnd(daysRemaining);
    if (!milestone) continue;

    const subjectKind: ExclusionNotificationSubjectKind =
      exclusionApplyTarget(exclusion.exclusion_type, exclusion.dog_id) === "dog"
        ? "dog"
        : "personnel";

    const subjectName = await resolveSubjectName(
      db,
      exclusion,
      subjectKind,
      agentCache,
      dogCache,
    );

    alerts.push({
      exclusionId: exclusion.id,
      agentId: exclusion.agent_id,
      dogId: exclusion.dog_id,
      subjectKind,
      subjectName,
      exclusionType: exclusion.exclusion_type,
      endDate,
      milestone,
      daysRemaining,
      alertKey: buildExclusionReminderAlertKey(exclusion.id, milestone, endDate),
    });
  }

  return sortExclusionReminderAlerts(alerts);
}

export async function fetchUnshownExclusionReminderAlerts(
  db: DbClient,
  reference: Date | string = new Date(),
): Promise<ExclusionReminderAlert[]> {
  const pending = await fetchPendingExclusionReminderAlerts(db, reference);
  const validKeys = new Set(pending.map((alert) => alert.alertKey));
  pruneShownExclusionReminderKeys(validKeys);
  const shown = readShownExclusionReminderKeys();
  return filterUnshownExclusionReminderAlerts(pending, shown);
}
