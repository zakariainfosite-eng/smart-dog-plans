import { createSqliteProvider } from "./sqlite-provider";
import type { DatabaseProvider } from "./types";

export type DatabaseProviderName = "sqlite";

let cachedProvider: DatabaseProvider | null = null;

export function getDatabaseProvider(): DatabaseProvider {
  if (!cachedProvider) {
    cachedProvider = createSqliteProvider();
  }
  return cachedProvider;
}

export function resetDatabaseProviderForTests(): void {
  cachedProvider = null;
}
