import { parseISO } from "date-fns";
import type { DbClient } from "@/integrations/database/client";
import { getSections } from "@/integrations/database";
import {
  fetchActiveExclusionsForDate,
  isAgentLevelExclusionType,
} from "@/lib/agent-exclusions";
import {
  buildFeuillePresenceData,
  collectFeuillePresenceMetaAgentIds,
  type FeuillePresenceAgentMeta,
} from "@/lib/documents/build-feuille-presence-data";
import { loadActiveFemaleAgentsForPresence } from "@/lib/documents/build-cynotechniciennes-presence-data";
import { resolveAttendanceSheetCommander } from "@/lib/documents/resolve-attendance-sheet-commander";
import type { FeuillePresenceData } from "@/lib/documents/feuille-presence-types";
import type {
  CheckpointAssignment,
  EligibleTeam,
  PersistableAssignment,
  PlanningEngineResult,
  Point653Assignment,
  Shift,
  SlotAssignment,
  TeamSpecialty,
} from "@/lib/planning/engine";
import { buildSectionRotationSchedule } from "@/lib/planning/section-rotation";

type StoredPlanningRow = {
  id: string;
  planning_date: string;
  shift: Shift;
  validated: boolean;
  created_at: string;
  section_id: string;
  sections: {
    id: string;
    name: string;
    commander_full_name: string;
    commander_grade: string;
    commander_mle: string;
  } | null;
};

type StoredAssignmentRow = {
  id: string;
  planning_id: string;
  checkpoint_post_id: string | null;
  agent_id: string;
  dog_id: string | null;
  is_hq_reserve: boolean;
  is_off_duty: boolean;
  agents:
    | {
        id: string;
        first_name: string;
        last_name: string;
        professional_number: string;
        grade: string;
        gender: string;
      }
    | Array<{
        id: string;
        first_name: string;
        last_name: string;
        professional_number: string;
        grade: string;
        gender: string;
      }>
    | null;
  dogs:
    | { id: string; name: string; specialty: string }
    | Array<{ id: string; name: string; specialty: string }>
    | null;
  checkpoint_posts:
    | {
        id: string;
        specialty_required: TeamSpecialty;
        required_agents: number;
        shift: Shift;
        checkpoint_id: string;
        checkpoints:
          | { id: string; name: string; night_only: boolean }
          | Array<{ id: string; name: string; night_only: boolean }>;
      }
    | Array<{
        id: string;
        specialty_required: TeamSpecialty;
        required_agents: number;
        shift: Shift;
        checkpoint_id: string;
        checkpoints:
          | { id: string; name: string; night_only: boolean }
          | Array<{ id: string; name: string; night_only: boolean }>;
      }>
    | null;
};

export type StoredPlanningDetail = {
  id: string;
  planning_date: string;
  shift: Shift;
  validated: boolean;
  created_at: string;
  section: {
    id: string;
    name: string;
    commander_full_name: string;
    commander_grade: string;
    commander_mle: string;
    index: number;
  };
  engineResult: PlanningEngineResult;
};

