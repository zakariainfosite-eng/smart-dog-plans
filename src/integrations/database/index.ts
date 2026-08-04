import { getDatabaseProvider } from "./provider";
import type {
  AgentWriteInput,
  CreateCheckpointInput,
  CreateDogInput,
  CreateSectionInput,
  UpdateCheckpointInput,
  UpdateDogInput,
  UpdateSectionInput,
} from "./types";

export type {
  Agent,
  AgentDogSummary,
  AgentRow,
  AgentSectionSummary,
  AgentWriteInput,
  Checkpoint,
  CheckpointAllowedGender,
  CheckpointFemalePolicy,
  CheckpointOperationalInput,
  CheckpointPost,
  CheckpointPostSpecialty,
  CheckpointWithPosts,
  CreateCheckpointInput,
  CreateDogInput,
  CreateSectionInput,
  DatabaseProvider,
  Dog,
  DogAgentSummary,
  DogRow,
  DogSpecialty,
  DogStatus,
  DogWriteInput,
  Gender,
  MaritalStatus,
  Section,
  SectionWithAgentCount,
  ShiftType,
  UpdateCheckpointInput,
  UpdateDogInput,
  UpdateSectionInput,
} from "./types";

export { getDatabaseProviderName } from "./config";
export { getDatabaseProvider, resetDatabaseProviderForTests } from "./provider";

export function getSections() {
  return getDatabaseProvider().getSections();
}

export function createSection(input: CreateSectionInput) {
  return getDatabaseProvider().createSection(input);
}

export function updateSection(id: string, input: UpdateSectionInput) {
  return getDatabaseProvider().updateSection(id, input);
}

export function deleteSection(id: string) {
  return getDatabaseProvider().deleteSection(id);
}

export function getAgents() {
  return getDatabaseProvider().getAgents();
}

export function getAgent(id: string) {
  return getDatabaseProvider().getAgent(id);
}

export function createAgent(input: AgentWriteInput) {
  return getDatabaseProvider().createAgent(input);
}

export function updateAgent(id: string, input: AgentWriteInput) {
  return getDatabaseProvider().updateAgent(id, input);
}

export function deleteAgent(id: string) {
  return getDatabaseProvider().deleteAgent(id);
}

export function getDogs() {
  return getDatabaseProvider().getDogs();
}

export function getDog(id: string) {
  return getDatabaseProvider().getDog(id);
}

export function createDog(input: CreateDogInput) {
  return getDatabaseProvider().createDog(input);
}

export function updateDog(id: string, input: UpdateDogInput) {
  return getDatabaseProvider().updateDog(id, input);
}

export function deleteDog(id: string) {
  return getDatabaseProvider().deleteDog(id);
}

export function getCheckpoints() {
  return getDatabaseProvider().getCheckpoints();
}

export function getCheckpoint(id: string) {
  return getDatabaseProvider().getCheckpoint(id);
}

export function createCheckpoint(input: CreateCheckpointInput) {
  return getDatabaseProvider().createCheckpoint(input);
}

export function updateCheckpoint(id: string, input: UpdateCheckpointInput) {
  return getDatabaseProvider().updateCheckpoint(id, input);
}

export function deleteCheckpoint(id: string) {
  return getDatabaseProvider().deleteCheckpoint(id);
}
