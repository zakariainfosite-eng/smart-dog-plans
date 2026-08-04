import type { LabelCount, MonthCount, StatisticsDateRange } from "@/lib/statistics/types";

export type CasesStatisticsFilters = {
  year: string;
  month: string;
  dateFrom: string;
  dateTo: string;
  specialty: string;
  sectionId: string;
  checkpointId: string;
  agentId: string;
  dogId: string;
};

export const DEFAULT_CASES_STATISTICS_FILTERS: CasesStatisticsFilters = {
  /** Empty = all years (range resolved in fetch-cases-statistics). */
  year: "",
  month: "",
  dateFrom: "",
  dateTo: "",
  specialty: "",
  sectionId: "",
  checkpointId: "",
  agentId: "",
  dogId: "",
};

export type CasesStatisticsFilterOptions = {
  years: string[];
  specialties: Array<{ value: string; label: string }>;
  sections: Array<{ id: string; name: string }>;
  checkpoints: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
  dogs: Array<{ id: string; name: string }>;
};

/** Seizure aggregates derived only from operational_cases rows. */
export type CasesSeizureTotals = {
  cannabisKg: number;
  cocaineKg: number;
  heroinKg: number;
  /** Hashish / résine (kg). */
  kifKg: number;
  ecstasyKg: number;
  psychotropesKg: number;
  /** Non-weight psychotropes (units / pieces / comprimés). */
  psychotropesPieces: number;
  otherNarcoticsKg: number;
  banknotesCount: number;
  currencyAmount: number;
  /** Amounts by currency code from operational cases. */
  currencyByCode: LabelCount[];
  explosivesObjects: number;
  /** Dynamic extras keyed by seizure_type / object_type. */
  otherSeizures: LabelCount[];
};

export type CasesStatisticsPayload = {
  range: StatisticsDateRange;
  totalCases: number;
  byYear: LabelCount[];
  byMonth: MonthCount[];
  byWeek: LabelCount[];
  bySpecialty: LabelCount[];
  byCheckpoint: LabelCount[];
  bySection: LabelCount[];
  byAgent: LabelCount[];
  byDog: LabelCount[];
  byTeam: LabelCount[];
  seizures: CasesSeizureTotals;
  rankings: {
    topAgents: LabelCount[];
    topDogs: LabelCount[];
    topCheckpoints: LabelCount[];
    topSections: LabelCount[];
  };
  charts: {
    monthlyEvolution: MonthCount[];
    yearlyEvolution: LabelCount[];
  };
};
