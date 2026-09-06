import { addDays, format } from "date-fns";
import type {
  PersistableAssignment,
  PlanningEngineResult,
  Shift,
  TeamSpecialty,
} from "@/lib/planning/engine";
import { FP_POINT_653_ASSIGNMENT, FP_REST_ASSIGNMENT } from "@/lib/documents/feuille-presence-layout";
import type {
  FeuillePresenceBuildResult,
  FeuillePresenceData,
  FeuillePresenceTableRow,
} from "@/lib/documents/feuille-presence-types";
import { buildCynotechniciennesTableRows } from "@/lib/documents/build-cynotechniciennes-presence-data";
import { sortAttendanceRowsByMatricule } from "@/lib/documents/sort-attendance-by-matricule";

export type FeuillePresenceAgentMeta = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  is_section_chief: boolean;
  dog_name?: string | null;
  dog_specialty?: TeamSpecialty | null;
};

export type SectionCommanderInfo = {
  fullName: string;
  grade: string;
  mle: string;
  /**
   * True when the attendance-sheet resolver could not print a chief
   * (excluded Chef de section and no available Adjoint in the same section).
   */
  needsManualFill?: boolean;
  /** chief | adjoint_replacement | manual_fill — drives the PDF title. */
  mode?: "chief" | "adjoint_replacement" | "manual_fill";
};

export type BuildFeuillePresenceInput = {
  planningDate: Date;
  shift: Shift;
  sectionName: string;
  /** Zero-based section index in the 12/24 rotation (displayed as 01–03). */
  sectionIndex: number;
  /** Chef de section stored on the section record. */
  sectionCommander: SectionCommanderInfo;
  /** Grade/MLE/dog metadata — only for agents referenced by the current planning. */
  agents: FeuillePresenceAgentMeta[];
  /**
   * Active female agents (never planned) — DAY sheets only: inserted after male
   * rows inside each specialty table (Affectation empty). Ignored for night.
   */
  femaleAgents?: FeuillePresenceAgentMeta[];
  /** Active agent-level exclusion types from the database, keyed by agent id. */
  exclusionTypesByAgent?: Record<string, string>;
  engineResult: PlanningEngineResult;
};

const FEUILLE_PRESENCE_DOG_PLACEHOLDER = "***";

/** HEURE / EMARGEMENT marker for non-operational agents. */
export const FEUILLE_PRESENCE_NON_OPERATIONAL_MARKER = "*****";

/** Official attendance-sheet labels for database exclusion types. */
const FEUILLE_PRESENCE_EXCLUSION_LABELS: Record<string, string> = {
  sickness: "Maladie",
  training: "Formation",
  annual_leave: "Congé annuel",
  special_leave: "Congé exceptionnel",
  administrative_leave: "Exclusion administrative",
  dog_sick: "Chien malade",
  female_dog_heat: "Chien en chaleur",
  absence: "Permission",
  mission: "Mission",
  rest: "Repos",
  other: "Indisponibilité",
};

const ENGINE_REASON_TO_EXCLUSION_TYPE: Record<string, string> = {
  Sick: "sickness",
  Absent: "absence",
  "On leave": "annual_leave",
  "On special leave": "special_leave",
  "In training": "training",
  "Administrative leave": "administrative_leave",
  "Dog sick": "dog_sick",
  "Female dog in heat": "female_dog_heat",
  "On mission": "mission",
  Excluded: "other",
};

/** Agent IDs from operational checkpoint assignments only. */
export function collectAssignedAgentIds(engineResult: PlanningEngineResult): string[] {
  return [...new Set(engineResult.assignments.map((a) => a.agent_id))];
}

/** Agent IDs from Point 653 reserve assignments. */
export function collectPoint653AgentIds(engineResult: PlanningEngineResult): string[] {
  return [...new Set(engineResult.point653.map((p) => p.agent_id))];
}

