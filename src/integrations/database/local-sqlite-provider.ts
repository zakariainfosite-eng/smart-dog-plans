import * as agentsStore from "./local-agents-store";
import * as checkpointsStore from "./local-checkpoints-store";
import * as dogsStore from "./local-dogs-store";
import * as sectionsStore from "./local-sections-store";
import { getLocalSqliteExecutor } from "./local-sqlite";
import type { DatabaseProvider } from "./types";

export function createLocalSqliteProvider(): DatabaseProvider {
  return {
    async getSections() {
      return sectionsStore.getSections(await getLocalSqliteExecutor());
    },
    async createSection(input) {
      return sectionsStore.createSection(await getLocalSqliteExecutor(), input);
    },
    async updateSection(id, input) {
      return sectionsStore.updateSection(await getLocalSqliteExecutor(), id, input);
    },
    async deleteSection(id) {
      await sectionsStore.deleteSection(await getLocalSqliteExecutor(), id);
    },
    async getAgents() {
      return agentsStore.getAgents(await getLocalSqliteExecutor());
    },
    async getAgent(id) {
      return agentsStore.getAgent(await getLocalSqliteExecutor(), id);
    },
    async createAgent(input) {
      return agentsStore.createAgent(await getLocalSqliteExecutor(), input);
    },
    async updateAgent(id, input) {
      return agentsStore.updateAgent(await getLocalSqliteExecutor(), id, input);
    },
    async deleteAgent(id) {
      await agentsStore.deleteAgent(await getLocalSqliteExecutor(), id);
    },
    async getDogs() {
      return dogsStore.getDogs(await getLocalSqliteExecutor());
    },
    async getDog(id) {
      return dogsStore.getDog(await getLocalSqliteExecutor(), id);
    },
    async createDog(input) {
      return dogsStore.createDog(await getLocalSqliteExecutor(), input);
    },
    async updateDog(id, input) {
      return dogsStore.updateDog(await getLocalSqliteExecutor(), id, input);
    },
    async deleteDog(id) {
      await dogsStore.deleteDog(await getLocalSqliteExecutor(), id);
    },
    async getCheckpoints() {
      return checkpointsStore.getCheckpoints(await getLocalSqliteExecutor());
    },
    async getCheckpoint(id) {
      return checkpointsStore.getCheckpoint(await getLocalSqliteExecutor(), id);
    },
    async createCheckpoint(input) {
      return checkpointsStore.createCheckpoint(await getLocalSqliteExecutor(), input);
    },
    async updateCheckpoint(id, input) {
      return checkpointsStore.updateCheckpoint(await getLocalSqliteExecutor(), id, input);
    },
    async deleteCheckpoint(id) {
      await checkpointsStore.deleteCheckpoint(await getLocalSqliteExecutor(), id);
    },
  };
}
