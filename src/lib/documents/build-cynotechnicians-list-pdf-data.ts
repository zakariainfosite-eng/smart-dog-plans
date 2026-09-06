import type { AgentRow } from "@/integrations/database";
import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import { formatAgentBirthDateDisplay } from "@/lib/agent-birth-date";
import {
  agentSpecialty,
  deriveAgentAvailabilityForAgent,
  type AgentAvailability,
} from "@/lib/agent-ui";
import { formatMaritalStatusPdfLabel } from "@/lib/marital-status";
import type {
  CynotechnicianListPdfRow,
  CynotechniciansListPdfData,
  CynotechniciansListPdfTable,
} from "@/lib/documents/feuille-presence-types";
import { FP_CONTENT_W } from "@/lib/documents/feuille-presence-layout";
import {
  PDF_ADMIN_TABLE_TITLE,
  PDF_OPERATIONAL_TABLE_TITLE,
  PDF_PERSONNEL_FONCTION_LABELS,
  splitPersonnelIntoTwoTables,
} from "@/lib/documents/personnel-two-tables";
import { normalizePersonnelFonction, usesOperationalPersonnelColumns } from "@/lib/personnel-fonction";
import {
  applyFonctionnairePdfListScope,
  buildFonctionnaireListTableCols,
  normalizeFonctionnairePdfListScope,
  sampleFonctionnairePdfTableSource,
  type FonctionnairePdfListScope,
  type FonctionnairePdfTableFieldConfig,
} from "@/lib/reports-messages/fonctionnaire-pdf-table-fields";

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
  rest: "Repos",
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
  if (!spec) return "";
  return SPECIALTY_LABEL[spec];
}

/** Re-export for verify scripts / callers. */
export {
  compareAgentsWithinFonction as compareAgentsForPersonnelListPdf,
  compareAdministrativePersonnel,
  splitPersonnelIntoTwoTables,
} from "@/lib/documents/personnel-two-tables";

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || "-";
}

function genderPdfLabel(gender: AgentRow["gender"]): string {
  return gender === "female" ? "Féminin" : "Masculin";
}

function maritalPdfLabel(value: AgentRow["marital_status"]): string {
  const label = formatMaritalStatusPdfLabel(value);
  return label === "NON RENSEIGNÉ" ? "-" : label;
}

