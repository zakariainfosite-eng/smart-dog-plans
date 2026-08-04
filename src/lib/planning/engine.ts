import { subDays, format } from "date-fns";
import type { Database } from "@/integrations/database/schema-types";
import { dedupePostsBySpecialty } from "@/lib/checkpoints/sync-posts";
import {
  isCheckpointOpenOnDate,
  isoWeekdayFromDate,
  normalizeCheckpointPriority,
  normalizeOperatingDays,
  type FemalePolicy,
} from "@/lib/checkpoints/operational-config";
import {
  isAgentLevelExclusionType,
  isDogLevelExclusionType,
  type PlanningExclusionDebugReport,
} from "@/lib/agent-exclusions";
import { pickHighestPriorityDogExclusionTypeName } from "@/lib/dog-operational-status";
import {
  compareFemaleCheckpointScores,
  scoreFemaleCheckpointCandidate,
  type FemaleAssignmentHistoryMaps,
} from "@/lib/planning/female-rotation";

export {
  AGENT_LEVEL_EXCLUSION_TYPES,
  DOG_LEVEL_EXCLUSION_TYPES,
  isAgentLevelExclusionType,
  isDogLevelExclusionType,
} from "@/lib/agent-exclusions";

export {
  buildFemaleAssignmentHistoryMaps,
  buildFemaleRotationCandidatePredicate,
  compareFemaleCheckpointScores,
  isFemaleGroupAActive,
  resolveActiveFemaleAgentIds,
  resolveRestingFemaleAgentIds,
  scoreFemaleCheckpointCandidate,
  splitFemaleRotationGroups,
  sortFemaleTeamsStable,
} from "@/lib/planning/female-rotation";

export type TeamSpecialty = "narcotics" | "explosives";
export type Specialty = TeamSpecialty;
export type Gender = "male" | "female";
export type Shift = "day" | "night";
export type AllowedGender = Database["public"]["Enums"]["checkpoint_allowed_gender"];

export type EligibleTeam = {
  agent_id: string;
  agent_name: string;
  professional_number: string;
  dog_id: string | null;
  dog_name: string | null;
  specialty: TeamSpecialty | null;
  gender: Gender;
  agent_only: boolean;
};

export type ExcludedTeam = {
  agent_id: string;
  agent_name: string;
  reason: string;
};

export type CheckpointPostInput = {
  id: string;
  shift: Shift;
  specialty_required: TeamSpecialty;
  required_agents: number;
  active: boolean;
  allowed_gender: AllowedGender;
  dog_required: boolean;
};

/** Checkpoint with nested requirements from checkpoint_posts (per shift). */
export type CheckpointInput = Pick<
  Database["public"]["Tables"]["checkpoints"]["Row"],
  | "id"
  | "name"
  | "night_only"
  | "allowed_gender"
  | "active"
  | "female_policy"
  | "priority"
  | "operating_days"
  | "day_shift_enabled"
  | "night_shift_enabled"
> & {
  posts: CheckpointPostInput[];
};

export type AgentInput = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  gender: Gender;
  active: boolean;
  section_id: string | null;
  dog_id: string | null;
  dogs: {
    id: string;
    name: string;
    specialty: Specialty;
    status: string;
    active: boolean;
  } | null;
};

export type ExclusionInput = {
  agent_id: string | null;
  dog_id?: string | null;
  exclusion_type: string;
};

function buildExclusionMaps(exclusions: ExclusionInput[]): {
  byAgent: Map<string, string[]>;
  byDog: Map<string, string[]>;
} {
  const byAgent = new Map<string, string[]>();
  const byDog = new Map<string, string[]>();
  for (const ex of exclusions) {
    if (ex.agent_id) {
      const arr = byAgent.get(ex.agent_id) ?? [];
      arr.push(ex.exclusion_type);
      byAgent.set(ex.agent_id, arr);
    }
    if (ex.dog_id && isDogLevelExclusionType(ex.exclusion_type)) {
      const arr = byDog.get(ex.dog_id) ?? [];
      arr.push(ex.exclusion_type);
      byDog.set(ex.dog_id, arr);
    }
  }
  return { byAgent, byDog };
}

function exclusionTypesForAgent(
  agent: Pick<AgentInput, "id" | "dog_id">,
  byAgent: Map<string, string[]>,
  byDog: Map<string, string[]>,
): string[] {
  const types = [...(byAgent.get(agent.id) ?? [])];
  if (agent.dog_id) {
    types.push(...(byDog.get(agent.dog_id) ?? []));
  }
  return types;
}

export type SlotAssignment = {
  post_id: string;
  specialty_required: Specialty;
  team: EligibleTeam | null;
  /**
   * Day-only: intentionally empty for manual female PDF insertion.
   * Not an understaffing / planning error.
   */
  reservation?: "RESERVED_FOR_FEMALE_ASSIGNMENT" | null;
};

export type PostAssignmentSummary = {
  post_id: string;
  specialty_required: Specialty;
  required: number;
  staffed: number;
};

export type CheckpointAssignment = {
  checkpoint_id: string;
  checkpoint_name: string;
  night_only: boolean;
  posts: PostAssignmentSummary[];
  slots: SlotAssignment[];
  total_required: number;
  total_staffed: number;
  is_understaffed: boolean;
};

export type PersistableAssignment = {
  agent_id: string;
  dog_id: string | null;
  checkpoint_id: string;
  checkpoint_post_id: string;
};

export type RotationHistoryInput = {
  agent_id: string;
  checkpoint_id: string;
  /** ISO date (yyyy-MM-dd) when available — used by Female Rotation fairness. */
  planning_date?: string;
};

export type PlanningSummary = {
  totalEmployees: number;
  assignedEmployees: number;
  /** Cynotechniciens assigned to operational checkpoints only. */
  assignedToCheckpoints: number;
  /** Cynotechniciens at Point 653 (headquarters reserve). */
  point653Employees: number;
  /** Inactive female rotation group — REST only (never section / 653 / night). */
  restEmployees: number;
  unassignedEmployees: number;
  fullyStaffedCheckpoints: number;
  understaffedCheckpoints: number;
  /** Cynotechniciens removed by agent-level exclusion records (Formation, Sick, Leave…). */
  agentExclusionCount: number;
  warnings: string[];
};

/** Structured empty-slot reasons (Rotation Engine V2 Phase 2 / female reservation). */
export type PlanningWarningCode =
  | "NO_ELIGIBLE_AGENT"
  | "NO_AVAILABLE_DOG"
  | "ALL_AGENTS_EXCLUDED"
  | "SMART_ROTATION_BLOCKED"
  | "NO_SPECIALTY_MATCH"
  | "RESERVED_FOR_FEMALE_ASSIGNMENT"
  | "ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE";

export const FEMALE_SLOT_RESERVATION_CODE = "RESERVED_FOR_FEMALE_ASSIGNMENT" as const;
export const ROTATION_OVERRIDE_CODE = "ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE" as const;

export type PlanningStructuredWarning = {
  code: PlanningWarningCode;
  checkpoint_id: string;
  checkpoint_name: string;
  post_id: string;
  specialty_required: Specialty;
  message: string;
};

export function formatPlanningWarning(warning: PlanningStructuredWarning): string {
  return `[${warning.code}] ${warning.message}`;
}

/** Permanent headquarters reserve — not configurable, unlimited capacity. */
export const POINT_653_NAME = "Point 653";

export type Point653ReasonCode =
  | "no_operational_assignment"
  | "no_assigned_dog"
  | "dog_sick"
  | "dog_in_heat"
  | "administrative_duty"
  | "absence"
  | "sickness"
  | "annual_leave"
  | "special_leave"
  | "mission"
  | "training"
  | "other_exclusion";

export type Point653Assignment = EligibleTeam & {
  reason: Point653ReasonCode;
};

export type PlanningEngineResult = {
  eligible: EligibleTeam[];
  excluded: ExcludedTeam[];
  /** Subset of excluded — only agent-level exclusion records (Formation, Sick, Leave…). */
  agentExclusions: ExcludedTeam[];
  checkpoints: CheckpointAssignment[];
  /** @deprecated Use point653 — operational-eligible teams not placed at a checkpoint. */
  unassigned: EligibleTeam[];
  point653: Point653Assignment[];
  /** Inactive female group marked REST (day shift only). */
  offDuty: EligibleTeam[];
  assignments: PersistableAssignment[];
  summary: PlanningSummary;
  /** Machine-readable empty-slot warnings (Phase 2). UI may ignore for now. */
  structuredWarnings: PlanningStructuredWarning[];
  exclusionDebug?: PlanningExclusionDebugReport;
};

export const FEMALE_NIGHT_EXCLUSION_REASON = "Female handlers are not eligible for this checkpoint shift.";

const GENDER_ALIASES: Record<string, AllowedGender> = {
  all: "all",
  any: "all",
  male: "male",
  female: "female",
};

const SPECIALTY_ORDER: Record<TeamSpecialty, number> = {
  narcotics: 0,
  explosives: 1,
};

/** Deterministic matricule / id comparison (numeric-aware). */
function compareMatriculeAsc(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** True when every id in `compatible` is present in `visited`. */
export function visitedCoversCompatible(
  visited: ReadonlySet<string>,
  compatible: ReadonlySet<string>,
): boolean {
  if (compatible.size === 0) return true;
  for (const id of compatible) {
    if (!visited.has(id)) return false;
  }
  return true;
}

/** Normalize checkpoint/post gender values (ANY/MALE/FEMALE and casing variants). */
export function normalizeAllowedGender(value: unknown): AllowedGender {
  if (value == null) return "all";
  const key = String(value).trim().toLowerCase();
  return GENDER_ALIASES[key] ?? "all";
}

function normalizeAgentGender(value: unknown): Gender {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "male" || key === "m") return "male";
  if (key === "female" || key === "f") return "female";
  return "male";
}

/**
 * Effective gender rule for a requirement line.
 * Explicit post restriction wins; otherwise inherit checkpoint restriction when post is ANY.
 */
export function resolveAllowedGenderForPost(
  post: Pick<CheckpointPostInput, "allowed_gender">,
  checkpoint: Pick<CheckpointInput, "allowed_gender">,
): AllowedGender {
  const postGender = normalizeAllowedGender(post.allowed_gender);
  const checkpointGender = normalizeAllowedGender(checkpoint.allowed_gender);

  if (postGender === "male" || postGender === "female") return postGender;
  if (checkpointGender === "male" || checkpointGender === "female") return checkpointGender;
  return "all";
}

/** Unassigned eligible female handlers for a specialty (night fallback gate). */
export function hasAvailableFemaleForSpecialty(
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  specialty: Specialty,
): boolean {
  return eligible.some(
    (team) =>
      !assignedToday.has(team.agent_id) &&
      team.gender === "female" &&
      team.specialty === specialty,
  );
}

/** True when night planning may relax a female-only slot to ANY after females are unavailable. */
export function shouldApplyNightFemaleFallback(
  configuredGender: AllowedGender,
  shift: Shift,
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  specialty: Specialty,
): boolean {
  if (shift !== "night") return false;
  if (normalizeAllowedGender(configuredGender) !== "female") return false;
  return !hasAvailableFemaleForSpecialty(eligible, assignedToday, specialty);
}

/**
 * Gender rule used during assignment.
 * Day: configured restriction only.
 * Night: female-only stays strict until fallback phase confirms no available female handler.
 */
export function resolveAssignmentAllowedGender(
  post: Pick<CheckpointPostInput, "allowed_gender"> | undefined,
  checkpoint: Pick<CheckpointInput, "allowed_gender">,
  shift: Shift,
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  specialty: Specialty,
  allowNightFallback: boolean,
): AllowedGender {
  const configured = post
    ? resolveAllowedGenderForPost(post, checkpoint)
    : normalizeAllowedGender(checkpoint.allowed_gender);

  if (
    shouldApplyNightFemaleFallback(configured, shift, eligible, assignedToday, specialty) &&
    allowNightFallback
  ) {
    return "all";
  }

  return configured;
}

