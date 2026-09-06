/**
 * Standalone generator for test-data/cynoplanning_test.db
 * Uses the current CynoPlanning DDL from src/integrations/database/schema-sql.ts.
 * Does not open or write any application / Electron / Android live database.
 */
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");
const initSqlJs = (await import("sql.js")).default;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "test-data", "cynoplanning_test.db");
const TEST_PASSWORD = "TestImport@2026";
const NOW = "2026-09-01 10:00:00";

const SCHEMA_STATEMENTS = [
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
      'dog_sick', 'female_dog_heat', 'annual_leave', 'mission', 'training', 'rest', 'other',
      'suspension',
      'dog_injured', 'dog_temporary_retirement', 'dog_vet_visit', 'dog_without_handler',
      'dog_training', 'dog_other'
    )),
    start_date TEXT NOT NULL,
    end_date TEXT,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_date IS NULL OR end_date >= start_date),
    CHECK (agent_id IS NOT NULL OR dog_id IS NOT NULL)
  )`,
  `CREATE TABLE IF NOT EXISTS exclusion_notifications (
    id TEXT PRIMARY KEY NOT NULL,
    exclusion_id TEXT NOT NULL REFERENCES agent_exclusions(id) ON DELETE CASCADE,
    agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
    dog_id TEXT REFERENCES dogs(id) ON DELETE CASCADE,
    subject_kind TEXT NOT NULL CHECK (subject_kind IN ('personnel', 'dog')),
    notification_type TEXT NOT NULL,
    milestone TEXT NOT NULL CHECK (milestone IN ('d2', 'd1', 'd0', 'd7', 'd3')),
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
  `CREATE TABLE IF NOT EXISTS role_documents (
    id TEXT PRIMARY KEY NOT NULL,
    reference_number TEXT UNIQUE,
    role_category TEXT NOT NULL CHECK (role_category IN ('veterinary', 'assistant', 'secretary', 'equipment_chief')),
    template_id TEXT NOT NULL,
    document_kind TEXT NOT NULL CHECK (document_kind IN ('report', 'message', 'monthly')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
    title TEXT NOT NULL,
    report_month INTEGER CHECK (report_month IS NULL OR (report_month >= 1 AND report_month <= 12)),
    report_year INTEGER CHECK (report_year IS NULL OR report_year >= 2000),
    agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    dog_id TEXT REFERENCES dogs(id) ON DELETE SET NULL,
    section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_by_user_id TEXT,
    created_by_email TEXT,
    created_by_name TEXT NOT NULL DEFAULT '',
    finalized_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS document_reference_sequences (
    prefix TEXT NOT NULL CHECK (prefix IN ('RAP', 'MSG')),
    year INTEGER NOT NULL CHECK (year >= 2000),
    last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    PRIMARY KEY (prefix, year)
  )`,
  `CREATE TABLE IF NOT EXISTS agent_administrative_history (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
      'conge', 'permission', 'arret_maladie', 'formation', 'exclusion_formation', 'autre'
    )),
    start_date TEXT NOT NULL,
    end_date TEXT,
    reason TEXT,
    observation TEXT,
    reference TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN (
      'manual', 'import', 'conge', 'permission', 'maladie', 'formation',
      'exclusion', 'cas_operationnel', 'planning'
    )),
    source_id TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_date IS NULL OR end_date >= start_date)
  )`,
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    success INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1))
  )`,
];

const INDEX_STATEMENTS = [
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
  `CREATE INDEX IF NOT EXISTS idx_role_documents_role_category ON role_documents(role_category)`,
  `CREATE INDEX IF NOT EXISTS idx_role_documents_status ON role_documents(status)`,
  `CREATE INDEX IF NOT EXISTS idx_role_documents_template ON role_documents(template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_role_documents_agent ON role_documents(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_role_documents_dog ON role_documents(dog_id)`,
  `CREATE INDEX IF NOT EXISTS idx_role_documents_section ON role_documents(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_role_documents_created_at ON role_documents(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_role_documents_report_period ON role_documents(report_year, report_month)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_admin_history_agent ON agent_administrative_history(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_admin_history_start_date ON agent_administrative_history(start_date)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_admin_history_type ON agent_administrative_history(event_type)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_admin_history_source ON agent_administrative_history(source_type, source_id)`,
];

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function notificationTypeForExclusion(exclusionType, subjectKind) {
  switch (exclusionType) {
    case "sickness":
    case "dog_sick":
    case "dog_injured":
    case "dog_vet_visit":
      return "end_of_sickness";
    case "female_dog_heat":
      return "end_of_heat";
    case "annual_leave":
    case "administrative_leave":
    case "special_leave":
    case "absence":
      return "end_of_leave";
    case "training":
    case "dog_training":
      return "end_of_training";
    case "mission":
      return "end_of_mission";
    default:
      return subjectKind === "dog" ? "dog_return" : "personnel_return";
  }
}

function insert(db, table, row) {
  const columns = Object.keys(row);
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  db.run(
    sql,
    columns.map((column) => row[column]),
  );
}

function queryAll(db, sql) {
  const result = db.exec(sql);
  if (!result[0]) return [];
  return result[0].values.map((values) => {
    const row = {};
    result[0].columns.forEach((column, index) => {
      row[column] = values[index];
    });
    return row;
  });
}

mkdirSync(dirname(OUT), { recursive: true });
if (existsSync(OUT)) unlinkSync(OUT);

const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 12);
const SQL = await initSqlJs({
  wasmBinary: readFileSync(join(ROOT, "node_modules/sql.js/dist/sql-wasm.wasm")),
});
const db = new SQL.Database();
db.run("PRAGMA foreign_keys = ON");

for (const statement of SCHEMA_STATEMENTS) db.run(statement);
for (const statement of INDEX_STATEMENTS) db.run(statement);

const users = [
  ["win-usr-01", "admin.test@cynoplanning.test", "admin"],
  ["win-usr-02", "chef.planning@cynoplanning.test", "user"],
  ["win-usr-03", "chef.section@cynoplanning.test", "user"],
  ["win-usr-04", "operateur.jour@cynoplanning.test", "user"],
  ["win-usr-05", "operateur.nuit@cynoplanning.test", "user"],
  ["win-usr-06", "secretariat@cynoplanning.test", "user"],
  ["win-usr-07", "veterinaire@cynoplanning.test", "user"],
  ["win-usr-08", "materiel@cynoplanning.test", "user"],
  ["win-usr-09", "statistiques@cynoplanning.test", "user"],
  ["win-usr-10", "consultation@cynoplanning.test", "user"],
];

const sections = [
  ["win-sec-alpha", "Section Alpha", "day", "Khalid El Fassi", "Adjudant", "18401"],
  ["win-sec-bravo", "Section Bravo", "day", "Mustapha Bennani", "Adjudant", "18402"],
  ["win-sec-charlie", "Section Charlie", "night", "Hassan Cherkaoui", "Adjudant", "18403"],
  ["win-sec-delta", "Section Delta", "night", "Said El Idrissi", "Adjudant", "18404"],
];

const dogs = [
  ["win-dog-01", "Rex", "male", "narcotics", "available", "Berger Belge Malinois", "2019-03-12", "advanced"],
  ["win-dog-02", "Max", "male", "explosives", "available", "Berger Belge Malinois", "2020-01-08", "operational"],
  ["win-dog-03", "Rocky", "male", "currency", "available", "Labrador Retriever", "2018-11-21", "advanced"],
  ["win-dog-04", "Thor", "male", "narcotics", "available", "Berger Allemand", "2019-07-02", "operational"],
  ["win-dog-05", "Nero", "male", "explosives", "sick", "Berger Belge Malinois", "2021-02-14", "operational"],
  ["win-dog-06", "Milo", "male", "narcotics", "available", "Springer Spaniel", "2020-06-30", "basic"],
  ["win-dog-07", "Kira", "female", "currency", "available", "Labrador Retriever", "2019-09-18", "operational"],
  ["win-dog-08", "Luna", "female", "narcotics", "heat", "Berger Belge Malinois", "2021-04-05", "operational"],
  ["win-dog-09", "Tara", "female", "explosives", "heat", "Berger Allemand", "2020-08-11", "advanced"],
  ["win-dog-10", "Ace", "male", "currency", "available", "Labrador Retriever", "2018-05-27", "advanced"],
  ["win-dog-11", "Duke", "male", "narcotics", "available", "Berger Belge Malinois", "2022-01-19", "basic"],
  ["win-dog-12", "Zeus", "male", "explosives", "available", "Berger Allemand", "2019-12-03", "operational"],
  ["win-dog-13", "Bella", "female", "narcotics", "available", "Labrador Retriever", "2021-10-22", "operational"],
  ["win-dog-14", "Shadow", "male", "explosives", "available", "Berger Belge Malinois", "2020-03-09", "advanced"],
  ["win-dog-15", "Hunter", "male", "narcotics", "available", "Springer Spaniel", "2018-08-16", "advanced"],
  ["win-dog-16", "Cleo", "female", "currency", "available", "Labrador Retriever", "2022-05-01", "basic"],
  ["win-dog-17", "Apache", "male", "explosives", "available", "Berger Belge Malinois", "2019-04-28", "operational"],
  ["win-dog-18", "Sasha", "female", "narcotics", "available", "Berger Allemand", "2020-12-15", "operational"],
  ["win-dog-19", "Blitz", "male", "currency", "available", "Labrador Retriever", "2021-07-07", "basic"],
  ["win-dog-20", "Nala", "female", "explosives", "available", "Berger Belge Malinois", "2022-02-26", "basic"],
];

const agents = [
  ["win-agt-01", "Ahmed", "El Amrani", "18501", "Brigadier", "male", "cynotechnicien", "win-sec-alpha", "win-dog-01"],
  ["win-agt-02", "Yassine", "Bennani", "18502", "Brigadier", "male", "cynotechnicien", "win-sec-alpha", "win-dog-02"],
  ["win-agt-03", "Omar", "Alaoui", "18503", "Gendarme", "male", "cynotechnicien", "win-sec-alpha", "win-dog-03"],
  ["win-agt-04", "Mehdi", "Idrissi", "18504", "Brigadier", "male", "cynotechnicien", "win-sec-alpha", "win-dog-04"],
  ["win-agt-05", "Hamza", "Tazi", "18505", "Gendarme", "male", "cynotechnicien", "win-sec-bravo", "win-dog-05"],
  ["win-agt-06", "Karim", "Benjelloun", "18506", "Brigadier", "male", "cynotechnicien", "win-sec-bravo", "win-dog-06"],
  ["win-agt-07", "Rachid", "Chraibi", "18507", "Gendarme", "male", "cynotechnicien", "win-sec-bravo", "win-dog-07"],
  ["win-agt-08", "Soufiane", "Kadiri", "18508", "Brigadier", "male", "cynotechnicien", "win-sec-bravo", "win-dog-08"],
  ["win-agt-09", "Anas", "Berrada", "18509", "Gendarme", "male", "cynotechnicien", "win-sec-charlie", "win-dog-09"],
  ["win-agt-10", "Nabil", "Lahlou", "18510", "Brigadier", "male", "cynotechnicien", "win-sec-charlie", "win-dog-10"],
  ["win-agt-11", "Amine", "Senhaji", "18511", "Gendarme", "male", "cynotechnicien", "win-sec-charlie", "win-dog-11"],
  ["win-agt-12", "Reda", "Filali", "18512", "Brigadier", "male", "cynotechnicien", "win-sec-charlie", "win-dog-12"],
  ["win-agt-13", "Hicham", "Ouazzani", "18513", "Gendarme", "male", "cynotechnicien", "win-sec-delta", "win-dog-13"],
  ["win-agt-14", "Tarik", "Bensouda", "18514", "Brigadier", "male", "cynotechnicien", "win-sec-delta", "win-dog-14"],
  ["win-agt-15", "Ismail", "Kettani", "18515", "Gendarme", "male", "cynotechnicien", "win-sec-delta", "win-dog-15"],
  ["win-agt-16", "Walid", "Squalli", "18516", "Brigadier", "male", "cynotechnicien", "win-sec-delta", "win-dog-16"],
  ["win-agt-17", "Adil", "Guessous", "18517", "Gendarme", "male", "cynotechnicien", "win-sec-alpha", "win-dog-17"],
  ["win-agt-18", "Samir", "Zniber", "18518", "Brigadier", "male", "cynotechnicien", "win-sec-bravo", "win-dog-18"],
  ["win-agt-19", "Fouad", "Tahiri", "18519", "Gendarme", "male", "cynotechnicien", "win-sec-charlie", "win-dog-19"],
  ["win-agt-20", "Driss", "Benkirane", "18520", "Brigadier", "male", "cynotechnicien", "win-sec-delta", "win-dog-20"],
  ["win-agt-21", "Khalid", "El Fassi", "18401", "Adjudant", "male", "chef_de_section", "win-sec-alpha", null],
  ["win-agt-22", "Mustapha", "Bennani", "18402", "Adjudant", "male", "chef_de_section", "win-sec-bravo", null],
  ["win-agt-23", "Hassan", "Cherkaoui", "18403", "Adjudant", "male", "chef_de_section", "win-sec-charlie", null],
  ["win-agt-24", "Said", "El Idrissi", "18404", "Adjudant", "male", "chef_de_section", "win-sec-delta", null],
  ["win-agt-25", "Fatima Zahra", "Amrani", "18601", "Brigadier", "female", "cynotechnicien", null, null],
  ["win-agt-26", "Imane", "Berrada", "18602", "Gendarme", "female", "cynotechnicien", null, null],
  ["win-agt-27", "Nadia", "Tazi", "18701", "Brigadier", "female", "secretaire", null, null],
  ["win-agt-28", "Abderrahim", "Kabbaj", "18702", "Adjudant", "male", "chef_materiel", "win-sec-alpha", null],
  ["win-agt-29", "Youssef", "Laaroussi", "18703", "Gendarme", "male", "aide_soignant_veterinaire", "win-sec-bravo", null],
  ["win-agt-30", "Mohamed", "Erraoui", "18704", "Gendarme", "male", "assistant_technique", "win-sec-charlie", null],
];

const checkpoints = [
  {
    id: "win-cp-01",
    name: "Port Tanger Med",
    night_only: 0,
    day_shift_enabled: 1,
    night_shift_enabled: 1,
    allowed_gender: "all",
    female_policy: "allowed",
    priority: 1,
    mandatory: 1,
    day_narcotics: 2,
    day_explosives: 1,
    night_narcotics: 1,
    night_explosives: 1,
    required_drugs: 2,
    required_explosives: 1,
  },
  {
    id: "win-cp-02",
    name: "Aéroport Ibn Battouta",
    night_only: 0,
    day_shift_enabled: 1,
    night_shift_enabled: 1,
    allowed_gender: "all",
    female_policy: "preferred",
    priority: 1,
    mandatory: 1,
    day_narcotics: 1,
    day_explosives: 2,
    night_narcotics: 1,
    night_explosives: 1,
    required_drugs: 1,
    required_explosives: 2,
  },
  {
    id: "win-cp-03",
    name: "Gare Tanger Ville",
    night_only: 0,
    day_shift_enabled: 1,
    night_shift_enabled: 1,
    allowed_gender: "all",
    female_policy: "allowed",
    priority: 2,
    mandatory: 1,
    day_narcotics: 0,
    day_explosives: 0,
    night_narcotics: 0,
    night_explosives: 0,
    required_drugs: 1,
    required_explosives: 0,
  },
  {
    id: "win-cp-04",
    name: "Poste frontière Fnideq",
    night_only: 1,
    day_shift_enabled: 0,
    night_shift_enabled: 1,
    allowed_gender: "male",
    female_policy: "not_allowed",
    priority: 2,
    mandatory: 1,
    day_narcotics: 0,
    day_explosives: 0,
    night_narcotics: 2,
    night_explosives: 1,
    required_drugs: 2,
    required_explosives: 1,
  },
  {
    id: "win-cp-05",
    name: "Port Tanger Ville",
    night_only: 0,
    day_shift_enabled: 1,
    night_shift_enabled: 1,
    allowed_gender: "all",
    female_policy: "allowed",
    priority: 3,
    mandatory: 1,
    day_narcotics: 0,
    day_explosives: 1,
    night_narcotics: 0,
    night_explosives: 1,
    required_drugs: 0,
    required_explosives: 1,
  },
  {
    id: "win-cp-06",
    name: "Zone franche Melloussa",
    night_only: 0,
    day_shift_enabled: 1,
    night_shift_enabled: 0,
    allowed_gender: "all",
    female_policy: "allowed",
    priority: 3,
    mandatory: 0,
    day_narcotics: 1,
    day_explosives: 0,
    night_narcotics: 0,
    night_explosives: 0,
    required_drugs: 1,
    required_explosives: 0,
  },
  {
    id: "win-cp-07",
    name: "Autoroute A1 — PK 78",
    night_only: 0,
    day_shift_enabled: 1,
    night_shift_enabled: 1,
    allowed_gender: "all",
    female_policy: "allowed",
    priority: 2,
    mandatory: 1,
    day_narcotics: 1,
    day_explosives: 1,
    night_narcotics: 1,
    night_explosives: 0,
    required_drugs: 1,
    required_explosives: 1,
  },
  {
    id: "win-cp-08",
    name: "Point 653",
    night_only: 0,
    day_shift_enabled: 1,
    night_shift_enabled: 1,
    allowed_gender: "male",
    female_policy: "not_allowed",
    priority: 4,
    mandatory: 0,
    day_narcotics: 0,
    day_explosives: 0,
    night_narcotics: 0,
    night_explosives: 0,
    required_drugs: 0,
    required_explosives: 0,
  },
];

const posts = [
  ["win-post-01", "win-cp-01", "narcotics", 2, "day"],
  ["win-post-02", "win-cp-01", "explosives", 1, "day"],
  ["win-post-03", "win-cp-01", "narcotics", 1, "night"],
  ["win-post-04", "win-cp-01", "explosives", 1, "night"],
  ["win-post-05", "win-cp-02", "narcotics", 1, "day"],
  ["win-post-06", "win-cp-02", "explosives", 2, "day"],
  ["win-post-07", "win-cp-02", "currency", 1, "day"],
  ["win-post-08", "win-cp-02", "explosives", 1, "night"],
  ["win-post-09", "win-cp-03", "currency", 1, "day"],
  ["win-post-10", "win-cp-03", "narcotics", 1, "night"],
  ["win-post-11", "win-cp-04", "narcotics", 2, "night"],
  ["win-post-12", "win-cp-04", "explosives", 1, "night"],
  ["win-post-13", "win-cp-05", "explosives", 1, "day"],
  ["win-post-14", "win-cp-05", "explosives", 1, "night"],
  ["win-post-15", "win-cp-06", "narcotics", 1, "day"],
  ["win-post-16", "win-cp-06", "currency", 1, "day"],
  ["win-post-17", "win-cp-07", "narcotics", 1, "day"],
  ["win-post-18", "win-cp-07", "explosives", 1, "day"],
  ["win-post-19", "win-cp-07", "narcotics", 1, "night"],
  ["win-post-20", "win-cp-08", "narcotics", 1, "day"],
];

const exclusions = [
  ["win-excl-01", "win-agt-05", null, "sickness", "2026-08-28", "2026-09-03", "Arrêt maladie — grippe (fiction)"],
  ["win-excl-02", "win-agt-08", null, "absence", "2026-08-30", "2026-08-31", "Absence justifiée"],
  ["win-excl-03", "win-agt-03", null, "administrative_leave", "2026-08-20", "2026-08-26", "Congé administratif"],
  ["win-excl-04", "win-agt-11", null, "special_leave", "2026-09-01", "2026-09-04", "Permission exceptionnelle"],
  ["win-excl-05", "win-agt-14", null, "annual_leave", "2026-08-10", "2026-08-24", "Congé annuel"],
  ["win-excl-06", "win-agt-18", null, "mission", "2026-08-29", "2026-09-02", "Mission à Tétouan"],
  ["win-excl-07", "win-agt-25", null, "training", "2026-08-25", "2026-09-05", "Formation cynotechnique"],
  ["win-excl-08", "win-agt-02", null, "suspension", "2026-08-15", "2026-08-18", "Suspension administrative levée"],
  ["win-excl-09", "win-agt-27", null, "other", "2026-08-27", "2026-08-27", "Convocation administrative"],
  ["win-excl-10", null, "win-dog-05", "dog_sick", "2026-08-27", "2026-09-06", "Boiterie — suivi vétérinaire"],
  ["win-excl-11", null, "win-dog-08", "female_dog_heat", "2026-08-26", "2026-09-08", "Chaleurs"],
  ["win-excl-12", null, "win-dog-09", "female_dog_heat", "2026-08-29", "2026-09-10", "Chaleurs"],
  ["win-excl-13", null, "win-dog-12", "dog_injured", "2026-08-22", "2026-08-29", "Blessure légère à la patte"],
  ["win-excl-14", null, "win-dog-17", "dog_vet_visit", "2026-09-01", null, "Sous observation vétérinaire"],
  ["win-excl-15", "win-agt-20", "win-dog-20", "dog_without_handler", "2026-08-31", null, "Chien sans maître temporaire"],
  ["win-excl-16", null, "win-dog-03", "dog_training", "2026-08-18", "2026-08-21", "Recyclage détection"],
  ["win-excl-17", "win-agt-07", null, "absence", "2026-09-01", "2026-09-01", "Absence d'une journée"],
  ["win-excl-18", "win-agt-29", null, "sickness", "2026-08-23", "2026-08-25", "Consultation médicale"],
];

const seed = () => {
  for (const [id, email, role] of users) {
    insert(db, "users", {
      id,
      email,
      password_hash: passwordHash,
      role,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  for (const [id, name, shift_type, commander_full_name, commander_grade, commander_mle] of sections) {
    insert(db, "sections", {
      id,
      name,
      shift_type,
      active: 1,
      commander_full_name,
      commander_grade,
      commander_mle,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  for (const [id, name, gender, specialty, status, breed, date_of_birth, training_level] of dogs) {
    insert(db, "dogs", {
      id,
      name,
      gender,
      specialty,
      status,
      active: 1,
      photo_url: null,
      breed,
      microchip_number: `MA-TEST-${id.slice(-2)}-${name.toUpperCase()}`,
      date_of_birth,
      training_level,
      veterinary_notes: status === "sick" ? "Boiterie — dossier de test" : null,
      observations: null,
      assignment_date: "2024-03-01",
      vaccination_info: "Rappel 2026-02",
      health_status: status === "available" ? "bon" : status,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  const origines = ["Tanger", "Tétouan", "Rabat", "Fès", "Casablanca", "Meknès", "Oujda", "Agadir"];
  const marital = ["married", "single", "married", "married", "single"];
  agents.forEach((row, index) => {
    const [id, first_name, last_name, professional_number, grade, gender, fonction, section_id, dog_id] = row;
    insert(db, "agents", {
      id,
      first_name,
      last_name,
      professional_number,
      grade,
      gender,
      fonction,
      marital_status: marital[index % marital.length],
      date_naissance: `19${80 + (index % 15)}-${String((index % 12) + 1).padStart(2, "0")}-15`,
      origine: origines[index % origines.length],
      section_id,
      dog_id,
      is_section_chief: fonction === "chef_de_section" ? 1 : 0,
      active: 1,
      phone: `0661${String(200000 + index).slice(-6)}`,
      address: `Quartier test ${index + 1}, Tanger`,
      observations: null,
      photo_url: null,
      created_at: NOW,
      updated_at: NOW,
    });
  });

  for (const checkpoint of checkpoints) {
    insert(db, "checkpoints", {
      ...checkpoint,
      active: 1,
      operating_days: "[1,2,3,4,5,6,7]",
      created_at: NOW,
      updated_at: NOW,
    });
  }

  for (const [id, checkpoint_id, specialty_required, required_agents, shift] of posts) {
    insert(db, "checkpoint_posts", {
      id,
      checkpoint_id,
      specialty_required,
      required_agents,
      active: 1,
      shift,
      dog_required: 1,
      allowed_gender: checkpoint_id === "win-cp-04" ? "male" : "all",
      created_at: NOW,
      updated_at: NOW,
    });
  }

  for (const [id, agent_id, dog_id, exclusion_type, start_date, end_date, notes] of exclusions) {
    insert(db, "agent_exclusions", {
      id,
      agent_id,
      dog_id,
      exclusion_type,
      start_date,
      end_date,
      notes,
      active: end_date == null || end_date >= "2026-09-01" ? 1 : 0,
      is_deleted: 0,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  const notify = [
    ["win-excl-01", "win-agt-05", null, "personnel", "Ahmed" /* overwritten */, "sickness"],
    ["win-excl-04", "win-agt-11", null, "personnel", "Amine Senhaji", "special_leave"],
    ["win-excl-10", null, "win-dog-05", "dog", "Nero", "dog_sick"],
    ["win-excl-11", null, "win-dog-08", "dog", "Luna", "female_dog_heat"],
  ];
  const names = {
    "win-excl-01": "Hamza Tazi",
    "win-excl-04": "Amine Senhaji",
    "win-excl-10": "Nero",
    "win-excl-11": "Luna",
  };
  const ends = {
    "win-excl-01": "2026-09-03",
    "win-excl-04": "2026-09-04",
    "win-excl-10": "2026-09-06",
    "win-excl-11": "2026-09-08",
  };
  let notifIndex = 1;
  for (const [exclusion_id, agent_id, dog_id, subject_kind, , exclusion_type] of notify) {
    for (const milestone of ["d2", "d1"]) {
      const end_date = ends[exclusion_id];
      insert(db, "exclusion_notifications", {
        id: `win-notif-${String(notifIndex).padStart(2, "0")}`,
        exclusion_id,
        agent_id,
        dog_id,
        subject_kind,
        notification_type: notificationTypeForExclusion(exclusion_type, subject_kind),
        milestone,
        end_date,
        return_date: addDays(end_date, 1),
        subject_name: names[exclusion_id],
        exclusion_type,
        is_read: 0,
        created_at: NOW,
      });
      notifIndex += 1;
    }
  }

  insert(db, "application_settings", {
    id: "win-set-org",
    key: "organisation",
    value: JSON.stringify({
      unitName: "Brigade cynotechnique — Jeu de test",
      serviceName: "Unité K9 Tanger (test)",
      city: "Tanger",
      country: "Maroc",
      address: "Quartier administratif fictif, Tanger",
      phone: "0539-000000",
      email: "test.unite@cynoplanning.test",
      notes: "Base SQLite de test — données fictives uniquement.",
    }),
    description: "Organisation de test",
    created_at: NOW,
    updated_at: NOW,
  });
  insert(db, "application_settings", {
    id: "win-set-planning",
    key: "planning",
    value: JSON.stringify({
      dayStart: "09:00",
      dayEnd: "21:00",
      nightStart: "21:00",
      nightEnd: "09:00",
    }),
    description: "Horaires de test",
    created_at: NOW,
    updated_at: NOW,
  });
  insert(db, "application_settings", {
    id: "win-set-excl",
    key: "exclusions",
    value: JSON.stringify({ disabledTypes: [], reminders: { d2: true, d1: true, d0: true } }),
    description: "Paramètres exclusions de test",
    created_at: NOW,
    updated_at: NOW,
  });
  insert(db, "application_settings", {
    id: "win-set-docs",
    key: "documents",
    value: JSON.stringify({
      pageFormat: "a4",
      orientation: "portrait",
      footerText: "Document de test CynoPlanning",
      pageNumbers: false,
      documentLocale: "fr",
      logoUrl: null,
    }),
    description: "Paramètres documents de test",
    created_at: NOW,
    updated_at: NOW,
  });

  const planningDates = [
    "2026-08-24",
    "2026-08-25",
    "2026-08-26",
    "2026-08-27",
    "2026-08-28",
    "2026-08-29",
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
  ];
  const sectionShifts = [
    ["win-sec-alpha", "day"],
    ["win-sec-bravo", "day"],
    ["win-sec-charlie", "night"],
    ["win-sec-delta", "night"],
  ];
  const dayPosts = posts.filter((post) => post[4] === "day").map((post) => post[0]);
  const nightPosts = posts.filter((post) => post[4] === "night").map((post) => post[0]);
  const agentsBySection = {
    "win-sec-alpha": agents.filter((row) => row[7] === "win-sec-alpha" && row[6] === "cynotechnicien"),
    "win-sec-bravo": agents.filter((row) => row[7] === "win-sec-bravo" && row[6] === "cynotechnicien"),
    "win-sec-charlie": agents.filter((row) => row[7] === "win-sec-charlie" && row[6] === "cynotechnicien"),
    "win-sec-delta": agents.filter((row) => row[7] === "win-sec-delta" && row[6] === "cynotechnicien"),
  };

  let planningIndex = 1;
  let assignmentIndex = 1;
  let rotationIndex = 1;
  const createdPlannings = [];

  for (const date of planningDates) {
    for (const [section_id, shift] of sectionShifts) {
      const id = `win-pln-${String(planningIndex).padStart(2, "0")}`;
      insert(db, "planning", {
        id,
        planning_date: date,
        section_id,
        shift,
        created_by: shift === "day" ? "win-usr-04" : "win-usr-05",
        validated: date < "2026-09-01" ? 1 : 0,
        created_at: NOW,
        updated_at: NOW,
      });
      createdPlannings.push({ id, date, section_id, shift });
      planningIndex += 1;
    }
  }

  for (const extra of [
    ["2026-08-30", "win-sec-alpha", "night"],
    ["2026-08-30", "win-sec-bravo", "night"],
    ["2026-08-31", "win-sec-alpha", "night"],
    ["2026-09-01", "win-sec-bravo", "night"],
  ]) {
    const id = `win-pln-${String(planningIndex).padStart(2, "0")}`;
    insert(db, "planning", {
      id,
      planning_date: extra[0],
      section_id: extra[1],
      shift: extra[2],
      created_by: "win-usr-02",
      validated: 0,
      created_at: NOW,
      updated_at: NOW,
    });
    createdPlannings.push({ id, date: extra[0], section_id: extra[1], shift: extra[2] });
    planningIndex += 1;
  }

  for (const planning of createdPlannings) {
    const pool = agentsBySection[planning.section_id] ?? [];
    const shiftPosts = planning.shift === "night" ? nightPosts : dayPosts;
    pool.forEach((agent, index) => {
      const postId = index < 3 ? shiftPosts[index % shiftPosts.length] : null;
      const isReserve = postId == null;
      insert(db, "planning_assignments", {
        id: `win-asg-${String(assignmentIndex).padStart(3, "0")}`,
        planning_id: planning.id,
        checkpoint_post_id: postId,
        agent_id: agent[0],
        dog_id: isReserve ? null : agent[8],
        is_hq_reserve: isReserve ? 1 : 0,
        is_off_duty: 0,
        created_at: NOW,
        updated_at: NOW,
      });
      if (planning.date < "2026-09-01") {
        insert(db, "rotation_history", {
          id: `win-rot-${String(rotationIndex).padStart(3, "0")}`,
          agent_id: agent[0],
          checkpoint_post_id: postId,
          planning_date: planning.date,
          is_hq_reserve: isReserve ? 1 : 0,
          is_off_duty: 0,
          created_at: NOW,
        });
        rotationIndex += 1;
      }
      assignmentIndex += 1;
    });
  }

  insert(db, "planning_assignments", {
    id: `win-asg-${String(assignmentIndex).padStart(3, "0")}`,
    planning_id: "win-pln-36",
    checkpoint_post_id: null,
    agent_id: "win-agt-25",
    dog_id: null,
    is_hq_reserve: 0,
    is_off_duty: 1,
    created_at: NOW,
  });
  insert(db, "planning_assignments", {
    id: `win-asg-${String(assignmentIndex + 1).padStart(3, "0")}`,
    planning_id: "win-pln-36",
    checkpoint_post_id: null,
    agent_id: "win-agt-26",
    dog_id: null,
    is_hq_reserve: 0,
    is_off_duty: 1,
    created_at: NOW,
  });

  insert(db, "operational_cases", {
    id: "win-case-01",
    case_date: "2026-08-20",
    case_number: "TEST-2026-001",
    agent_id: "win-agt-01",
    dog_id: "win-dog-01",
    checkpoint_id: "win-cp-01",
    specialty: "narcotics",
    location: "Port Tanger Med — terminal conteneurs (fiction)",
    seizure_type: "cannabis",
    quantity: 2.4,
    unit: "kg",
    object_type: null,
    object_count: null,
    threat_level: "medium",
    currency_code: null,
    total_amount: null,
    banknote_count: null,
    country: "Maroc",
    observations: "Saisie fictive pour test d'importation.",
    is_deleted: 0,
    created_at: NOW,
    updated_at: NOW,
  });
  insert(db, "operational_cases", {
    id: "win-case-02",
    case_date: "2026-08-24",
    case_number: "TEST-2026-002",
    agent_id: "win-agt-02",
    dog_id: "win-dog-02",
    checkpoint_id: "win-cp-02",
    specialty: "explosives",
    location: "Aéroport Ibn Battouta — soute (fiction)",
    seizure_type: "explosives",
    quantity: null,
    unit: null,
    object_type: "ammunition",
    object_count: 12,
    threat_level: "high",
    currency_code: null,
    total_amount: null,
    banknote_count: null,
    country: "Maroc",
    observations: "Dossier de test.",
    is_deleted: 0,
    created_at: NOW,
    updated_at: NOW,
  });
  insert(db, "operational_cases", {
    id: "win-case-03",
    case_date: "2026-08-28",
    case_number: "TEST-2026-003",
    agent_id: "win-agt-03",
    dog_id: "win-dog-03",
    checkpoint_id: "win-cp-03",
    specialty: "currency",
    location: "Gare Tanger Ville (fiction)",
    seizure_type: "counterfeit_currency",
    quantity: null,
    unit: "banknotes",
    object_type: null,
    object_count: null,
    threat_level: "low",
    currency_code: "EUR",
    total_amount: 4500,
    banknote_count: 90,
    country: "Maroc",
    observations: "Billets fictifs.",
    is_deleted: 0,
    created_at: NOW,
    updated_at: NOW,
  });
  insert(db, "operational_case_attachments", {
    id: "win-att-01",
    case_id: "win-case-01",
    file_name: "pv-test-001.pdf",
    storage_path: "test-media/win-case-01/pv-test-001.pdf",
    file_size: 24576,
    mime_type: "application/pdf",
    created_at: NOW,
  });

  insert(db, "role_documents", {
    id: "win-doc-01",
    reference_number: "RAP-2026-0001",
    role_category: "veterinary",
    template_id: "sick-dog-report",
    document_kind: "report",
    status: "draft",
    title: "Rapport vétérinaire de test — Nero",
    report_month: 8,
    report_year: 2026,
    agent_id: "win-agt-29",
    dog_id: "win-dog-05",
    section_id: "win-sec-bravo",
    payload: JSON.stringify({ kind: "test", note: "document fictif" }),
    created_by_user_id: "win-usr-07",
    created_by_email: "veterinaire@cynoplanning.test",
    created_by_name: "Compte vétérinaire test",
    finalized_at: null,
    created_at: NOW,
    updated_at: NOW,
  });
  insert(db, "role_documents", {
    id: "win-doc-02",
    reference_number: "MSG-2026-0001",
    role_category: "secretary",
    template_id: "message-demande",
    document_kind: "message",
    status: "finalized",
    title: "Message de test — demande de fournitures",
    report_month: null,
    report_year: 2026,
    agent_id: "win-agt-27",
    dog_id: null,
    section_id: "win-sec-alpha",
    payload: JSON.stringify({ kind: "test" }),
    created_by_user_id: "win-usr-06",
    created_by_email: "secretariat@cynoplanning.test",
    created_by_name: "Secrétariat test",
    finalized_at: "2026-08-29 16:00:00",
    created_at: NOW,
    updated_at: NOW,
  });
  insert(db, "document_reference_sequences", { prefix: "RAP", year: 2026, last_number: 1 });
  insert(db, "document_reference_sequences", { prefix: "MSG", year: 2026, last_number: 1 });

  const history = [
    ["win-hist-01", "win-agt-03", "conge", "2026-08-20", "2026-08-26", "Congé administratif", "exclusion"],
    ["win-hist-02", "win-agt-05", "arret_maladie", "2026-08-28", "2026-09-03", "Arrêt maladie", "maladie"],
    ["win-hist-03", "win-agt-14", "conge", "2026-08-10", "2026-08-24", "Congé annuel", "conge"],
    ["win-hist-04", "win-agt-25", "formation", "2026-08-25", "2026-09-05", "Formation", "formation"],
    ["win-hist-05", "win-agt-18", "permission", "2026-08-29", "2026-09-02", "Mission", "exclusion"],
    ["win-hist-06", "win-agt-01", "autre", "2026-07-15", "2026-07-15", "Note de service fictive", "manual"],
  ];
  for (const [id, agent_id, event_type, start_date, end_date, reason, source_type] of history) {
    insert(db, "agent_administrative_history", {
      id,
      agent_id,
      event_type,
      start_date,
      end_date,
      reason,
      observation: "Historique de test",
      reference: `TEST-${id.slice(-2)}`,
      source_type,
      source_id: null,
      created_by: "win-usr-01",
      created_at: NOW,
      updated_at: NOW,
    });
  }

  const migrations = [
    ["001_sections_commander_columns", "sections commander"],
    ["002_users_role_column", "users role"],
    ["003_checkpoints_priority_column", "checkpoints priority"],
    ["004_female_agents_clear_section", "female agents"],
    ["005_agents_fonction_column", "agents fonction"],
    ["006_non_cyno_clear_assignment", "non cyno"],
    ["007_agents_fonction_chef_materiel", "chef materiel"],
    ["008_agent_exclusions_dog_target", "dog exclusions"],
    ["009_agents_marital_status_column", "marital status"],
    ["010_checkpoints_mandatory_column", "mandatory"],
    ["011_agents_fonction_hierarchy_v2", "hierarchy"],
    ["012_agents_fonction_brigadier_canonical", "brigadier"],
    ["013_exclusion_return_notifications", "notifications"],
    ["014_agents_date_naissance_column", "date naissance"],
    ["015_agents_origine_column", "origine"],
    ["016_role_documents_module", "role documents"],
    ["017_role_documents_equipment_chief", "equipment chief"],
    ["019_open_ended_dog_exclusions", "open ended exclusions"],
    ["020_agent_administrative_history", "admin history"],
  ];
  for (const [id, name] of migrations) {
    insert(db, "schema_migrations", {
      id,
      name,
      applied_at: NOW,
      success: 1,
    });
  }
};

db.run("BEGIN");
try {
  seed();
  db.run("COMMIT");
} catch (error) {
  db.run("ROLLBACK");
  throw error;
}

const integrity = queryAll(db, "PRAGMA integrity_check")[0];
const fkViolations = queryAll(db, "PRAGMA foreign_key_check");
if (integrity.integrity_check !== "ok") {
  db.close();
  throw new Error(`integrity_check failed: ${JSON.stringify(integrity)}`);
}
if (fkViolations.length > 0) {
  db.close();
  throw new Error(`foreign_key_check failed: ${JSON.stringify(fkViolations)}`);
}

const tables = queryAll(
  db,
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
).map((row) => row.name);
const counts = {};
for (const table of tables) {
  counts[table] = queryAll(db, `SELECT COUNT(*) AS n FROM "${table}"`)[0].n;
}

const exported = Buffer.from(db.export());
db.close();
writeFileSync(OUT, exported);

const bytes = statSync(OUT).size;
const report = {
  path: OUT,
  bytes,
  integrity: integrity.integrity_check,
  foreignKeyViolations: fkViolations.length,
  tables,
  counts,
  testLogin: {
    email: "admin.test@cynoplanning.test",
    password: TEST_PASSWORD,
    note: "bcryptjs cost 12 — fictional accounts only",
  },
};
writeFileSync(join(dirname(OUT), "cynoplanning_test.summary.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
