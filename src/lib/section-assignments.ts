import type { TFunction } from "i18next";
import type { AgentRow, AgentWriteInput } from "@/integrations/database";
import {
  isAgentExclusionActive,
  isAgentLevelExclusionType,
  type AgentExclusionRecord,
} from "@/lib/agent-exclusions";
import {
  isChefDeSectionFonction,
  isCynotechnicienFonction,
  normalizePersonnelFonction,
} from "@/lib/personnel-fonction";

/** Build a full write payload that only changes section_id — never deletes the agent. */
export function agentWriteWithSection(
  agent: AgentRow,
  sectionId: string | null,
): AgentWriteInput {
  return {
    first_name: agent.first_name,
    last_name: agent.last_name,
    professional_number: agent.professional_number,
    grade: agent.grade,
    gender: agent.gender,
    marital_status: agent.marital_status,
    fonction: normalizePersonnelFonction(agent.fonction),
    section_id: sectionId,
    dog_id: agent.dog_id,
    phone: agent.phone,
    address: agent.address,
    observations: agent.observations,
    active: agent.active,
    photo_url: agent.photo_url,
  };
}

/** Who may keep a section assignment under current business rules (matches agents-store). */
export function canAssignAgentToSection(agent: Pick<AgentRow, "fonction" | "gender">): boolean {
  const fonction = normalizePersonnelFonction(agent.fonction);
  if (isChefDeSectionFonction(fonction)) return true;
  return isCynotechnicienFonction(fonction) && agent.gender !== "female";
}

export function isActiveCynotechnicien(agent: Pick<AgentRow, "fonction" | "gender" | "active">): boolean {
  return (
    agent.active &&
    isCynotechnicienFonction(agent.fonction) &&
    agent.gender !== "female"
  );
}

export function personnelStatusLabel(
  agent: Pick<AgentRow, "id" | "active">,
  exclusions: AgentExclusionRecord[],
  referenceISO: string,
  t: TFunction,
): string {
  if (!agent.active) return t("common.inactive");

  const activeExclusion = exclusions.find(
    (row) =>
      row.agent_id === agent.id &&
      isAgentLevelExclusionType(row.exclusion_type) &&
      isAgentExclusionActive(row, referenceISO),
  );
  if (activeExclusion) {
    return t(`exclusions.type.${activeExclusion.exclusion_type}`);
  }
  return t("employees.operationalStatus.available");
}
