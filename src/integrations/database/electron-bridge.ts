import type {
  Agent,
  AgentRow,
  AgentWriteInput,
  Checkpoint,
  CheckpointWithPosts,
  CreateCheckpointInput,
  CreateDogInput,
  CreateSectionInput,
  Dog,
  DogRow,
  Section,
  SectionWithAgentCount,
  UpdateCheckpointInput,
  UpdateDogInput,
  UpdateSectionInput,
} from "./types";

export type ElectronDatabaseBridge = {
  getSections(): Promise<SectionWithAgentCount[]>;
  createSection(input: CreateSectionInput): Promise<Section>;
  updateSection(id: string, input: UpdateSectionInput): Promise<Section>;
  deleteSection(id: string): Promise<void>;
  getAgents(): Promise<AgentRow[]>;
  getAgent(id: string): Promise<AgentRow | null>;
  createAgent(input: AgentWriteInput): Promise<Agent>;
  updateAgent(id: string, input: AgentWriteInput): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;
  getDogs(): Promise<DogRow[]>;
  getDog(id: string): Promise<DogRow | null>;
  createDog(input: CreateDogInput): Promise<Dog>;
  updateDog(id: string, input: UpdateDogInput): Promise<Dog>;
  deleteDog(id: string): Promise<void>;
  getCheckpoints(): Promise<CheckpointWithPosts[]>;
  getCheckpoint(id: string): Promise<CheckpointWithPosts | null>;
  createCheckpoint(input: CreateCheckpointInput): Promise<Checkpoint>;
  updateCheckpoint(id: string, input: UpdateCheckpointInput): Promise<Checkpoint>;
  deleteCheckpoint(id: string): Promise<void>;
};

function getBridge(): ElectronDatabaseBridge {
  const bridge = globalThis.window?.cynoplanning?.database;
  if (!bridge) {
    throw new Error("SQLite provider requires the CynoPlanning Electron desktop app.");
  }
  return bridge;
}

export function getElectronDatabaseBridge(): ElectronDatabaseBridge {
  return getBridge();
}

export function isElectronDatabaseAvailable(): boolean {
  return Boolean(globalThis.window?.cynoplanning?.database);
}
