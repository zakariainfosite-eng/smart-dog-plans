import { isAgentLevelExclusionType } from "@/lib/agent-exclusions";
import { normalizePersonnelFonction } from "@/lib/personnel-fonction";

export type SectionCommanderDisplayMode = "chief" | "adjoint_replacement" | "manual_fill";

export type SectionCommanderAgentLike = {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  professional_number: string;
  section_id: string | null;
  fonction: string | null | undefined;
  active: boolean;
};

export type ExclusionLike = {
  agent_id: string | null;
  exclusion_type: string;
};

export type SectionCommanderDisplay = {
  fullName: string;
  grade: string;
  mle: string;
  mode: SectionCommanderDisplayMode;
  needsManualFill: boolean;
};

/** PDF / UI title when the real Chef de section is shown (or blank fill-in). */
export const SECTION_COMMANDER_TITLE_CHIEF = "CHEF DE SECTION";

/**
 * Display-only interim title when an available Adjoint temporarily stands in
 * for an excluded Chef. Never persisted to the database.
 */
export const SECTION_COMMANDER_TITLE_ADJOINT_REPLACEMENT = "CHEF DE SECTION (INTÉRIM)";

/** Dotted placeholder for manual fill on the Section page. */
export const SECTION_COMMANDER_MANUAL_FILL_DOTS = "………………………………";

function excludedAgentIds(exclusions: ExclusionLike[]): Set<string> {
  const ids = new Set<string>();
  for (const exclusion of exclusions) {
    if (!exclusion.agent_id) continue;
    if (!isAgentLevelExclusionType(exclusion.exclusion_type)) continue;
    ids.add(exclusion.agent_id);
  }
  return ids;
}

/** Display name only — never prefix with grade. */
export function formatSectionCommanderName(
  agent: Pick<SectionCommanderAgentLike, "first_name" | "last_name">,
): string {
  return `${agent.first_name} ${agent.last_name}`.replace(/\s+/g, " ").trim();
}

/** Remove a leading grade token from legacy "GRADE First Last" commander strings. */
export function stripLeadingGradeFromCommanderName(fullName: string, grade: string): string {
  const name = fullName.trim();
  const g = grade.trim();
  if (!name || !g) return name;
  const escaped = g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return name.replace(new RegExp(`^${escaped}\\s+`, "i"), "").trim();
}

function compareAgents(a: SectionCommanderAgentLike, b: SectionCommanderAgentLike): number {
  const byLast = a.last_name.localeCompare(b.last_name, undefined, { sensitivity: "base" });
  if (byLast !== 0) return byLast;
  return a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" });
}

function toDisplay(agent: SectionCommanderAgentLike, mode: SectionCommanderDisplayMode): SectionCommanderDisplay {
  return {
    fullName: formatSectionCommanderName(agent),
    grade: agent.grade?.trim() ?? "",
    mle: agent.professional_number?.trim() ?? "",
    mode,
    needsManualFill: false,
  };
}

/**
 * Resolve who is shown as section commander (Section page + attendance PDF).
 *
 * 1) Available Chef de section → title CHEF DE SECTION
 * 2) Excluded Chef + available Adjoint in same section → ADJOINT CHEF DE SECTION
 * 3) Excluded Chef + no available Adjoint → CHEF DE SECTION + blank dotted lines
 *
 * Fully dynamic from live agents + active exclusions — no DB structure changes.
 */
export function resolveSectionCommanderDisplay(params: {
  sectionId: string;
  agents: SectionCommanderAgentLike[];
  exclusions: ExclusionLike[];
  fallback?: { fullName: string; grade: string; mle: string };
}): SectionCommanderDisplay {
  const { sectionId, agents, exclusions, fallback } = params;
  const excludedIds = excludedAgentIds(exclusions);

  const inSection = agents.filter(
    (agent) => agent.section_id === sectionId && agent.active,
  );

  const chiefs = inSection
    .filter((agent) => normalizePersonnelFonction(agent.fonction) === "chef_de_section")
    .sort(compareAgents);

  const adjoints = inSection
    .filter((agent) => normalizePersonnelFonction(agent.fonction) === "chef_de_section_pi")
    .sort(compareAgents);

  const primaryChef = chiefs[0] ?? null;

  if (primaryChef && !excludedIds.has(primaryChef.id)) {
    return toDisplay(primaryChef, "chief");
  }

  const availableAdjoint = adjoints.find((agent) => !excludedIds.has(agent.id)) ?? null;

  if (primaryChef && excludedIds.has(primaryChef.id)) {
    if (availableAdjoint) {
      return toDisplay(availableAdjoint, "adjoint_replacement");
    }
    return {
      fullName: "",
      grade: "",
      mle: "",
      mode: "manual_fill",
      needsManualFill: true,
    };
  }

  // No permanent Chef in the section — show available Adjoint as display-only interim,
  // or fall back to section-stored commander fields when still useful.
  if (availableAdjoint) {
    return toDisplay(availableAdjoint, "adjoint_replacement");
  }

  const fallbackGrade = fallback?.grade.trim() ?? "";
  const fallbackMle = fallback?.mle.trim() ?? "";
  const fallbackName = stripLeadingGradeFromCommanderName(
    fallback?.fullName.trim() ?? "",
    fallbackGrade,
  );
  if (fallbackName || fallbackGrade || fallbackMle) {
    const fallbackAgent = agents.find(
      (agent) =>
        agent.professional_number.trim() === fallbackMle && fallbackMle.length > 0,
    );
    if (fallbackAgent && excludedIds.has(fallbackAgent.id)) {
      return {
        fullName: "",
        grade: "",
        mle: "",
        mode: "manual_fill",
        needsManualFill: true,
      };
    }
    if (fallbackAgent && !excludedIds.has(fallbackAgent.id)) {
      return toDisplay(fallbackAgent, "chief");
    }
    return {
      fullName: fallbackName,
      grade: fallbackGrade,
      mle: fallbackMle,
      mode: "chief",
      needsManualFill: false,
    };
  }

  return {
    fullName: "",
    grade: "",
    mle: "",
    mode: "manual_fill",
    needsManualFill: true,
  };
}

export function sectionCommanderTitleForMode(mode: SectionCommanderDisplayMode): string {
  return mode === "adjoint_replacement"
    ? SECTION_COMMANDER_TITLE_ADJOINT_REPLACEMENT
    : SECTION_COMMANDER_TITLE_CHIEF;
}
