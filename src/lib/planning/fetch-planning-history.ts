import type { DbClient } from "@/integrations/database/client";

export type PlanningHistoryListItem = {
  id: string;
  planning_date: string;
  shift: "day" | "night";
  validated: boolean;
  created_at: string;
  section_id: string;
  section_name: string;
  agent_count: number;
  dog_count: number;
};

/** Load every saved planning row with section name and assignment counts. */
export async function fetchPlanningHistory(
  client: DbClient,
): Promise<PlanningHistoryListItem[]> {
  const { data: planningRows, error } = await client
    .from("planning")
    .select("id, planning_date, shift, validated, created_at, section_id")
    .order("planning_date", { ascending: false });

  if (error) throw error;

  const rows = (planningRows ?? []) as Array<{
    id: string;
    planning_date: string;
    shift: "day" | "night";
    validated: boolean;
    created_at: string;
    section_id: string;
  }>;
  if (rows.length === 0) return [];

  const planningIds = rows.map((row) => row.id);
  const sectionIds = [...new Set(rows.map((row) => row.section_id).filter(Boolean))];

  const [assignmentsRes, sectionsRes] = await Promise.all([
    client.from("planning_assignments").select("planning_id, agent_id, dog_id").in("planning_id", planningIds),
    sectionIds.length > 0
      ? client.from("sections").select("id, name").in("id", sectionIds)
      : Promise.resolve({ data: [] as unknown[], error: null as unknown | null }),
  ]);

  if (assignmentsRes.error) throw assignmentsRes.error;
  if (sectionsRes.error) throw sectionsRes.error;

  const sectionNameById = new Map(
    ((sectionsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.id,
      row.name,
    ]),
  );

  const countsByPlanning = new Map<string, { agents: Set<string>; dogs: Set<string> }>();
  for (const id of planningIds) {
    countsByPlanning.set(id, { agents: new Set(), dogs: new Set() });
  }

  for (const row of assignmentsRes.data ?? []) {
    const bucket = countsByPlanning.get(row.planning_id as string);
    if (!bucket) continue;
    bucket.agents.add(String(row.agent_id));
    if (row.dog_id) bucket.dogs.add(String(row.dog_id));
  }

  return rows.map((row) => {
    const counts = countsByPlanning.get(row.id) ?? {
      agents: new Set<string>(),
      dogs: new Set<string>(),
    };

    return {
      id: row.id,
      planning_date: row.planning_date,
      shift: row.shift,
      validated: Boolean(row.validated),
      created_at: row.created_at,
      section_id: row.section_id,
      section_name: sectionNameById.get(row.section_id)?.trim() || "—",
      agent_count: counts.agents.size,
      dog_count: counts.dogs.size,
    };
  });
}
