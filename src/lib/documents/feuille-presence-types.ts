export type FeuillePresenceTableRow = {
  fullName: string;
  grade: string;
  mle: string;
  dogName: string;
  hour: string;
  assignment: string;
  /** EMARGEMENT column — populated for non-operational agents only. */
  signature: string;
};

export type FeuillePresenceData = {
  dateLine: string;
  sectionName: string;
  chefName: string;
  chefGrade: string;
  chefMle: string;
  narcoticsRows: FeuillePresenceTableRow[];
  explosivesRows: FeuillePresenceTableRow[];
};

export type FeuillePresenceBuildResult =
  | { ok: true; data: FeuillePresenceData }
  | { ok: false; errors: string[] };

/** One row of the official cynotechnicians list PDF (same visual table style). */
export type CynotechnicianListPdfRow = {
  /** 1-based row number for the current filtered/sorted export. */
  numero: number;
  nom: string;
  prenom: string;
  matricule: string;
  grade: string;
  chien: string;
  specialite: string;
  section: string;
};

export type CynotechniciansListPdfData = {
  /** Header date line — same placement as the attendance sheet. */
  dateLine: string;
  rows: CynotechnicianListPdfRow[];
};

/** One row of the official cynotechnical dogs list PDF (same visual table style). */
export type DogListPdfRow = {
  /** 1-based row number for the current filtered/sorted export. */
  numero: number;
  nom: string;
  puce: string;
  race: string;
  specialite: string;
  cynotechnicien: string;
};

export type DogsListPdfData = {
  /** Header date line — same placement as the attendance sheet. */
  dateLine: string;
  rows: DogListPdfRow[];
};