export type StoredPlanningExportBundle = {
  planningDate: Date;
  shift: Shift;
  sectionName: string;
  data: FeuillePresenceData;
  basename: string;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toTeamSpecialty(value: string | null | undefined): TeamSpecialty {
  return value === "explosives" ? "explosives" : "narcotics";
}

function toEligibleTeam(row: StoredAssignmentRow): EligibleTeam {
  const agent = unwrapOne(row.agents);
  const dog = unwrapOne(row.dogs);
  return {
    agent_id: row.agent_id,
    agent_name: `${agent?.first_name ?? ""} ${agent?.last_name ?? ""}`.trim(),
    professional_number: agent?.professional_number ?? "",
    dog_id: row.dog_id,
    dog_name: dog?.name ?? null,
    specialty: dog ? toTeamSpecialty(dog.specialty) : null,
    gender: agent?.gender === "female" ? "female" : "male",
    agent_only: !row.dog_id,
  };
}

function buildEngineResultFromAssignments(
  assignments: StoredAssignmentRow[],
): PlanningEngineResult {
  const operational = assignments.filter(
    (row) => !row.is_hq_reserve && !row.is_off_duty && row.checkpoint_post_id,
  );
  const point653Rows = assignments.filter((row) => row.is_hq_reserve);
  const offDutyRows = assignments.filter((row) => row.is_off_duty);

  const byCheckpoint = new Map<string, StoredAssignmentRow[]>();
  for (const row of operational) {
    const post = unwrapOne(row.checkpoint_posts);
    const checkpoint = unwrapOne(post?.checkpoints);
    if (!checkpoint) continue;
    const list = byCheckpoint.get(checkpoint.id) ?? [];
    list.push(row);
    byCheckpoint.set(checkpoint.id, list);
  }

  const checkpoints: CheckpointAssignment[] = [];

  for (const [checkpointId, rows] of byCheckpoint) {
    const checkpoint = unwrapOne(unwrapOne(rows[0]?.checkpoint_posts)?.checkpoints);
    if (!checkpoint) continue;

    const postStats = new Map<
      string,
      { specialty_required: TeamSpecialty; required: number; staffed: number }
    >();
    const slots: SlotAssignment[] = [];

    for (const row of rows) {
      const post = unwrapOne(row.checkpoint_posts);
      if (!post) continue;

      slots.push({
        post_id: post.id,
        specialty_required: post.specialty_required,
        team: toEligibleTeam(row),
      });

      const existing = postStats.get(post.id);
      if (existing) {
        existing.staffed += 1;
      } else {
        postStats.set(post.id, {
          specialty_required: post.specialty_required,
          required: post.required_agents,
          staffed: 1,
        });
      }
    }

    const posts = [...postStats.entries()].map(([post_id, stats]) => ({
      post_id,
      specialty_required: stats.specialty_required,
      required: stats.required,
      staffed: stats.staffed,
    }));

    const total_staffed = slots.length;
    const total_required = posts.reduce((sum, post) => sum + post.required, 0);

    checkpoints.push({
      checkpoint_id: checkpointId,
      checkpoint_name: checkpoint.name,
      night_only: Boolean(checkpoint.night_only),
      posts,
      slots,
      total_required,
      total_staffed,
      is_understaffed: total_staffed < total_required,
    });
  }

  checkpoints.sort((a, b) => a.checkpoint_name.localeCompare(b.checkpoint_name));

  const persistable: PersistableAssignment[] = operational
    .map((row) => {
      const post = unwrapOne(row.checkpoint_posts);
      const checkpoint = unwrapOne(post?.checkpoints);
      if (!post || !checkpoint || !row.checkpoint_post_id) return null;
      return {
        agent_id: row.agent_id,
        dog_id: row.dog_id,
        checkpoint_id: checkpoint.id,
        checkpoint_post_id: row.checkpoint_post_id,
      };
    })
    .filter((row): row is PersistableAssignment => row != null);

  const point653: Point653Assignment[] = point653Rows.map((row) => ({
    ...toEligibleTeam(row),
    reason: "no_operational_assignment",
  }));

  const offDuty = offDutyRows.map(toEligibleTeam);
  const assignedToCheckpoints = operational.length;

  return {
    eligible: [],
    excluded: [],
    agentExclusions: [],
    checkpoints,
    unassigned: [],
    point653,
    offDuty,
    assignments: persistable,
    structuredWarnings: [],
    summary: {
      totalEmployees: assignedToCheckpoints + point653.length + offDuty.length,
      assignedEmployees: assignedToCheckpoints + point653.length + offDuty.length,
      assignedToCheckpoints,
      point653Employees: point653.length,
      restEmployees: offDuty.length,
      unassignedEmployees: 0,
      fullyStaffedCheckpoints: checkpoints.filter((cp) => !cp.is_understaffed).length,
      understaffedCheckpoints: checkpoints.filter((cp) => cp.is_understaffed).length,
      agentExclusionCount: 0,
      warnings: [],
    },
  };
}

function restError(
  error: { message?: string; code?: string } | null | undefined,
  context: string,
): Error {
  const message = error?.message?.trim() || "Unknown database error";
  const code = error?.code ? ` [${error.code}]` : "";
  return new Error(`${context}: ${message}${code}`);
}

async function fetchRowsByIds<T extends Record<string, unknown>>(
  client: DbClient,
  table: string,
  columns: string,
  ids: Array<string | null | undefined>,
): Promise<T[]> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return [];
  const { data, error } = await client.from(table).select(columns).in("id", unique);
  if (error) throw restError(error, `SELECT ${table}`);
  return (data ?? []) as T[];
}

