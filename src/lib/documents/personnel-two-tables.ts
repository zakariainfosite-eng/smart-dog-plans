/**
 * Shared two-table Personnel presentation (app + PDF):
 * 1) Administrative / command staff (single table, Fonction column)
 * 2) Cynotechniciens (operational columns)
 */
import type { AgentRow } from "@/integrations/database";
import { personnelGradeSortRank } from "@/lib/documents/personnel-grade-rank";
import {
  normalizePersonnelFonction,
  PERSONNEL_FONCTIONS,
  usesOperationalPersonnelColumns,
  type PersonnelFonction,
} from "@/lib/personnel-fonction";

/** Official French labels for the Fonction column (PDF + deterministic export). */
export const PDF_PERSONNEL_FONCTION_LABELS: Record<PersonnelFonction, string> = {
  chef_brigadier: "Chef Brigade",
  chef_brigadier_pi: "Chef Brigade PI",
  chef_secretariat: "Chef Secrétariat",
  secretaire: "Secrétaire",
  assistant_technique: "Assistant technique",
  chef_de_section: "Chef de section",
  chef_de_section_pi: "Chef de section PI",
  chef_materiel: "Chef matériel",
  aide_soignant_veterinaire: "Aide-soignant vétérinaire",
  cynotechnicien: "Cynotechnicien",
};

export const PDF_ADMIN_TABLE_TITLE = "Personnel administratif / de commandement";
export const PDF_OPERATIONAL_TABLE_TITLE = "Cynotechniciens";

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function fonctionHierarchyRank(fonction: string | null | undefined): number {
  const normalized = normalizePersonnelFonction(fonction);
  const idx = PERSONNEL_FONCTIONS.indexOf(normalized);
  return idx === -1 ? PERSONNEL_FONCTIONS.length : idx;
}

/** Within-function: Grade (highest first) → Matricule ↑ → Nom A→Z. */
export function compareAgentsWithinFonction(a: AgentRow, b: AgentRow): number {
  const byGrade = personnelGradeSortRank(a.grade) - personnelGradeSortRank(b.grade);
  if (byGrade !== 0) return byGrade;

  const byMatricule = compareText(
    a.professional_number?.trim() ?? "",
    b.professional_number?.trim() ?? "",
  );
  if (byMatricule !== 0) return byMatricule;

  const byLast = compareText(a.last_name ?? "", b.last_name ?? "");
  if (byLast !== 0) return byLast;
  return compareText(a.first_name ?? "", b.first_name ?? "");
}

/** Admin table: hierarchy → grade → matricule → nom. */
export function compareAdministrativePersonnel(a: AgentRow, b: AgentRow): number {
  const byFonction = fonctionHierarchyRank(a.fonction) - fonctionHierarchyRank(b.fonction);
  if (byFonction !== 0) return byFonction;
  return compareAgentsWithinFonction(a, b);
}

export type PersonnelTwoTablesSplit = {
  administrative: AgentRow[];
  operational: AgentRow[];
};

/**
 * Split + sort for the two-table layout.
 * Empty groups are returned as [] (caller skips rendering).
 */
export function splitPersonnelIntoTwoTables(
  agents: readonly AgentRow[],
): PersonnelTwoTablesSplit {
  const administrative: AgentRow[] = [];
  const operational: AgentRow[] = [];

  for (const agent of agents) {
    if (usesOperationalPersonnelColumns(agent.fonction)) {
      operational.push(agent);
    } else {
      administrative.push(agent);
    }
  }

  administrative.sort(compareAdministrativePersonnel);
  operational.sort(compareAgentsWithinFonction);

  return { administrative, operational };
}
