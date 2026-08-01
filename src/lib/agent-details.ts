import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import {
  fetchAgentOperationalCases,
  resolveOperationalCasesTable,
  type OperationalCaseWithRelations,
} from "@/lib/operational-case-api";
import { computeAgentCareerSummary, type AgentCareerSummary } from "@/lib/agent-career";
import { formatPgError } from "@/lib/soft-delete";

type Db = DbClient;

export type AgentDetailsAgent = Database["public"]["Tables"]["agents"]["Row"] & {
  sections: { id: string; name: string; shift_type: string } | null;
  dogs: {
    id: string;
    name: string;
    specialty: string;
    status: string;
    active: boolean;
  } | null;
};

export type AgentPlanningHistoryItem = {
  id: string;
  planningDate: string;
  shift: string;
  sectionName: string | null;
  checkpointName: string | null;
  validated: boolean;
  isHqReserve: boolean;
};

export type AgentRotationHistoryItem = {
  id: string;
  planningDate: string;
  checkpointName: string | null;
  isHqReserve: boolean;
};

export type AgentExclusionHistoryItem = Database["public"]["Tables"]["agent_exclusions"]["Row"];

export type AgentOperationalCase = OperationalCaseWithRelations;

export type AgentDetailsSectionErrors = {
  exclusions?: string;
  operationalCases?: string;
  careerSummary?: string;
  history?: string;
};

export type AgentDetailsPayload = {
  agent: AgentDetailsAgent;
  operationalCases: AgentOperationalCase[];
  recentPlanning: AgentPlanningHistoryItem[];
  recentRotations: AgentRotationHistoryItem[];
  exclusions: AgentExclusionHistoryItem[];
  careerSummary: AgentCareerSummary | null;
  sectionErrors?: AgentDetailsSectionErrors;
};

async function fetchAgentExclusionsForDetails(
  db: Db,
  agentId: string,
): Promise<{ data: AgentExclusionHistoryItem[]; error: unknown | null }> {
  const { data, error } = await db
    .from("agent_exclusions")
    .select("*")
    .eq("agent_id", agentId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };
  return { data: data ?? [], error: null };
}

async function fetchAgentCareerSummary(
  db: Db,
  agentId: string,
): Promise<{ data: AgentCareerSummary | null; error: unknown | null }> {
  const casesTable = await resolveOperationalCasesTable(db);
  const [careerCasesRes, careerExclusionsRes] = await Promise.all([
    db
      .from(casesTable)
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId),
    db.from("agent_exclusions").select("exclusion_type").eq("agent_id", agentId),
  ]);

  if (careerCasesRes.error) return { data: null, error: careerCasesRes.error };
  if (careerExclusionsRes.error) return { data: null, error: careerExclusionsRes.error };

  return {
    data: computeAgentCareerSummary(
      careerCasesRes.count ?? 0,
      (careerExclusionsRes.data ?? []).map((row: any) => row.exclusion_type),
    ),
    error: null,
  };
}

/** Resolve checkpoint_post_id → checkpoint name via flat SQLite selects (no PostgREST embeds). */
async function fetchCheckpointNamesByPostId(
  db: Db,
  postIds: string[],
): Promise<{ data: Map<string, string>; error: unknown | null }> {
  const uniqueIds = [...new Set(postIds.filter(Boolean))];
  if (uniqueIds.length === 0) return { data: new Map(), error: null };

  const postsRes = await db
    .from("checkpoint_posts")
    .select("id, checkpoint_id")
    .in("id", uniqueIds);
  if (postsRes.error) return { data: new Map(), error: postsRes.error };

  const posts = (postsRes.data ?? []) as Array<{ id: string; checkpoint_id: string | null }>;
  const checkpointIds = [
    ...new Set(posts.map((row) => row.checkpoint_id).filter((id): id is string => Boolean(id))),
  ];
  if (checkpointIds.length === 0) return { data: new Map(), error: null };

  const checkpointsRes = await db
    .from("checkpoints")
    .select("id, name")
    .in("id", checkpointIds);
  if (checkpointsRes.error) return { data: new Map(), error: checkpointsRes.error };

  const checkpointNameById = new Map(
    ((checkpointsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.id,
      row.name,
    ]),
  );
  const nameByPostId = new Map<string, string>();
  for (const post of posts) {
    if (!post.checkpoint_id) continue;
    const name = checkpointNameById.get(post.checkpoint_id);
    if (name) nameByPostId.set(post.id, name);
  }
  return { data: nameByPostId, error: null };
}

