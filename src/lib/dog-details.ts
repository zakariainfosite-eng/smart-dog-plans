import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import { fetchDogOperationalCases, type OperationalCaseWithRelations } from "@/lib/operational-case-api";
import { formatPgError } from "@/lib/soft-delete";
import type { AgentExclusionHistoryItem } from "@/lib/agent-details";

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

export type DogDetailsSectionErrors = {
  operationalCases?: string;
  exclusions?: string;
};

export type DogDetailsPayload = {
  dog: DogDetailsDog;
  operationalCases: DogOperationalCase[];
  exclusions: AgentExclusionHistoryItem[];
  sectionErrors?: DogDetailsSectionErrors;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function fetchAgentExclusionsForDogHandler(
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

export async function fetchDogDetails(db: Db, dogId: string): Promise<DogDetailsPayload> {
  const sectionErrors: DogDetailsSectionErrors = {};

  const dogRes = await db
    .from("dogs")
    .select(
      "*, agent:agents!agents_dog_id_fkey(id, first_name, last_name, professional_number, section:sections(id, name, shift_type))",
    )
    .eq("id", dogId)
    .single();

  if (dogRes.error) throw dogRes.error;

  const rawAgent = (dogRes.data as unknown as { agent: unknown }).agent;
  const agent = unwrapOne(rawAgent as DogDetailsDog["agent"] | DogDetailsDog["agent"][] | null);
  const dog = { ...(dogRes.data as Database["public"]["Tables"]["dogs"]["Row"]), agent };

  let operationalCases: DogOperationalCase[] = [];
  try {
    operationalCases = await fetchDogOperationalCases(db, dogId);
  } catch (error) {
    sectionErrors.operationalCases = formatPgError(error);
  }

  let exclusions: AgentExclusionHistoryItem[] = [];
  if (agent?.id) {
    const exclusionsRes = await fetchAgentExclusionsForDogHandler(db, agent.id);
    if (exclusionsRes.error) {
      sectionErrors.exclusions = formatPgError(exclusionsRes.error);
    } else {
      exclusions = exclusionsRes.data;
    }
  }

  return {
    dog,
    operationalCases,
    exclusions,
    sectionErrors: Object.keys(sectionErrors).length > 0 ? sectionErrors : undefined,
  };
}
