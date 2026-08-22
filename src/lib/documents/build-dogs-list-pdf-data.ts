import type { DogRow, DogSpecialty, DogStatus } from "@/integrations/database";
import type { DogListPdfRow, DogsListPdfData } from "@/lib/documents/feuille-presence-types";
import { FP_CONTENT_W } from "@/lib/documents/feuille-presence-layout";
import { formatAgentBirthDateDisplay } from "@/lib/agent-birth-date";
import { formatDogSexPdfLabel } from "@/lib/dog-sex";
import {
  addYears,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
  parseISO,
} from "date-fns";
import {
  applyChienPdfListFilters,
  buildChienListTableCols,
  type ChienPdfMinAgeYears,
  type ChienPdfSexFilter,
  type ChienPdfTableFieldConfig,
} from "@/lib/reports-messages/chien-pdf-table-fields";

/** Official French labels — same language register as the attendance sheet. */
const SPECIALTY_LABEL: Record<DogSpecialty, string> = {
  narcotics: "STUPÉFIANTS",
  explosives: "EXPLOSIFS",
  currency: "BILLETS DE BANQUE",
};

const STATUS_PDF_LABEL: Record<DogStatus, string> = {
  available: "DISPONIBLE",
  sick: "MALADE",
  heat: "CHALEUR",
};

function padDate(n: number): string {
  return String(n).padStart(2, "0");
}

/** Attendance-sheet style date line with today's export date. */
export function formatDogsListDateLine(date = new Date()): string {
  return `TANGER LE ${padDate(date.getDate())} / ${padDate(date.getMonth() + 1)} / ${date.getFullYear()}`;
}

export function dogsListFilename(date = new Date()): string {
  const iso = `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())}`;
  return `Liste_Chiens_${iso}.pdf`;
}

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || "-";
}

function specialiteLabel(specialty: DogSpecialty | null | undefined): string {
  if (!specialty) return "-";
  return SPECIALTY_LABEL[specialty];
}

function handlerNameLabel(dog: DogRow): string {
  const agent = dog.agent;
  if (!agent) return "-";
  const fullName = `${agent.last_name ?? ""} ${agent.first_name ?? ""}`.trim();
  return fullName ? fullName.toUpperCase() : "-";
}

function formatDogAgePdfLabel(dateOfBirth: string | null | undefined): string {
  if (!dateOfBirth?.trim()) return "-";
  let dob: Date;
  try {
    dob = parseISO(dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) return "-";
  } catch {
    return "-";
  }
  const now = new Date();
  const totalDays = differenceInDays(now, dob);
  if (totalDays < 30) return `${totalDays} J`;
  const totalMonths = differenceInMonths(now, dob);
  if (totalMonths < 12) return `${totalMonths} MOIS`;
  const years = differenceInYears(now, dob);
  const months = differenceInMonths(now, addYears(dob, years));
  if (months === 0) return `${years} ANS`;
  return `${years} ANS ${months} MOIS`;
}

function mapDogToPdfRow(dog: DogRow, numero: number): DogListPdfRow {
  const specialty = specialiteLabel(dog.specialty);
  return {
    numero,
    nom: (dog.name ?? "").trim().toUpperCase() || "-",
    sexe: formatDogSexPdfLabel(dog.gender),
    puce: dash(dog.microchip_number),
    race: (dog.breed ?? "").trim().toUpperCase() || "-",
    specialite: specialty,
    cynotechnicien: handlerNameLabel(dog),
    handlerMatricule: dash(dog.agent?.professional_number),
    handlerGrade: dash(dog.agent?.grade),
    age: formatDogAgePdfLabel(dog.date_of_birth),
    dateOfBirth: formatAgentBirthDateDisplay(dog.date_of_birth) || "-",
    section: dash(dog.agent?.section?.name),
    status: STATUS_PDF_LABEL[dog.status] ?? dash(dog.status),
    assignmentDate: formatAgentBirthDateDisplay(dog.assignment_date) || "-",
    detectionType: specialty,
  };
}

function sampleSourceDogs(): DogRow[] {
  return [
    {
      id: "sample-cherry",
      name: "CHERRY",
      gender: "female",
      specialty: "explosives",
      status: "available",
      active: true,
      photo_url: null,
      breed: "Malinois",
      microchip_number: "982000123456789",
      date_of_birth: "2021-03-12",
      training_level: null,
      veterinary_notes: null,
      observations: null,
      assignment_date: "2022-06-01",
      vaccination_info: null,
      health_status: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      agent: {
        id: "a1",
        first_name: "Raja",
        last_name: "El Kassmi",
        professional_number: "133398",
        grade: "GDPX",
        section: { id: "s1", name: "Section Explosifs" },
      },
    },
    {
      id: "sample-rex",
      name: "REX",
      gender: "male",
      specialty: "narcotics",
      status: "available",
      active: true,
      photo_url: null,
      breed: "Berger allemand",
      microchip_number: "982000987654321",
      date_of_birth: "2018-01-15",
      training_level: null,
      veterinary_notes: null,
      observations: null,
      assignment_date: "2019-03-01",
      vaccination_info: null,
      health_status: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      agent: {
        id: "a2",
        first_name: "Karim",
        last_name: "Zidane",
        professional_number: "300",
        grade: "Brigadier",
        section: { id: "s2", name: "Section Stupéfiants" },
      },
    },
  ];
}

export function buildSampleChienListPdfData(
  fields: ChienPdfTableFieldConfig[] | null | undefined,
  sexFilter: ChienPdfSexFilter | null | undefined = undefined,
  minAgeYears: ChienPdfMinAgeYears | null | undefined = undefined,
): DogsListPdfData {
  return buildDogsListPdfData(sampleSourceDogs(), new Date(), fields, sexFilter, minAgeYears);
}

/** Map filtered table rows (current order) → official PDF rows + template columns. */
export function buildDogsListPdfData(
  dogs: DogRow[],
  exportDate = new Date(),
  fields: ChienPdfTableFieldConfig[] | null | undefined = undefined,
  sexFilter: ChienPdfSexFilter | null | undefined = undefined,
  minAgeYears: ChienPdfMinAgeYears | null | undefined = undefined,
): DogsListPdfData {
  const selected = applyChienPdfListFilters(dogs, sexFilter, minAgeYears, exportDate);
  return {
    dateLine: formatDogsListDateLine(exportDate),
    columns: buildChienListTableCols(fields, FP_CONTENT_W),
    rows: selected.map((dog, index) => mapDogToPdfRow(dog, index + 1)),
  };
}
