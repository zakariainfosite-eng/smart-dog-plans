/**
 * Electron entry re-exports Phase 1 SQLite service.
 * Canonical implementation: src/main/database/sqlite.ts
 */
export {
  closeDatabase,
  getDatabase,
  getDatabasePath,
  getUserDataPath,
  initializeDatabase,
  initializeSchema,
  SCHEMA_STATEMENTS,
  SQLITE_SCHEMA_INIT_MESSAGE,
  testDatabaseInitialization,
} from "../src/main/database/sqlite";
export {
  SCHEMA_MIGRATIONS_TABLE,
  SQLITE_MIGRATIONS,
  createPreMigrationBackup,
  getAppliedMigrationIds,
  restoreDatabaseFromBackup,
  runPendingMigrations,
} from "../src/main/database/migrations";
