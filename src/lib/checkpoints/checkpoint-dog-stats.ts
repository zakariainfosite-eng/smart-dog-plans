import type { DbClient } from "@/integrations/database/client";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import { deriveDogOperationalStatus } from "@/lib/dog-operational-status";
import type { AgentRow } from "@/integrations/database";
import type { CheckpointWithPosts } from "@/integrations/database";

export type CheckpointDogCategory = "explosives" | "narcotics";

export type CheckpointDogCategoryStats = {
  total: number;
  active: number;
  excluded: number;
};

export type CheckpointDogStats = {
  explosives: CheckpointDogCategoryStats;
  narcotics: CheckpointDogCategoryStats;
  /** All dogs without active exclusion (any specialty). Matches Chiens page. */
  activeTotal?: number;
  /** All dogs with active exclusion (any specialty). Matches Chiens page. */
  excludedTotal?: number;
};

export const EMPTY_CHECKPOINT_DOG_STATS: CheckpointDogStats = {
  explosives: { total: 0, active: 0, excluded: 0 },
  narcotics: { total: 0, active: 0, excluded: 0 },
  activeTotal: 0,
  excludedTotal: 0,
};

export type DogStatsInput = {
  id: string;
  specialty: string;
};

function isNarcoticsSpecialty(specialty: string): boolean {
  return specialty === "narcotics" || specialty === "currency";
}

/** One dog linked to a checkpoint via planning or rotation history. */
export type CheckpointDogAssignment = {
  checkpointId: string;
  agentId: string;
  dogId: string;
};

const DEBUG = import.meta.env.DEV;

function dogMatchesCategory(specialty: string, category: CheckpointDogCategory): boolean {
  if (category === "explosives") return specialty === "explosives";
  return specialty === "narcotics" || specialty === "currency";
}

function resolveDogIdForAgent(agent: AgentRow | undefined): string | null {
  if (!agent) return null;
  return agent.dog_id ?? agent.dogs?.id ?? null;
}

function resolveDogSpecialty(
  dogId: string,
  agents: AgentRow[],
  dogSpecialtyById: Map<string, string>,
): string {
  const fromMap = dogSpecialtyById.get(dogId);
  if (fromMap) return fromMap;
  const agent = agents.find((row) => row.dog_id === dogId || row.dogs?.id === dogId);
  return agent?.dogs?.specialty ?? "";
}

function countCategoryStats(
  dogIds: Set<string>,
  exclusions: AgentExclusionRecord[],
  reference: Date | string,
): CheckpointDogCategoryStats {
  let active = 0;
  let excluded = 0;

  for (const dogId of dogIds) {
    const status = deriveDogOperationalStatus(dogId, exclusions, reference);
    if (status.kind === "excluded") excluded += 1;
    else active += 1;
  }

  return { total: dogIds.size, active, excluded };
}

function buildDogSpecialtyIndex(agents: AgentRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const agent of agents) {
    if (agent.dogs?.id && agent.dogs.specialty) {
      map.set(agent.dogs.id, agent.dogs.specialty);
    }
  }
  return map;
}

function buildAgentById(agents: AgentRow[]): Map<string, AgentRow> {
  return new Map(agents.map((agent) => [agent.id, agent]));
}

/** Distinct dogs assigned to each checkpoint (planning + rotation history). */
export function indexCheckpointDogAssignments(
  assignments: CheckpointDogAssignment[],
): Map<string, Set<string>> {
  const byCheckpoint = new Map<string, Set<string>>();
  for (const row of assignments) {
    const bucket = byCheckpoint.get(row.checkpointId) ?? new Set<string>();
    bucket.add(row.dogId);
    byCheckpoint.set(row.checkpointId, bucket);
  }
  return byCheckpoint;
}