/** Checkpoint-level female agent policy (database-driven, not hardcoded). */
export function teamMatchesFemalePolicy(
  team: Pick<EligibleTeam, "gender">,
  policy: FemalePolicy,
): boolean {
  if (policy === "not_allowed" && team.gender === "female") return false;
  return true;
}

/** Hard gender gate for assignment — female_policy overrides legacy allowed_gender. */
export function resolveHardGenderRequirement(
  post: CheckpointPostInput,
  checkpoint: CheckpointInput,
  shift: Shift,
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  allowNightFallback: boolean,
): AllowedGender {
  const policy = checkpoint.female_policy ?? "allowed";

  if (policy === "not_allowed") return "male";
  if (policy === "preferred") return "all";

  return resolveAssignmentAllowedGender(
    post,
    checkpoint,
    shift,
    eligible,
    assignedToday,
    post.specialty_required,
    allowNightFallback,
  );
}

/** Match allowed gender enum value. */
export function teamMatchesGenderRequirement(
  team: Pick<EligibleTeam, "gender">,
  allowedGender: AllowedGender,
): boolean {
  const rule = normalizeAllowedGender(allowedGender);
  if (rule === "all") return true;
  if (rule === "male") return team.gender === "male";
  return team.gender === "female";
}

/** Specialty + gender + dog requirement match for a checkpoint post. */
export function teamMatchesPostRequirements(
  team: EligibleTeam,
  post: CheckpointPostInput,
  checkpoint: CheckpointInput,
  shift: Shift,
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  allowNightFallback: boolean,
): boolean {
  if (!teamMatchesFemalePolicy(team, checkpoint.female_policy ?? "allowed")) return false;

  const allowedGender = resolveHardGenderRequirement(
    post,
    checkpoint,
    shift,
    eligible,
    assignedToday,
    allowNightFallback,
  );
  if (!teamMatchesGenderRequirement(team, allowedGender)) return false;

  const slotSpecialty = post.specialty_required;

  if (!team.dog_id || team.agent_only) return false;
  return team.specialty === slotSpecialty;
}

function genderRequirementLabel(allowedGender: AllowedGender): string {
  const rule = normalizeAllowedGender(allowedGender);
  if (rule === "male") return "male-only";
  if (rule === "female") return "female-only";
  return "any gender";
}

export function qualifyTeams(
  agents: AgentInput[],
  exclusions: ExclusionInput[],
  shift: Shift,
): { eligible: EligibleTeam[]; excluded: ExcludedTeam[] } {
  const { byAgent, byDog } = buildExclusionMaps(exclusions);

  const eligible: EligibleTeam[] = [];
  const excluded: ExcludedTeam[] = [];

  for (const a of agents) {
    const name = `${a.first_name} ${a.last_name}`;
    const dog = Array.isArray(a.dogs) ? a.dogs[0] : a.dogs;
    const exTypes = exclusionTypesForAgent(a, byAgent, byDog);

    if (!a.active) {
      excluded.push({ agent_id: a.id, agent_name: name, reason: "Inactive" });
      continue;
    }

    const agentExclusionTypes = exTypes.filter(isAgentLevelExclusionType);
    if (agentExclusionTypes.length > 0) {
      excluded.push({
        agent_id: a.id,
        agent_name: name,
        reason: formatExclusion(agentExclusionTypes[0]),
      });
      continue;
    }

    const gender = normalizeAgentGender(a.gender);

    if (shift === "night" && gender === "female") {
      excluded.push({
        agent_id: a.id,
        agent_name: name,
        reason: NIGHT_SHIFT_FEMALE_EXCLUSION_REASON,
      });
      continue;
    }

    if (a.dog_id && dog) {
      if (!dog.active) {
        excluded.push({ agent_id: a.id, agent_name: name, reason: "Dog inactive" });
        continue;
      }
      const dogExcludedByRecord = exTypes.some(isDogLevelExclusionType);
      if (dogExcludedByRecord || dog.status === "sick" || dog.status === "heat") {
        continue;
      }
      if (dog.status !== "available") {
        excluded.push({ agent_id: a.id, agent_name: name, reason: `Dog status: ${dog.status}` });
        continue;
      }
      if (dog.specialty !== "narcotics" && dog.specialty !== "explosives") {
        excluded.push({ agent_id: a.id, agent_name: name, reason: "Unsupported dog specialty" });
        continue;
      }

      eligible.push({
        agent_id: a.id,
        agent_name: name,
        professional_number: a.professional_number,
        dog_id: dog.id,
        dog_name: dog.name,
        specialty: dog.specialty,
        gender,
        agent_only: false,
      });
      continue;
    }

    // No assigned dog — not operationally eligible; routed to Point 653 after checkpoint pass.
    continue;
  }

  return { eligible, excluded };
}

function formatExclusion(type: string): string {
  const labels: Record<string, string> = {
    absence: "Absent",
    sickness: "Sick",
    annual_leave: "On leave",
    special_leave: "On special leave",
    administrative_leave: "Administrative leave",
    dog_sick: "Dog sick",
    female_dog_heat: "Female dog in heat",
    dog_injured: "Dog injured",
    dog_temporary_retirement: "Dog temporarily retired",
    dog_vet_visit: "Dog veterinary visit",
    dog_training: "Dog training",
    dog_other: "Dog unavailable",
    mission: "On mission",
    training: "In training",
    suspension: "Suspended",
    other: "Excluded",
  };
  return labels[type] ?? "Excluded";
}

function resolvePoint653Reason(
  agent: AgentInput,
  byAgent: Map<string, string[]>,
  byDog: Map<string, string[]>,
): Point653ReasonCode {
  const exTypes = exclusionTypesForAgent(agent, byAgent, byDog);
  const topDogExclusion = pickHighestPriorityDogExclusionTypeName(exTypes);
  if (topDogExclusion === "female_dog_heat") return "dog_in_heat";
  if (topDogExclusion === "dog_sick") return "dog_sick";
  if (topDogExclusion) return "dog_sick";

  const dog = Array.isArray(agent.dogs) ? agent.dogs[0] : agent.dogs;
  if (!agent.dog_id || !dog) return "no_assigned_dog";
  // Legacy dogs.status fallback — operational truth is exclusions.
  if (dog.status === "sick") return "dog_sick";
  if (dog.status === "heat") return "dog_in_heat";
  return "no_operational_assignment";
}

function buildPoint653Team(agent: AgentInput): EligibleTeam {
  const name = `${agent.first_name} ${agent.last_name}`;
  const dog = Array.isArray(agent.dogs) ? agent.dogs[0] : agent.dogs;
  const specialty =
    dog?.specialty === "narcotics" || dog?.specialty === "explosives"
      ? dog.specialty
      : null;

  return {
    agent_id: agent.id,
    agent_name: name,
    professional_number: agent.professional_number,
    dog_id: dog?.id ?? agent.dog_id,
    dog_name: dog?.name ?? null,
    specialty,
    gender: normalizeAgentGender(agent.gender),
    agent_only: !agent.dog_id || !dog,
  };
}

/**
 * Assign every non-checkpoint male cynotechnicien to Point 653 after operational slots are filled.
 * Female agents never enter Point 653 (or any male section reserve).
 * Point 653 has unlimited capacity and is always available.
 */
export function buildPoint653Assignments(
  sectionAgents: AgentInput[],
  assignedToday: Set<string>,
  exclusions: ExclusionInput[],
  excluded: ExcludedTeam[],
): Point653Assignment[] {
  const excludedIds = new Set(excluded.map((entry) => entry.agent_id));
  const { byAgent, byDog } = buildExclusionMaps(exclusions);

  const assignments: Point653Assignment[] = [];

  for (const agent of sectionAgents) {
    if (!agent.active) continue;
    if (normalizeAgentGender(agent.gender) === "female") continue;
    if (assignedToday.has(agent.id)) continue;
    if (excludedIds.has(agent.id)) continue;

    const exTypes = exclusionTypesForAgent(agent, byAgent, byDog);
    if (exTypes.some(isAgentLevelExclusionType)) continue;

    assignments.push({
      ...buildPoint653Team(agent),
      reason: resolvePoint653Reason(agent, byAgent, byDog),
    });
  }

  return assignments.sort((a, b) => a.agent_name.localeCompare(b.agent_name));
}

/**
 * Female agents are excluded from the automatic planning engine entirely.
 * Listed for presence only inside existing specialty tables (empty Affectation).
 */
export function buildFemaleRestAssignments(
  _poolAgents: AgentInput[],
  _assignedToday: Set<string>,
  _excluded: ExcludedTeam[],
  _planningDate: Date,
  _shift: Shift,
): EligibleTeam[] {
  return [];
}

/** Build one slot per required handler on each active checkpoint post. */
function buildSlotsFromPosts(posts: CheckpointPostInput[]): SlotAssignment[] {
  const activePosts = posts
    .filter((p) => p.active && p.required_agents > 0)
    .sort((a, b) => {
      const order =
        SPECIALTY_ORDER[a.specialty_required] - SPECIALTY_ORDER[b.specialty_required];
      if (order !== 0) return order;
      return a.id.localeCompare(b.id);
    });

  const slots: SlotAssignment[] = [];
  for (const post of activePosts) {
    for (let i = 0; i < post.required_agents; i++) {
      slots.push({
        post_id: post.id,
        specialty_required: post.specialty_required,
        team: null,
      });
    }
  }
  return slots;
}

/** Operational rule: female handlers are never eligible for night planning (may become configurable later). */
export const NIGHT_SHIFT_FEMALE_EXCLUSION_REASON =
  "Female agents not eligible for night shift";

/** True when checkpoint is open for the given planning date and shift. */
export function isCheckpointOperationalForPlanning(
  checkpoint: CheckpointInput,
  shift: Shift,
  planningDate: Date,
): boolean {
  if (checkpoint.active === false) return false;

  const operatingDays = normalizeOperatingDays(checkpoint.operating_days);
  if (!isCheckpointOpenOnDate(operatingDays, planningDate)) return false;

  if (shift === "day" && !checkpoint.day_shift_enabled) return false;
  if (shift === "night" && !checkpoint.night_shift_enabled) return false;

  return checkpoint.posts.some(
    (post) =>
      post.shift === shift && post.active && post.required_agents > 0,
  );
}
/** Filter checkpoints by shift config, operating day, and active posts. */
export function filterCheckpointsForPlanning(
  checkpoints: CheckpointInput[],
  shift: Shift,
  planningDate: Date,
): CheckpointInput[] {
  return checkpoints
    .map((cp) => ({
      ...cp,
      posts: cp.posts.filter((p) => p.shift === shift),
    }))
    .filter((cp) => isCheckpointOperationalForPlanning(cp, shift, planningDate));
}

/** @deprecated Use filterCheckpointsForPlanning */
export function filterCheckpointsForShift(
  checkpoints: CheckpointInput[],
  shift: Shift,
): CheckpointInput[] {
  const today = new Date();
  return filterCheckpointsForPlanning(checkpoints, shift, today);
}

/** Keep only employees belonging to the selected section. */
export function filterAgentsForSection(agents: AgentInput[], sectionId: string): AgentInput[] {
  return agents.filter((a) => a.section_id === sectionId);
}

/**
 * Planning pool: section males only for every shift.
 * Female cynotechnicians never enter Smart Rotation, checkpoint assignment,
 * HQ Reserve, or planning optimization — they use a separate attendance sheet.
 */
