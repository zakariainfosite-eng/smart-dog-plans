import { db, type DbClient } from "@/integrations/database/client";
import { getAgents } from "@/integrations/database";
import {
  expirePastExclusions,
  fetchActiveExclusionsForDate,
  todayISODate,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import {
  collectDashboardPersonnelGroups,
  dashboardPersonnelStatsFromGroups,
  type DashboardPersonnelGroups,
  type DashboardPersonnelStats,
} from "@/lib/dashboard/compute-dashboard-personnel-stats";

export type DashboardPlanningRow = {
  id: string;
  shift: string;
  validated: boolean;
  sections: { name: string } | null;
};

export type DashboardStats = {
  /** Total fonctionnaires (cynotechniciens + administratif). */
  agents: number;
  personnel: DashboardPersonnelStats;
  personnelGroups: DashboardPersonnelGroups;
  exclusions: AgentExclusionRecord[];
  planning: DashboardPlanningRow[];
};

/**
 * Dashboard KPIs use the same Electron IPC agent store as the Fonctionnaires page
 * (`getAgents()`), plus today's active exclusions (`fetchActiveExclusionsForDate`).
 *
 * Counts reuse existing fonction / availability / assignment helpers — they do
 * not change planning, exclusion, or authentication logic.
 *
 * Today's planning still uses the SQLite REST gateway, but is loaded separately
 * so a planning query failure cannot zero out the KPI counts.
 */
export async function fetchDashboardStats(
  client: DbClient = db,
): Promise<DashboardStats> {
  // Keep exclusion flags in sync whenever the dashboard opens.
  await expirePastExclusions(client);

  const [agents, exclusions] = await Promise.all([
    getAgents(),
    fetchActiveExclusionsForDate(client, todayISODate()),
  ]);

  const personnelGroups = collectDashboardPersonnelGroups(
    agents,
    exclusions as AgentExclusionRecord[],
  );
  const personnel = dashboardPersonnelStatsFromGroups(personnelGroups);

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
    agents: personnel.totalFonctionnaires,
    personnel,
    personnelGroups,
    exclusions: exclusions as AgentExclusionRecord[],
    planning,
  };
}
