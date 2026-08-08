import { isElectronDesktopRuntime } from "@/lib/runtime-platform";
import { createSqliteProvider } from "./sqlite-provider";
import type { DatabaseProvider } from "./types";

export type DatabaseProviderName = "sqlite";

let cachedElectronProvider: DatabaseProvider | null = null;
let cachedLocalProvider: DatabaseProvider | null = null;

export function getDatabaseProvider(): DatabaseProvider {
  if (typeof window !== "undefined" && isElectronDesktopRuntime()) {
    if (!cachedElectronProvider) {
      cachedElectronProvider = createSqliteProvider();
    }
    return cachedElectronProvider;
  }
  if (!cachedLocalProvider) {
    cachedLocalProvider = createLazyLocalSqliteProvider();
  }
  return cachedLocalProvider;
}

function createLazyLocalSqliteProvider(): DatabaseProvider {
  let inner: Promise<DatabaseProvider> | null = null;
  const load = async () => {
    if (!inner) {
      inner = import("./local-sqlite-provider").then((mod) => mod.createLocalSqliteProvider());
    }
    return inner;
  };
  return {
    async getSections() {
      return (await load()).getSections();
    },
    async createSection(input) {
      return (await load()).createSection(input);
    },
    async updateSection(id, input) {
      return (await load()).updateSection(id, input);
    },
    async deleteSection(id) {
      await (await load()).deleteSection(id);
    },
    async getAgents() {
      return (await load()).getAgents();
    },
    async getAgent(id) {
      return (await load()).getAgent(id);
    },
    async createAgent(input) {
      return (await load()).createAgent(input);
    },
    async updateAgent(id, input) {
      return (await load()).updateAgent(id, input);
    },
    async deleteAgent(id) {
      await (await load()).deleteAgent(id);
    },
    async getDogs() {
      return (await load()).getDogs();
    },
    async getDog(id) {
      return (await load()).getDog(id);
    },
    async createDog(input) {
      return (await load()).createDog(input);
    },
    async updateDog(id, input) {
      return (await load()).updateDog(id, input);
    },
    async deleteDog(id) {
      await (await load()).deleteDog(id);
    },
    async getCheckpoints() {
      return (await load()).getCheckpoints();
    },
    async getCheckpoint(id) {
      return (await load()).getCheckpoint(id);
    },
    async createCheckpoint(input) {
      return (await load()).createCheckpoint(input);
    },
    async updateCheckpoint(id, input) {
      return (await load()).updateCheckpoint(id, input);
    },
    async deleteCheckpoint(id) {
      await (await load()).deleteCheckpoint(id);
    },
  };
}

export function resetDatabaseProviderForTests(): void {
  cachedElectronProvider = null;
  cachedLocalProvider = null;
}
