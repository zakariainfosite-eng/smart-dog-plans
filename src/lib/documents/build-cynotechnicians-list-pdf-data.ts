import type { AgentRow } from "@/integrations/database";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import {
  agentSpecialty,
  deriveAgentAvailabilityForAgent,
  type AgentAvailability,
} from "@/lib/agent-ui";
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

/** Official French Statut labels for the personnel list PDF/DOCX. */
const STATUS_PDF_LABEL: Record<string, string> = {
  available: "Disponible",
  sickness: "Malade",
  annual_leave: "Congé",
  special_leave: "Congé",
  administrative_leave: "Congé",
  absence: "Absence",
  mission: "Mission",
  training: "Formation",
  suspension: "Suspension",
  other: "Indisponible",
  dog_sick: "Chien malade",
  female_dog_heat: "Chienne en chaleur",
  dog_injured: "Blessé",
  dog_temporary_retirement: "Chien en repos",
  dog_vet_visit: "Sous observation",
  dog_without_handler: "Chien sans maître",
  dog_training: "Dressage",
  dog_other: "Indisponible",
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
  return `Liste_Fonctionnaires_${iso}.pdf`;
}

export function formatPersonnelStatusPdfLabel(availability: AgentAvailability): string {
  if (availability.status === "available") {
    return STATUS_PDF_LABEL.available;
  }
  return STATUS_PDF_LABEL[availability.exclusionType] ?? "Indisponible";
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
  exclusions: AgentExclusionRecord[],
  exportDate: Date,
): CynotechnicianListPdfRow {
  const fonction = normalizePersonnelFonction(agent.fonction);
  const availability = deriveAgentAvailabilityForAgent(agent, exclusions, exportDate);
  return {
    numero,
    nom: (agent.last_name ?? "").trim().toUpperCase(),
    prenom: (agent.first_name ?? "").trim().toUpperCase(),
    matricule: agent.professional_number?.trim() || "-",
    grade: (agent.grade ?? "").trim() || "-",
    fonction: operational ? "" : PDF_PERSONNEL_FONCTION_LABELS[fonction],
    situation: formatPersonnelStatusPdfLabel(availability),
    chien: operational ? agent.dogs?.name?.trim() || "-" : "",
    specialite: operational ? specialiteLabel(agent) : "",
    section: operational ? agent.sections?.name?.trim() || "-" : "",
  };
}

/**
 * Build official Fonctionnaires List PDF data — exactly two tables max:
 * administrative/command (with Fonction), then Cynotechniciens.
 */
export function buildCynotechniciansListPdfData(
  agents: AgentRow[],
  exclusions: AgentExclusionRecord[],
  exportDate = new Date(),
): CynotechniciansListPdfData {
  const { administrative, operational } = splitPersonnelIntoTwoTables(agents);
  const tables: CynotechniciansListPdfTable[] = [];

  if (administrative.length > 0) {
    tables.push({
      title: PDF_ADMIN_TABLE_TITLE,
      layout: "administrative",
      rows: administrative.map((agent, index) =>
        mapAgentToPdfRow(agent, index + 1, false, exclusions, exportDate),
      ),
    });
  }

  if (operational.length > 0) {
    tables.push({
      title: PDF_OPERATIONAL_TABLE_TITLE,
      layout: "operational",
      rows: operational.map((agent, index) =>
        mapAgentToPdfRow(agent, index + 1, true, exclusions, exportDate),
      ),
    });
  }

  return {
    dateLine: formatCynotechniciansListDateLine(exportDate),
    tables,
  };
}
