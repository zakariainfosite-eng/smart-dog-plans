/**
 * Client-side sort / filter helpers for the Personnel table.
 * No DB schema changes — operates on already-loaded AgentRow data.
 */
import type { AgentRow } from "@/integrations/database";
import { maritalStatusSortRank } from "@/lib/marital-status";
import {
  normalizePersonnelFonction,
  PERSONNEL_FONCTIONS,
  type PersonnelFonction,
} from "@/lib/personnel-fonction";
import {
  deriveAgentAvailabilityForAgent,
  type AgentAvailability,
} from "@/lib/agent-ui";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";

/** Quick-filter statuses shown in « Tous les statuts ». */
export const PERSONNEL_STATUS_FILTER_TYPES = [
  "sickness",
  "annual_leave",
  "special_leave",
  "administrative_leave",
  "absence",
  "mission",
  "training",
  "rest",
  "suspension",
  "other",
  "dog_sick",
  "female_dog_heat",
  "dog_injured",
  "dog_temporary_retirement",
  "dog_vet_visit",
  "dog_without_handler",
  "dog_training",
  "dog_other",
] as const;

export type PersonnelStatusFilter =
  | "all"
  | "available"
  | (typeof PERSONNEL_STATUS_FILTER_TYPES)[number];

export const PERSONNEL_SORT_KEYS = [
  "matricule_asc",
  "matricule_desc",
  "name_asc",
  "name_desc",
  "grade_asc",
  "fonction_asc",
  "section_asc",
  "specialty_asc",
  "availability_asc",
  "marital_asc",
  "gender_asc",
  "seniority_asc",
  "seniority_desc",
] as const;

export type PersonnelSortKey = (typeof PERSONNEL_SORT_KEYS)[number];

export const DEFAULT_PERSONNEL_SORT: PersonnelSortKey = "matricule_asc";

const FONCTION_RANK = new Map<string, number>(
  PERSONNEL_FONCTIONS.map((f, i) => [f, i]),
);

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function specialtyRank(agent: AgentRow): number {
  const spec = agent.dogs?.specialty;
  if (spec === "narcotics") return 0;
  if (spec === "explosives") return 1;
  return 2;
}

function availabilityRank(availability: AgentAvailability): number {
  return availability.status === "available" ? 0 : 1;
}

function fonctionRank(fonction: string | null | undefined): number {
  const normalized = normalizePersonnelFonction(fonction);
  return FONCTION_RANK.get(normalized) ?? PERSONNEL_FONCTIONS.length;
}

function seniorityTime(agent: AgentRow): number {
  const raw = agent.created_at;
  if (!raw) return Number.POSITIVE_INFINITY;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** Stable tie-breaker: matricule then id. */
function compareMatricule(a: AgentRow, b: AgentRow): number {
  const byMat = compareText(a.professional_number ?? "", b.professional_number ?? "");
  if (byMat !== 0) return byMat;
  return compareText(a.id, b.id);
}

export function comparePersonnelRows(
  a: AgentRow,
  b: AgentRow,
  sortKey: PersonnelSortKey,
  exclusions: AgentExclusionRecord[],
): number {
  let primary = 0;

  switch (sortKey) {
    case "matricule_asc":
      return compareMatricule(a, b);
    case "matricule_desc":
      return compareMatricule(b, a);
    case "name_asc":
      primary = compareText(
        `${a.last_name} ${a.first_name}`,
        `${b.last_name} ${b.first_name}`,
      );
      break;
    case "name_desc":
      primary = compareText(
        `${b.last_name} ${b.first_name}`,
        `${a.last_name} ${a.first_name}`,
      );
      break;
    case "grade_asc":
      primary = compareText(a.grade ?? "", b.grade ?? "");
      break;
    case "fonction_asc":
      primary = fonctionRank(a.fonction) - fonctionRank(b.fonction);
      if (primary === 0) {
        primary = compareText(
          normalizePersonnelFonction(a.fonction),
          normalizePersonnelFonction(b.fonction),
        );
      }
      break;
    case "section_asc":
      primary = compareText(a.sections?.name ?? "", b.sections?.name ?? "");
      break;
    case "specialty_asc":
      primary = specialtyRank(a) - specialtyRank(b);
      break;
    case "availability_asc": {
      const avA = deriveAgentAvailabilityForAgent(a, exclusions);
      const avB = deriveAgentAvailabilityForAgent(b, exclusions);
      primary = availabilityRank(avA) - availabilityRank(avB);
      if (primary === 0 && avA.status === "excluded" && avB.status === "excluded") {
        primary = compareText(avA.exclusionType, avB.exclusionType);
      }
      break;
    }
    case "marital_asc":
      primary =
        maritalStatusSortRank(a.marital_status) - maritalStatusSortRank(b.marital_status);
      break;
    case "gender_asc":
      primary = compareText(a.gender ?? "", b.gender ?? "");
      break;
    case "seniority_asc":
      // Longer tenure first (older created_at).
      primary = seniorityTime(a) - seniorityTime(b);
      break;
    case "seniority_desc":
      primary = seniorityTime(b) - seniorityTime(a);
      break;
    default:
      primary = 0;
  }

  if (primary !== 0) return primary;
  return compareMatricule(a, b);
}

/** Search Nom + Matricule + Grade + Fonction + Origine. */
export function personnelMatchesSearch(
  agent: AgentRow,
  query: string,
  fonctionLabel: (fonction: PersonnelFonction) => string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const fonction = normalizePersonnelFonction(agent.fonction);
  const hay = [
    agent.first_name,
    agent.last_name,
    `${agent.first_name} ${agent.last_name}`,
    `${agent.last_name} ${agent.first_name}`,
    agent.professional_number,
    agent.grade,
    agent.origine ?? "",
    fonctionLabel(fonction),
    fonction,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function personnelMatchesStatusFilter(
  agent: Pick<AgentRow, "id" | "dog_id">,
  exclusions: AgentExclusionRecord[],
  statusFilter: PersonnelStatusFilter,
): boolean {
  if (statusFilter === "all") return true;
  const availability = deriveAgentAvailabilityForAgent(agent, exclusions);
  if (statusFilter === "available") {
    return availability.status === "available";
  }
  return (
    availability.status === "excluded" && availability.exclusionType === statusFilter
  );
}

/** Unique non-empty grades from the loaded roster (sorted). */
export function uniquePersonnelGrades(agents: readonly AgentRow[]): string[] {
  const set = new Set<string>();
  for (const agent of agents) {
    const grade = agent.grade?.trim();
    if (grade) set.add(grade);
  }
  return [...set].sort((a, b) => compareText(a, b));
}

export function hasPersonnelSeniorityData(agents: readonly AgentRow[]): boolean {
  return agents.some((a) => Boolean(a.created_at) && Number.isFinite(Date.parse(a.created_at)));
}
