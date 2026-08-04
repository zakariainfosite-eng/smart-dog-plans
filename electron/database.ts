/**
 * Electron entry re-exports Phase 1 SQLite service.
 * Canonical implementation: src/main/database/sqlite.ts
 */
export {
  closeDatabase,
  ensureSchemaIndexes,
  getDatabase,
  getDatabasePath,
  getUserDataPath,
  initializeDatabase,
  initializeSchema,
  SCHEMA_INDEX_STATEMENTS,
  SCHEMA_STATEMENTS,
  SCHEMA_TABLE_STATEMENTS,
  SQLITE_SCHEMA_INIT_MESSAGE,
  testDatabaseInitialization,
} from "../src/main/database/sqlite";
export {
  SCHEMA_MIGRATIONS_TABLE,
  SQLITE_MIGRATIONS,
  SqliteMigrationError,
  assertAgentsFonctionSchema,
  assertCheckpointsMandatorySchema,
  createPreMigrationBackup,
  formatMigrationFailureDetail,
  getAppliedMigrationIds,
  isMigrationBackupFileName,
  isSqliteMigrationError,
  migrationBackupTimestamp,
  restoreDatabaseFromBackup,
  runPendingMigrations,
} from "../src/main/database/migrations";
