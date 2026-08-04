/**
 * Electron schema re-exports Phase 1 SQLite schema.
 * Canonical implementation: src/main/database/sqlite.ts
 */
export {
  ensureSchemaIndexes,
  initializeSchema,
  SCHEMA_INDEX_STATEMENTS,
  SCHEMA_STATEMENTS,
  SCHEMA_TABLE_STATEMENTS,
  SQLITE_SCHEMA_INIT_MESSAGE,
} from "../src/main/database/sqlite";
