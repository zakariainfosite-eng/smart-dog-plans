import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import type { AgentRow, DogRow, DogSpecialty } from "@/integrations/database";
import { normalizePersonnelFonction } from "@/lib/personnel-fonction";

export type HeatExclusionRow = {
  id: string;
  dog_id: string | null;
  exclusion_type: string;
  start_date: string;
  end_date: string | null;
  active: boolean | number;
  is_deleted?: boolean | number | null;
};

export type HeatDogInHeatItem = {
  exclusionId: string;
  dogId: string;
  dogName: string;
  specialtyKey: DogSpecialty;
  specialtyLabel: string;
  handlerId: string | null;
  handlerName: string;
  heatStartDate: string;
  heatEndDate: string;
  /** Calendar days until end_date (0 = ends today). Null if no end date. */
  remainingDays: number | null;
};

function isTruthyFlag(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1;
}

/** Official specialty wording for the heat radio message (from DB specialty key). */
export function heatOfficialSpecialtyLabel(
  specialty: DogSpecialty | string | null | undefined,
  t: (key: string) => string,
): string {
  if (!specialty) return "";
  if (specialty === "explosives") return "Explosifs et armes à feu";
  if (specialty === "narcotics") return "Stupéfiants & Billets de banque";
  if (specialty === "currency") return t("specialty.currency");
  return t(`specialty.${specialty}`);
}

export function agentFullName(agent: Pick<AgentRow, "first_name" | "last_name">): string {
  return `${agent.first_name} ${agent.last_name}`.trim();
}

/** Aide-soignants vétérinaires from personnel (fallback: all active agents). */
export function listAideSoignantVeterinaire(agents: AgentRow[]): AgentRow[] {
  const aides = agents.filter(
    (agent) =>
      agent.active &&
      normalizePersonnelFonction(agent.fonction) === "aide_soignant_veterinaire",
  );
  if (aides.length > 0) return aides;
  return agents.filter((agent) => agent.active);
}

/**
 * Female dogs currently in an active `female_dog_heat` exclusion.
 * Sorted so 1–2 days remaining appear first, then soonest end dates.
 */
export function listDogsCurrentlyInHeat(input: {
  exclusions: HeatExclusionRow[];
  dogs: DogRow[];
  specialtyLabel: (specialty: DogSpecialty) => string;
  today?: Date;
}): HeatDogInHeatItem[] {
  const today = startOfDay(input.today ?? new Date());
  const dogById = new Map(input.dogs.map((dog) => [dog.id, dog]));
  const items: HeatDogInHeatItem[] = [];

  for (const row of input.exclusions) {
    if (row.exclusion_type !== "female_dog_heat") continue;
    if (!isTruthyFlag(row.active)) continue;
    if (isTruthyFlag(row.is_deleted)) continue;
    if (!row.dog_id) continue;

    const dog = dogById.get(row.dog_id);
    if (!dog || dog.gender !== "female") continue;

    const endRaw = (row.end_date || "").trim();
    if (!endRaw) continue;
    const endDay = startOfDay(parseISO(endRaw.slice(0, 10)));
    if (Number.isNaN(endDay.getTime())) continue;

    const startRaw = (row.start_date || "").trim().slice(0, 10);
    if (startRaw) {
      const startDay = startOfDay(parseISO(startRaw));
      if (!Number.isNaN(startDay.getTime()) && startDay > today) continue;
    }
    // Already ended
    if (endDay < today) continue;

    const remainingDays = differenceInCalendarDays(endDay, today);
    const handler = dog.agent;
    items.push({
      exclusionId: row.id,
      dogId: dog.id,
      dogName: dog.name,
      specialtyKey: dog.specialty,
      specialtyLabel: input.specialtyLabel(dog.specialty),
      handlerId: handler?.id ?? null,
      handlerName: handler
        ? `${handler.first_name} ${handler.last_name}`.trim()
        : "",
      heatStartDate: startRaw || endRaw.slice(0, 10),
      heatEndDate: endRaw.slice(0, 10),
      remainingDays,
    });
  }

  items.sort((a, b) => {
    const ra = a.remainingDays ?? 9999;
    const rb = b.remainingDays ?? 9999;
    const aUrgent = ra <= 2 ? 0 : 1;
    const bUrgent = rb <= 2 ? 0 : 1;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    if (ra !== rb) return ra - rb;
    return a.dogName.localeCompare(b.dogName, "fr");
  });

  return items;
}

export function resolveMasterFromAgents(
  handlerId: string | null | undefined,
  agents: AgentRow[],
): { name: string; grade: string; matricule: string; hasMaster: boolean } {
  if (!handlerId) {
    return { name: "", grade: "", matricule: "", hasMaster: false };
  }
  const agent = agents.find((row) => row.id === handlerId);
  if (!agent) {
    return { name: "", grade: "", matricule: "", hasMaster: false };
  }
  return {
    name: agentFullName(agent),
    grade: (agent.grade || "").trim(),
    matricule: (agent.professional_number || "").trim(),
    hasMaster: true,
  };
}

export function heatDogIdentityFromDog(dog: DogRow | null | undefined): {
  breed: string;
  microchip: string;
  dogBirthDate: string;
  gender: string;
  trainingLevel: string;
  assignmentDate: string;
  healthStatus: string;
  handlerSection: string;
} {
  if (!dog) {
    return {
      breed: "",
      microchip: "",
      dogBirthDate: "",
      gender: "",
      trainingLevel: "",
      assignmentDate: "",
      healthStatus: "",
      handlerSection: "",
    };
  }
  return {
    breed: (dog.breed ?? "").trim(),
    microchip: (dog.microchip_number ?? "").trim(),
    dogBirthDate: (dog.date_of_birth ?? "").trim(),
    gender: (dog.gender ?? "").trim(),
    trainingLevel: (dog.training_level ?? "").trim(),
    assignmentDate: (dog.assignment_date ?? "").trim(),
    healthStatus: (dog.health_status ?? "").trim(),
    handlerSection: (dog.agent?.section?.name ?? "").trim(),
  };
}