export function buildPlanningAgentPool(
  agents: AgentInput[],
  sectionId: string,
  _shift: Shift,
): AgentInput[] {
  return agents.filter(
    (agent) =>
      agent.section_id === sectionId && normalizeAgentGender(agent.gender) !== "female",
  );
}

/**
 * Dedicated HQ Reserve floaters — male agents with no section membership.
 * Used only in Phase 2 when section Strict Rotation cannot fill a slot.
 * Callers may omit them; an empty pool is valid.
 */
export function buildHqReserveAgentPool(agents: AgentInput[]): AgentInput[] {
  return agents.filter(
    (agent) =>
      agent.section_id == null && normalizeAgentGender(agent.gender) !== "female",
  );
}

function mergeEligibleByAgentId(...groups: EligibleTeam[][]): EligibleTeam[] {
  const byId = new Map<string, EligibleTeam>();
  for (const group of groups) {
    for (const team of group) {
      if (!byId.has(team.agent_id)) byId.set(team.agent_id, team);
    }
  }
  return [...byId.values()].sort((a, b) =>
    compareMatriculeAsc(
      a.professional_number || a.agent_id,
      b.professional_number || b.agent_id,
    ),
  );
}

function filterMapByAgentIds(map: Map<string, string>, agentIds: Set<string>): Map<string, string> {
  const filtered = new Map<string, string>();
  for (const [agentId, value] of map) {
    if (agentIds.has(agentId)) filtered.set(agentId, value);
  }
  return filtered;
}

function filterFairnessByAgentIds(
  map: Map<string, number>,
  agentIds: Set<string>,
): Map<string, number> {
  const filtered = new Map<string, number>();
  for (const [key, count] of map) {
    const agentId = key.split(":")[0];
    if (agentIds.has(agentId)) filtered.set(key, count);
  }
  return filtered;
}


type PickContext = {
  shift: Shift;
  checkpoint: CheckpointInput;
  post: CheckpointPostInput;
  assignedToday: Set<string>;
  eligible: EligibleTeam[];
  allowNightFallback: boolean;
  /**
   * When true: enforce Smart Rotation cycle rule (Phases 1–2.1).
   * False only for last-resort operational coverage rescue before Point 653.
   */
  requireSmartRotation: boolean;
  compatibleCheckpointsByAgent: Map<string, Set<string>>;
  agentVisitedCheckpoints: Map<string, Set<string>>;
  yesterdayCheckpointByAgent: Map<string, string>;
  fairnessCounts: Map<string, number>;
  /** ISO yyyy-MM-dd of the planning day — used for “days since last assignment”. */
  planningDateISO: string;
  /** Most recent prior assignment date (any checkpoint) per agent. */
  lastAssignmentDateByAgent: Map<string, string>;
  femaleHistory?: FemaleAssignmentHistoryMaps;
};

/**
 * Rotation Engine V2 — deterministic agent selection.
 * Smart Rotation is enforced when `requireSmartRotation` is true.
 * No randomness.
 *
 * Rank (ascending = better, except days-since which prefers longer gap):
 * 1. Filter: not visited this CP in current cycle (when Smart Rotation on)
 * 2. Lowest visit count for this checkpoint
 * 3. Lowest assignments in current cycle
 * 4. Longest time since last assignment
 * 5. Lowest matricule
 */
function pickAgent(candidates: EligibleTeam[], ctx: PickContext): EligibleTeam | null {
  const poolCandidates =
    ctx.shift === "night"
      ? candidates.filter((t) => t.gender !== "female")
      : candidates;

  const genderAndSpecialtyPool = poolCandidates.filter(
    (t) =>
      !ctx.assignedToday.has(t.agent_id) &&
      teamMatchesPostRequirements(
        t,
        ctx.post,
        ctx.checkpoint,
        ctx.shift,
        ctx.eligible,
        ctx.assignedToday,
        ctx.allowNightFallback,
      ),
  );

  if (genderAndSpecialtyPool.length === 0) return null;

  let pool = genderAndSpecialtyPool;
  if (ctx.requireSmartRotation) {
    pool = genderAndSpecialtyPool.filter((t) =>
      canAssignBySmartRotation(
        t.agent_id,
        ctx.checkpoint.id,
        ctx.compatibleCheckpointsByAgent,
        ctx.agentVisitedCheckpoints,
      ),
    );
    if (pool.length === 0) return null;
  }

  type Scored = {
    team: EligibleTeam;
    visitCount: number;
    cycleAssignments: number;
    daysSinceLast: number;
    matricule: string;
  };

  const scored: Scored[] = pool.map((team) => {
    const compatible = ctx.compatibleCheckpointsByAgent.get(team.agent_id) ?? new Set<string>();
    const visited = ctx.agentVisitedCheckpoints.get(team.agent_id) ?? new Set<string>();
    let cycleAssignments = 0;
    for (const id of visited) {
      if (compatible.has(id)) cycleAssignments += 1;
    }
    const lastDate = ctx.lastAssignmentDateByAgent.get(team.agent_id);
    const daysSinceLast = lastDate
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(`${ctx.planningDateISO}T12:00:00`) -
              Date.parse(`${lastDate}T12:00:00`)) /
              86_400_000,
          ),
        )
      : Number.MAX_SAFE_INTEGER;

    return {
      team,
      visitCount: ctx.fairnessCounts.get(`${team.agent_id}:${ctx.checkpoint.id}`) ?? 0,
      cycleAssignments,
      daysSinceLast,
      matricule: team.professional_number || team.agent_id,
    };
  });

  scored.sort((a, b) => {
    if (a.visitCount !== b.visitCount) return a.visitCount - b.visitCount;
    if (a.cycleAssignments !== b.cycleAssignments) {
      return a.cycleAssignments - b.cycleAssignments;
    }
    if (a.daysSinceLast !== b.daysSinceLast) return b.daysSinceLast - a.daysSinceLast;
    return compareMatriculeAsc(a.matricule, b.matricule);
  });

  return scored[0]?.team ?? null;
}

/**
 * Female Rotation picker — same eligibility gates as pickAgent, plus history fairness.
 * Deterministic (no Math.random). Does not alter male Smart Rotation (`pickAgent`).
 */
function pickFemaleRotationAgent(
  candidates: EligibleTeam[],
  ctx: PickContext,
): EligibleTeam | null {
  const genderAndSpecialtyPool = candidates.filter(
    (t) =>
      t.gender === "female" &&
      !ctx.assignedToday.has(t.agent_id) &&
      teamMatchesPostRequirements(
        t,
        ctx.post,
        ctx.checkpoint,
        ctx.shift,
        ctx.eligible,
        ctx.assignedToday,
        ctx.allowNightFallback,
      ),
  );

  if (genderAndSpecialtyPool.length === 0) return null;

  let pool = genderAndSpecialtyPool;
  if (ctx.requireSmartRotation) {
    pool = genderAndSpecialtyPool.filter((t) =>
      canAssignBySmartRotation(
        t.agent_id,
        ctx.checkpoint.id,
        ctx.compatibleCheckpointsByAgent,
        ctx.agentVisitedCheckpoints,
      ),
    );
    if (pool.length === 0) return null;
  }

  const history = ctx.femaleHistory ?? {
    lastWorkingCheckpointByAgent: new Map<string, string>(),
    lastAssignedDateByPair: new Map<string, string>(),
  };

  type Scored = { team: EligibleTeam; score: ReturnType<typeof scoreFemaleCheckpointCandidate> };
  const scored: Scored[] = pool.map((team) => ({
    team,
    score: scoreFemaleCheckpointCandidate(
      team.agent_id,
      ctx.checkpoint.id,
      history,
      ctx.fairnessCounts,
    ),
  }));

  scored.sort((a, b) => {
    const byScore = compareFemaleCheckpointScores(a.score, b.score);
    if (byScore !== 0) return byScore;
    return compareMatriculeAsc(
      a.team.professional_number || a.team.agent_id,
      b.team.professional_number || b.team.agent_id,
    );
  });

  return scored[0]?.team ?? null;
}

/** True when the agent can fill at least one active post on the checkpoint. */
export function isCheckpointCompatibleForAgent(
  team: EligibleTeam,
  checkpoint: CheckpointInput,
  shift: Shift,
  eligible: EligibleTeam[],
  assignedToday: Set<string> = new Set<string>(),
  allowNightFallback: boolean = shift === "night",
): boolean {
  if (checkpoint.active === false) return false;

  return checkpoint.posts.some(
    (post) =>
      post.active &&
      post.required_agents > 0 &&
      teamMatchesPostRequirements(
        team,
        post,
        checkpoint,
        shift,
        eligible,
        assignedToday,
        allowNightFallback,
      ),
  );
}

/** Compatible checkpoints where the team could fill an active post (specialty, gender, shift). */
export function buildCompatibleCheckpointsByAgent(
  eligible: EligibleTeam[],
  checkpoints: CheckpointInput[],
  shift: Shift,
  planningDate: Date,
  allowNightFallback = false,
): Map<string, Set<string>> {
  const activeCheckpoints = filterCheckpointsForPlanning(checkpoints, shift, planningDate);
  const assignedToday = new Set<string>();
  const map = new Map<string, Set<string>>();

  for (const team of eligible) {
    const compatible = new Set<string>();
    for (const cp of activeCheckpoints) {
      if (
        !isCheckpointCompatibleForAgent(
          team,
          cp,
          shift,
          eligible,
          assignedToday,
          allowNightFallback,
        )
      ) {
        continue;
      }
      compatible.add(cp.id);
    }
    map.set(team.agent_id, compatible);
  }

  return map;
}

/** Visited compatible checkpoints per agent for the *current* rotation cycle. */
export function buildAgentVisitedCheckpoints(
  history: RotationHistoryInput[],
  compatibleByAgent: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const sorted = [...history].sort((a, b) => {
    const dateA = a.planning_date ?? "";
    const dateB = b.planning_date ?? "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    if (a.agent_id !== b.agent_id) return a.agent_id.localeCompare(b.agent_id);
    return a.checkpoint_id.localeCompare(b.checkpoint_id);
  });

  const visited = new Map<string, Set<string>>();

  for (const row of sorted) {
    const compatible = compatibleByAgent.get(row.agent_id);
    if (!compatible?.has(row.checkpoint_id)) continue;

    const set = visited.get(row.agent_id) ?? new Set<string>();
    // Safety: if state was already complete, start a fresh cycle before recording.
    if (visitedCoversCompatible(set, compatible)) {
      set.clear();
    }
    set.add(row.checkpoint_id);
    // Completing visit ends the cycle — next assignment starts with an empty set.
    if (visitedCoversCompatible(set, compatible)) {
      set.clear();
    }
    visited.set(row.agent_id, set);
  }

  return visited;
}

/**
 * Record a visit into the in-memory current-cycle set (used during a planning run).
 * When the visit completes the compatible set, the cycle resets to empty.
 */
export function recordAgentCycleVisit(
  agentId: string,
  checkpointId: string,
  compatibleByAgent: Map<string, Set<string>>,
  visitedByAgent: Map<string, Set<string>>,
): void {
  const compatible = compatibleByAgent.get(agentId);
  if (!compatible?.has(checkpointId)) return;

  const set = visitedByAgent.get(agentId) ?? new Set<string>();
  if (visitedCoversCompatible(set, compatible)) {
    set.clear();
  }
  set.add(checkpointId);
  if (visitedCoversCompatible(set, compatible)) {
    set.clear();
  }
  visitedByAgent.set(agentId, set);
}

/** Latest planning_date per agent from history (deterministic). */
export function buildLastAssignmentDateByAgent(
  history: RotationHistoryInput[],
): Map<string, string> {
  const last = new Map<string, string>();
  const sorted = [...history].sort((a, b) => {
    const dateA = a.planning_date ?? "";
    const dateB = b.planning_date ?? "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.agent_id.localeCompare(b.agent_id);
  });
  for (const row of sorted) {
    if (!row.planning_date) continue;
    last.set(row.agent_id, row.planning_date);
  }
  return last;
}