type AssignmentAgent = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: string;
};

type AssignmentDog = { id: string; name: string; specialty: string };

type AssignmentPost = {
  id: string;
  specialty_required: TeamSpecialty;
  required_agents: number;
  shift: Shift;
  checkpoint_id: string;
};

type AssignmentCheckpoint = { id: string; name: string; night_only: boolean };

function attachAssignmentRelations(
  assignments: Array<{
    id: string;
    planning_id: string;
    checkpoint_post_id: string | null;
    agent_id: string;
    dog_id: string | null;
    is_hq_reserve: boolean;
    is_off_duty: boolean;
  }>,
  agentsById: Map<string, AssignmentAgent>,
  dogsById: Map<string, AssignmentDog>,
  postsById: Map<string, AssignmentPost>,
  checkpointsById: Map<string, AssignmentCheckpoint>,
): StoredAssignmentRow[] {
  return assignments.map((row) => {
    const post = row.checkpoint_post_id ? postsById.get(row.checkpoint_post_id) ?? null : null;
    const checkpoint = post ? checkpointsById.get(post.checkpoint_id) ?? null : null;
    return {
      ...row,
      agents: agentsById.get(row.agent_id) ?? null,
      dogs: row.dog_id ? dogsById.get(row.dog_id) ?? null : null,
      checkpoint_posts: post
        ? {
            ...post,
            checkpoints: checkpoint,
          }
        : null,
    };
  });
}

/**
 * Rebuild the planning engine view from persisted SQLite rows.
 * Uses the same identifiers as Historique (`planning.id` / `planning_assignments.planning_id`)
 * and flat queries — no nested PostgREST embeds — so Capacitor SQLite can load them.
 */