/**
 * Agent planning history via flat table reads + in-memory joins.
 * Avoids Supabase-style relational embeds on planning_id which the SQLite gateway rejects.
 */
async function fetchAgentPlanningHistory(
  db: Db,
  agentId: string,
): Promise<{ data: AgentPlanningHistoryItem[]; error: unknown | null }> {
  const assignmentsRes = await db
    .from("planning_assignments")
    .select("id, planning_id, checkpoint_post_id, is_hq_reserve, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (assignmentsRes.error) return { data: [], error: assignmentsRes.error };

  const assignments = (assignmentsRes.data ?? []) as Array<{
    id: string;
    planning_id: string;
    checkpoint_post_id: string | null;
    is_hq_reserve: boolean;
  }>;
  if (assignments.length === 0) return { data: [], error: null };

  const planningIds = [...new Set(assignments.map((row) => row.planning_id).filter(Boolean))];
  const postIds = assignments
    .filter((row) => !row.is_hq_reserve && row.checkpoint_post_id)
    .map((row) => row.checkpoint_post_id as string);

  const [planningRes, checkpointNamesResult] = await Promise.all([
    planningIds.length > 0
      ? db
          .from("planning")
          .select("id, planning_date, shift, validated, section_id")
          .in("id", planningIds)
      : Promise.resolve({ data: [] as unknown[], error: null as unknown | null }),
    fetchCheckpointNamesByPostId(db, postIds),
  ]);

  if (planningRes.error) return { data: [], error: planningRes.error };
  if (checkpointNamesResult.error) return { data: [], error: checkpointNamesResult.error };

  const planningRows = (planningRes.data ?? []) as Array<{
    id: string;
    planning_date: string;
    shift: string;
    validated: boolean;
    section_id: string;
  }>;
  const planningById = new Map(planningRows.map((row) => [row.id, row]));

  const sectionIds = [
    ...new Set(planningRows.map((row) => row.section_id).filter((id): id is string => Boolean(id))),
  ];
  const sectionsRes =
    sectionIds.length > 0
      ? await db.from("sections").select("id, name").in("id", sectionIds)
      : { data: [] as unknown[], error: null as unknown | null };
  if (sectionsRes.error) return { data: [], error: sectionsRes.error };

  const sectionNameById = new Map(
    ((sectionsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.id,
      row.name,
    ]),
  );

  const recentPlanning: AgentPlanningHistoryItem[] = assignments.slice(0, 15).map((row) => {
    const planning = planningById.get(row.planning_id);
    return {
      id: row.id,
      planningDate: planning?.planning_date ?? "—",
      shift: planning?.shift ?? "—",
      sectionName: planning ? (sectionNameById.get(planning.section_id) ?? null) : null,
      checkpointName: row.is_hq_reserve
        ? null
        : row.checkpoint_post_id
          ? (checkpointNamesResult.data.get(row.checkpoint_post_id) ?? null)
          : null,
      validated: planning?.validated ?? false,
      isHqReserve: Boolean(row.is_hq_reserve),
    };
  });

  return { data: recentPlanning, error: null };
}

/** Agent rotation history via flat table reads + in-memory joins (SQLite-safe). */
async function fetchAgentRotationHistory(
  db: Db,
  agentId: string,
): Promise<{ data: AgentRotationHistoryItem[]; error: unknown | null }> {
  const rotationsRes = await db
    .from("rotation_history")
    .select("id, planning_date, is_hq_reserve, checkpoint_post_id")
    .eq("agent_id", agentId)
    .order("planning_date", { ascending: false })
    .limit(30);

  if (rotationsRes.error) return { data: [], error: rotationsRes.error };

  const rotations = (rotationsRes.data ?? []) as Array<{
    id: string;
    planning_date: string;
    is_hq_reserve: boolean;
    checkpoint_post_id: string | null;
  }>;
  if (rotations.length === 0) return { data: [], error: null };

  const postIds = rotations
    .filter((row) => !row.is_hq_reserve && row.checkpoint_post_id)
    .map((row) => row.checkpoint_post_id as string);
  const checkpointNamesResult = await fetchCheckpointNamesByPostId(db, postIds);
  if (checkpointNamesResult.error) return { data: [], error: checkpointNamesResult.error };

  const recentRotations: AgentRotationHistoryItem[] = rotations.slice(0, 15).map((row) => ({
    id: row.id,
    planningDate: row.planning_date,
    checkpointName: row.is_hq_reserve
      ? null
      : row.checkpoint_post_id
        ? (checkpointNamesResult.data.get(row.checkpoint_post_id) ?? null)
        : null,
    isHqReserve: Boolean(row.is_hq_reserve),
  }));

  return { data: recentRotations, error: null };
}

export async function fetchAgentDetails(
  db: Db,
  agentId: string,
): Promise<AgentDetailsPayload> {
  const sectionErrors: AgentDetailsSectionErrors = {};

  const agentRes = await db.from("agents").select("*").eq("id", agentId).single();
  if (agentRes.error) throw agentRes.error;

  const agentRow = agentRes.data as Database["public"]["Tables"]["agents"]["Row"];

  const [sectionRes, dogRes] = await Promise.all([
    agentRow.section_id
      ? db
          .from("sections")
          .select("id, name, shift_type")
          .eq("id", agentRow.section_id)
          .maybeSingle()
      : Promise.resolve({ data: null as unknown | null, error: null as unknown | null }),
    agentRow.dog_id
      ? db
          .from("dogs")
          .select("id, name, specialty, status, active")
          .eq("id", agentRow.dog_id)
          .maybeSingle()
      : Promise.resolve({ data: null as unknown | null, error: null as unknown | null }),
  ]);

  if (sectionRes.error) throw sectionRes.error;
  if (dogRes.error) throw dogRes.error;

  const agent: AgentDetailsAgent = {
    ...agentRow,
    sections: (sectionRes.data as AgentDetailsAgent["sections"]) ?? null,
    dogs: (dogRes.data as AgentDetailsAgent["dogs"]) ?? null,
  };

  const [
    planningHistoryResult,
    rotationHistoryResult,
    exclusionsResult,
    operationalCasesResult,
    careerResult,
  ] = await Promise.all([
    fetchAgentPlanningHistory(db, agentId),
    fetchAgentRotationHistory(db, agentId),
    fetchAgentExclusionsForDetails(db, agentId),
    fetchAgentOperationalCases(db, agentId).then(
      (data) => ({ data, error: null as unknown | null }),
      (error) => ({ data: [] as AgentOperationalCase[], error }),
    ),
    fetchAgentCareerSummary(db, agentId),
  ]);

  if (planningHistoryResult.error || rotationHistoryResult.error) {
    sectionErrors.history = formatPgError(
      planningHistoryResult.error ?? rotationHistoryResult.error,
    );
  }

  if (exclusionsResult.error) {
    sectionErrors.exclusions = formatPgError(exclusionsResult.error);
  }

  if (operationalCasesResult.error) {
    sectionErrors.operationalCases = formatPgError(operationalCasesResult.error);
  }

  if (careerResult.error) {
    sectionErrors.careerSummary = formatPgError(careerResult.error);
  }

  return {
    agent,
    operationalCases: operationalCasesResult.data,
    recentPlanning: planningHistoryResult.error ? [] : planningHistoryResult.data,
    recentRotations: rotationHistoryResult.error ? [] : rotationHistoryResult.data,
    exclusions: exclusionsResult.data,
    careerSummary: careerResult.data,
    sectionErrors: Object.keys(sectionErrors).length > 0 ? sectionErrors : undefined,
  };
}
