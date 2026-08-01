import { db, type DbClient } from "@/integrations/database/client";
import { getAgents, getCheckpoints, getDogs } from "@/integrations/database";
import { todayISODate } from "@/lib/agent-exclusions";

export type DashboardPlanningRow = {
  id: string;
  shift: string;
  validated: boolean;
  sections: { name: string } | null;
};

export type DashboardStats = {
  agents: number;
  dogs: number;
  checkpoints: number;
  planning: DashboardPlanningRow[];
};

/**
 * Dashboard KPIs use the SAME Electron IPC stores as the working list pages:
 * - Agents page  → getAgents()
 * - Dogs page    → getDogs()
 * - Checkpoints  → getCheckpoints()
 *
 * Counts are raw `.length` (no extra active / exclusion filters), matching the
 * unfiltered totals shown on those pages (34 / 33 / 11).
 *
 * Today's planning still uses the SQLite REST gateway, but is loaded separately
 * so a planning query failure cannot zero out the KPI counts.
 */
export async function fetchDashboardStats(
  client: DbClient = db,
): Promise<DashboardStats> {
  // Same data source + same cardinality as Employees / Dogs / Checkpoints pages.
  const [agents, dogs, checkpoints] = await Promise.all([
    getAgents(),
    getDogs(),
    getCheckpoints(),
  ]);

  let planning: DashboardPlanningRow[] = [];
  try {
    const today = todayISODate();
    const planningRes = await client
      .from("planning")
      .select("id, section_id, shift, validated")
      .eq("planning_date", today);

    if (planningRes.error) throw planningRes.error;

    const planningRows = (planningRes.data ?? []) as Array<{
      id: string;
      section_id: string;
      shift: string;
      validated: boolean;
    }>;
    const sectionIds = [...new Set(planningRows.map((row) => row.section_id).filter(Boolean))];
    const sectionsRes =
      sectionIds.length > 0
        ? await client.from("sections").select("id, name").in("id", sectionIds)
        : { data: [] as unknown[], error: null as unknown | null };
    if (sectionsRes.error) throw sectionsRes.error;

    const sectionNameById = new Map(
      ((sectionsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [
        row.id,
        row.name,
      ]),
    );

    planning = planningRows.map((row) => {
      const name = sectionNameById.get(row.section_id);
      return {
        id: row.id,
        shift: row.shift,
        validated: Boolean(row.validated),
        sections: name ? { name } : null,
      };
    });
  } catch (error) {
    console.error("[dashboard] Failed to load today's planning (KPIs unaffected):", error);
  }

  return {
    agents: agents.length,
    dogs: dogs.length,
    checkpoints: checkpoints.length,
    planning,
  };
}
