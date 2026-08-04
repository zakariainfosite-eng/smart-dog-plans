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

/** Rebuild the planning engine view from persisted SQLite rows. */
export async function loadStoredPlanningDetail(
  client: DbClient,
  planningId: string,
): Promise<StoredPlanningDetail> {
  const { data: planning, error: planningError } = await client
    .from("planning")
    .select("id, planning_date, shift, validated, created_at, section_id")
    .eq("id", planningId)
    .single();

  if (planningError) throw planningError;

  const planningRow = planning as {
    id: string;
    planning_date: string;
    shift: Shift;
    validated: boolean;
    created_at: string;
    section_id: string;
  };

  const { data: sectionData, error: sectionError } = await client
    .from("sections")
    .select("id, name, commander_full_name, commander_grade, commander_mle")
    .eq("id", planningRow.section_id)
    .maybeSingle();

  if (sectionError) throw sectionError;
  if (!sectionData) {
    throw new Error("Planning section not found.");
  }

  const section = sectionData as {
    id: string;
    name: string;
    commander_full_name: string;
    commander_grade: string;
    commander_mle: string;
  };

  const { data: assignments, error: assignmentError } = await client
    .from("planning_assignments")
    .select(
      `id, planning_id, checkpoint_post_id, agent_id, dog_id, is_hq_reserve, is_off_duty,
       agents:agent_id(id, first_name, last_name, professional_number, grade, gender),
       dogs:dog_id(id, name, specialty),
       checkpoint_posts:checkpoint_post_id(
         id, specialty_required, required_agents, shift, checkpoint_id,
         checkpoints:checkpoint_id(id, name, night_only)
       )`,
    )
    .eq("planning_id", planningId);

  if (assignmentError) throw assignmentError;

  const row: StoredPlanningRow = {
    ...planningRow,
    sections: section,
  };

  const sections = await getSections();
  const schedule = buildSectionRotationSchedule(
    sections.filter((entry) => entry.active),
    parseISO(row.planning_date),
  );
  const sectionEntry = schedule.list.find((entry) => entry.id === row.section_id);

  const engineResult = buildEngineResultFromAssignments(
    (assignments ?? []) as StoredAssignmentRow[],
  );

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
      index: sectionEntry?.index ?? 0,
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

  const exclusionsRaw = await fetchActiveExclusionsForDate(client, detail.planning_date);
  const exclusionTypesByAgent: Record<string, string> = {};
  for (const exclusion of exclusionsRaw) {
    if (!exclusion.agent_id || !metaAgentIds.includes(exclusion.agent_id)) continue;
    if (!isAgentLevelExclusionType(exclusion.exclusion_type)) continue;
    exclusionTypesByAgent[exclusion.agent_id] = exclusion.exclusion_type;
  }

  const femaleAgents = await loadActiveFemaleAgentsForPresence(client);

  const buildResult = buildFeuillePresenceData({
    planningDate,
    shift: detail.shift,
    sectionName: detail.section.name,
    sectionIndex: detail.section.index,
    sectionCommander: {
      fullName: detail.section.commander_full_name,
      grade: detail.section.commander_grade,
      mle: detail.section.commander_mle,
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
