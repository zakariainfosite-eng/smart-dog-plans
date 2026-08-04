import type { AgentRow } from "@/integrations/database";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import { agentSpecialty } from "@/lib/agent-ui";
import { formatMaritalStatusPdfLabel } from "@/lib/marital-status";
import type {
  CynotechnicianListPdfRow,
  CynotechniciansListPdfData,
  CynotechniciansListPdfTable,
} from "@/lib/documents/feuille-presence-types";
import {
  PDF_ADMIN_TABLE_TITLE,
  PDF_OPERATIONAL_TABLE_TITLE,
  PDF_PERSONNEL_FONCTION_LABELS,
  splitPersonnelIntoTwoTables,
} from "@/lib/documents/personnel-two-tables";
import { normalizePersonnelFonction } from "@/lib/personnel-fonction";

/** Official French labels — same language register as the attendance sheet. */
const SPECIALTY_LABEL: Record<"narcotics" | "explosives", string> = {
  narcotics: "STUPÉFIANTS",
  explosives: "EXPLOSIFS",
};

/** @deprecated Prefer PDF_PERSONNEL_FONCTION_LABELS from personnel-two-tables. */
export const PDF_PERSONNEL_FONCTION_SECTION_TITLES = PDF_PERSONNEL_FONCTION_LABELS;

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

/** Re-export for verify scripts / callers. */
export {
  compareAgentsWithinFonction as compareAgentsForPersonnelListPdf,
  compareAdministrativePersonnel,
  splitPersonnelIntoTwoTables,
} from "@/lib/documents/personnel-two-tables";

function mapAgentToPdfRow(
  agent: AgentRow,
  numero: number,
  operational: boolean,
): CynotechnicianListPdfRow {
  const fonction = normalizePersonnelFonction(agent.fonction);
  return {
    numero,
    nom: (agent.last_name ?? "").trim().toUpperCase(),
    prenom: (agent.first_name ?? "").trim().toUpperCase(),
    matricule: agent.professional_number?.trim() || "-",
    grade: (agent.grade ?? "").trim() || "-",
    fonction: operational ? "" : PDF_PERSONNEL_FONCTION_LABELS[fonction],
    situation: formatMaritalStatusPdfLabel(agent.marital_status),
    chien: operational ? agent.dogs?.name?.trim() || "-" : "",
    specialite: operational ? specialiteLabel(agent) : "",
    section: operational ? agent.sections?.name?.trim() || "-" : "",
  };
}

/**
 * Build official Personnel List PDF data — exactly two tables max:
 * administrative/command (with Fonction), then Cynotechniciens.
 */
export function buildCynotechniciansListPdfData(
  agents: AgentRow[],
  _exclusions: AgentExclusionRecord[],
  exportDate = new Date(),
): CynotechniciansListPdfData {
  const { administrative, operational } = splitPersonnelIntoTwoTables(agents);
  const tables: CynotechniciansListPdfTable[] = [];

  if (administrative.length > 0) {
    tables.push({
      title: PDF_ADMIN_TABLE_TITLE,
      layout: "administrative",
      rows: administrative.map((agent, index) =>
        mapAgentToPdfRow(agent, index + 1, false),
      ),
    });
  }

  if (operational.length > 0) {
    tables.push({
      title: PDF_OPERATIONAL_TABLE_TITLE,
      layout: "operational",
      rows: operational.map((agent, index) =>
        mapAgentToPdfRow(agent, index + 1, true),
      ),
    });
  }

  return {
    dateLine: formatCynotechniciansListDateLine(exportDate),
    tables,
  };
}
