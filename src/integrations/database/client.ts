import { createSqliteDataClient, type SqliteDataClient } from "./sqlite-data-client";

export type DbClient = SqliteDataClient;

let _client: DbClient | undefined;

function getClient(): DbClient {
  if (!_client) {
    _client = createSqliteDataClient();
  }
  return _client;
}

/**
 * SQLite-only data client (Electron IPC REST gateway).
 * Import as: `import { db, type DbClient } from "@/integrations/database/client"`
 */
export const db = new Proxy({} as DbClient, {
  get(_, prop, receiver) {
    return Reflect.get(getClient() as object, prop, receiver);
  },
});