export async function loadStoredPlanningDetail(
  client: DbClient,
  planningId: string,
): Promise<StoredPlanningDetail> {
  const id = planningId?.trim();
  console.info("[history] loadStoredPlanningDetail:start", {
    planningId: id,
    table: "planning",
  });

  const { data: planning, error: planningError } = await client
    .from("planning")
    .select("id, planning_date, shift, validated, created_at, section_id")
    .eq("id", id)
    .maybeSingle();

  if (planningError) {
    console.error("[history] planning query failed", {
      planningId: id,
      table: "planning",
      query: { id },
      error: planningError,
    });
    throw restError(planningError, `SELECT planning WHERE id = ${id}`);
  }
  if (!planning) {
    console.error("[history] planning row missing", { planningId: id, table: "planning" });
    throw new Error(`Planning not found: ${id}`);
  }

  const planningRow = planning as {
    id: string;
    planning_date: string;
    shift: Shift;
    validated: boolean;
    created_at: string;
    section_id: string;
  };

  console.info("[history] loadStoredPlanningDetail:planning", {
    id: planningRow.id,
    planning_date: planningRow.planning_date,
    shift: planningRow.shift,
    section_id: planningRow.section_id,
    validated: planningRow.validated,
  });

  const { data: sectionData, error: sectionError } = await client
    .from("sections")
    .select("id, name, commander_full_name, commander_grade, commander_mle")
    .eq("id", planningRow.section_id)
    .maybeSingle();

  if (sectionError) {
    console.error("[history] section query failed", {
      planningId: id,
      table: "sections",
      query: { id: planningRow.section_id },
      error: sectionError,
    });
    throw restError(sectionError, `SELECT sections WHERE id = ${planningRow.section_id}`);
  }
  if (!sectionData) {
    console.error("[history] section row missing", {
      planningId: id,
      table: "sections",
      section_id: planningRow.section_id,
    });
    throw new Error(`Planning section not found: ${planningRow.section_id}`);
  }

  const section = sectionData as {
    id: string;
    name: string;
    commander_full_name: string;
    commander_grade: string;
    commander_mle: string;
  };

  const { data: assignmentRows, error: assignmentError } = await client
    .from("planning_assignments")
    .select("id, planning_id, checkpoint_post_id, agent_id, dog_id, is_hq_reserve, is_off_duty")
    .eq("planning_id", id);

  if (assignmentError) {
    console.error("[history] assignments query failed", {
      planningId: id,
      table: "planning_assignments",
      query: { planning_id: id },
      error: assignmentError,
    });
    throw restError(assignmentError, `SELECT planning_assignments WHERE planning_id = ${id}`);
  }

  const assignments = (assignmentRows ?? []) as Array<{
    id: string;
    planning_id: string;
    checkpoint_post_id: string | null;
    agent_id: string;
    dog_id: string | null;
    is_hq_reserve: boolean;
    is_off_duty: boolean;
  }>;

  console.info("[history] loadStoredPlanningDetail:assignments", {
    planningId: id,
    table: "planning_assignments",
    count: assignments.length,
  });

  const [agents, dogs, posts] = await Promise.all([
    fetchRowsByIds<Record<string, unknown>>(
      client,
      "agents",
      "id, first_name, last_name, professional_number, grade, gender",
      assignments.map((row) => row.agent_id),
    ),
    fetchRowsByIds<Record<string, unknown>>(
      client,
      "dogs",
      "id, name, specialty",
      assignments.map((row) => row.dog_id),
    ),
    fetchRowsByIds<Record<string, unknown>>(
      client,
      "checkpoint_posts",
      "id, specialty_required, required_agents, shift, checkpoint_id",
      assignments.map((row) => row.checkpoint_post_id),
    ),
  ]);

  const checkpoints = await fetchRowsByIds<Record<string, unknown>>(
    client,
    "checkpoints",
    "id, name, night_only",
    posts.map((post) => String(post.checkpoint_id ?? "")),
  );

  const hydrated = attachAssignmentRelations(
    assignments,
    new Map(
      agents.map((agent) => [
        String(agent.id),
        {
          id: String(agent.id),
          first_name: String(agent.first_name ?? ""),
          last_name: String(agent.last_name ?? ""),
          professional_number: String(agent.professional_number ?? ""),
          grade: String(agent.grade ?? ""),
          gender: String(agent.gender ?? "male"),
        },
      ]),
    ),
    new Map(
      dogs.map((dog) => [
        String(dog.id),
        {
          id: String(dog.id),
          name: String(dog.name ?? ""),
          specialty: String(dog.specialty ?? ""),
        },
      ]),
    ),
    new Map(
      posts.map((post) => [
        String(post.id),
        {
          id: String(post.id),
          specialty_required: toTeamSpecialty(String(post.specialty_required ?? "")),
          required_agents: Number(post.required_agents ?? 0),
          shift: (post.shift === "night" ? "night" : "day") as Shift,
          checkpoint_id: String(post.checkpoint_id ?? ""),
        },
      ]),
    ),
    new Map(
      checkpoints.map((checkpoint) => [
        String(checkpoint.id),
        {
          id: String(checkpoint.id),
          name: String(checkpoint.name ?? ""),
          night_only: Boolean(checkpoint.night_only),
        },
      ]),
    ),
  );

  const row: StoredPlanningRow = {
    ...planningRow,
    sections: section,
  };

  let sectionIndex = 0;
  try {
    const sections = await getSections();
    const schedule = buildSectionRotationSchedule(
      sections.filter((entry) => entry.active),
      parseISO(row.planning_date),
    );
    sectionIndex = schedule.list.find((entry) => entry.id === row.section_id)?.index ?? 0;
  } catch (rotationError) {
    console.error("[history] section rotation lookup failed (detail still loads)", rotationError);
  }

  const engineResult = buildEngineResultFromAssignments(hydrated);

  console.info("[history] loadStoredPlanningDetail:ok", {
    planningId: row.id,
    planning_date: row.planning_date,
    shift: row.shift,
    section: section.name,
    assignmentCount: hydrated.length,
  });

  return {
    id: row.id,
    planning_date: row.planning_date,
    shift: row.shift,
    validated: Boolean(row.validated),
    created_at: row.created_at,
    section: {
      id: section.id,
      name: section.name,
      commander_full_name: section.commander_full_name ?? "",
      commander_grade: section.commander_grade ?? "",
      commander_mle: section.commander_mle ?? "",
      index: sectionIndex,
    },
    engineResult,
  };
}

