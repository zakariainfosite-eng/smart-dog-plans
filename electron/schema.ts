/**
 * Electron schema re-exports Phase 1 SQLite schema.
 * Canonical implementation: src/main/database/sqlite.ts
 */
export {
  initializeSchema,
  SCHEMA_STATEMENTS,
  SQLITE_SCHEMA_INIT_MESSAGE,
} from "../src/main/database/sqlite";
