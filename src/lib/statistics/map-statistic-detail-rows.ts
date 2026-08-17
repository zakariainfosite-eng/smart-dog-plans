import type { TFunction } from "i18next";

import type { AgentExclusionRecord } from "@/lib/agent-exclusions";
import { isOpenEndedExclusionType } from "@/lib/agent-exclusions";
import {
  cynotechnicienSpecialty,
  deriveAgentAvailabilityForAgent,
} from "@/lib/agent-ui";
import { dogOperationalStatusLabelKey, deriveDogOperationalStatus } from "@/lib/dog-operational-status";
import { usesOperationalPersonnelColumns } from "@/lib/personnel-fonction";
import {
  availabilityStatusLabel,
  dash,
  exclusionTypeLabel,
  formatPersonName,
  formatStatisticDate,
  fonctionLabel,
  specialtyLabel,
} from "@/lib/statistics/statistic-detail-columns";
import type { StatisticTableRow } from "@/lib/statistics/statistic-details";

export type PersonnelDetailSource = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  fonction?: string | null;
  section_id?: string | null;
  sections?: { name?: string | null } | null;
  dogs?: { id?: string; name?: string | null; specialty?: string | null } | null;
  dog_id?: string | null;
  active?: boolean;
};

export function mapPersonnelDetailRows(
  agents: ReadonlyArray<PersonnelDetailSource>,
  t: TFunction,
  exclusions: AgentExclusionRecord[] = [],
  reference: Date | string = new Date(),
): StatisticTableRow[] {
  return agents.map((agent) => {
    const availability = deriveAgentAvailabilityForAgent(agent, exclusions, reference);
    const specialty = usesOperationalPersonnelColumns(agent.fonction)
      ? cynotechnicienSpecialty(agent)
      : null;
    return {
      id: agent.id,
      cells: {
        firstName: dash(agent.first_name),
        lastName: dash(agent.last_name),
        fonction: fonctionLabel(t, agent.fonction),
        specialty: specialtyLabel(t, specialty),
        status: availabilityStatusLabel(t, availability),
        section: dash(agent.sections?.name),
        dogName: dash(agent.dogs?.name),
      },
    };
  });
}

export type DogDetailSource = {
  id: string;
  name: string;
  specialty: string;
  agent?: { first_name?: string | null; last_name?: string | null } | null;
};

export function mapDogDetailRows(
  dogs: ReadonlyArray<DogDetailSource>,
  t: TFunction,
  exclusions: AgentExclusionRecord[] = [],
  reference: Date | string = new Date(),
): StatisticTableRow[] {
  return dogs.map((dog) => {
    const status = deriveDogOperationalStatus(dog.id, exclusions, reference);
    return {
      id: dog.id,
      cells: {
        dogName: dash(dog.name),
        handler: formatPersonName(dog.agent?.first_name, dog.agent?.last_name),
        specialty: specialtyLabel(t, dog.specialty),
        status: t(dogOperationalStatusLabelKey(status)),
        exclusionType:
          status.kind === "excluded" ? exclusionTypeLabel(t, status.exclusionType) : "—",
      },
    };
  });
}

export type ExclusionDetailSource = {
  id: string;
  exclusion_type: string;
  start_date: string;
  end_date: string | null;
  active?: boolean | number;
  agent?: {
    first_name?: string | null;
    last_name?: string | null;
    fonction?: string | null;
    dog?: {
      name?: string | null;
      specialty?: string | null;
    } | null;
  } | null;
  dog?: {
    name?: string | null;
    specialty?: string | null;
  } | null;
};

export function mapExclusionDetailRows(
  rows: ReadonlyArray<ExclusionDetailSource>,
  t: TFunction,
  todayISO: string,
): StatisticTableRow[] {
  return rows.map((row) => {
    const openEnded = isOpenEndedExclusionType(row.exclusion_type);
    const end = openEnded ? "" : (row.end_date?.slice(0, 10) ?? "");
    const expired = Boolean(!openEnded && end && end < todayISO);
    return {
      id: row.id,
      cells: {
        firstName: dash(row.agent?.first_name),
        lastName: dash(row.agent?.last_name),
        dogName: dash(row.dog?.name ?? row.agent?.dog?.name),
        exclusionType: exclusionTypeLabel(t, row.exclusion_type),
        specialty: specialtyLabel(t, row.dog?.specialty ?? row.agent?.dog?.specialty),
        startDate: formatStatisticDate(row.start_date),
        endDate: openEnded ? "—" : formatStatisticDate(row.end_date),
        status: expired ? t("status.expired") : t("status.active"),
      },
    };
  });
}

export type CheckpointDetailSource = {
  id: string;
  name: string;
  active?: boolean;
  night_only?: boolean;
  typeLabel?: string;
  requiredLabel?: string;
  specialtyLabel?: string;
};

export function mapCheckpointDetailRows(
  rows: ReadonlyArray<CheckpointDetailSource>,
  t: TFunction,
): StatisticTableRow[] {
  return rows.map((row) => ({
    id: row.id,
    cells: {
      checkpoint: dash(row.name),
      name: dash(row.name),
      type: dash(row.typeLabel),
      specialty: dash(row.specialtyLabel),
      required: dash(row.requiredLabel),
      status: row.active === false ? t("common.inactive") : t("common.active"),
      nightOnly: row.night_only ? t("common.yes") : t("common.no"),
    },
  }));
}

export function splitPersonName(fullName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "—", lastName: "—" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "—" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}
