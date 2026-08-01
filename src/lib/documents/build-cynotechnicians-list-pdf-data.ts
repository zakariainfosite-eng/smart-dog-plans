import type { AgentRow } from "@/integrations/database";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import { agentSpecialty } from "@/lib/agent-ui";
import type {
  CynotechnicianListPdfRow,
  CynotechniciansListPdfData,
} from "@/lib/documents/feuille-presence-types";

/** Official French labels — same language register as the attendance sheet. */
const SPECIALTY_LABEL: Record<"narcotics" | "explosives", string> = {
  narcotics: "STUPÉFIANTS",
  explosives: "EXPLOSIFS",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Attendance-sheet style date line with today's export date. */
export function formatCynotechniciansListDateLine(date = new Date()): string {
  return `TANGER LE ${pad2(date.getDate())} / ${pad2(date.getMonth() + 1)} / ${date.getFullYear()}`;
}

export function cynotechniciansListFilename(date = new Date()): string {
  const iso = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return `Liste_Cynotechniciens_${iso}.pdf`;
}

function specialiteLabel(agent: AgentRow): string {
  const spec = agentSpecialty(agent);
  if (!spec) return "-";
  return SPECIALTY_LABEL[spec];
}

/** Map filtered table rows (current order) → official PDF rows. */
export function buildCynotechniciansListPdfData(
  agents: AgentRow[],
  _exclusions: AgentExclusionRecord[],
  exportDate = new Date(),
): CynotechniciansListPdfData {
  const rows: CynotechnicianListPdfRow[] = agents.map((agent, index) => ({
    numero: index + 1,
    nom: (agent.last_name ?? "").trim().toUpperCase(),
    prenom: (agent.first_name ?? "").trim().toUpperCase(),
    matricule: agent.professional_number?.trim() || "-",
    grade: (agent.grade ?? "").trim() || "-",
    chien: agent.dogs?.name?.trim() || "-",
    specialite: specialiteLabel(agent),
    section: agent.sections?.name?.trim() || "-",
  }));

  return {
    dateLine: formatCynotechniciansListDateLine(exportDate),
    rows,
  };
}
