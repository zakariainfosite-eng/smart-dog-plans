export type FeuillePresenceTableRow = {
  fullName: string;
  grade: string;
  mle: string;
  dogName: string;
  hour: string;
  assignment: string;
  /** EMARGEMENT column — populated for non-operational agents only. */
  signature: string;
  /**
   * Female presence-only row (no planning assignment).
   * Rendered inside the existing specialty table after male rows;
   * Affectation stays empty. Used only for stable sort/order.
   */
  presenceOnly?: boolean;
};

export type FeuillePresenceChefMode = "chief" | "adjoint_replacement" | "manual_fill";

export type FeuillePresenceData = {
  dateLine: string;
  sectionName: string;
  chefName: string;
  chefGrade: string;
  chefMle: string;
  /**
   * When true, the PDF omits any chief identity and shows blank Nom / Matricule / Grade
   * dotted lines for handwritten fill-in (excluded chief, no available adjoint).
   */
  chefNeedsReplacement?: boolean;
  /** Title mode: real chef, adjoint replacement, or blank fill-in. */
  chefMode?: FeuillePresenceChefMode;
  narcoticsRows: FeuillePresenceTableRow[];
  explosivesRows: FeuillePresenceTableRow[];
};

export type FeuillePresenceBuildResult =
  | { ok: true; data: FeuillePresenceData }
  | { ok: false; errors: string[] };

/** One column of the personnel list PDF, driven by PDF_FUNCTIONNAIRE_TEMPLATE. */
export type PersonnelListPdfColumn = {
  key: string;
  label: string;
  w: number;
};

/** One row of the official personnel list PDF (same visual table style). */
export type CynotechnicianListPdfRow = {
  /** 1-based row number within the table (admin or operational). */
  numero: number;
  nom: string;
  prenom: string;
  fullName: string;
  matricule: string;
  grade: string;
  /** Filled for administrative table; empty for operational. */
  fonction: string;
  /** Operational Statut (Disponible / exclusion reason) — same logic as Fonctionnaires page. */
  situation: string;
  chien: string;
  specialite: string;
  section: string;
  gender: string;
  dateOfBirth: string;
  origine: string;
  phone: string;
  maritalStatus: string;
  address: string;
};

/** Column layout for a Personnel List PDF table. */
export type CynotechniciansListPdfLayout = "operational" | "administrative";

/**
 * At most two tables:
 * 1) Administrative / command
 * 2) Cynotechniciens
 * Column set is shared (PDF_FUNCTIONNAIRE_TEMPLATE).
 */
export type CynotechniciansListPdfTable = {
  /** Section title above the table (empty = no title band). */
  title: string;
  layout: CynotechniciansListPdfLayout;
  rows: CynotechnicianListPdfRow[];
};

/** @deprecated Use CynotechniciansListPdfTable — kept as alias during transition. */
export type CynotechniciansListPdfSection = CynotechniciansListPdfTable;

export type CynotechniciansListPdfData = {
  /** Header date line — same placement as the attendance sheet. */
  dateLine: string;
  /** 0–2 non-empty tables in fixed order (admin then operational). */
  tables: CynotechniciansListPdfTable[];
  /** Enabled template fields, in saved order — used by both tables. */
  columns: PersonnelListPdfColumn[];
};

/** One row of the official dogs list PDF (same visual table style as Fonctionnaires). */
export type DogListPdfRow = {
  /** 1-based row number for the current filtered/sorted export. */
  numero: number;
  nom: string;
  sexe: string;
  puce: string;
  race: string;
  specialite: string;
  cynotechnicien: string;
  handlerMatricule: string;
  handlerGrade: string;
  age: string;
  dateOfBirth: string;
  section: string;
  status: string;
  assignmentDate: string;
  detectionType: string;
};

export type DogsListPdfColumn = {
  key: string;
  label: string;
  w: number;
};

export type DogsListPdfData = {
  /** Header date line — same placement as the attendance sheet. */
  dateLine: string;
  /** Enabled Chiens template fields, in saved order. */
  columns: DogsListPdfColumn[];
  rows: DogListPdfRow[];
};