/** Agent IDs from female REST (inactive rotation group). */
export function collectOffDutyAgentIds(engineResult: PlanningEngineResult): string[] {
  return [...new Set((engineResult.offDuty ?? []).map((p) => p.agent_id))];
}

/** Agent IDs requiring DB metadata for the current planning (assignments + Point 653 + REST + exclusions). */
export function collectFeuillePresenceMetaAgentIds(engineResult: PlanningEngineResult): string[] {
  const ids = new Set<string>();
  for (const assignment of engineResult.assignments) ids.add(assignment.agent_id);
  for (const entry of engineResult.point653) ids.add(entry.agent_id);
  for (const entry of engineResult.offDuty ?? []) ids.add(entry.agent_id);
  for (const exclusion of engineResult.agentExclusions) ids.add(exclusion.agent_id);
  return [...ids];
}

function planningAgentNames(engineResult: PlanningEngineResult): Map<string, string> {
  const names = new Map<string, string>();
  for (const checkpoint of engineResult.checkpoints) {
    for (const slot of checkpoint.slots) {
      if (slot.team) {
        names.set(slot.team.agent_id, slot.team.agent_name.trim().toUpperCase());
      }
    }
  }
  for (const entry of engineResult.point653) {
    names.set(entry.agent_id, entry.agent_name.trim().toUpperCase());
  }
  for (const entry of engineResult.offDuty ?? []) {
    names.set(entry.agent_id, entry.agent_name.trim().toUpperCase());
  }
  for (const exclusion of engineResult.agentExclusions) {
    names.set(exclusion.agent_id, exclusion.agent_name.trim().toUpperCase());
  }
  return names;
}

function agentFullName(agent: FeuillePresenceAgentMeta): string {
  return `${agent.last_name} ${agent.first_name}`.trim().toUpperCase();
}

function formatDogName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed.toUpperCase() : FEUILLE_PRESENCE_DOG_PLACEHOLDER;
}

/** Date line for the attendance sheet header — night shift spans two calendar days. */
export function formatFeuillePresenceDateLine(planningDate: Date, shift: Shift): string {
  if (shift === "day") {
    return `TANGER LE ${format(planningDate, "dd / MM / yyyy")}`;
  }

  const nextDay = addDays(planningDate, 1);
  const startDay = format(planningDate, "dd");
  const endDay = format(nextDay, "dd");

  if (
    planningDate.getMonth() === nextDay.getMonth()
    && planningDate.getFullYear() === nextDay.getFullYear()
  ) {
    return `TANGER LE ${startDay}-${endDay}/${format(planningDate, "MM/yyyy")}`;
  }

  return `TANGER LE ${format(planningDate, "dd/MM")} - ${format(nextDay, "dd/MM/yyyy")}`;
}