/**
 * Smart Rotation — absolute cycle rule inside the agent's compatible set.
 * Agent cannot revisit a checkpoint until every compatible checkpoint has been visited once.
 * When the current-cycle visited set already covers all compatible CPs, a new cycle may begin.
 */
export function canAssignBySmartRotation(
  agentId: string,
  checkpointId: string,
  compatibleByAgent: Map<string, Set<string>>,
  visitedByAgent: Map<string, Set<string>>,
): boolean {
  const compatible = compatibleByAgent.get(agentId);
  if (!compatible || compatible.size === 0) return false;
  if (!compatible.has(checkpointId)) return false;

  const visited = visitedByAgent.get(agentId) ?? new Set<string>();
  if (visitedCoversCompatible(visited, compatible)) return true;
  return !visited.has(checkpointId);
}

function summarizePosts(posts: CheckpointPostInput[], slots: SlotAssignment[]): PostAssignmentSummary[] {
  return posts
    .filter((p) => p.active && p.required_agents > 0)
    .sort((a, b) => SPECIALTY_ORDER[a.specialty_required] - SPECIALTY_ORDER[b.specialty_required])
    .map((post) => ({
      post_id: post.id,
      specialty_required: post.specialty_required,
      required: post.required_agents,
      staffed: slots.filter((s) => s.post_id === post.id && s.team).length,
    }));
}

type PendingSlot = {
  checkpoint: CheckpointInput;
  slot: SlotAssignment;
  post: CheckpointPostInput | undefined;
  configuredGender: AllowedGender;
  /** Day-only female reservation — engine must not assign males here. */
  reservedForFemale?: boolean;
};

function isFemaleReservedSlot(pending: PendingSlot): boolean {
  return (
    pending.reservedForFemale === true ||
    pending.slot.reservation === FEMALE_SLOT_RESERVATION_CODE
  );
}

/** Open operational slots the male engine may still fill (excludes female reservations). */
function hasAssignableOpenSlots(pendingSlots: readonly PendingSlot[]): boolean {
  return pendingSlots.some(
    (pending) => !pending.slot.team && !isFemaleReservedSlot(pending),
  );
}

/**
 * DAY planning only: reserve one Stupéfiants + one Explosifs operational slot
 * for manual female PDF insertion. Deterministic. Night is unchanged.
 */
function markDayFemaleReservedSlots(
  pendingSlots: PendingSlot[],
  shift: Shift,
): PlanningStructuredWarning[] {
  if (shift !== "day") return [];

  const warnings: PlanningStructuredWarning[] = [];
  const specialties: Specialty[] = ["narcotics", "explosives"];

  for (const specialty of specialties) {
    const candidates = pendingSlots
      .filter((pending) => {
        if (!pending.post || !pending.post.active) return false;
        if (pending.slot.specialty_required !== specialty) return false;
        if (isFemaleReservedSlot(pending)) return false;
        if (pending.slot.team) return false;
        const policy = pending.checkpoint.female_policy ?? "allowed";
        if (policy === "not_allowed") return false;
        const gender = pending.configuredGender;
        if (normalizeAllowedGender(gender) === "male") return false;
        return true;
      })
      .sort((a, b) => {
        const policyRank = (p: PendingSlot) =>
          (p.checkpoint.female_policy ?? "allowed") === "preferred" ? 0 : 1;
        const policyDiff = policyRank(a) - policyRank(b);
        if (policyDiff !== 0) return policyDiff;
        // Prefer lower operational priority so P1–P2 male coverage stays available.
        const priorityDiff =
          normalizeCheckpointPriority(b.checkpoint.priority) -
          normalizeCheckpointPriority(a.checkpoint.priority);
        if (priorityDiff !== 0) return priorityDiff;
        const nameDiff = a.checkpoint.name.localeCompare(b.checkpoint.name, undefined, {
          numeric: true,
        });
        if (nameDiff !== 0) return nameDiff;
        return (a.post?.id ?? "").localeCompare(b.post?.id ?? "");
      });

    const chosen = candidates[0];
    if (!chosen) continue;

    chosen.reservedForFemale = true;
    chosen.slot.reservation = FEMALE_SLOT_RESERVATION_CODE;
    warnings.push({
      code: FEMALE_SLOT_RESERVATION_CODE,
      checkpoint_id: chosen.checkpoint.id,
      checkpoint_name: chosen.checkpoint.name,
      post_id: chosen.post!.id,
      specialty_required: specialty,
      message: `Checkpoint ${chosen.checkpoint.name}: reserved for female ${specialty} assignment (manual PDF insertion).`,
    });
  }

  return warnings.sort((a, b) => {
    const bySpecialty =
      SPECIALTY_ORDER[a.specialty_required] - SPECIALTY_ORDER[b.specialty_required];
    if (bySpecialty !== 0) return bySpecialty;
    return a.checkpoint_name.localeCompare(b.checkpoint_name, undefined, { numeric: true });
  });
}

function buildPendingSlots(checkpoints: CheckpointInput[]): PendingSlot[] {
  const pending: PendingSlot[] = [];

  for (const checkpoint of checkpoints) {
    const activePosts = checkpoint.posts.filter((p) => p.active);
    const slots = buildSlotsFromPosts(activePosts);

    for (const slot of slots) {
      const post = activePosts.find((p) => p.id === slot.post_id);
      pending.push({
        checkpoint,
        slot,
        post,
        configuredGender: post
          ? resolveAllowedGenderForPost(post, checkpoint)
          : normalizeAllowedGender(checkpoint.allowed_gender),
      });
    }
  }

  return pending;
}

function checkpointTotalRequired(checkpoint: CheckpointInput): number {
  return checkpoint.posts
    .filter((p) => p.active && p.required_agents > 0)
    .reduce((sum, p) => sum + p.required_agents, 0);
}

function slotAssignmentAllowedGender(
  pending: PendingSlot,
  shift: Shift,
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  allowNightFallback: boolean,
): AllowedGender {
  if (!pending.post) {
    return normalizeAllowedGender(pending.checkpoint.allowed_gender);
  }
  return resolveHardGenderRequirement(
    pending.post,
    pending.checkpoint,
    shift,
    eligible,
    assignedToday,
    allowNightFallback,
  );
}

/** Count agents matching specialty + gender for slot-priority ordering. */
function countCompatibleCandidates(
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  pending: PendingSlot,
  shift: Shift,
  allowNightFallback: boolean,
): number {
  if (!pending.post) return 0;
  return eligible.filter(
    (t) =>
      !assignedToday.has(t.agent_id) &&
      teamMatchesPostRequirements(
        t,
        pending.post!,
        pending.checkpoint,
        shift,
        eligible,
        assignedToday,
        allowNightFallback,
      ),
  ).length;
}

function genderAssignmentPriority(
  pending: PendingSlot,
  shift: Shift,
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  allowNightFallback: boolean,
): number {
  const policy = pending.checkpoint.female_policy ?? "allowed";
  if (policy === "not_allowed") return 0;

  const allowedGender = slotAssignmentAllowedGender(
    pending,
    shift,
    eligible,
    assignedToday,
    allowNightFallback,
  );
  if (allowedGender === "female") return 1;
  if (policy === "preferred") return 2;
  return 3;
}

function comparePendingSlots(
  a: PendingSlot,
  b: PendingSlot,
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  shift: Shift,
  allowNightFallback: boolean,
): number {
  const priorityDiff =
    normalizeCheckpointPriority(a.checkpoint.priority) -
    normalizeCheckpointPriority(b.checkpoint.priority);
  if (priorityDiff !== 0) return priorityDiff;

  const genderPriorityDiff =
    genderAssignmentPriority(a, shift, eligible, assignedToday, allowNightFallback) -
    genderAssignmentPriority(b, shift, eligible, assignedToday, allowNightFallback);
  if (genderPriorityDiff !== 0) return genderPriorityDiff;

  const candidateDiff =
    countCompatibleCandidates(eligible, assignedToday, a, shift, allowNightFallback) -
    countCompatibleCandidates(eligible, assignedToday, b, shift, allowNightFallback);
  if (candidateDiff !== 0) return candidateDiff;

  const nameDiff = a.checkpoint.name.localeCompare(b.checkpoint.name, undefined, {
    numeric: true,
  });
  if (nameDiff !== 0) return nameDiff;

  const specialtyDiff =
    SPECIALTY_ORDER[a.slot.specialty_required] -
    SPECIALTY_ORDER[b.slot.specialty_required];
  if (specialtyDiff !== 0) return specialtyDiff;

  return a.slot.post_id.localeCompare(b.slot.post_id);
}

