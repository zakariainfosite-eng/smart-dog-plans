import type { Database } from "@/integrations/database/schema-types";

export type StatisticsPeriod = "today" | "week" | "month" | "year" | "custom";

export type StatisticsDateRange = {
  from: string;
  to: string;
};

export type LabelCount = {
  label: string;
  value: number;
  key?: string;
};

export type MonthCount = {
  month: string;
  label: string;
  value: number;
};

export type MonthBreakdown = {
  month: string;
  label: string;
  total: number;
  items: LabelCount[];
};

export type LabelCountWithPct = LabelCount & {
  pct: number;
};

export type SeizureTotals = {
  cannabisKg: number;
  hashishKg: number;
  cocaineKg: number;
  heroinKg: number;
  syntheticDrugsKg: number;
};

export type StatisticsPayload = {
  range: StatisticsDateRange;
  kpis: {
    totalAgents: number;
    activeAgents: number;
    inactiveAgents: number;
    totalDogs: number;
    availableDogs: number;
    excludedDogs: number;
    totalOperationalCases: number;
    totalExclusions: number;
    totalPlanning: number;
    totalCheckpoints: number;
    totalSections: number;
  };
  operationalCases: {
    byMonth: MonthCount[];
    byMonthDetail: MonthBreakdown[];
    bySpecialty: LabelCount[];
    byCheckpoint: LabelCount[];
    byDog: LabelCount[];
    byAgent: LabelCount[];
    seizures: SeizureTotals;
  };
  planning: {
    thisMonth: number;
    byMonth: MonthCount[];
    byMonthDetail: MonthBreakdown[];
    bySection: LabelCount[];
    byCheckpoint: LabelCount[];
  };
  exclusions: {
    total: number;
    active: number;
    finished: number;
    byMonth: MonthCount[];
    byMonthDetail: MonthBreakdown[];
    byReason: LabelCount[];
    byType: LabelCount[];
  };
  leave: {
    total: number;
    byMonth: MonthCount[];
    byMonthDetail: MonthBreakdown[];
    bySection: LabelCount[];
  };
  dogs: {
    bySpecialty: LabelCount[];
    byStatus: LabelCount[];
    byBreed: LabelCount[];
    byAge: LabelCount[];
    assigned: number;
    unassigned: number;
  };
  agents: {
    bySection: LabelCount[];
    byGrade: LabelCount[];
    byGender: LabelCount[];
    bySpecialty: LabelCount[];
    withDog: number;
    withoutDog: number;
  };
  rankings: {
    topAgents: LabelCount[];
    topDogs: LabelCount[];
    topCheckpoints: LabelCount[];
    topExclusionReasons: LabelCount[];
  };
};

export type ExclusionType = Database["public"]["Enums"]["exclusion_type"];