export function computeCheckpointDogStats(
  checkpointId: string,
  agents: AgentRow[],
  assignments: CheckpointDogAssignment[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
  dogSpecialtyById: Map<string, string> = buildDogSpecialtyIndex(agents),
): CheckpointDogStats {
  const assignedDogIds = new Set(
    assignments.filter((row) => row.checkpointId === checkpointId).map((row) => row.dogId),
  );

  const explosivesDogs = new Set<string>();
  const narcoticsDogs = new Set<string>();

  for (const dogId of assignedDogIds) {
    const specialty = resolveDogSpecialty(dogId, agents, dogSpecialtyById);
    if (dogMatchesCategory(specialty, "explosives")) explosivesDogs.add(dogId);
    if (dogMatchesCategory(specialty, "narcotics")) narcoticsDogs.add(dogId);
  }

  const stats: CheckpointDogStats = {
    explosives: countCategoryStats(explosivesDogs, exclusions, reference),
    narcotics: countCategoryStats(narcoticsDogs, exclusions, reference),
  };

  if (DEBUG) {
    console.log("[checkpoint-dog-stats]", {
      checkpointId,
      assignedDogs: [...assignedDogIds].map((dogId) => ({
        dogId,
        specialty: resolveDogSpecialty(dogId, agents, dogSpecialtyById),
      })),
      totals: stats,
    });
  }

  return stats;
}

export function computeCheckpointDogStatsMap(
  checkpoints: CheckpointWithPosts[],
  agents: AgentRow[],
  assignments: CheckpointDogAssignment[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): Map<string, CheckpointDogStats> {
  const dogSpecialtyById = buildDogSpecialtyIndex(agents);
  const map = new Map<string, CheckpointDogStats>();

  for (const checkpoint of checkpoints) {
    map.set(
      checkpoint.id,
      computeCheckpointDogStats(
        checkpoint.id,
        agents,
        assignments,
        exclusions,
        reference,
        dogSpecialtyById,
      ),
    );
  }

  if (DEBUG) {
    console.log("[checkpoint-dog-stats] map", {
      checkpoints: checkpoints.length,
      assignments: assignments.length,
      agentsWithDogs: agents.filter((agent) => agent.dog_id || agent.dogs?.id).length,
    });
  }

  return map;
}

/**
 * Page-level dog stats — same source and rules as the Chiens page:
 * all dogs from getDogs(), active/excluded via deriveDogOperationalStatus.
 */
export function computeDogOperationalStatsFromDogs(
  dogs: DogStatsInput[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): CheckpointDogStats {
  let activeTotal = 0;
  let excludedTotal = 0;
  let narcoticsActive = 0;
  let narcoticsExcluded = 0;
  let explosivesActive = 0;
  let explosivesExcluded = 0;
  const narcoticsDogIds = new Set<string>();
  const explosivesDogIds = new Set<string>();
  const debugRows: Array<{ id: string; specialty: string; status: "active" | "excluded" }> = [];

  for (const dog of dogs) {
    const operational = deriveDogOperationalStatus(dog.id, exclusions, reference);
    const isExcluded = operational.kind === "excluded";
    const status = isExcluded ? "excluded" : "active";

    debugRows.push({ id: dog.id, specialty: dog.specialty, status });

    if (isExcluded) excludedTotal += 1;
    else activeTotal += 1;

    if (isNarcoticsSpecialty(dog.specialty)) {
      narcoticsDogIds.add(dog.id);
      if (isExcluded) narcoticsExcluded += 1;
      else narcoticsActive += 1;
    }
    if (dog.specialty === "explosives") {
      explosivesDogIds.add(dog.id);
      if (isExcluded) explosivesExcluded += 1;
      else explosivesActive += 1;
    }
  }

  const stats: CheckpointDogStats = {
    narcotics: {
      total: narcoticsDogIds.size,
      active: narcoticsActive,
      excluded: narcoticsExcluded,
    },
    explosives: {
      total: explosivesDogIds.size,
      active: explosivesActive,
      excluded: explosivesExcluded,
    },
    activeTotal,
    excludedTotal,
  };

  if (DEBUG) {
    console.log("[checkpoint-dog-stats] from-dogs", {
      totalDogsLoaded: dogs.length,
      dogs: debugRows,
      finalCounts: stats,
    });
  }

  return stats;
}

/** @deprecated Prefer computeDogOperationalStatsFromDogs for page-level totals. */
export function computeAggregateCheckpointDogStats(
  agents: AgentRow[],
  assignments: CheckpointDogAssignment[],
  exclusions: AgentExclusionRecord[],
  reference: Date | string = new Date(),
): CheckpointDogStats {
  const dogSpecialtyById = buildDogSpecialtyIndex(agents);
  const uniqueDogIds = new Set(assignments.map((row) => row.dogId));

  const explosivesDogs = new Set<string>();
  const narcoticsDogs = new Set<string>();

  for (const dogId of uniqueDogIds) {
    const specialty = resolveDogSpecialty(dogId, agents, dogSpecialtyById);
    if (dogMatchesCategory(specialty, "explosives")) explosivesDogs.add(dogId);
    if (dogMatchesCategory(specialty, "narcotics")) narcoticsDogs.add(dogId);
  }

  return {
    explosives: countCategoryStats(explosivesDogs, exclusions, reference),
    narcotics: countCategoryStats(narcoticsDogs, exclusions, reference),
  };
}

type AssignmentSourceRow = {
  agent_id: string;
  dog_id: string | null;
  checkpoint_post_id: string | null;
  is_hq_reserve: boolean | number | null;
  is_off_duty: boolean | number | null;
};

function isTruthyFlag(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1;
}

function appendAssignment(
  target: CheckpointDogAssignment[],
  seen: Set<string>,
  checkpointId: string,
  agentId: string,
  dogId: string | null,
  agentById: Map<string, AgentRow>,
): void {
  const resolvedDogId = dogId ?? resolveDogIdForAgent(agentById.get(agentId));
  if (!resolvedDogId) return;

  const key = `${checkpointId}:${resolvedDogId}`;
  if (seen.has(key)) return;
  seen.add(key);

  target.push({
    checkpointId,
    agentId,
    dogId: resolvedDogId,
  });
}

/**
 * Read-only: dogs assigned to checkpoints via planning_assignments and rotation_history.
 * Does not modify planning or assignment data.
 */
export async function fetchCheckpointDogAssignments(
  db: DbClient,
  agents: AgentRow[],
): Promise<CheckpointDogAssignment[]> {
  const agentById = buildAgentById(agents);

  const [assignmentsRes, rotationRes, postsRes] = await Promise.all([
    db
      .from("planning_assignments")
      .select("agent_id, dog_id, checkpoint_post_id, is_hq_reserve, is_off_duty")
      .not("checkpoint_post_id", "is", null),
    db
      .from("rotation_history")
      .select("agent_id, checkpoint_post_id, is_hq_reserve, is_off_duty")
      .not("checkpoint_post_id", "is", null),
    db.from("checkpoint_posts").select("id, checkpoint_id"),
  ]);

  if (assignmentsRes.error) throw assignmentsRes.error;
  if (rotationRes.error) throw rotationRes.error;
  if (postsRes.error) throw postsRes.error;

  const postToCheckpoint = new Map(
    (postsRes.data ?? []).map((post: { id: string; checkpoint_id: string }) => [
      post.id,
      post.checkpoint_id,
    ]),
  );

  const rows: CheckpointDogAssignment[] = [];
  const seen = new Set<string>();

  for (const row of (assignmentsRes.data ?? []) as AssignmentSourceRow[]) {
    if (isTruthyFlag(row.is_hq_reserve) || isTruthyFlag(row.is_off_duty)) continue;
    if (!row.checkpoint_post_id) continue;
    const checkpointId = postToCheckpoint.get(row.checkpoint_post_id);
    if (!checkpointId) continue;
    appendAssignment(rows, seen, checkpointId, row.agent_id, row.dog_id, agentById);
  }

  for (const row of (rotationRes.data ?? []) as AssignmentSourceRow[]) {
    if (isTruthyFlag(row.is_hq_reserve) || isTruthyFlag(row.is_off_duty)) continue;
    if (!row.checkpoint_post_id) continue;
    const checkpointId = postToCheckpoint.get(row.checkpoint_post_id);
    if (!checkpointId) continue;
    appendAssignment(rows, seen, checkpointId, row.agent_id, row.dog_id, agentById);
  }

  if (DEBUG) {
    console.log("[checkpoint-dog-stats] fetch", {
      planningRows: (assignmentsRes.data ?? []).length,
      rotationRows: (rotationRes.data ?? []).length,
      distinctAssignments: rows.length,
      sample: rows.slice(0, 5),
    });
  }

  return rows;
}

export const CHECKPOINT_DOG_ASSIGNMENTS_QUERY_KEY = "checkpoint-dog-assignments";