function assignOpenSlots(
  pendingSlots: PendingSlot[],
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  assignments: PersistableAssignment[],
  warnings: string[],
  params: {
    shift: Shift;
    planningDate: Date;
    checkpoints: CheckpointInput[];
    compatibleCheckpointsByAgent: Map<string, Set<string>>;
    agentVisitedCheckpoints: Map<string, Set<string>>;
    yesterdayCheckpointByAgent: Map<string, string>;
    fairnessCounts: Map<string, number>;
    rotationHistory: RotationHistoryInput[];
    lastAssignmentDateByAgent: Map<string, string>;
    /** Phase 2 — dedicated HQ Reserve floaters (already qualified). */
    hqReserveEligible?: EligibleTeam[];
    /**
     * When false, skip Phase 2.2 rotation-override rescue (used by intermediate drains).
     * Default true.
     */
    enableOperationalRescue?: boolean;
  },
): PlanningStructuredWarning[] {
  const planningDateISO = format(params.planningDate, "yyyy-MM-dd");
  const rotationOverrides: PlanningStructuredWarning[] = [];

  const planningEligible = mergeEligibleByAgentId(
    eligible,
    params.hqReserveEligible ?? [],
  );
  const maleEligible = eligible.filter((team) => team.gender === "male");

  const commitAssignment = (
    pending: PendingSlot,
    team: EligibleTeam,
    allowNightFallback: boolean,
  ): boolean => {
    if (
      !pending.post ||
      !teamMatchesPostRequirements(
        team,
        pending.post,
        pending.checkpoint,
        params.shift,
        planningEligible,
        assignedToday,
        allowNightFallback,
      )
    ) {
      warnings.push(
        `Checkpoint ${pending.checkpoint.name}: rejected invalid gender assignment for ${pending.slot.specialty_required}.`,
      );
      return false;
    }

    pending.slot.team = team;
    assignedToday.add(team.agent_id);
    assignments.push({
      agent_id: team.agent_id,
      dog_id: team.dog_id,
      checkpoint_id: pending.checkpoint.id,
      checkpoint_post_id: pending.slot.post_id,
    });

    recordAgentCycleVisit(
      team.agent_id,
      pending.checkpoint.id,
      params.compatibleCheckpointsByAgent,
      params.agentVisitedCheckpoints,
    );
    const fairnessKey = `${team.agent_id}:${pending.checkpoint.id}`;
    params.fairnessCounts.set(
      fairnessKey,
      (params.fairnessCounts.get(fairnessKey) ?? 0) + 1,
    );
    params.lastAssignmentDateByAgent.set(team.agent_id, planningDateISO);
    return true;
  };

  const runPhase = (options: {
    allowNightFallback: boolean;
    /** Strict Smart Rotation for Phases 1–2.1; false only in rescue. */
    requireSmartRotation: boolean;
    /** Restrict which eligible teams may be considered this phase. */
    candidates?: EligibleTeam[];
    /** Use Female Rotation history fairness (does not affect male phases). */
    useFemaleHistoryRanking?: boolean;
    femaleHistory?: FemaleAssignmentHistoryMaps;
  }) => {
    const candidatePool = options.candidates ?? maleEligible;

    while (true) {
      const openSlots = pendingSlots.filter((pending) => {
        if (pending.slot.team) return false;
        if (isFemaleReservedSlot(pending)) return false;
        if (options.allowNightFallback) {
          return shouldApplyNightFemaleFallback(
            pending.configuredGender,
            params.shift,
            planningEligible,
            assignedToday,
            pending.slot.specialty_required,
          );
        }
        return true;
      });
      if (openSlots.length === 0) break;

      // RULE 3 — Priority ascending first (then stable secondary keys).
      openSlots.sort((a, b) =>
        comparePendingSlots(
          a,
          b,
          planningEligible,
          assignedToday,
          params.shift,
          options.allowNightFallback,
        ),
      );

      let progress = false;

      for (const pending of openSlots) {
        if (pending.slot.team) continue;

        const pickCtx: PickContext = {
          shift: params.shift,
          checkpoint: pending.checkpoint,
          post: pending.post!,
          assignedToday,
          eligible: planningEligible,
          allowNightFallback: options.allowNightFallback,
          requireSmartRotation: options.requireSmartRotation,
          compatibleCheckpointsByAgent: params.compatibleCheckpointsByAgent,
          agentVisitedCheckpoints: params.agentVisitedCheckpoints,
          yesterdayCheckpointByAgent: params.yesterdayCheckpointByAgent,
          fairnessCounts: params.fairnessCounts,
          planningDateISO,
          lastAssignmentDateByAgent: params.lastAssignmentDateByAgent,
          femaleHistory: options.femaleHistory,
        };

        const team = pending.post
          ? options.useFemaleHistoryRanking
            ? pickFemaleRotationAgent(candidatePool, pickCtx)
            : pickAgent(candidatePool, pickCtx)
          : null;

        if (!team) {
          continue;
        }

        if (!commitAssignment(pending, team, options.allowNightFallback)) {
          continue;
        }

        progress = true;
      }

      if (!progress) break;
    }
  };

  // Phase 1 — section males only, Priority-only Strict Smart Rotation.
  runPhase({
    allowNightFallback: false,
    requireSmartRotation: true,
    candidates: maleEligible,
  });

  // Night gender fallback may widen female-only posts; Smart Rotation stays absolute.
  if (params.shift === "night") {
    params.compatibleCheckpointsByAgent = buildCompatibleCheckpointsByAgent(
      planningEligible,
      params.checkpoints,
      params.shift,
      params.planningDate,
      true,
    );
    runPhase({
      allowNightFallback: true,
      requireSmartRotation: true,
      candidates: maleEligible,
    });
  }

  // Phase 2 — HQ Reserve floaters, then remaining section candidates (Strict Rotation).
  if (hasAssignableOpenSlots(pendingSlots)) {
    const hqReserveEligible = (params.hqReserveEligible ?? []).filter(
      (team) => team.gender === "male" && !assignedToday.has(team.agent_id),
    );

    if (hqReserveEligible.length > 0) {
      runPhase({
        allowNightFallback: params.shift === "night",
        requireSmartRotation: true,
        candidates: hqReserveEligible,
      });
    }

    const sectionReserveCandidates = maleEligible.filter(
      (team) => !assignedToday.has(team.agent_id),
    );
    if (sectionReserveCandidates.length > 0 && hasAssignableOpenSlots(pendingSlots)) {
      runPhase({
        allowNightFallback: params.shift === "night",
        requireSmartRotation: true,
        candidates: sectionReserveCandidates,
      });
    }
  }

  // Phase 2.1 — final Strict Rotation global pass (section + HQ Reserve).
  if (hasAssignableOpenSlots(pendingSlots)) {
    params.compatibleCheckpointsByAgent = buildCompatibleCheckpointsByAgent(
      planningEligible,
      params.checkpoints,
      params.shift,
      params.planningDate,
      params.shift === "night",
    );
    const allRemainingEligible = planningEligible.filter(
      (team) => team.gender === "male" && !assignedToday.has(team.agent_id),
    );
    if (allRemainingEligible.length > 0) {
      runPhase({
        allowNightFallback: params.shift === "night",
        requireSmartRotation: true,
        candidates: allRemainingEligible,
      });
    }
  }

  // Phase 2.2 — last-resort operational coverage rescue before Point 653.
  // May break Smart Rotation when a specialty-compatible agent still exists.
  // Female reserved daytime slots remain untouched.
  if (params.enableOperationalRescue !== false) {
    const allowNightFallback = params.shift === "night";

    while (hasAssignableOpenSlots(pendingSlots)) {
      const remaining = planningEligible.filter(
        (team) => team.gender === "male" && !assignedToday.has(team.agent_id),
      );
      if (remaining.length === 0) break;

      const openSlots = pendingSlots.filter(
        (pending) =>
          !pending.slot.team && pending.post && !isFemaleReservedSlot(pending),
      );
      openSlots.sort((a, b) =>
        comparePendingSlots(
          a,
          b,
          planningEligible,
          assignedToday,
          params.shift,
          allowNightFallback,
        ),
      );

      let progress = false;
      for (const pending of openSlots) {
        if (pending.slot.team || isFemaleReservedSlot(pending) || !pending.post) {
          continue;
        }

        const pickCtx: PickContext = {
          shift: params.shift,
          checkpoint: pending.checkpoint,
          post: pending.post,
          assignedToday,
          eligible: planningEligible,
          allowNightFallback,
          requireSmartRotation: true,
          compatibleCheckpointsByAgent: params.compatibleCheckpointsByAgent,
          agentVisitedCheckpoints: params.agentVisitedCheckpoints,
          yesterdayCheckpointByAgent: params.yesterdayCheckpointByAgent,
          fairnessCounts: params.fairnessCounts,
          planningDateISO,
          lastAssignmentDateByAgent: params.lastAssignmentDateByAgent,
        };

        const pool = remaining.filter((team) => !assignedToday.has(team.agent_id));
        const strictTeam = pickAgent(pool, {
          ...pickCtx,
          requireSmartRotation: true,
        });
        const rescueTeam = pickAgent(pool, {
          ...pickCtx,
          requireSmartRotation: false,
        });
        const team = strictTeam ?? rescueTeam;
        if (!team) continue;

        if (!commitAssignment(pending, team, allowNightFallback)) {
          continue;
        }

        if (!strictTeam && rescueTeam) {
          rotationOverrides.push({
            code: ROTATION_OVERRIDE_CODE,
            checkpoint_id: pending.checkpoint.id,
            checkpoint_name: pending.checkpoint.name,
            post_id: pending.post.id,
            specialty_required: pending.slot.specialty_required,
            message: `Checkpoint ${pending.checkpoint.name}: Smart Rotation overridden to staff ${pending.slot.specialty_required} with ${team.agent_name} (operational coverage before ${POINT_653_NAME}).`,
          });
        }

        progress = true;
      }

      if (!progress) break;
    }
  }

  return rotationOverrides;
}

/**
 * Checkpoint posts that still have open slots after the selected section's
 * assignment phases complete. Sole source for UNDERSTAFFED / "position left unfilled".
 */
export type UnfilledCheckpointPost = {
  checkpoint_id: string;
  checkpoint_name: string;
  post_id: string;
  specialty_required: Specialty;
  required_agents: number;
  staffed_agents: number;
  unfilled_count: number;
  /** Effective hard gender rule at end of planning for this post. */
  allowed_gender: AllowedGender;
  checkpoint: CheckpointInput;
  post: CheckpointPostInput;
};

/** Collect posts with remaining unfilled slots after assignment (selected section only). */
function collectUnfilledCheckpointPosts(
  pendingSlots: PendingSlot[],
  shift: Shift,
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
): UnfilledCheckpointPost[] {
  const allowNightFallback = shift === "night";
  const byPost = new Map<
    string,
    {
      pending: PendingSlot;
      required: number;
      staffed: number;
      unfilled: number;
      reserved: number;
    }
  >();

  for (const pending of pendingSlots) {
    if (!pending.post || !pending.post.active) continue;
    const key = pending.post.id;
    const row = byPost.get(key) ?? {
      pending,
      required: pending.post.required_agents,
      staffed: 0,
      unfilled: 0,
      reserved: 0,
    };
    if (isFemaleReservedSlot(pending)) {
      row.reserved += 1;
    } else if (pending.slot.team) {
      row.staffed += 1;
    } else {
      row.unfilled += 1;
    }
    byPost.set(key, row);
  }

  const unfilled: UnfilledCheckpointPost[] = [];
  for (const row of byPost.values()) {
    // Female-reserved slots are covered for staffing purposes — not unfilled demand.
    if (row.unfilled <= 0) continue;
    const { pending } = row;
    const post = pending.post!;
    const allowedGender = resolveHardGenderRequirement(
      post,
      pending.checkpoint,
      shift,
      eligible,
      assignedToday,
      allowNightFallback,
    );
    unfilled.push({
      checkpoint_id: pending.checkpoint.id,
      checkpoint_name: pending.checkpoint.name,
      post_id: post.id,
      specialty_required: post.specialty_required,
      required_agents: row.required,
      staffed_agents: row.staffed,
      unfilled_count: row.unfilled,
      allowed_gender: allowedGender,
      checkpoint: pending.checkpoint,
      post,
    });
  }

  return unfilled.sort((a, b) => {
    const byName = a.checkpoint_name.localeCompare(b.checkpoint_name, undefined, {
      numeric: true,
    });
    if (byName !== 0) return byName;
    return a.post_id.localeCompare(b.post_id);
  });
}

/**
 * Emit UNDERSTAFFED / "position left unfilled" only from posts that remain
 * unfilled after the selected section finished assigning. Fully staffed
 * checkpoints are never warned.
 */
