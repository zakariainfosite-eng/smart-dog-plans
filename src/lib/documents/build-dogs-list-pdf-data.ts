import type { DogRow, DogSpecialty } from "@/integrations/database";
import type { DogListPdfRow, DogsListPdfData } from "@/lib/documents/feuille-presence-types";
import { formatDogSexPdfLabel } from "@/lib/dog-sex";

/** Official French labels — same language register as the attendance sheet. */
const SPECIALTY_LABEL: Record<DogSpecialty, string> = {
  narcotics: "STUPÉFIANTS",
  explosives: "EXPLOSIFS",
  currency: "BILLETS DE BANQUE",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Attendance-sheet style date line with today's export date. */
export function formatDogsListDateLine(date = new Date()): string {
  return `TANGER LE ${pad2(date.getDate())} / ${pad2(date.getMonth() + 1)} / ${date.getFullYear()}`;
}

export function dogsListFilename(date = new Date()): string {
  const iso = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return `Liste_Chiens_Cynotechniques_${iso}.pdf`;
}

function specialiteLabel(specialty: DogSpecialty | null | undefined): string {
  if (!specialty) return "-";
  return SPECIALTY_LABEL[specialty];
}

function cynotechnicienLabel(dog: DogRow): string {
  const agent = dog.agent;
  if (!agent) return "-";
  const fullName = `${agent.first_name ?? ""} ${agent.last_name ?? ""}`.trim();
  return fullName ? fullName.toUpperCase() : "-";
}

/** Map filtered table rows (current order) → official PDF rows. */
export function buildDogsListPdfData(
  dogs: DogRow[],
  exportDate = new Date(),
): DogsListPdfData {
  const rows: DogListPdfRow[] = dogs.map((dog, index) => ({
    numero: index + 1,
    nom: (dog.name ?? "").trim().toUpperCase() || "-",
    sexe: formatDogSexPdfLabel(dog.gender),
    puce: dog.microchip_number?.trim() || "-",
    race: (dog.breed ?? "").trim().toUpperCase() || "-",
    specialite: specialiteLabel(dog.specialty),
    cynotechnicien: cynotechnicienLabel(dog),
  }));

  return {
    dateLine: formatDogsListDateLine(exportDate),
    rows,
  };
}
