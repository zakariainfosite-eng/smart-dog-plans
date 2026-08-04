import type { DbClient } from "@/integrations/database/client";
import {
  buildPlanningExclusionReport,
  fetchActiveExclusionsForDate,
  logPlanningExclusionDebug,
} from "@/lib/agent-exclusions";
import { CHECKPOINT_PLANNING_SELECT } from "@/lib/checkpoints/checkpoint-columns";
import {
  normalizeCheckpointRow,
  previousPlanningDate,
  type AgentInput,
  type RotationHistoryInput,
} from "@/lib/planning/engine";
import { isCynotechnicienFonction } from "@/lib/personnel-fonction";

/**
 * Load agents for automatic planning:
 * - Active male Cynotechniciens of the selected section only
 * - Non-cynotechnicien roles and females are never loaded into the engine
 *   (Smart Rotation, checkpoint assignment, HQ Reserve, optimization).
 */
async function loadPlanningAgents(
  db: DbClient,
  sectionId: string,
): Promise<AgentInput[]> {
  const agentSelect =
    "id, first_name, last_name, professional_number, gender, fonction, active, section_id, dog_id, dogs:dog_id(id, name, specialty, status, active)";

  const sectionRes = await db
    .from("agents")
    .select(agentSelect)
    .eq("active", true)
    .eq("section_id", sectionId);

  if (sectionRes.error) throw sectionRes.error;

  return ((sectionRes.data ?? []) as Array<AgentInput & { fonction?: string }>).filter(
    (row) =>
      isCynotechnicienFonction(row.fonction) &&
      String(row.gender).toLowerCase() !== "female",
  );
}

export async function loadPlanningContext(
  db: DbClient,
  dateISO: string,
  sectionId: string,
  planningDate: Date,
) {
  const prevDateISO = previousPlanningDate(planningDate);

  const agents = await loadPlanningAgents(db, sectionId);
  const agentIds = agents.map((agent: any) => agent.id);
  const emptyList = { data: [] as never[], error: null };

  const [checkpointsRes, exclusionsRaw, rotationHistoryRes] = await Promise.all([
    db
      .from("checkpoints")
      .select(CHECKPOINT_PLANNING_SELECT)
      .eq("active", true)
      .order("name"),
    fetchActiveExclusionsForDate(db, dateISO),
    agentIds.length > 0
      ? db
          .from("rotation_history")
          .select(
            "agent_id, checkpoint_post_id, planning_date, checkpoint_posts:checkpoint_post_id(checkpoint_id)",
          )
          .eq("is_hq_reserve", false)
          .eq("is_off_duty", false)
          .not("checkpoint_post_id", "is", null)
          .in("agent_id", agentIds)
      : Promise.resolve(emptyList),
  ]);

  const sectionAgentIds = new Set(agentIds);
  const sectionDogIds = new Set(
    agents
      .map((agent: { dog_id?: string | null }) => agent.dog_id)
      .filter((id: string | null | undefined): id is string => Boolean(id)),
  );
  const dogToAgentId = new Map<string, string>();
  for (const agent of agents as Array<{ id: string; dog_id?: string | null }>) {
    if (agent.dog_id) dogToAgentId.set(agent.dog_id, agent.id);
  }
  const exclusionDebug = buildPlanningExclusionReport(
    exclusionsRaw,
    dateISO,
    sectionAgentIds,
    sectionDogIds,
    dogToAgentId,
  );
  logPlanningExclusionDebug(exclusionDebug);

  const errors = [checkpointsRes.error, rotationHistoryRes.error].filter(Boolean);
  if (errors.length > 0) {
    throw errors[0];
  }

  const yesterdayCheckpointByAgent = new Map<string, string>();
  const fairnessCounts = new Map<string, number>();
  const rotationHistory: RotationHistoryInput[] = [];

  for (const row of rotationHistoryRes.data ?? []) {
    const posts = row.checkpoint_posts;
    const cp = Array.isArray(posts) ? posts[0] : posts;
    if (!cp || typeof cp !== "object" || !("checkpoint_id" in cp)) continue;

    const checkpointId = cp.checkpoint_id as string;
    rotationHistory.push({
      agent_id: row.agent_id,
      checkpoint_id: checkpointId,
      planning_date: row.planning_date,
    });

    const fairnessKey = `${row.agent_id}:${checkpointId}`;
    fairnessCounts.set(fairnessKey, (fairnessCounts.get(fairnessKey) ?? 0) + 1);

    if (row.planning_date === prevDateISO) {
      yesterdayCheckpointByAgent.set(row.agent_id, checkpointId);
    }
  }

  return {
    agents,
    checkpoints: (checkpointsRes.data ?? []).map((row: any) =>
      normalizeCheckpointRow(row as Parameters<typeof normalizeCheckpointRow>[0]),
    ),
    exclusions: exclusionDebug.inputs,
    exclusionDebug,
    rotationHistory,
    yesterdayCheckpointByAgent,
    fairnessCounts,
  };
}
