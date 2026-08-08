/**
 * Canonical CynoPlanning SQLite DDL — shared by Electron and Capacitor/iOS.
 * Keep in sync with src/main/database/sqlite.ts (re-exported from here).
 *
 * Persistence: all statements are CREATE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
 * Startup must never DROP or recreate these tables when a user database already exists.
 * Electron applies incremental migrations 001–014 via src/main/database/migrations.ts;
 * Capacitor uses this full DDL for new DBs and records APPLIED_MIGRATION_IDS as baseline.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'night')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    commander_full_name TEXT NOT NULL DEFAULT '',
    commander_grade TEXT NOT NULL DEFAULT '',
    commander_mle TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS dogs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
    specialty TEXT NOT NULL CHECK (specialty IN ('narcotics', 'explosives', 'currency')),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sick', 'heat')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    photo_url TEXT,
    breed TEXT,
    microchip_number TEXT,
    date_of_birth TEXT,
    training_level TEXT,
    veterinary_notes TEXT,
    observations TEXT CHECK (observations IS NULL OR length(observations) <= 500),
    assignment_date TEXT,
    vaccination_info TEXT,
    health_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    professional_number TEXT NOT NULL UNIQUE,
    grade TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
    fonction TEXT NOT NULL DEFAULT 'cynotechnicien' CHECK (fonction IN (
      'chef_brigadier',
      'chef_brigadier_pi',
      'chef_secretariat',
      'secretaire',
      'assistant_technique',
      'chef_de_section',
      'chef_de_section_pi',
      'chef_materiel',
      'aide_soignant_veterinaire',
      'cynotechnicien'
    )),
    marital_status TEXT DEFAULT NULL CHECK (
      marital_status IS NULL OR marital_status IN ('single', 'married', 'divorced', 'widowed')
    ),
    date_naissance TEXT DEFAULT NULL,
    origine TEXT DEFAULT NULL,
    section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
    dog_id TEXT UNIQUE REFERENCES dogs(id) ON DELETE SET NULL,
    is_section_chief INTEGER NOT NULL DEFAULT 0 CHECK (is_section_chief IN (0, 1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    phone TEXT,
    address TEXT,
    observations TEXT CHECK (observations IS NULL OR length(observations) <= 500),
    photo_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    night_only INTEGER NOT NULL DEFAULT 0 CHECK (night_only IN (0, 1)),
    allowed_gender TEXT NOT NULL DEFAULT 'all' CHECK (allowed_gender IN ('all', 'male', 'female')),
    operating_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
    day_shift_enabled INTEGER NOT NULL DEFAULT 1 CHECK (day_shift_enabled IN (0, 1)),
    night_shift_enabled INTEGER NOT NULL DEFAULT 1 CHECK (night_shift_enabled IN (0, 1)),
    female_policy TEXT NOT NULL DEFAULT 'allowed' CHECK (female_policy IN ('allowed', 'preferred', 'not_allowed')),
    priority INTEGER NOT NULL DEFAULT 3 CHECK (priority IN (1, 2, 3, 4)),
    mandatory INTEGER NOT NULL DEFAULT 1 CHECK (mandatory IN (0, 1)),
    day_explosives INTEGER NOT NULL DEFAULT 0 CHECK (day_explosives >= 0),
    day_narcotics INTEGER NOT NULL DEFAULT 0 CHECK (day_narcotics >= 0),
    night_explosives INTEGER NOT NULL DEFAULT 0 CHECK (night_explosives >= 0),
    night_narcotics INTEGER NOT NULL DEFAULT 0 CHECK (night_narcotics >= 0),
    required_drugs INTEGER NOT NULL DEFAULT 0 CHECK (required_drugs >= 0),
    required_explosives INTEGER NOT NULL DEFAULT 0 CHECK (required_explosives >= 0),
    total_required_staff INTEGER GENERATED ALWAYS AS (required_drugs + required_explosives) STORED,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS checkpoint_posts (
    id TEXT PRIMARY KEY NOT NULL,
    checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
    specialty_required TEXT NOT NULL CHECK (specialty_required IN ('narcotics', 'explosives', 'currency')),
    required_agents INTEGER NOT NULL DEFAULT 1 CHECK (required_agents > 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    shift TEXT NOT NULL DEFAULT 'day' CHECK (shift IN ('day', 'night')),
    dog_required INTEGER NOT NULL DEFAULT 1 CHECK (dog_required IN (0, 1)),
    allowed_gender TEXT NOT NULL DEFAULT 'all' CHECK (allowed_gender IN ('all', 'male', 'female')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS agent_exclusions (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
    dog_id TEXT REFERENCES dogs(id) ON DELETE CASCADE,
    exclusion_type TEXT NOT NULL CHECK (exclusion_type IN (
      'absence', 'sickness', 'administrative_leave', 'special_leave',
      'dog_sick', 'female_dog_heat', 'annual_leave', 'mission', 'training', 'other',
      'suspension',
      'dog_injured', 'dog_temporary_retirement', 'dog_vet_visit', 'dog_training', 'dog_other'
    )),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_date >= start_date),
    CHECK (agent_id IS NOT NULL OR dog_id IS NOT NULL)
  )`,

  `CREATE TABLE IF NOT EXISTS exclusion_notifications (
    id TEXT PRIMARY KEY NOT NULL,
    exclusion_id TEXT NOT NULL REFERENCES agent_exclusions(id) ON DELETE CASCADE,
    agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
    dog_id TEXT REFERENCES dogs(id) ON DELETE CASCADE,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('personnel', 'dog')),
    notification_type TEXT NOT NULL,
    milestone TEXT NOT NULL CHECK (milestone IN ('d7', 'd3', 'd1', 'd0')),
    end_date TEXT NOT NULL,
    return_date TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    exclusion_type TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (exclusion_id, milestone)
  )`,

  `CREATE TABLE IF NOT EXISTS planning (
    id TEXT PRIMARY KEY NOT NULL,
    planning_date TEXT NOT NULL,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
    shift TEXT NOT NULL CHECK (shift IN ('day', 'night')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    validated INTEGER NOT NULL DEFAULT 0 CHECK (validated IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (planning_date, section_id, shift)
  )`,

  `CREATE TABLE IF NOT EXISTS planning_assignments (
    id TEXT PRIMARY KEY NOT NULL,
    planning_id TEXT NOT NULL REFERENCES planning(id) ON DELETE CASCADE,
    checkpoint_post_id TEXT REFERENCES checkpoint_posts(id) ON DELETE RESTRICT,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
    dog_id TEXT REFERENCES dogs(id) ON DELETE SET NULL,
    is_hq_reserve INTEGER NOT NULL DEFAULT 0 CHECK (is_hq_reserve IN (0, 1)),
    is_off_duty INTEGER NOT NULL DEFAULT 0 CHECK (is_off_duty IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS rotation_history (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    checkpoint_post_id TEXT REFERENCES checkpoint_posts(id) ON DELETE CASCADE,
    planning_date TEXT NOT NULL,
    is_hq_reserve INTEGER NOT NULL DEFAULT 0 CHECK (is_hq_reserve IN (0, 1)),
    is_off_duty INTEGER NOT NULL DEFAULT 0 CHECK (is_off_duty IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS operational_cases (
    id TEXT PRIMARY KEY NOT NULL,
    case_date TEXT NOT NULL,
    case_number TEXT NOT NULL UNIQUE,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
    dog_id TEXT REFERENCES dogs(id) ON DELETE SET NULL,
    checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
    specialty TEXT NOT NULL CHECK (specialty IN ('narcotics', 'explosives', 'currency')),
    location TEXT,
    seizure_type TEXT CHECK (seizure_type IS NULL OR seizure_type IN (
      'cannabis', 'exta', 'pofa', 'cocaine', 'heroin', 'synthetic_drugs',
      'hashish', 'explosives', 'counterfeit_currency', 'other'
    )),
    quantity REAL CHECK (quantity IS NULL OR quantity > 0),
    unit TEXT CHECK (unit IS NULL OR unit IN (
      'kg', 'g', 'units', 'pieces', 'liters', 'banknotes', 'tonne'
    )),
    object_type TEXT CHECK (object_type IS NULL OR object_type IN (
      'firearm', 'bladed_weapon', 'grenade', 'homemade_explosive',
      'ammunition', 'detonator', 'explosive_material', 'other'
    )),
    object_count INTEGER CHECK (object_count IS NULL OR object_count > 0),
    threat_level TEXT CHECK (threat_level IS NULL OR threat_level IN ('low', 'medium', 'high')),
    currency_code TEXT,
    total_amount REAL CHECK (total_amount IS NULL OR total_amount >= 0),
    banknote_count INTEGER CHECK (banknote_count IS NULL OR banknote_count >= 0),
    country TEXT,
    observations TEXT CHECK (observations IS NULL OR length(observations) <= 1000),
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS operational_case_attachments (
    id TEXT PRIMARY KEY NOT NULL,
    case_id TEXT NOT NULL REFERENCES operational_cases(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    mime_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS application_settings (
    id TEXT PRIMARY KEY NOT NULL,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL DEFAULT '{}',
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sections_active ON sections(active)`,
  `CREATE INDEX IF NOT EXISTS idx_dogs_active ON dogs(active)`,
  `CREATE INDEX IF NOT EXISTS idx_dogs_status ON dogs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_dogs_specialty ON dogs(specialty)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_section ON agents(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active)`,
  `CREATE INDEX IF NOT EXISTS idx_checkpoints_active ON checkpoints(active)`,
  `CREATE INDEX IF NOT EXISTS idx_checkpoint_posts_checkpoint ON checkpoint_posts(checkpoint_id)`,
  `CREATE INDEX IF NOT EXISTS idx_checkpoint_posts_specialty ON checkpoint_posts(specialty_required)`,
  `CREATE INDEX IF NOT EXISTS idx_checkpoint_posts_checkpoint_shift_specialty
    ON checkpoint_posts(checkpoint_id, shift, specialty_required)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_agent ON agent_exclusions(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dog ON agent_exclusions(dog_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_dates ON agent_exclusions(start_date, end_date)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_active ON agent_exclusions(active)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_exclusions_is_deleted ON agent_exclusions(is_deleted)`,
  `CREATE INDEX IF NOT EXISTS idx_exclusion_notifications_return_date ON exclusion_notifications(return_date)`,
  `CREATE INDEX IF NOT EXISTS idx_exclusion_notifications_is_read ON exclusion_notifications(is_read)`,
  `CREATE INDEX IF NOT EXISTS idx_planning_date ON planning(planning_date)`,
  `CREATE INDEX IF NOT EXISTS idx_planning_section ON planning(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pa_planning ON planning_assignments(planning_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pa_post ON planning_assignments(checkpoint_post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pa_agent ON planning_assignments(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pa_dog ON planning_assignments(dog_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rh_agent ON rotation_history(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rh_post ON rotation_history(checkpoint_post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rh_date ON rotation_history(planning_date)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_agent ON operational_cases(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_date ON operational_cases(case_date)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_specialty ON operational_cases(specialty)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_checkpoint ON operational_cases(checkpoint_id)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_cases_is_deleted ON operational_cases(is_deleted)`,
  `CREATE INDEX IF NOT EXISTS idx_operational_case_attachments_case ON operational_case_attachments(case_id)`,
];

function isIndexStatement(statement: string): boolean {
  return /^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(statement);
}

export const SCHEMA_TABLE_STATEMENTS: readonly string[] = SCHEMA_STATEMENTS.filter(
  (statement) => !isIndexStatement(statement),
);

export const SCHEMA_INDEX_STATEMENTS: readonly string[] = SCHEMA_STATEMENTS.filter((statement) =>
  isIndexStatement(statement),
);

export const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";

/**
 * Baseline migration ids already reflected in SCHEMA_TABLE_STATEMENTS.
 * Capacitor/sql.js record these in schema_migrations on first open (INSERT OR IGNORE)
 * so future incremental migrations can detect what is still pending.
 * Electron runs the real `up` functions in src/main/database/migrations.ts instead.
 */
export const APPLIED_MIGRATION_IDS: readonly string[] = [
  "001_sections_commander_columns",
  "002_users_role_column",
  "003_checkpoints_priority_column",
  "004_female_agents_clear_section",
  "005_agents_fonction_column",
  "006_non_cyno_clear_assignment",
  "007_agents_fonction_chef_materiel",
  "008_agent_exclusions_dog_target",
  "009_agents_marital_status_column",
  "010_checkpoints_mandatory_column",
  "011_agents_fonction_hierarchy_v2",
  "012_agents_fonction_brigadier_canonical",
  "013_exclusion_return_notifications",
  "014_agents_date_naissance_column",
];

/**
 * Real incremental migrations for persistent Capacitor/sql.js databases.
 * Do not add new ids to APPLIED_MIGRATION_IDS: those ids describe the baseline
 * already represented by the full CREATE TABLE schema above.
 */
export const LOCAL_SQLITE_MIGRATIONS: readonly {
  id: string;
  name: string;
  statements: readonly string[];
}[] = [
  {
    id: "015_agents_origine_column",
    name: "Add origine to agents — nullable for existing rows",
    statements: ["ALTER TABLE agents ADD COLUMN origine TEXT DEFAULT NULL"],
  },
];
