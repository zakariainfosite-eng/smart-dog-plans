import type { DbClient } from "@/integrations/database/client";
import type { FeuillePresenceAgentMeta } from "@/lib/documents/build-feuille-presence-data";
import type { FeuillePresenceTableRow } from "@/lib/documents/feuille-presence-types";
import { sortAttendanceRowsByMatricule } from "@/lib/documents/sort-attendance-by-matricule";
import type { TeamSpecialty } from "@/lib/planning/engine";

const FEUILLE_PRESENCE_DOG_PLACEHOLDER = "***";

function agentFullName(agent: FeuillePresenceAgentMeta): string {
  return `${agent.last_name ?? ""} ${agent.first_name ?? ""}`.trim().toUpperCase();
}

function formatDogName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed.toUpperCase() : FEUILLE_PRESENCE_DOG_PLACEHOLDER;
}

function resolveSpecialty(specialty: string | null | undefined): TeamSpecialty {
  return specialty === "explosives" ? "explosives" : "narcotics";
}

/**
 * Female presence rows for the existing specialty tables.
 * Same columns as male rows; Affectation left empty — no checkpoint / reserve.
 *
 * PRESERVE — Appended after the last male row in Stupéfiants / Explosifs.
 * Rotation Engine must never remove or overwrite this PDF customization.
 */
export function buildCynotechniciennesTableRows(agents: FeuillePresenceAgentMeta[]): {
  narcoticsRows: FeuillePresenceTableRow[];
  explosivesRows: FeuillePresenceTableRow[];
} {
  const rows = sortAttendanceRowsByMatricule(
    agents.map((agent) => {
      const specialty = resolveSpecialty(agent.dog_specialty);
      return {
        fullName: agentFullName(agent),
        grade: agent.grade?.trim() ?? "",
        mle: agent.professional_number?.trim() ?? "",
        dogName: formatDogName(agent.dog_name),
        hour: "",
        assignment: "",
        signature: "",
        presenceOnly: true as const,
        _group: specialty,
      };
    }),
  );

  const toRow = ({
    fullName,
    grade,
    mle,
    dogName,
    hour,
    assignment,
    signature,
    presenceOnly,
  }: (typeof rows)[number]): FeuillePresenceTableRow => ({
    fullName,
    grade,
    mle,
    dogName,
    hour,
    assignment,
    signature,
    presenceOnly,
  });

  return {
    narcoticsRows: rows.filter((row) => row._group === "narcotics").map(toRow),
    explosivesRows: rows.filter((row) => row._group === "explosives").map(toRow),
  };
}

/** Load active female agents with dog specialty for PDF presence rows. */
export async function loadActiveFemaleAgentsForPresence(
  db: DbClient,
): Promise<FeuillePresenceAgentMeta[]> {
  const { data, error } = await db
    .from("agents")
    .select(
      "id, first_name, last_name, professional_number, grade, gender, fonction, dogs:dog_id(name, specialty)",
    )
    .eq("active", true)
    .eq("gender", "female")
    .order("last_name")
    .order("first_name");

  if (error) throw error;

  return (data ?? [])
    .filter((row: any) => (row.fonction ?? "cynotechnicien") === "cynotechnicien")
    .map((row: any) => {
      const dogs = row.dogs;
      const dog = Array.isArray(dogs) ? dogs[0] : dogs;
      const specialty = dog?.specialty;
      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        professional_number: row.professional_number,
        grade: row.grade ?? "",
        is_section_chief: false,
        dog_name: dog?.name ?? null,
        dog_specialty:
          specialty === "narcotics" || specialty === "explosives" ? specialty : null,
      };
    });
}
