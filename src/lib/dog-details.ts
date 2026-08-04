import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import { fetchDogOperationalCases, type OperationalCaseWithRelations } from "@/lib/operational-case-api";
import { formatPgError } from "@/lib/soft-delete";
import type { AgentExclusionHistoryItem } from "@/lib/agent-details";
import { isAgentExclusionActive } from "@/lib/agent-exclusions";

type Db = DbClient;

export type DogDetailsDog = Database["public"]["Tables"]["dogs"]["Row"] & {
  agent: {
    id: string;
    first_name: string;
    last_name: string;
    professional_number: string;
    section: { id: string; name: string; shift_type: string } | null;
  } | null;
};

export type DogOperationalCase = OperationalCaseWithRelations;

export type DogDetailsStatistics = {
  operationalCases: number;
  exclusions: number;
  activeExclusions: number;
};

export type DogDetailsSectionErrors = {
  operationalCases?: string;
  exclusions?: string;
};

export type DogDetailsPayload = {
  dog: DogDetailsDog;
  operationalCases: DogOperationalCase[];
  exclusions: AgentExclusionHistoryItem[];
  statistics: DogDetailsStatistics;
  sectionErrors?: DogDetailsSectionErrors;
};

type AgentRow = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  section_id: string | null;
};

type SectionRow = {
  id: string;
  name: string;
  shift_type: string;
};

/**
 * Load dog details with flat SQLite selects.
 *
 * Avoids Supabase-style reverse embeds such as
 * `agent:agents!agents_dog_id_fkey(...)` which the local REST gateway rejects
 * (Invalid column). Assignment is stored as agents.dog_id → dogs.id.
 */
export async function fetchDogDetails(db: Db, dogId: string): Promise<DogDetailsPayload> {
  const sectionErrors: DogDetailsSectionErrors = {};

  const dogRes = await db.from("dogs").select("*").eq("id", dogId).single();
  if (dogRes.error) throw dogRes.error;

  const dogRow = dogRes.data as Database["public"]["Tables"]["dogs"]["Row"];

  const agentRes = await db
    .from("agents")
    .select("id, first_name, last_name, professional_number, section_id")
    .eq("dog_id", dogId)
    .maybeSingle();
  if (agentRes.error) throw agentRes.error;

  const agentRow = (agentRes.data as AgentRow | null) ?? null;

  let section: SectionRow | null = null;
  if (agentRow?.section_id) {
    const sectionRes = await db
      .from("sections")
      .select("id, name, shift_type")
      .eq("id", agentRow.section_id)
      .maybeSingle();
    if (sectionRes.error) throw sectionRes.error;
    section = (sectionRes.data as SectionRow | null) ?? null;
  }

  const agent: DogDetailsDog["agent"] = agentRow
    ? {
        id: agentRow.id,
        first_name: agentRow.first_name,
        last_name: agentRow.last_name,
        professional_number: agentRow.professional_number,
        section,
      }
    : null;

  const dog: DogDetailsDog = { ...dogRow, agent };

  let operationalCases: DogOperationalCase[] = [];
  try {
    operationalCases = await fetchDogOperationalCases(db, dogId);
  } catch (error) {
    sectionErrors.operationalCases = formatPgError(error);
  }

  let exclusions: AgentExclusionHistoryItem[] = [];
  const exclusionsRes = await fetchDogExclusions(db, dogId);
  if (exclusionsRes.error) {
    sectionErrors.exclusions = formatPgError(exclusionsRes.error);
  } else {
    exclusions = exclusionsRes.data;
  }

  return {
    dog,
    operationalCases,
    exclusions,
    statistics: {
      operationalCases: operationalCases.length,
      exclusions: exclusions.length,
      activeExclusions: exclusions.filter((row) => isAgentExclusionActive(row)).length,
    },
    sectionErrors: Object.keys(sectionErrors).length > 0 ? sectionErrors : undefined,
  };
}

async function fetchDogExclusions(
  db: Db,
  dogId: string,
): Promise<{ data: AgentExclusionHistoryItem[]; error: unknown | null }> {
  const { data, error } = await db
    .from("agent_exclusions")
    .select("*")
    .eq("dog_id", dogId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };
  return { data: (data ?? []) as AgentExclusionHistoryItem[], error: null };
}
