import type { DbClient } from "@/integrations/database/client";
import { getSections } from "@/integrations/database";
import {
  isDogLevelExclusionType,
  todayISODate,
} from "@/lib/agent-exclusions";
import { loadPlanningContext } from "@/lib/planning/load-planning-context";
import {
  buildSectionRotationSchedule,
  currentOperationalShift,
} from "@/lib/planning/section-rotation";
import { parseISO } from "date-fns";

export type OperationalSummary = {
  dateISO: string;
  hasPlanning: boolean;
  hasActiveSection: boolean;
  sectionName: string;
  shift: "day" | "night";
  commanderName: string;
  commanderGrade: string;
  commanderMle: string;
  agentsMaladie: number;
  agentsFormation: number;
  agentsConge: number;
  unavailableDogs: number;
};

export const OPERATIONAL_SUMMARY_QUERY_KEY = ["operational-summary"] as const;

const CONGE_EXCLUSION_TYPES = new Set([
  "annual_leave",
  "special_leave",
  "administrative_leave",
]);

export function createEmptyOperationalSummary(
  referenceDate = new Date(),
): OperationalSummary {
  return {
    dateISO: todayISODate(),
    hasPlanning: false,
    hasActiveSection: false,
    sectionName: "—",
    shift: currentOperationalShift(referenceDate),
    commanderName: "",
    commanderGrade: "",
    commanderMle: "",
    agentsMaladie: 0,
    agentsFormation: 0,
    agentsConge: 0,
    unavailableDogs: 0,
  };
}

function countOperationalExclusions(
  exclusions: Array<{ agent_id: string | null; dog_id?: string | null; exclusion_type: string }>,
  sectionAgentIds: Set<string>,
) {
  const maladie = new Set<string>();
  const formation = new Set<string>();
  const conge = new Set<string>();
  const unavailableDogs = new Set<string>();

  for (const exclusion of exclusions) {
    const inSection = exclusion.agent_id != null && sectionAgentIds.has(exclusion.agent_id);
    if (!inSection && !isDogLevelExclusionType(exclusion.exclusion_type)) continue;

    if (exclusion.exclusion_type === "sickness" && exclusion.agent_id) {
      maladie.add(exclusion.agent_id);
    } else if (exclusion.exclusion_type === "training" && exclusion.agent_id) {
      formation.add(exclusion.agent_id);
    } else if (CONGE_EXCLUSION_TYPES.has(exclusion.exclusion_type) && exclusion.agent_id) {
      conge.add(exclusion.agent_id);
    } else if (isDogLevelExclusionType(exclusion.exclusion_type)) {
      unavailableDogs.add(exclusion.dog_id ?? exclusion.agent_id ?? exclusion.exclusion_type);
    }
  }

  return {
    agentsMaladie: maladie.size,
    agentsFormation: formation.size,
    agentsConge: conge.size,
    unavailableDogs: unavailableDogs.size,
  };
}

export async function fetchOperationalSummary(
  db: DbClient,
  referenceDate = new Date(),
): Promise<OperationalSummary> {
  const dateISO = todayISODate();
  const shift = currentOperationalShift(referenceDate);
  const empty = createEmptyOperationalSummary(referenceDate);

  // Same IPC source as Sections / Daily Planning pages.
  const sectionRows = await getSections();
  const activeSections = sectionRows
    .filter((row) => row.active)
    .map((row) => ({
      id: row.id,
      name: row.name,
      commander_full_name: row.commander_full_name,
      commander_grade: row.commander_grade,
      commander_mle: row.commander_mle,
    }));

  const schedule = buildSectionRotationSchedule(activeSections, referenceDate);
  const activeSection = shift === "day" ? schedule.day : schedule.night;

  if (!activeSection) {
    return empty;
  }

  const { data: planningRow, error: planningError } = await db
    .from("planning")
    .select("id, validated")
    .eq("planning_date", dateISO)
    .eq("section_id", activeSection.id)
    .eq("shift", shift)
    .eq("validated", true)
    .maybeSingle();

  if (planningError) throw planningError;

  const ctx = await loadPlanningContext(
    db,
    dateISO,
    activeSection.id,
    parseISO(dateISO),
  );

  const sectionAgentIds = new Set(ctx.agents.map((agent) => agent.id));
  const exclusionCounts = countOperationalExclusions(ctx.exclusions, sectionAgentIds);

  return {
    dateISO,
    hasPlanning: !!planningRow,
    hasActiveSection: true,
    sectionName: activeSection.name,
    shift,
    commanderName: activeSection.commander_full_name.trim(),
    commanderGrade: activeSection.commander_grade.trim(),
    commanderMle: activeSection.commander_mle.trim(),
    ...exclusionCounts,
  };
}
