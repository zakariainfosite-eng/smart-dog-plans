import { db, type DbClient } from "@/integrations/database/client";
import { getAgents, getDogs, type DogRow } from "@/integrations/database";
import { collectDogsWithoutHandler } from "@/lib/dog-handler-assignment";
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
import { syncExclusionPlanningReplacementsUpToToday } from "@/lib/planning/sync-exclusion-planning-replacements";

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
  dogsWithoutHandler: number;
  dogsWithoutHandlerList: DogRow[];
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

  try {
    await syncExclusionPlanningReplacementsUpToToday(client, todayISODate());
  } catch (syncError) {
    console.error("[dashboard] exclusion planning replacement sync failed", syncError);
  }

  const [agents, dogs, exclusions] = await Promise.all([
    getAgents(),
    getDogs(),
    fetchActiveExclusionsForDate(client, todayISODate()),
  ]);

  const personnelGroups = collectDashboardPersonnelGroups(
    agents,
    exclusions as AgentExclusionRecord[],
  );
  const personnel = dashboardPersonnelStatsFromGroups(personnelGroups);
  const agentRefs = agents.map((agent) => ({ id: agent.id, dog_id: agent.dog_id }));
  const dogsWithoutHandlerList = collectDogsWithoutHandler(dogs, agentRefs);

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
    dogsWithoutHandler: dogsWithoutHandlerList.length,
    dogsWithoutHandlerList,
    exclusions: exclusions as AgentExclusionRecord[],
    planning,
  };
}
