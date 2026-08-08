/**
 * Personnel role hierarchy — display order is authoritative for selectors.
 * Stable DB values (snake_case). Existing rows keep their stored values
 * (or are remapped via migration aliases).
 */
export const PERSONNEL_FONCTIONS = [
  "chef_brigadier",
  "chef_brigadier_pi",
  "chef_secretariat",
  "secretaire",
  "assistant_technique",
  "chef_de_section",
  "chef_de_section_pi",
  "chef_materiel",
  "aide_soignant_veterinaire",
  "cynotechnicien",
] as const;

export type PersonnelFonction = (typeof PERSONNEL_FONCTIONS)[number];

export const DEFAULT_PERSONNEL_FONCTION: PersonnelFonction = "cynotechnicien";

/** Legacy / alias values → canonical hierarchy keys. */
const FONCTION_ALIASES: Record<string, PersonnelFonction> = {
  // Previous hierarchy spelling (migration 011)
  chef_brigade: "chef_brigadier",
  chef_brigade_pi: "chef_brigadier_pi",
  // Historical spelling / informal labels
  chef_de_brigade: "chef_brigadier",
  chefbrigade: "chef_brigadier",
  chef_brigade_p_i: "chef_brigadier_pi",
  chef_brigadier_p_i: "chef_brigadier_pi",
  secretariat: "chef_secretariat",
  secretaire_chef: "chef_secretariat",
  secretary: "secretaire",
  assistant: "assistant_technique",
  section_chief: "chef_de_section",
  chef_section: "chef_de_section",
  chef_de_section_p_i: "chef_de_section_pi",
  chef_section_pi: "chef_de_section_pi",
  material_chief: "chef_materiel",
  aide_soignant: "aide_soignant_veterinaire",
  veterinary_aide: "aide_soignant_veterinaire",
  cyno: "cynotechnicien",
  cynotechnician: "cynotechnicien",
};

/** SQL CHECK / IN-list of canonical fonction values (single source for migrations). */
export const PERSONNEL_FONCTIONS_SQL = PERSONNEL_FONCTIONS.map((f) => `'${f}'`).join(",\n          ");

/** Only cynotechniciens enter Smart Rotation / planning / HQ Reserve / attendance PDFs. */
export function isCynotechnicienFonction(
  fonction: string | null | undefined,
): boolean {
  return normalizePersonnelFonction(fonction) === "cynotechnicien";
}

/**
 * Operational table layout (chien / spécialité / section columns).
 * Only Cynotechnicien uses the full operational column set in UI + PDF.
 */
export function usesOperationalPersonnelColumns(
  fonction: string | null | undefined,
): boolean {
  return isCynotechnicienFonction(fonction);
}

/** Chef de section (and PI variant) is linked to exactly one section (not planned). */
export function isChefDeSectionFonction(
  fonction: string | null | undefined,
): boolean {
  const normalized = normalizePersonnelFonction(fonction);
  return normalized === "chef_de_section" || normalized === "chef_de_section_pi";
}

/** Permanent Chef de section only (never the Adjoint / PI variant). */
export function isPrimaryChefDeSectionFonction(
  fonction: string | null | undefined,
): boolean {
  return normalizePersonnelFonction(fonction) === "chef_de_section";
}

/** Roles that may keep a section_id (operational cynotechnicien or section chief). */
export function mayHaveSectionFonction(
  fonction: string | null | undefined,
): boolean {
  return (
    isCynotechnicienFonction(fonction) || isChefDeSectionFonction(fonction)
  );
}

function resolveFonctionCandidate(
  value: string | null | undefined,
): PersonnelFonction | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ((PERSONNEL_FONCTIONS as readonly string[]).includes(trimmed)) {
    return trimmed as PersonnelFonction;
  }
  const lower = trimmed.toLowerCase().replace(/\s+/g, "_");
  if ((PERSONNEL_FONCTIONS as readonly string[]).includes(lower)) {
    return lower as PersonnelFonction;
  }
  if (lower in FONCTION_ALIASES) {
    return FONCTION_ALIASES[lower]!;
  }
  return null;
}

/**
 * Read-path normalization: map aliases; unknown / empty → cynotechnicien
 * for display compatibility with legacy rows.
 */
export function normalizePersonnelFonction(
  value: string | null | undefined,
): PersonnelFonction {
  return resolveFonctionCandidate(value) ?? DEFAULT_PERSONNEL_FONCTION;
}

/**
 * Write-path validation for create/update — never silently coerce invalid roles.
 * Accepts canonical keys and known aliases (e.g. chef_brigade → chef_brigadier).
 */
export function parsePersonnelFonctionStrict(
  value: string | null | undefined,
): PersonnelFonction {
  const resolved = resolveFonctionCandidate(value);
  if (!resolved) {
    throw new Error(
      `Agent fonction is required and must be one of: ${PERSONNEL_FONCTIONS.join(", ")}`,
    );
  }
  return resolved;
}

/** SQL IN-list for chef de section roles (including PI). */
export const CHEF_DE_SECTION_FONCTIONS_SQL = `('chef_de_section', 'chef_de_section_pi')`;