/** Build Feuille de présence export data from a stored planning archive row. */
export async function prepareStoredPlanningExport(
  client: DbClient,
  planningId: string,
): Promise<StoredPlanningExportBundle> {
  const detail = await loadStoredPlanningDetail(client, planningId);
  const planningDate = parseISO(detail.planning_date);
  const metaAgentIds = collectFeuillePresenceMetaAgentIds(detail.engineResult);

  let agentsMeta: FeuillePresenceAgentMeta[] = [];
  if (metaAgentIds.length > 0) {
    const { data: agentsRaw, error } = await client
      .from("agents")
      .select("id, first_name, last_name, professional_number, grade, dogs:dog_id(name, specialty)")
      .in("id", metaAgentIds);

    if (error) throw error;

    agentsMeta = (agentsRaw ?? []).map((agent: Record<string, unknown>) => {
      const dogs = agent.dogs;
      const dog = unwrapOne(
        dogs as { name: string; specialty: string } | Array<{ name: string; specialty: string }>,
      );
      const specialty = dog?.specialty;
      return {
        id: String(agent.id),
        first_name: String(agent.first_name ?? ""),
        last_name: String(agent.last_name ?? ""),
        professional_number: String(agent.professional_number ?? ""),
        grade: String(agent.grade ?? ""),
        is_section_chief: false,
        dog_name: dog?.name ?? null,
        dog_specialty:
          specialty === "narcotics" || specialty === "explosives" ? specialty : null,
      };
    });
  }

  // PDF / attendance sheet: evaluate exclusions against the planning date, not today.
  const exclusionsRaw = await fetchActiveExclusionsForDate(client, detail.planning_date);
  const exclusionTypesByAgent: Record<string, string> = {};
  for (const exclusion of exclusionsRaw) {
    if (!exclusion.agent_id || !metaAgentIds.includes(exclusion.agent_id)) continue;
    if (!isAgentLevelExclusionType(exclusion.exclusion_type)) continue;
    exclusionTypesByAgent[exclusion.agent_id] = exclusion.exclusion_type;
  }

  const resolvedCommander = await resolveAttendanceSheetCommander(
    client,
    detail.section.id,
    {
      fullName: detail.section.commander_full_name,
      grade: detail.section.commander_grade,
      mle: detail.section.commander_mle,
    },
    exclusionsRaw,
  );

  const femaleAgents = await loadActiveFemaleAgentsForPresence(client);

  const buildResult = buildFeuillePresenceData({
    planningDate,
    shift: detail.shift,
    sectionName: detail.section.name,
    sectionIndex: detail.section.index,
    sectionCommander: {
      fullName: resolvedCommander.fullName,
      grade: resolvedCommander.grade,
      mle: resolvedCommander.mle,
      needsManualFill: resolvedCommander.needsManualFill,
      mode: resolvedCommander.mode,
    },
    agents: agentsMeta,
    femaleAgents,
    exclusionTypesByAgent,
    engineResult: detail.engineResult,
  });

  if (!buildResult.ok) {
    throw new Error("Incomplete data for the attendance sheet export.");
  }

  return {
    planningDate,
    shift: detail.shift,
    sectionName: detail.section.name,
    data: buildResult.data,
    basename: `Planning_${detail.planning_date}`,
  };
}