function realValue(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function mapAgentToPdfRow(
  agent: AgentRow,
  numero: number,
  exclusions: AgentExclusionRecord[],
  exportDate: Date,
): CynotechnicianListPdfRow {
  const fonction = normalizePersonnelFonction(agent.fonction);
  const showCynotechnical = usesOperationalPersonnelColumns(agent.fonction);
  const availability = deriveAgentAvailabilityForAgent(agent, exclusions, exportDate);
  const nom = (agent.last_name ?? "").trim().toUpperCase();
  const prenom = (agent.first_name ?? "").trim().toUpperCase();
  return {
    numero,
    nom,
    prenom,
    fullName: `${nom} ${prenom}`.replace(/\s+/g, " ").trim(),
    matricule: dash(agent.professional_number),
    grade: dash(agent.grade),
    fonction: PDF_PERSONNEL_FONCTION_LABELS[fonction],
    situation: formatPersonnelStatusPdfLabel(availability),
    chien: showCynotechnical ? realValue(agent.dogs?.name) : "",
    specialite: showCynotechnical ? specialiteLabel(agent) : "",
    section: showCynotechnical ? realValue(agent.sections?.name) : "",
    gender: genderPdfLabel(agent.gender),
    dateOfBirth: formatAgentBirthDateDisplay(agent.date_naissance) || "-",
    origine: dash(agent.origine),
    phone: dash(agent.phone),
    maritalStatus: maritalPdfLabel(agent.marital_status),
    address: dash(agent.address),
  };
}

function sourceToListRow(
  numero: number,
  extras: Partial<CynotechnicianListPdfRow> = {},
): CynotechnicianListPdfRow {
  const source = sampleFonctionnairePdfTableSource();
  return {
    numero,
    nom: source.lastName,
    prenom: source.firstName,
    fullName: `${source.lastName} ${source.firstName}`,
    matricule: source.matricule,
    grade: source.grade,
    fonction: source.fonction,
    situation: "Disponible",
    chien: source.dogName,
    specialite: source.specialty,
    section: source.section,
    gender: source.gender,
    dateOfBirth: source.dateOfBirth,
    origine: source.origine,
    phone: source.phone,
    maritalStatus: source.maritalStatus,
    address: source.address,
    ...extras,
  };
}

function columnsForLayout(
  fields: FonctionnairePdfTableFieldConfig[] | null | undefined,
  layout: CynotechniciansListPdfTable["layout"],
) {
  return buildFonctionnaireListTableCols(fields, FP_CONTENT_W, {
    includeCynotechnical: layout === "operational",
  });
}

function documentColumns(
  fields: FonctionnairePdfTableFieldConfig[] | null | undefined,
  listScope: FonctionnairePdfListScope | null | undefined,
) {
  const scope = normalizeFonctionnairePdfListScope(listScope);
  return columnsForLayout(fields, scope === "administrative" ? "administrative" : "operational");
}

function pushPersonnelListTable(
  tables: CynotechniciansListPdfTable[],
  title: string,
  layout: CynotechniciansListPdfTable["layout"],
  rows: CynotechnicianListPdfRow[],
  fields: FonctionnairePdfTableFieldConfig[] | null | undefined,
) {
  if (rows.length === 0) return;
  tables.push({
    title,
    layout,
    rows,
    columns: columnsForLayout(fields, layout),
  });
}

/**
 * Sample list used by Gestion du modèle PDF — same columns and listScope as export.
 */
export function buildSampleFonctionnaireListPdfData(
  fields: FonctionnairePdfTableFieldConfig[] | null | undefined,
  listScope: FonctionnairePdfListScope | null | undefined = undefined,
): CynotechniciansListPdfData {
  const groups = applyFonctionnairePdfListScope(
    {
      administrative: [
        sourceToListRow(1, {
          nom: "ALAOUI",
          prenom: "OMAR",
          fullName: "ALAOUI OMAR",
          matricule: "100",
          grade: "Commissaire",
          fonction: PDF_PERSONNEL_FONCTION_LABELS.chef_brigadier,
          chien: "",
          specialite: "",
          section: "",
        }),
      ],
      operational: [sourceToListRow(1)],
    },
    listScope,
  );
  const tables: CynotechniciansListPdfTable[] = [];
  pushPersonnelListTable(
    tables,
    PDF_ADMIN_TABLE_TITLE,
    "administrative",
    groups.administrative,
    fields,
  );
  pushPersonnelListTable(
    tables,
    PDF_OPERATIONAL_TABLE_TITLE,
    "operational",
    groups.operational,
    fields,
  );
  return {
    dateLine: formatCynotechniciansListDateLine(),
    columns: documentColumns(fields, listScope),
    tables,
  };
}

/**
 * Build official Fonctionnaires List PDF data — at most two tables:
 * administrative/command, then Cynotechniciens.
 * Administrative tables omit cynotechnical columns; cynotechnicien tables keep them
 * when enabled on PDF_FUNCTIONNAIRE_TEMPLATE. listScope filters which groups appear.
 */
export function buildCynotechniciansListPdfData(
  agents: AgentRow[],
  exclusions: AgentExclusionRecord[],
  exportDate = new Date(),
  fields: FonctionnairePdfTableFieldConfig[] | null | undefined = undefined,
  listScope: FonctionnairePdfListScope | null | undefined = undefined,
): CynotechniciansListPdfData {
  const split = applyFonctionnairePdfListScope(splitPersonnelIntoTwoTables(agents), listScope);
  const tables: CynotechniciansListPdfTable[] = [];

  pushPersonnelListTable(
    tables,
    PDF_ADMIN_TABLE_TITLE,
    "administrative",
    split.administrative.map((agent, index) =>
      mapAgentToPdfRow(agent, index + 1, exclusions, exportDate),
    ),
    fields,
  );
  pushPersonnelListTable(
    tables,
    PDF_OPERATIONAL_TABLE_TITLE,
    "operational",
    split.operational.map((agent, index) =>
      mapAgentToPdfRow(agent, index + 1, exclusions, exportDate),
    ),
    fields,
  );

  return {
    dateLine: formatCynotechniciansListDateLine(exportDate),
    columns: documentColumns(fields, listScope),
    tables,
  };
}
