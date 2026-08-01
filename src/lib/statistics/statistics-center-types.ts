import type { StatisticsDateRange } from "@/lib/statistics/types";

export type StatisticsCenterFilters = {
  year: string;
  month: string;
  dateFrom: string;
  dateTo: string;
  checkpointId: string;
  sectionId: string;
  agentId: string;
  dogId: string;
};

export const DEFAULT_STATISTICS_CENTER_FILTERS: StatisticsCenterFilters = {
  year: String(new Date().getFullYear()),
  month: "",
  dateFrom: "",
  dateTo: "",
  checkpointId: "",
  sectionId: "",
  agentId: "",
  dogId: "",
};

export type MonthlySummaryRow = {
  monthKey: string;
  monthLabel: string;
  generatedPlanning: number;
  operationalCases: number;
  drugDetections: number;
  explosiveDetections: number;
  currencyDetections: number;
  exclusions: number;
  activeTeams: number;
  inactiveTeams: number;
  assignments: number;
  avgMissionsPerDay: number;
  avgCasesPerDay: number;
};

export type AnnualMetricRow = {
  id: string;
  annualTotal: number;
  monthlyAverage: number;
};

export type RankingRow = {
  rank: number;
  id: string;
  name: string;
  detail: string;
  missions: number;
  cases: number;
  detections: number;
  activityScore: number;
};

export type DailyActivityRow = {
  date: string;
  generatedPlanning: number;
  assignments: number;
  operationalCases: number;
  drugDetections: number;
  explosiveDetections: number;
  currencyDetections: number;
  activeTeams: number;
};

export type SectionPerformanceRow = {
  id: string;
  name: string;
  generatedPlanning: number;
  totalMissions: number;
  operationalCases: number;
  drugDetections: number;
  explosiveDetections: number;
  currencyDetections: number;
  activeAgents: number;
  avgMissionsPerMonth: number;
};

export type OperationalHighlights = {
  mostActiveMonth: { label: string; missions: number; cases: number } | null;
  mostActiveCheckpoint: { name: string; missions: number } | null;
  mostActiveDog: { name: string; missions: number; cases: number } | null;
  mostActiveAgent: { name: string; missions: number; cases: number } | null;
  mostActiveSection: { name: string; missions: number; cases: number } | null;
};

export type CheckpointStatisticsRow = {
  id: string;
  name: string;
  missionsGenerated: number;
  assignedTeams: number;
  drugDetections: number;
  explosiveDetections: number;
  currencyDetections: number;
  lastActivity: string | null;
};

export type AgentStatisticsRow = {
  id: string;
  name: string;
  sectionName: string;
  dogName: string;
  totalMissions: number;
  dayMissions: number;
  nightMissions: number;
  drugDetections: number;
  explosiveDetections: number;
  currencyDetections: number;
  operationalCases: number;
  attendanceRate: number;
  lastMission: string | null;
};

export type DogStatisticsRow = {
  id: string;
  name: string;
  specialty: string;
  handlerName: string;
  totalMissions: number;
  operationalCases: number;
  availabilityPct: number;
  daysUnavailable: number;
};

export type OperationalIntelligencePayload = {
  year: number;
  detailRange: StatisticsDateRange;
  annualMetrics: AnnualMetricRow[];
  monthlyActivity: MonthlySummaryRow[];
  monthlyDetailed: MonthlySummaryRow[];
  topAgents: RankingRow[];
  topDogs: RankingRow[];
  topCheckpoints: RankingRow[];
  sectionPerformance: SectionPerformanceRow[];
  dailyActivity: DailyActivityRow[];
  highlights: OperationalHighlights;
};

/** @deprecated use OperationalIntelligencePayload */
export type StatisticsCenterPayload = OperationalIntelligencePayload;

export type StatisticsCenterFilterOptions = {
  years: string[];
  checkpoints: { id: string; name: string }[];
  sections: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  dogs: { id: string; name: string }[];
};