function appendWarningsFromUnfilledCheckpointPosts(
  unfilledCheckpointPosts: readonly UnfilledCheckpointPost[],
  pendingSlots: readonly PendingSlot[],
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  shift: Shift,
  warnings: string[],
): void {
  if (unfilledCheckpointPosts.length === 0) return;

  const allowNightFallback = shift === "night";

  for (const entry of unfilledCheckpointPosts) {
    const allowedGender = entry.allowed_gender;
    if (allowedGender === "all") continue;

    const specialtyPool = eligible.filter(
      (t) =>
        !assignedToday.has(t.agent_id) && t.specialty === entry.specialty_required,
    );
    const genderPool = specialtyPool.filter((t) =>
      teamMatchesPostRequirements(
        t,
        entry.post,
        entry.checkpoint,
        shift,
        eligible,
        assignedToday,
        allowNightFallback,
      ),
    );

    if (specialtyPool.length > 0 && genderPool.length === 0) {
      const warning = `Checkpoint ${entry.checkpoint_name}: no eligible ${genderRequirementLabel(allowedGender)} handler for ${entry.specialty_required} — position left unfilled.`;
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  }

  const understaffedCheckpointIds = new Set(
    unfilledCheckpointPosts.map((entry) => entry.checkpoint_id),
  );

  for (const checkpointId of understaffedCheckpointIds) {
    const slotsForCp = pendingSlots.filter(
      (pending) => pending.checkpoint.id === checkpointId,
    );
    if (slotsForCp.length === 0) continue;
    const name = slotsForCp[0].checkpoint.name;
    const activePosts = slotsForCp[0].checkpoint.posts.filter((p) => p.active);
    const totalRequired = activePosts.reduce((sum, p) => sum + p.required_agents, 0);
    const totalStaffed = slotsForCp.filter((pending) => pending.slot.team).length;
    const reservedFemale = slotsForCp.filter((pending) => isFemaleReservedSlot(pending)).length;
    const missing = totalRequired - totalStaffed - reservedFemale;
    if (missing <= 0 || totalRequired <= 0) continue;
    const warning = `Checkpoint ${name} is UNDERSTAFFED (${totalStaffed}/${totalRequired}, ${missing} position${missing === 1 ? "" : "s"} unfilled).`;
    if (!warnings.includes(warning)) warnings.push(warning);
  }
}

type UnfilledClassificationContext = {
  poolAgents: AgentInput[];
  eligible: EligibleTeam[];
  assignedToday: Set<string>;
  exclusions: ExclusionInput[];
  shift: Shift;
  allowNightFallback: boolean;
  compatibleCheckpointsByAgent: Map<string, Set<string>>;
  /** Visited cycle state at the start of this planning run (before today's assignments). */
  agentVisitedCheckpointsAtStart: Map<string, Set<string>>;
};

function agentHasOperationalDog(
  agent: AgentInput,
  byAgent: Map<string, string[]>,
  byDog: Map<string, string[]>,
): boolean {
  const dog = Array.isArray(agent.dogs) ? agent.dogs[0] : agent.dogs;
  if (!agent.dog_id || !dog) return false;
  if (!dog.active) return false;
  if (dog.status !== "available") return false;
  if (dog.specialty !== "narcotics" && dog.specialty !== "explosives") return false;
  const exTypes = exclusionTypesForAgent(agent, byAgent, byDog);
  if (exTypes.some(isDogLevelExclusionType)) return false;
  return true;
}

/**
 * Classify why a post remained empty after Strict Rotation + HQ Reserve Phase 2.
 * Deterministic — first matching code wins.
 */
export function classifyUnfilledSlotReason(
  entry: UnfilledCheckpointPost,
  ctx: UnfilledClassificationContext,
): PlanningWarningCode {
  const { byAgent, byDog } = buildExclusionMaps(ctx.exclusions);
  const specialty = entry.specialty_required;

  const activePool = ctx.poolAgents.filter((agent) => agent.active);
  const agentExcluded = activePool.filter((agent) => {
    const types = exclusionTypesForAgent(agent, byAgent, byDog);
    return types.some(isAgentLevelExclusionType);
  });
  const notAgentExcluded = activePool.filter(
    (agent) => !agentExcluded.some((excluded) => excluded.id === agent.id),
  );

  if (activePool.length > 0 && notAgentExcluded.length === 0) {
    return "ALL_AGENTS_EXCLUDED";
  }

  const withDog = notAgentExcluded.filter((agent) =>
    agentHasOperationalDog(agent, byAgent, byDog),
  );
  if (withDog.length === 0) {
    return activePool.length === 0 ? "NO_ELIGIBLE_AGENT" : "NO_AVAILABLE_DOG";
  }

  const specialtyMatch = withDog.filter((agent) => {
    const dog = Array.isArray(agent.dogs) ? agent.dogs[0] : agent.dogs;
    return dog?.specialty === specialty;
  });
  if (specialtyMatch.length === 0) {
    return "NO_SPECIALTY_MATCH";
  }

  const matchingEligible = ctx.eligible.filter((team) =>
    teamMatchesPostRequirements(
      team,
      entry.post,
      entry.checkpoint,
      ctx.shift,
      ctx.eligible,
      ctx.assignedToday,
      ctx.allowNightFallback,
    ),
  );

  if (matchingEligible.length === 0) {
    return "NO_ELIGIBLE_AGENT";
  }

  // Use start-of-run visited state — post-assignment cycle resets would hide the block reason.
  const rotationAllowed = matchingEligible.filter((team) =>
    canAssignBySmartRotation(
      team.agent_id,
      entry.checkpoint_id,
      ctx.compatibleCheckpointsByAgent,
      ctx.agentVisitedCheckpointsAtStart,
    ),
  );

  if (rotationAllowed.length === 0) {
    return "SMART_ROTATION_BLOCKED";
  }

  // Compatible agents existed under Strict Rotation but were consumed by higher-priority slots.
  return "NO_ELIGIBLE_AGENT";
}

function structuredWarningMessage(
  code: PlanningWarningCode,
  entry: UnfilledCheckpointPost,
): string {
  const cp = entry.checkpoint_name;
  const specialty = entry.specialty_required;
  switch (code) {
    case "ALL_AGENTS_EXCLUDED":
      return `Checkpoint ${cp}: all agents excluded — ${specialty} left unfilled.`;
    case "NO_AVAILABLE_DOG":
      return `Checkpoint ${cp}: no available dog for ${specialty} — left unfilled.`;
    case "NO_SPECIALTY_MATCH":
      return `Checkpoint ${cp}: no specialty match for ${specialty} — left unfilled.`;
    case "SMART_ROTATION_BLOCKED":
      return `Checkpoint ${cp}: Smart Rotation blocked all candidates for ${specialty} — left unfilled (cycle incomplete).`;
    case "RESERVED_FOR_FEMALE_ASSIGNMENT":
      return `Checkpoint ${cp}: reserved for female ${specialty} assignment (manual PDF insertion).`;
    case "ROTATION_OVERRIDE_FOR_OPERATIONAL_COVERAGE":
      return `Checkpoint ${cp}: Smart Rotation overridden for ${specialty} (operational coverage before Point 653).`;
    case "NO_ELIGIBLE_AGENT":
    default:
      return `Checkpoint ${cp}: no eligible agent for ${specialty} — left unfilled.`;
  }
}

/** Build Phase 2 structured warnings for every still-unfilled post. */
export function buildStructuredUnfilledWarnings(
  unfilledCheckpointPosts: readonly UnfilledCheckpointPost[],
  ctx: UnfilledClassificationContext,
): PlanningStructuredWarning[] {
  const warnings: PlanningStructuredWarning[] = [];
  for (const entry of unfilledCheckpointPosts) {
    const code = classifyUnfilledSlotReason(entry, ctx);
    warnings.push({
      code,
      checkpoint_id: entry.checkpoint_id,
      checkpoint_name: entry.checkpoint_name,
      post_id: entry.post_id,
      specialty_required: entry.specialty_required,
      message: structuredWarningMessage(code, entry),
    });
  }
  return warnings.sort((a, b) => {
    const byName = a.checkpoint_name.localeCompare(b.checkpoint_name, undefined, {
      numeric: true,
    });
    if (byName !== 0) return byName;
    return a.post_id.localeCompare(b.post_id);
  });
}

function buildCheckpointResults(
  activeCheckpoints: CheckpointInput[],
  pendingSlots: PendingSlot[],
): CheckpointAssignment[] {
  const checkpointResults: CheckpointAssignment[] = [];

  for (const cp of activeCheckpoints) {
    const activePosts = cp.posts.filter((p) => p.active);
    const slots = pendingSlots
      .filter((pending) => pending.checkpoint.id === cp.id)
      .map((pending) => pending.slot);
    const totalRequired = activePosts.reduce((sum, p) => sum + p.required_agents, 0);
    const totalStaffed = slots.filter((s) => s.team).length;
    const reservedFemale = slots.filter(
      (s) => s.reservation === FEMALE_SLOT_RESERVATION_CODE,
    ).length;
    // Female-reserved day slots count as covered — not understaffed.
    const is_understaffed = totalStaffed + reservedFemale < totalRequired;

    checkpointResults.push({
      checkpoint_id: cp.id,
      checkpoint_name: cp.name,
      night_only: cp.night_only,
      posts: summarizePosts(activePosts, slots),
      slots,
      total_required: totalRequired,
      total_staffed: totalStaffed,
      is_understaffed,
    });
  }

  return checkpointResults;
}

type SmartRotationAuditMaps = {
  compatibleCheckpointsByAgent: Map<string, Set<string>>;
  agentVisitedCheckpoints: Map<string, Set<string>>;
};

function teamCanFillOpenSlotUnderRules(
  team: EligibleTeam,
  pending: PendingSlot,
  shift: Shift,
  eligible: EligibleTeam[],
  assignedToday: Set<string>,
  allowNightFallback: boolean,
  smartRotation?: SmartRotationAuditMaps,
): boolean {
  if (!pending.post) return false;
  // Males must never fill day female-reserved positions.
  if (isFemaleReservedSlot(pending)) return false;
  if (
    !teamMatchesPostRequirements(
      team,
      pending.post,
      pending.checkpoint,
      shift,
      eligible,
      assignedToday,
      allowNightFallback,
    )
  ) {
    return false;
  }
  if (!smartRotation) return true;
  return canAssignBySmartRotation(
    team.agent_id,
    pending.checkpoint.id,
    smartRotation.compatibleCheckpointsByAgent,
    smartRotation.agentVisitedCheckpoints,
  );
}

/** True when an unassigned agent could still fill an open compatible slot. */
export function hasReserveWhileUnderstaffedConflict(
  eligible: EligibleTeam[],
  unassigned: EligibleTeam[],
  pendingSlots: PendingSlot[],
  shift: Shift,
  assignedToday: Set<string>,
  smartRotation?: SmartRotationAuditMaps,
): boolean {
  const openSlots = pendingSlots.filter(
    (pending) => !pending.slot.team && !isFemaleReservedSlot(pending),
  );
  const allowNightFallback = shift === "night";

  for (const team of unassigned) {
    for (const pending of openSlots) {
      if (
        teamCanFillOpenSlotUnderRules(
          team,
          pending,
          shift,
          eligible,
          assignedToday,
          allowNightFallback,
          smartRotation,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function teamDisplayName(team: EligibleTeam): string {
  return team.agent_name || team.professional_number || team.agent_id;
}

/** Detailed diagnostics when reserve holds compatible teams while checkpoints stay empty. */
export function buildReserveConflictDiagnostics(
  eligible: EligibleTeam[],
  unassigned: EligibleTeam[],
  pendingSlots: PendingSlot[],
  shift: Shift,
  assignedToday: Set<string>,
  smartRotation?: SmartRotationAuditMaps,
): string[] {
  const diagnostics: string[] = [];
  const openSlots = pendingSlots.filter(
    (pending) => !pending.slot.team && !isFemaleReservedSlot(pending),
  );
  const allowNightFallback = shift === "night";

  for (const pending of openSlots) {
    if (!pending.post) continue;

    const compatibleInReserve = unassigned.filter((team) =>
      teamCanFillOpenSlotUnderRules(
        team,
        pending,
        shift,
        eligible,
        assignedToday,
        allowNightFallback,
        smartRotation,
      ),
    );

    if (compatibleInReserve.length === 0) continue;

    const reserveNames = compatibleInReserve.map(teamDisplayName).join(", ");
    diagnostics.push(
      `INVALID: Checkpoint "${pending.checkpoint.name}" has unfilled ${pending.slot.specialty_required} position while compatible team(s) at ${POINT_653_NAME}: ${reserveNames}.`,
    );
  }

  return diagnostics;
}

/** Detect invalid planning output: females at night or closed checkpoints in results. */
export function auditOperationalViolations(
  result: PlanningEngineResult,
  checkpoints: CheckpointInput[],
  shift: Shift,
  planningDate: Date,
  agentGenderById: Map<string, Gender>,
): string[] {
  const warnings: string[] = [];
  const checkpointById = new Map(checkpoints.map((cp) => [cp.id, cp]));
  const weekday = isoWeekdayFromDate(planningDate);

  if (shift === "night") {
    for (const assignment of result.assignments) {
      const gender = normalizeAgentGender(agentGenderById.get(assignment.agent_id));
      if (gender === "female") {
        warnings.push(
          `INVALID: Female agent assigned to night shift (${assignment.agent_id}).`,
        );
      }
    }
  }

  for (const cpResult of result.checkpoints) {
    if (cpResult.total_required <= 0) continue;

    const checkpoint = checkpointById.get(cpResult.checkpoint_id);
    if (!checkpoint) continue;

    const operatingDays = normalizeOperatingDays(checkpoint.operating_days);
    if (!operatingDays.includes(weekday)) {
      warnings.push(
        `INVALID: Checkpoint "${cpResult.checkpoint_name}" appears on a disabled weekday (day ${weekday}).`,
      );
    }

    if (shift === "day" && !checkpoint.day_shift_enabled) {
      warnings.push(
        `INVALID: Checkpoint "${cpResult.checkpoint_name}" appears on day shift while day is disabled.`,
      );
    }

    if (shift === "night" && !checkpoint.night_shift_enabled) {
      warnings.push(
        `INVALID: Checkpoint "${cpResult.checkpoint_name}" appears on night shift while night is disabled.`,
      );
    }
  }

  return warnings;
}

function agentDisplayName(agent: AgentInput | undefined, agentId: string): string {
  if (!agent) return agentId;
  return `${agent.first_name} ${agent.last_name}`;
}

/** Detects planning output that violates agent/dog exclusion rules. */
export function auditExclusionViolations(
  agents: AgentInput[],
  exclusions: ExclusionInput[],
  result: Pick<
    PlanningEngineResult,
    "assignments" | "point653" | "excluded" | "checkpoints"
  >,
): string[] {
  const warnings: string[] = [];
  const { byAgent, byDog } = buildExclusionMaps(exclusions);

  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const excludedIds = new Set(result.excluded.map((entry) => entry.agent_id));

  const pushViolation = (agentId: string, context: string, rule: string) => {
    warnings.push(
      `INVALID: Exclusion rule ignored — ${agentDisplayName(agentById.get(agentId), agentId)} ${context} (${rule}).`,
    );
  };

  for (const assignment of result.assignments) {
    const agent = agentById.get(assignment.agent_id);
    const exTypes = agent
      ? exclusionTypesForAgent(agent, byAgent, byDog)
      : (byAgent.get(assignment.agent_id) ?? []);
    const agentExclusionTypes = exTypes.filter(isAgentLevelExclusionType);
    if (agentExclusionTypes.length > 0) {
      pushViolation(
        assignment.agent_id,
        "assigned to operational checkpoint",
        formatExclusion(agentExclusionTypes[0]!),
      );
    }
    if (excludedIds.has(assignment.agent_id)) {
      pushViolation(
        assignment.agent_id,
        "assigned to operational checkpoint",
        "personnel excluded",
      );
    }

    const dog = agent ? (Array.isArray(agent.dogs) ? agent.dogs[0] : agent.dogs) : null;
    if (dog?.status === "sick") {
      pushViolation(assignment.agent_id, "assigned to operational checkpoint", "dog sick");
    } else if (dog?.status === "heat") {
      pushViolation(assignment.agent_id, "assigned to operational checkpoint", "dog in heat");
    }

    const topDogExclusion = pickHighestPriorityDogExclusionTypeName(exTypes);
    if (topDogExclusion) {
      pushViolation(
        assignment.agent_id,
        "assigned to operational checkpoint",
        formatExclusion(topDogExclusion),
      );
    }
  }

  for (const entry of result.point653) {
    const agent = agentById.get(entry.agent_id);
    const agentExclusionTypes = (
      agent
        ? exclusionTypesForAgent(agent, byAgent, byDog)
        : (byAgent.get(entry.agent_id) ?? [])
    ).filter(isAgentLevelExclusionType);
    if (agentExclusionTypes.length > 0) {
      pushViolation(
        entry.agent_id,
        `assigned to ${POINT_653_NAME}`,
        formatExclusion(agentExclusionTypes[0]),
      );
    }
    if (excludedIds.has(entry.agent_id)) {
      pushViolation(entry.agent_id, `assigned to ${POINT_653_NAME}`, "personnel excluded");
    }
  }

  return warnings;
}

function buildAgentGenderMap(agents: AgentInput[]): Map<string, Gender> {
  return new Map(
    agents.map((agent) => [agent.id, normalizeAgentGender(agent.gender)]),
  );
}

/** Detects reserve agents while a compatible open slot still exists. */
export function auditReservePriority(
  eligible: EligibleTeam[],
  result: PlanningEngineResult,
  checkpoints: CheckpointInput[],
  shift: Shift,
  planningDate: Date = new Date(),
  smartRotation?: SmartRotationAuditMaps,
): boolean {
  const activeCheckpoints = filterCheckpointsForPlanning(checkpoints, shift, planningDate);
  const pendingSlots: PendingSlot[] = [];

  for (const checkpoint of activeCheckpoints) {
    const resultCheckpoint = result.checkpoints.find(
      (entry) => entry.checkpoint_id === checkpoint.id,
    );
    const activePosts = checkpoint.posts.filter((p) => p.active);
    const slots =
      resultCheckpoint?.slots ?? buildSlotsFromPosts(activePosts);

    for (const slot of slots) {
      const post = activePosts.find((p) => p.id === slot.post_id);
      pendingSlots.push({
        checkpoint,
        slot,
        post,
        configuredGender: post
          ? resolveAllowedGenderForPost(post, checkpoint)
          : normalizeAllowedGender(checkpoint.allowed_gender),
      });
    }
  }

  // When caller omits maps, rebuild Strict Rotation state from the result's eligible pool.
  const rotationMaps =
    smartRotation ??
    (() => {
      const compatible = buildCompatibleCheckpointsByAgent(
        eligible,
        checkpoints,
        shift,
        planningDate,
        shift === "night",
      );
      return {
        compatibleCheckpointsByAgent: compatible,
        // After a completed run we cannot recover in-run visited state perfectly;
        // treat empty visited as "cycle start" so only specialty-compatible reserve
        // conflicts that Smart Rotation would allow are flagged.
        agentVisitedCheckpoints: new Map<string, Set<string>>(),
      };
    })();

  return hasReserveWhileUnderstaffedConflict(
    eligible,
    result.unassigned,
    pendingSlots,
    shift,
    new Set(result.assignments.map((assignment) => assignment.agent_id)),
    rotationMaps,
  );
}

export type EngineParams = {
  sectionId: string;
  agents: AgentInput[];
  exclusions: ExclusionInput[];
  checkpoints: CheckpointInput[];
  shift: Shift;
  planningDate: Date;
  rotationHistory: RotationHistoryInput[];
  yesterdayCheckpointByAgent: Map<string, string>;
  fairnessCounts: Map<string, number>;
  exclusionDebug?: PlanningExclusionDebugReport;
};

function buildAgentExclusionsFromRecords(
  excluded: ExcludedTeam[],
  sectionExclusions: ExclusionInput[],
): ExcludedTeam[] {
  const agentExcludedIds = new Set(
    sectionExclusions
      .filter((entry) => isAgentLevelExclusionType(entry.exclusion_type) && entry.agent_id)
      .map((entry) => entry.agent_id as string),
  );
  return excluded.filter((entry) => agentExcludedIds.has(entry.agent_id));
}

function auditIgnoredAgentExclusions(
  sectionExclusions: ExclusionInput[],
  agentExclusions: ExcludedTeam[],
  sectionAgents: AgentInput[],
  exclusionDebug: PlanningExclusionDebugReport | undefined,
): string[] {
  const warnings: string[] = [];
  const agentById = new Map(sectionAgents.map((agent) => [agent.id, agent]));
  const excludedIds = new Set(agentExclusions.map((entry) => entry.agent_id));

  for (const exclusion of sectionExclusions) {
    if (!isAgentLevelExclusionType(exclusion.exclusion_type)) continue;
    if (!exclusion.agent_id) continue;
    if (excludedIds.has(exclusion.agent_id)) continue;

    const agent = agentById.get(exclusion.agent_id);
    const name = agent ? `${agent.first_name} ${agent.last_name}` : exclusion.agent_id;
    const ignored = exclusionDebug?.ignored.find(
      (entry) =>
        entry.agent_id === exclusion.agent_id &&
        entry.exclusion_type === exclusion.exclusion_type,
    );
    const detail = ignored ? ignored.reason : "agent not found in section pool or exclusion not applied";
    warnings.push(
      `INVALID: Exclusion ignored — ${name} (${exclusion.exclusion_type}): ${detail}.`,
    );
  }

  if (
    sectionExclusions.some((entry) => isAgentLevelExclusionType(entry.exclusion_type)) &&
    agentExclusions.length === 0
  ) {
    warnings.push(
      "INVALID: Active agent exclusions were loaded but Cynotechniciens exclus count is zero.",
    );
  }

  return warnings;
}

export function runPlanningEngine(params: EngineParams): PlanningEngineResult {
  const sectionAgents = buildPlanningAgentPool(params.agents, params.sectionId, params.shift);
  const hqReserveAgents = buildHqReserveAgentPool(params.agents);
  const sectionAgentIds = new Set(sectionAgents.map((a) => a.id));
  const hqReserveAgentIds = new Set(hqReserveAgents.map((a) => a.id));
  const planningAgentIds = new Set([...sectionAgentIds, ...hqReserveAgentIds]);
  const sectionDogIds = new Set(
    sectionAgents
      .map((agent) => agent.dog_id)
      .filter((id): id is string => Boolean(id)),
  );
  const hqDogIds = new Set(
    hqReserveAgents
      .map((agent) => agent.dog_id)
      .filter((id): id is string => Boolean(id)),
  );
  const planningDogIds = new Set([...sectionDogIds, ...hqDogIds]);
  const sectionExclusions = params.exclusions.filter(
    (e) =>
      (e.agent_id != null && planningAgentIds.has(e.agent_id)) ||
      (e.dog_id != null && planningDogIds.has(e.dog_id)),
  );
  const yesterdayCheckpointByAgent = filterMapByAgentIds(
    params.yesterdayCheckpointByAgent,
    planningAgentIds,
  );
  const fairnessCounts = filterFairnessByAgentIds(params.fairnessCounts, planningAgentIds);
  const sectionRotationHistory = params.rotationHistory.filter((row) =>
    planningAgentIds.has(row.agent_id),
  );

  const { eligible: sectionEligible, excluded: sectionExcluded } = qualifyTeams(
    sectionAgents,
    sectionExclusions,
    params.shift,
  );
  const { eligible: hqEligible, excluded: hqExcluded } = qualifyTeams(
    hqReserveAgents,
    sectionExclusions,
    params.shift,
  );
  const eligible = mergeEligibleByAgentId(sectionEligible, hqEligible);
  const excluded = [...sectionExcluded, ...hqExcluded].sort((a, b) =>
    a.agent_name.localeCompare(b.agent_name),
  );
  const agentExclusions = buildAgentExclusionsFromRecords(excluded, sectionExclusions);
  let compatibleCheckpointsByAgent = buildCompatibleCheckpointsByAgent(
    eligible,
    params.checkpoints,
    params.shift,
    params.planningDate,
    false,
  );
  const agentVisitedCheckpoints = buildAgentVisitedCheckpoints(
    sectionRotationHistory,
    compatibleCheckpointsByAgent,
  );
  /** Immutable snapshot for Phase 2 empty-slot classification. */
  const agentVisitedCheckpointsAtStart = new Map(
    [...agentVisitedCheckpoints.entries()].map(([agentId, visited]) => [
      agentId,
      new Set(visited),
    ]),
  );
  const lastAssignmentDateByAgent = buildLastAssignmentDateByAgent(sectionRotationHistory);
  // Mutable fairness copy for in-run updates (does not touch caller input).
  const fairnessCountsMutable = new Map(fairnessCounts);

  const assignedToday = new Set<string>();
  const assignments: PersistableAssignment[] = [];
  const warnings: string[] = [];

  const activeCheckpoints = filterCheckpointsForPlanning(
    params.checkpoints,
    params.shift,
    params.planningDate,
  ).sort((a, b) => {
    const priorityDiff =
      normalizeCheckpointPriority(a.priority) - normalizeCheckpointPriority(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const requiredDiff = checkpointTotalRequired(b) - checkpointTotalRequired(a);
    if (requiredDiff !== 0) return requiredDiff;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  const pendingSlots = buildPendingSlots(activeCheckpoints);

  // DAY only: reserve one Stupéfiants + one Explosifs slot for manual female PDF insertion.
  const femaleReservationWarnings = markDayFemaleReservedSlots(
    pendingSlots,
    params.shift,
  );

  const rotationOverrideWarnings: PlanningStructuredWarning[] = [];

  // Phase 1 + Phase 2 + Phase 2.1 + Phase 2.2 rescue (inside assignOpenSlots).
  rotationOverrideWarnings.push(
    ...assignOpenSlots(pendingSlots, sectionEligible, assignedToday, assignments, warnings, {
      shift: params.shift,
      planningDate: params.planningDate,
      checkpoints: params.checkpoints,
      compatibleCheckpointsByAgent,
      agentVisitedCheckpoints,
      yesterdayCheckpointByAgent,
      fairnessCounts: fairnessCountsMutable,
      rotationHistory: sectionRotationHistory,
      lastAssignmentDateByAgent,
      hqReserveEligible: hqEligible,
    }),
  );

  // Night-aware compatibility rebuild, then one more global pass + rescue before Point 653.
  compatibleCheckpointsByAgent = buildCompatibleCheckpointsByAgent(
    mergeEligibleByAgentId(sectionEligible, hqEligible),
    params.checkpoints,
    params.shift,
    params.planningDate,
    params.shift === "night",
  );
  rotationOverrideWarnings.push(
    ...assignOpenSlots(
      pendingSlots,
      mergeEligibleByAgentId(sectionEligible, hqEligible),
      assignedToday,
      assignments,
      warnings,
      {
        shift: params.shift,
        planningDate: params.planningDate,
        checkpoints: params.checkpoints,
        compatibleCheckpointsByAgent,
        agentVisitedCheckpoints,
        yesterdayCheckpointByAgent,
        fairnessCounts: fairnessCountsMutable,
        rotationHistory: sectionRotationHistory,
        lastAssignmentDateByAgent,
        hqReserveEligible: [],
      },
    ),
  );

  // Sync maps after the global drain (assignOpenSlots may rebuild night compatibility).
  compatibleCheckpointsByAgent = buildCompatibleCheckpointsByAgent(
    mergeEligibleByAgentId(sectionEligible, hqEligible),
    params.checkpoints,
    params.shift,
    params.planningDate,
    params.shift === "night",
  );

  // Final specialty-only rescue drain: operational coverage beats Point 653.
  // Female reserved daytime slots stay excluded (assignOpenSlots skips them).
  const planningEligibleAll = mergeEligibleByAgentId(sectionEligible, hqEligible);
  for (let safety = 0; safety < 64; safety += 1) {
    if (!hasAssignableOpenSlots(pendingSlots)) break;

    const specialtyCandidates = planningEligibleAll.filter(
      (team) =>
        team.gender === "male" &&
        !assignedToday.has(team.agent_id) &&
        pendingSlots.some(
          (pending) =>
            !pending.slot.team &&
            pending.post &&
            !isFemaleReservedSlot(pending) &&
            teamCanFillOpenSlotUnderRules(
              team,
              pending,
              params.shift,
              planningEligibleAll,
              assignedToday,
              params.shift === "night",
              // No Smart Rotation gate — last-resort operational coverage.
              undefined,
            ),
        ),
    );
    if (specialtyCandidates.length === 0) break;

    rotationOverrideWarnings.push(
      ...assignOpenSlots(pendingSlots, specialtyCandidates, assignedToday, assignments, warnings, {
        shift: params.shift,
        planningDate: params.planningDate,
        checkpoints: params.checkpoints,
        compatibleCheckpointsByAgent,
        agentVisitedCheckpoints,
        yesterdayCheckpointByAgent,
        fairnessCounts: fairnessCountsMutable,
        rotationHistory: sectionRotationHistory,
        lastAssignmentDateByAgent,
        hqReserveEligible: [],
        enableOperationalRescue: true,
      }),
    );
  }

  // Only posts still open after assignment produce staffing warnings.
  const unfilledCheckpointPosts = collectUnfilledCheckpointPosts(
    pendingSlots,
    params.shift,
    mergeEligibleByAgentId(sectionEligible, hqEligible),
    assignedToday,
  );
  appendWarningsFromUnfilledCheckpointPosts(
    unfilledCheckpointPosts,
    pendingSlots,
    mergeEligibleByAgentId(sectionEligible, hqEligible),
    assignedToday,
    params.shift,
    warnings,
  );

  const structuredWarnings = [
    ...femaleReservationWarnings,
    ...rotationOverrideWarnings,
    ...buildStructuredUnfilledWarnings(unfilledCheckpointPosts, {
      poolAgents: [...sectionAgents, ...hqReserveAgents],
      eligible: mergeEligibleByAgentId(sectionEligible, hqEligible),
      assignedToday,
      exclusions: sectionExclusions,
      shift: params.shift,
      allowNightFallback: params.shift === "night",
      compatibleCheckpointsByAgent,
      agentVisitedCheckpointsAtStart,
    }),
  ];
  for (const structured of structuredWarnings) {
    const formatted = formatPlanningWarning(structured);
    if (!warnings.includes(formatted)) warnings.push(formatted);
  }

  const checkpointResults = buildCheckpointResults(activeCheckpoints, pendingSlots);

  // Females are excluded from the engine — REST list stays empty.
  const offDuty = buildFemaleRestAssignments(
    sectionAgents,
    assignedToday,
    excluded,
    params.planningDate,
    params.shift,
  );

  // Point 653 is the final fallback — only after every legal operational match is exhausted.
  const point653 = buildPoint653Assignments(
    sectionAgents,
    assignedToday,
    sectionExclusions,
    excluded,
  );

  const unassigned = point653
    .filter((entry) => entry.reason === "no_operational_assignment")
    .map(({ reason: _reason, ...team }) => team);

  const staffedCheckpoints = checkpointResults.filter(
    (c) => c.total_required > 0 && !c.is_understaffed,
  );
  const understaffedCheckpoints = checkpointResults.filter((c) => c.is_understaffed);

  // After rescue, any specialty-compatible agent still at 653 while a slot is open is INVALID
  // (Smart Rotation must not keep agents in reserve over operational coverage).
  for (const diagnostic of buildReserveConflictDiagnostics(
    mergeEligibleByAgentId(sectionEligible, hqEligible),
    unassigned,
    pendingSlots,
    params.shift,
    assignedToday,
    undefined,
  )) {
    if (!warnings.includes(diagnostic)) warnings.push(diagnostic);
  }

  for (const diagnostic of auditIgnoredAgentExclusions(
    sectionExclusions,
    agentExclusions,
    sectionAgents,
    params.exclusionDebug,
  )) {
    if (!warnings.includes(diagnostic)) warnings.push(diagnostic);
  }

  for (const diagnostic of auditExclusionViolations(
    sectionAgents,
    sectionExclusions,
    {
      assignments,
      point653,
      excluded,
      checkpoints: checkpointResults,
    },
  )) {
    if (!warnings.includes(diagnostic)) warnings.push(diagnostic);
  }

  for (const diagnostic of auditOperationalViolations(
    {
      eligible,
      excluded,
      agentExclusions,
      checkpoints: checkpointResults,
      unassigned,
      point653,
      offDuty,
      assignments,
      structuredWarnings,
      summary: {
        totalEmployees: sectionAgents.filter((a) => a.active).length,
        assignedEmployees: assignedToday.size + point653.length + offDuty.length,
        assignedToCheckpoints: assignedToday.size,
        point653Employees: point653.length,
        restEmployees: offDuty.length,
        unassignedEmployees: point653.length,
        fullyStaffedCheckpoints: staffedCheckpoints.length,
        understaffedCheckpoints: understaffedCheckpoints.length,
        agentExclusionCount: agentExclusions.length,
        warnings: [],
      },
    },
    params.checkpoints,
    params.shift,
    params.planningDate,
    buildAgentGenderMap(sectionAgents),
  )) {
    if (!warnings.includes(diagnostic)) warnings.push(diagnostic);
  }

  if (point653.length > 0) {
    warnings.push(
      `${point653.length} cynotechnicien${point653.length === 1 ? "" : "s"} assigned to ${POINT_653_NAME}.`,
    );
  }

  if (offDuty.length > 0) {
    warnings.push(
      `${offDuty.length} female cynotechnicien${offDuty.length === 1 ? "" : "s"} marked REST (inactive Female Rotation group).`,
    );
  }

  if (params.exclusionDebug) {
    console.log("[Daily Planning] Personnel removed from planning:", agentExclusions);
    console.log(
      "[Daily Planning] Female REST (inactive rotation group):",
      offDuty.map((entry) => ({
        agent_id: entry.agent_id,
        agent_name: entry.agent_name,
      })),
    );
    console.log(
      "[Daily Planning] Personnel sent to Point 653 (dog / no-dog / reserve):",
      point653.map((entry) => ({
        agent_id: entry.agent_id,
        agent_name: entry.agent_name,
        reason: entry.reason,
      })),
    );
  }

  return {
    eligible,
    excluded,
    agentExclusions,
    checkpoints: checkpointResults,
    unassigned,
    point653,
    offDuty,
    assignments,
    structuredWarnings,
    exclusionDebug: params.exclusionDebug,
    summary: {
      totalEmployees: sectionAgents.filter((a) => a.active).length,
      assignedEmployees: assignedToday.size + point653.length + offDuty.length,
      assignedToCheckpoints: assignedToday.size,
      point653Employees: point653.length,
      restEmployees: offDuty.length,
      unassignedEmployees: point653.length,
      fullyStaffedCheckpoints: staffedCheckpoints.length,
      understaffedCheckpoints: understaffedCheckpoints.length,
      agentExclusionCount: agentExclusions.length,
      warnings,
    },
  };
}

export function previousPlanningDate(date: Date): string {
  return format(subDays(date, 1), "yyyy-MM-dd");
}

/** Normalize Supabase nested posts on a checkpoint row. */
export function normalizeCheckpointRow(row: {
  id: string;
  name: string;
  night_only: boolean;
  active?: boolean;
  allowed_gender?: AllowedGender;
  female_policy?: FemalePolicy;
  priority?: number | null;
  operating_days?: number[] | null;
  day_shift_enabled?: boolean;
  night_shift_enabled?: boolean;
  posts: CheckpointPostInput[] | CheckpointPostInput | null;
}): CheckpointInput {
  const rawPosts = row.posts;
  const posts = dedupePostsBySpecialty(
    Array.isArray(rawPosts) ? rawPosts : rawPosts ? [rawPosts] : [],
  ).map((post) => ({
    ...post,
    shift: (post.shift ?? "day") as Shift,
    dog_required: post.dog_required ?? true,
    allowed_gender: normalizeAllowedGender(
      post.allowed_gender ?? row.allowed_gender ?? "all",
    ),
  }));
  return {
    id: row.id,
    name: row.name,
    night_only: row.night_only,
    active: row.active ?? true,
    allowed_gender: normalizeAllowedGender(row.allowed_gender ?? "all"),
    female_policy: row.female_policy ?? "allowed",
    priority: normalizeCheckpointPriority(row.priority),
    operating_days: normalizeOperatingDays(row.operating_days),
    day_shift_enabled: row.day_shift_enabled ?? (row.night_only ? false : true),
    night_shift_enabled:
      row.night_shift_enabled ?? (row.night_only ? true : false),
    posts,
  };
}