function humanizeExclusionType(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatExclusionMotifForFeuillePresence(
  agentId: string,
  exclusion: PlanningEngineResult["agentExclusions"][number],
  exclusionTypesByAgent: Record<string, string> = {},
): string {
  const type =
    exclusionTypesByAgent[agentId] ?? ENGINE_REASON_TO_EXCLUSION_TYPE[exclusion.reason];

  if (type) {
    return FEUILLE_PRESENCE_EXCLUSION_LABELS[type] ?? humanizeExclusionType(type);
  }

  return "Non renseigné";
}

/** @deprecated Use formatExclusionMotifForFeuillePresence with exclusion types from DB. */
export function mapExclusionReasonToMotif(reason: string): string {
  const type = ENGINE_REASON_TO_EXCLUSION_TYPE[reason];
  if (type) {
    return FEUILLE_PRESENCE_EXCLUSION_LABELS[type] ?? humanizeExclusionType(type);
  }
  return "Non renseigné";
}

function resolveSpecialty(
  specialty: TeamSpecialty | null | undefined,
): TeamSpecialty {
  return specialty === "explosives" ? "explosives" : "narcotics";
}

function agentSpecialty(agent: FeuillePresenceAgentMeta): TeamSpecialty {
  return resolveSpecialty(agent.dog_specialty);
}

type AssignmentContext = {
  team: NonNullable<
    PlanningEngineResult["checkpoints"][number]["slots"][number]["team"]
  > | null;
  checkpointName: string;
  specialty: TeamSpecialty;
};

function findAssignmentContext(
  engineResult: PlanningEngineResult,
  assignment: PersistableAssignment,
): AssignmentContext {
  for (const checkpoint of engineResult.checkpoints) {
    if (checkpoint.checkpoint_id !== assignment.checkpoint_id) continue;

    for (const slot of checkpoint.slots) {
      if (
        slot.post_id === assignment.checkpoint_post_id
        && slot.team?.agent_id === assignment.agent_id
      ) {
        return {
          team: slot.team,
          checkpointName: checkpoint.checkpoint_name,
          specialty: slot.specialty_required,
        };
      }
    }

    for (const slot of checkpoint.slots) {
      if (slot.team?.agent_id === assignment.agent_id) {
        return {
          team: slot.team,
          checkpointName: checkpoint.checkpoint_name,
          specialty: slot.specialty_required,
        };
      }
    }

    return {
      team: null,
      checkpointName: checkpoint.checkpoint_name,
      specialty: "narcotics",
    };
  }

  return { team: null, checkpointName: "", specialty: "narcotics" };
}

function buildOperationalRowFromAssignment(
  agent: FeuillePresenceAgentMeta | undefined,
  assignment: PersistableAssignment,
  context: AssignmentContext,
): FeuillePresenceTableRow & { agentId: string; specialty: TeamSpecialty } {
  const team = context.team;
  const fullName = team
    ? team.agent_name.trim().toUpperCase()
    : agent
      ? agentFullName(agent)
      : assignment.agent_id.toUpperCase();

  return {
    agentId: assignment.agent_id,
    specialty: context.specialty,
    fullName,
    grade: agent?.grade?.trim() ?? "",
    mle: team?.professional_number?.trim() || agent?.professional_number?.trim() || "",
    dogName: formatDogName(team?.dog_name || agent?.dog_name),
    hour: "",
    assignment: context.checkpointName.trim().toUpperCase(),
    signature: "",
  };
}

function buildPoint653RowBestEffort(
  agent: FeuillePresenceAgentMeta | undefined,
  entry: PlanningEngineResult["point653"][number],
): FeuillePresenceTableRow & { agentId: string; specialty: TeamSpecialty } {
  return {
    agentId: entry.agent_id,
    specialty: resolveSpecialty(entry.specialty ?? agent?.dog_specialty),
    fullName: entry.agent_name.trim().toUpperCase(),
    grade: agent?.grade?.trim() ?? "",
    mle: entry.professional_number?.trim() || agent?.professional_number?.trim() || "",
    dogName: formatDogName(entry.dog_name || agent?.dog_name),
    hour: "",
    assignment: FP_POINT_653_ASSIGNMENT,
    signature: "",
  };
}

function buildRestRowBestEffort(
  agent: FeuillePresenceAgentMeta | undefined,
  entry: PlanningEngineResult["offDuty"][number],
): FeuillePresenceTableRow & { agentId: string; specialty: TeamSpecialty } {
  return {
    agentId: entry.agent_id,
    specialty: resolveSpecialty(entry.specialty ?? agent?.dog_specialty),
    fullName: entry.agent_name.trim().toUpperCase(),
    grade: agent?.grade?.trim() ?? "",
    mle: entry.professional_number?.trim() || agent?.professional_number?.trim() || "",
    dogName: formatDogName(entry.dog_name || agent?.dog_name),
    hour: "",
    assignment: FP_REST_ASSIGNMENT,
    signature: "",
  };
}

function buildExcludedRowBestEffort(
  agent: FeuillePresenceAgentMeta | undefined,
  exclusion: PlanningEngineResult["agentExclusions"][number],
  exclusionTypesByAgent: Record<string, string>,
): FeuillePresenceTableRow & { agentId: string; specialty: TeamSpecialty } {
  return {
    agentId: exclusion.agent_id,
    specialty: agent ? agentSpecialty(agent) : "narcotics",
    fullName: exclusion.agent_name.trim().toUpperCase(),
    grade: agent?.grade?.trim() ?? "",
    mle: agent?.professional_number?.trim() ?? "",
    dogName: formatDogName(agent?.dog_name),
    hour: FEUILLE_PRESENCE_NON_OPERATIONAL_MARKER,
    assignment: formatExclusionMotifForFeuillePresence(
      exclusion.agent_id,
      exclusion,
      exclusionTypesByAgent,
    ),
    signature: FEUILLE_PRESENCE_NON_OPERATIONAL_MARKER,
  };
}

/**
 * Build attendance sheet data from the generated planning.
 * Never blocks on understaffed checkpoints or operational warnings — reports what was assigned.
 */
export function buildFeuillePresenceData(input: BuildFeuillePresenceInput): FeuillePresenceBuildResult {
  const assignedIdSet = new Set(collectAssignedAgentIds(input.engineResult));
  const point653IdSet = new Set(collectPoint653AgentIds(input.engineResult));
  const agentById = new Map(input.agents.map((a) => [a.id, a]));
  const exclusionTypesByAgent = input.exclusionTypesByAgent ?? {};

  type DraftRow = FeuillePresenceTableRow & {
    agentId: string;
    specialty: TeamSpecialty;
  };

  const operationalDraft: DraftRow[] = [];
  const seenOperational = new Set<string>();

  for (const assignment of input.engineResult.assignments) {
    if (seenOperational.has(assignment.agent_id)) continue;
    seenOperational.add(assignment.agent_id);

    const context = findAssignmentContext(input.engineResult, assignment);
    const agent = agentById.get(assignment.agent_id);
    operationalDraft.push(
      buildOperationalRowFromAssignment(agent, assignment, context),
    );
  }

  const point653Draft: DraftRow[] = [];
  const seenPoint653 = new Set<string>();

  for (const entry of input.engineResult.point653) {
    if (seenPoint653.has(entry.agent_id)) continue;
    seenPoint653.add(entry.agent_id);

    const agent = agentById.get(entry.agent_id);
    point653Draft.push(buildPoint653RowBestEffort(agent, entry));
  }

  const restDraft: DraftRow[] = [];
  const seenRest = new Set<string>();

  for (const entry of input.engineResult.offDuty ?? []) {
    if (seenRest.has(entry.agent_id)) continue;
    seenRest.add(entry.agent_id);

    const agent = agentById.get(entry.agent_id);
    restDraft.push(buildRestRowBestEffort(agent, entry));
  }

  const excludedDraft: DraftRow[] = [];
  const seenExclusions = new Set<string>();

  for (const exclusion of input.engineResult.agentExclusions) {
    if (seenExclusions.has(exclusion.agent_id)) continue;
    seenExclusions.add(exclusion.agent_id);

    const agent = agentById.get(exclusion.agent_id);
    excludedDraft.push(buildExcludedRowBestEffort(agent, exclusion, exclusionTypesByAgent));
  }

  // DAY only: reserved female presence lines (Stupéfiants + Explosifs).
  // NIGHT: omit entirely — sheet lists only personnel assigned to that shift.
  const femaleRows =
    input.shift === "day"
      ? buildCynotechniciennesTableRows(input.femaleAgents ?? [])
      : { narcoticsRows: [] as FeuillePresenceTableRow[], explosivesRows: [] as FeuillePresenceTableRow[] };

  // PRESERVE (day) — Men first (matricule), then women of the same specialty (matricule).
  // Females: personnel info only, empty Affectation; never operationally assigned.
  // Rotation Engine updates must not remove this day-only append.
  const narcoticsRows = [
    ...sortAttendanceRowsByMatricule(
      [
        ...operationalDraft.filter((r) => r.specialty === "narcotics"),
        ...point653Draft.filter((r) => r.specialty === "narcotics"),
        ...restDraft.filter((r) => r.specialty === "narcotics"),
        ...excludedDraft.filter((r) => r.specialty === "narcotics"),
      ].map(stripDraft),
    ),
    ...femaleRows.narcoticsRows,
  ];

  const explosivesRows = [
    ...sortAttendanceRowsByMatricule(
      [
        ...operationalDraft.filter((r) => r.specialty === "explosives"),
        ...point653Draft.filter((r) => r.specialty === "explosives"),
        ...restDraft.filter((r) => r.specialty === "explosives"),
        ...excludedDraft.filter((r) => r.specialty === "explosives"),
      ].map(stripDraft),
    ),
    ...femaleRows.explosivesRows,
  ];

  const chefNeedsReplacement = Boolean(input.sectionCommander.needsManualFill);
  const chefMode =
    input.sectionCommander.mode ??
    (chefNeedsReplacement ? "manual_fill" : "chief");
  const data: FeuillePresenceData = {
    dateLine: formatFeuillePresenceDateLine(input.planningDate, input.shift),
    sectionName: input.sectionName.trim().toUpperCase(),
    // Leadership name: preserve natural casing (never GRADE-prefixed / ALL CAPS).
    chefName: chefNeedsReplacement ? "" : input.sectionCommander.fullName.trim(),
    chefGrade: chefNeedsReplacement ? "" : input.sectionCommander.grade.trim(),
    chefMle: chefNeedsReplacement ? "" : input.sectionCommander.mle.trim(),
    chefNeedsReplacement,
    chefMode,
    narcoticsRows,
    explosivesRows,
  };

  return { ok: true, data };
}

function stripDraft(row: FeuillePresenceTableRow & { agentId: string; specialty: TeamSpecialty }): FeuillePresenceTableRow {
  return {
    fullName: row.fullName,
    grade: row.grade,
    mle: row.mle,
    dogName: row.dogName,
    hour: row.hour,
    assignment: row.assignment,
    signature: row.signature,
  };
}

/** Internal assertions for planning ↔ PDF consistency (used by verification script). */
export function verifyFeuillePresenceData(
  input: BuildFeuillePresenceInput,
  data: FeuillePresenceData,
): string[] {
  const issues: string[] = [];
  const allRows = [...data.narcoticsRows, ...data.explosivesRows];
  const assignmentIds = collectAssignedAgentIds(input.engineResult);
  const point653Ids = collectPoint653AgentIds(input.engineResult);
  const offDutyIds = collectOffDutyAgentIds(input.engineResult);
  const exclusionIds = input.engineResult.agentExclusions.map((e) => e.agent_id);
  const planningNames = planningAgentNames(input.engineResult);
  const agentById = new Map(input.agents.map((a) => [a.id, a]));

  const expectedCount =
    assignmentIds.length + point653Ids.length + offDutyIds.length + exclusionIds.length;
  if (allRows.length !== expectedCount) {
    issues.push(
      `Nombre de lignes incorrect : PDF ${allRows.length}, planification ${expectedCount}.`,
    );
  }

  const exclusionTypesByAgent = input.exclusionTypesByAgent ?? {};
  const excludedNames = new Set(
    input.engineResult.agentExclusions.map((e) => e.agent_name.trim().toUpperCase()),
  );

  const seenNames = new Set<string>();
  for (const row of allRows) {
    if (seenNames.has(row.fullName)) {
      issues.push(`Agent en double dans le PDF : ${row.fullName}.`);
    }
    seenNames.add(row.fullName);

    const isExcluded = excludedNames.has(row.fullName);
    if (isExcluded) {
      if (row.hour !== FEUILLE_PRESENCE_NON_OPERATIONAL_MARKER) {
        issues.push(`${row.fullName} — HEURE doit afficher ${FEUILLE_PRESENCE_NON_OPERATIONAL_MARKER}.`);
      }
      if (row.signature !== FEUILLE_PRESENCE_NON_OPERATIONAL_MARKER) {
        issues.push(`${row.fullName} — EMARGEMENT doit afficher ${FEUILLE_PRESENCE_NON_OPERATIONAL_MARKER}.`);
      }
    } else if (row.hour.trim()) {
      issues.push(`Heure renseignée pour ${row.fullName} — doit rester vide.`);
    } else if (row.signature.trim()) {
      issues.push(`Émargement renseigné pour ${row.fullName} — doit rester vide.`);
    }
  }

  for (const agentId of assignmentIds) {
    const expectedName = planningNames.get(agentId) ?? agentId;
    const row = allRows.find((r) => r.fullName === expectedName);
    if (!row) {
      issues.push(`Agent absent du PDF : ${expectedName}.`);
    } else if (
      row.assignment === FP_POINT_653_ASSIGNMENT ||
      row.assignment === FP_REST_ASSIGNMENT ||
      isExclusionMotif(row.assignment)
    ) {
      issues.push(`${expectedName} — affectation opérationnelle incorrecte.`);
    }
  }

  for (const agentId of point653Ids) {
    const expectedName = planningNames.get(agentId) ?? agentId;
    const row = allRows.find((r) => r.fullName === expectedName);
    if (!row) {
      issues.push(`Point 653 absent du PDF : ${expectedName}.`);
    } else if (row.assignment !== FP_POINT_653_ASSIGNMENT) {
      issues.push(`${expectedName} — affectation Point 653 incorrecte.`);
    }
  }

  for (const agentId of offDutyIds) {
    const expectedName = planningNames.get(agentId) ?? agentId;
    const row = allRows.find((r) => r.fullName === expectedName);
    if (!row) {
      issues.push(`REPOS absent du PDF : ${expectedName}.`);
    } else if (row.assignment !== FP_REST_ASSIGNMENT) {
      issues.push(`${expectedName} — affectation REPOS incorrecte.`);
    }
  }

  for (const exclusion of input.engineResult.agentExclusions) {
    const expectedName = exclusion.agent_name.trim().toUpperCase();
    const expectedMotif = formatExclusionMotifForFeuillePresence(
      exclusion.agent_id,
      exclusion,
      exclusionTypesByAgent,
    );
    const row = allRows.find((r) => r.fullName === expectedName);
    if (!row) {
      issues.push(`Personnel non opérationnel absent : ${expectedName}.`);
    } else if (row.assignment !== expectedMotif) {
      issues.push(`${expectedName} — motif incorrect (attendu : ${expectedMotif}).`);
    }

    const agent = agentById.get(exclusion.agent_id);
    if (agent) {
      const specialty = agentSpecialty(agent);
      const inTable =
        specialty === "narcotics"
          ? data.narcoticsRows.some((r) => r.fullName === expectedName)
          : data.explosivesRows.some((r) => r.fullName === expectedName);
      if (!inTable) {
        issues.push(`${expectedName} devrait être dans le tableau ${specialty === "narcotics" ? "Stupéfiants" : "Explosifs"}.`);
      }
    }
  }

  if (!data.dateLine.trim()) issues.push("Date manquante dans l'en-tête.");
  if (!data.sectionName.trim()) issues.push("Section manquante dans l'en-tête.");

  return issues;
}

function isExclusionMotif(assignment: string): boolean {
  const motifs = new Set([
    ...Object.values(FEUILLE_PRESENCE_EXCLUSION_LABELS),
    "Non renseigné",
  ]);
  return motifs.has(assignment);
}
