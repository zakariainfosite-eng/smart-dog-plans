import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import { filterNotDeleted, isMissingSoftDeleteColumn } from "@/lib/soft-delete";
import type {
  CheckpointCaseRow,
  CheckpointPlanningAssignment,
  CheckpointRow,
  CheckpointStatisticsRaw,
} from "@/lib/statistics/checkpoint-stats";

type Db = DbClient;

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const CASE_SELECT =
  "*, agent:agents(id, first_name, last_name, section_id, sections(id, name)), dog:dog_id(id, name), checkpoint:checkpoint_id(id, name)" as const;

const ASSIGNMENT_SELECT =
  "id, agent_id, dog_id, planning(id, planning_date, section_id), checkpoint_posts(id, checkpoint_id, specialty_required, checkpoints(id, name))" as const;

function mapCaseRow(row: unknown): CheckpointCaseRow {
  const raw = row as Record<string, unknown>;
  const agentRaw = unwrapOne(raw.agent as CheckpointCaseRow["agent"] | CheckpointCaseRow["agent"][]);
  return {
    ...(raw as Database["public"]["Tables"]["operational_cases"]["Row"]),
    agent: agentRaw,
    dog: unwrapOne(raw.dog as CheckpointCaseRow["dog"]),
    checkpoint: unwrapOne(raw.checkpoint as CheckpointCaseRow["checkpoint"]),
  };
}

function mapAssignmentRow(row: unknown): CheckpointPlanningAssignment {
  const raw = row as Record<string, unknown>;
  const postsRaw = unwrapOne(
    raw.checkpoint_posts as CheckpointPlanningAssignment["checkpoint_posts"] | CheckpointPlanningAssignment["checkpoint_posts"][],
  );
  const checkpoints = postsRaw?.checkpoints
    ? unwrapOne(postsRaw.checkpoints as { id: string; name: string } | { id: string; name: string }[])
    : null;
  return {
    id: raw.id as string,
    agent_id: raw.agent_id as string,
    dog_id: (raw.dog_id as string | null) ?? null,
    planning: unwrapOne(raw.planning as CheckpointPlanningAssignment["planning"]),
    checkpoint_posts: postsRaw
      ? {
          ...postsRaw,
          checkpoints,
        }
      : null,
  };
}

async function fetchCases(db: Db): Promise<CheckpointCaseRow[]> {
  let { data, error } = await db
    .from("operational_cases")
    .select(CASE_SELECT)
    .eq("is_deleted", false)
    .order("case_date", { ascending: false });

  if (error && isMissingSoftDeleteColumn(error)) {
    ({ data, error } = await db.from("operational_cases").select(CASE_SELECT).order("case_date", { ascending: false }));
  }
  if (error) throw error;
  return filterNotDeleted((data ?? []).map(mapCaseRow));
}

async function fetchAssignments(db: Db): Promise<CheckpointPlanningAssignment[]> {
  const { data, error } = await db
    .from("planning_assignments")
    .select(ASSIGNMENT_SELECT)
    .not("checkpoint_post_id", "is", null);
  if (error) throw error;
  return (data ?? []).map(mapAssignmentRow);
}

export async function fetchCheckpointStatisticsRaw(db: Db): Promise<CheckpointStatisticsRaw> {
  const [checkpointsRes, sectionsRes, cases, assignments] = await Promise.all([
    db.from("checkpoints").select("id, name, active").order("name"),
    db.from("sections").select("id, name"),
    fetchCases(db),
    fetchAssignments(db),
  ]);

  if (checkpointsRes.error) throw checkpointsRes.error;
  if (sectionsRes.error) throw sectionsRes.error;

  return {
    checkpoints: (checkpointsRes.data ?? []) as CheckpointRow[],
    cases,
    assignments,
    sectionNames: new Map((sectionsRes.data ?? []).map((s: any) => [s.id, s.name])),
  };
}

export const CHECKPOINT_STATISTICS_QUERY_KEY = "checkpoint-statistics-raw";

export type SectionOption = { id: string; name: string };

export function extractSectionOptions(raw: CheckpointStatisticsRaw): SectionOption[] {
  const map = new Map<string, string>();
  for (const row of raw.cases) {
    const agent = row.agent as CheckpointCaseRow["agent"] & { sections?: { id: string; name: string } | null };
    const section = agent?.sections;
    if (section?.id && section.name) map.set(section.id, section.name);
  }
  for (const row of raw.assignments) {
    const sectionId = row.planning?.section_id;
    if (sectionId) {
      map.set(sectionId, raw.sectionNames.get(sectionId) ?? sectionId);
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
