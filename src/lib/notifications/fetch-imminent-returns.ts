import type { DbClient } from "@/integrations/database/client";
import {
  exclusionApplyTarget,
  planningDayISO,
  type ExclusionType,
} from "@/lib/agent-exclusions";
import { isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import {
  daysUntilReturn,
  exclusionReturnDateISO,
} from "@/lib/notifications/exclusion-return-dates";
import type { ExclusionNotificationSubjectKind } from "@/lib/notifications/exclusion-return-types";
import { addDays, format, parseISO } from "date-fns";

export type ImminentReturnItem = {
  exclusion_id: string;
  agent_id: string | null;
  dog_id: string | null;
  subject_kind: ExclusionNotificationSubjectKind;
  subject_name: string;
  exclusion_type: ExclusionType | string;
  end_date: string;
  return_date: string;
  days_until: number;
};

type ExclusionRow = {
  id: string;
  agent_id: string | null;
  dog_id: string | null;
  exclusion_type: ExclusionType | string;
  end_date: string;
};

/**
 * Next upcoming returns (available again on return_date = end_date + 1).
 * Used by the dashboard “Retours imminents” card.
 */
export async function fetchImminentReturns(
  db: DbClient,
  limit = 5,
  reference: Date | string = new Date(),
): Promise<ImminentReturnItem[]> {
  const todayISO = planningDayISO(reference);
  // Include yesterday's end (return today) through next 14 days of ends.
  const minEnd = format(addDays(parseISO(todayISO), -1), "yyyy-MM-dd");
  const maxEnd = format(addDays(parseISO(todayISO), 13), "yyyy-MM-dd");

  const run = async (withSoftDelete: boolean) => {
    let query = db
      .from("agent_exclusions")
      .select("id, agent_id, dog_id, exclusion_type, end_date")
      .gte("end_date", minEnd)
      .lte("end_date", maxEnd)
      .order("end_date", { ascending: true });
    if (withSoftDelete) {
      query = query.eq("is_deleted", false);
    }
    return query;
  };

  const { data, error } = await run(true);
  let rows: ExclusionRow[];
  if (!error) {
    rows = (data ?? []) as ExclusionRow[];
  } else if (isMissingSoftDeleteColumn(error)) {
    const legacy = await run(false);
    if (legacy.error) throw legacy.error;
    rows = (legacy.data ?? []) as ExclusionRow[];
  } else {
    throw error;
  }

  const agentIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))] as string[];
  const dogIds = [...new Set(rows.map((r) => r.dog_id).filter(Boolean))] as string[];

  const agentNames = new Map<string, string>();
  const dogNames = new Map<string, string>();

  if (agentIds.length > 0) {
    const { data: agents, error: agentsError } = await db
      .from("agents")
      .select("id, first_name, last_name")
      .in("id", agentIds);
    if (agentsError) throw agentsError;
    for (const agent of agents ?? []) {
      agentNames.set(
        agent.id as string,
        `${agent.first_name} ${agent.last_name}`.trim(),
      );
    }
  }

  if (dogIds.length > 0) {
    const { data: dogs, error: dogsError } = await db
      .from("dogs")
      .select("id, name")
      .in("id", dogIds);
    if (dogsError) throw dogsError;
    for (const dog of dogs ?? []) {
      dogNames.set(dog.id as string, String(dog.name ?? "—"));
    }
  }

  const items: ImminentReturnItem[] = [];
  for (const row of rows) {
    const returnDate = exclusionReturnDateISO(row.end_date);
    const daysUntil = daysUntilReturn(returnDate, todayISO);
    if (daysUntil < 0) continue;

    const subjectKind: ExclusionNotificationSubjectKind =
      exclusionApplyTarget(row.exclusion_type, row.dog_id) === "dog" ? "dog" : "personnel";

    const subjectName =
      subjectKind === "dog" && row.dog_id
        ? dogNames.get(row.dog_id) ?? "—"
        : row.agent_id
          ? agentNames.get(row.agent_id) ?? "—"
          : "—";

    items.push({
      exclusion_id: row.id,
      agent_id: row.agent_id,
      dog_id: row.dog_id,
      subject_kind: subjectKind,
      subject_name: subjectName,
      exclusion_type: row.exclusion_type,
      end_date: row.end_date.slice(0, 10),
      return_date: returnDate,
      days_until: daysUntil,
    });
  }

  items.sort((a, b) => {
    if (a.days_until !== b.days_until) return a.days_until - b.days_until;
    return a.subject_name.localeCompare(b.subject_name, "fr");
  });

  return items.slice(0, limit);
}
