/**
 * Standalone generator for test-data/cynoplanning_67chiens.db
 * Copies the current CynoPlanning DDL. Does not modify application source.
 */
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");
const initSqlJs = (await import("sql.js")).default;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "test-data", "cynoplanning_67chiens.db");
const TEST_PASSWORD = "TestImport@2026";
const SEED_PASSWORD = "karim@123";
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
  `CREATE TABLE IF NOT EXISTS agent_checkpoint_restrictions (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (agent_id, checkpoint_id)
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
  `CREATE INDEX IF NOT EXISTS idx_agent_checkpoint_restrictions_checkpoint
    ON agent_checkpoint_restrictions(checkpoint_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_checkpoint_restrictions_agent
    ON agent_checkpoint_restrictions(agent_id)`,
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

const MIGRATION_IDS = [
  ["001_sections_commander_columns", "baseline"],
  ["002_users_role_column", "baseline"],
  ["003_checkpoints_priority_column", "baseline"],
  ["004_female_agents_clear_section", "baseline"],
  ["005_agents_fonction_column", "baseline"],
  ["006_non_cyno_clear_assignment", "baseline"],
  ["007_agents_fonction_chef_materiel", "baseline"],
  ["008_agent_exclusions_dog_target", "baseline"],
  ["009_agents_marital_status_column", "baseline"],
  ["010_checkpoints_mandatory_column", "baseline"],
  ["011_agents_fonction_hierarchy_v2", "baseline"],
  ["012_agents_fonction_brigadier_canonical", "baseline"],
  ["013_exclusion_return_notifications", "baseline"],
  ["014_agents_date_naissance_column", "baseline"],
  ["015_agents_origine_column", "origine"],
  ["016_role_documents_module", "role documents"],
  ["017_role_documents_equipment_chief", "equipment chief"],
  ["019_open_ended_dog_exclusions", "open ended exclusions"],
  ["020_agent_administrative_history", "admin history"],
  ["021_agent_exclusions_rest_type", "rest exclusion"],
  ["022_agent_checkpoint_restrictions", "checkpoint restrictions"],
];

function insert(db, table, row) {
  const columns = Object.keys(row);
  db.run(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
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

const MALE_FIRST = [
  "Ahmed", "Youssef", "Omar", "Mehdi", "Hamza", "Karim", "Rachid", "Soufiane",
  "Anas", "Nabil", "Amine", "Reda", "Hicham", "Tarik", "Ismail", "Walid",
  "Adil", "Samir", "Fouad", "Driss", "Khalid", "Mustapha", "Hassan", "Said",
  "Abderrahim", "Mohamed", "Yassine", "Ilyas", "Bilal", "Ayoub", "Zakaria",
  "Othmane", "Jawad", "Mounir", "Hakim", "Noureddine", "Abdellah", "Farid",
  "Lotfi", "Sami", "Badr", "Ibrahim", "Anouar", "Jalal", "Mounir", "Rafik",
  "Taha", "Younes", "Imad", "Nizar", "Hicham", "Oussama", "Marouane", "Ayoub",
];
const FEMALE_FIRST = [
  "Fatima Zahra", "Imane", "Nadia", "Sara", "Salma", "Khadija", "Amina", "Hajar",
  "Maryam", "Ghita", "Loubna", "Nisrine",
];
const LAST = [
  "El Amrani", "Bennani", "Alaoui", "Idrissi", "Tazi", "Benjelloun", "Chraibi",
  "Kadiri", "Berrada", "Lahlou", "Senhaji", "Filali", "Ouazzani", "Bensouda",
  "Kettani", "Squalli", "Guessous", "Zniber", "Tahiri", "Benkirane", "El Fassi",
  "Cherkaoui", "Kabbaj", "Laaroussi", "Erraoui", "Benslimane", "El Alami",
  "Mernissi", "Benabdellah", "El Ouardi", "Hajji", "Naciri", "El Khattabi",
  "Bouazza", "El Idrissi", "Benomar", "El Mansouri", "Raji", "El Khatib",
  "Bouziane", "El Hassani", "Benali", "El Yamani", "Chakiri", "El Ghazali",
  "Bennis", "El Ouazzani", "Lamrani", "El Harti", "Benkirane", "El Malki",
  "Touhami", "El Idrissi", "Benjelloun", "El Fassi", "Amrani",
];
const DOG_NAMES = [
  "Rex", "Max", "Rocky", "Thor", "Nero", "Milo", "Ace", "Duke", "Zeus", "Shadow",
  "Hunter", "Apache", "Blitz", "Ranger", "Titan", "Diesel", "Bolt", "Jax", "Argo",
  "Odin", "Wolf", "Storm", "Bandit", "Chief", "Ghost", "Hawk", "Ice", "King",
  "Leon", "Mars", "Nitro", "Orion", "Pilot", "Quest", "Rambo", "Scout", "Tango",
  "Uno", "Victor", "Warrior", "Xander", "York", "Zorro", "Atlas", "Bruno",
  "Kira", "Luna", "Tara", "Bella", "Cleo", "Sasha", "Nala", "Maya", "Zara",
  "Diva", "Ella", "Fiona", "Gala", "Hana", "Iris", "Jade", "Kora", "Lila",
  "Mira", "Nova", "Pia", "Ruby",
];
const BREEDS = ["Berger Belge Malinois", "Berger Allemand", "Labrador Retriever", "Springer Spaniel"];
const ORIGINES = ["Tanger", "Tétouan", "Rabat", "Fès", "Casablanca", "Meknès", "Oujda", "Agadir", "Kenitra", "Salé"];
const MARITAL = ["married", "married", "single", "married", "divorced"];
const CYNO_GRADES = ["Brigadier", "Brigadier", "Gardien de la paix", "Brigadier principal", "Gardien de la paix"];

if (DOG_NAMES.length !== 67) {
  throw new Error(`Expected 67 unique dog names, got ${DOG_NAMES.length}`);
}

function uniquePairs(firstNames, lastNames, count, reserved = new Set()) {
  const pairs = [];
  const used = new Set(reserved);
  let offset = 0;
  while (pairs.length < count) {
    const index = pairs.length;
    const first = firstNames[index % firstNames.length];
    const last = lastNames[(index + offset) % lastNames.length];
    const key = `${first}|${last}`;
    if (used.has(key)) {
      offset += 1;
      if (offset > firstNames.length * lastNames.length) {
        throw new Error(`Could not generate ${count} unique name pairs`);
      }
      continue;
    }
    used.add(key);
    pairs.push({ first, last });
  }
  return pairs;
}

mkdirSync(dirname(OUT), { recursive: true });
if (existsSync(OUT)) unlinkSync(OUT);

const testHash = bcrypt.hashSync(TEST_PASSWORD, 12);
const seedHash = bcrypt.hashSync(SEED_PASSWORD, 12);
const SQL = await initSqlJs({
  wasmBinary: readFileSync(join(ROOT, "node_modules/sql.js/dist/sql-wasm.wasm")),
});
const db = new SQL.Database();
db.run("PRAGMA foreign_keys = ON");
for (const statement of SCHEMA_STATEMENTS) db.run(statement);
for (const statement of INDEX_STATEMENTS) db.run(statement);

const sections = [
  { id: "sec-1", name: "Section 1", shift_type: "day" },
  { id: "sec-2", name: "Section 2", shift_type: "day" },
  { id: "sec-3", name: "Section 3", shift_type: "night" },
];

const chefs = [
  { id: "agt-chef-1", first: "Khalid", last: "El Fassi", mle: "20001", section_id: "sec-1", grade: "Adjudant" },
  { id: "agt-chef-2", first: "Mustapha", last: "Bennani", mle: "20002", section_id: "sec-2", grade: "Adjudant" },
  { id: "agt-chef-3", first: "Hassan", last: "Cherkaoui", mle: "20003", section_id: "sec-3", grade: "Adjudant" },
];

const checkpoints = [
  { id: "cp-653", name: "653", night_only: 0, day_on: 1, night_on: 1, gender: "male", female: "not_allowed", priority: 4, mandatory: 0, day_n: 0, day_e: 0, night_n: 0, night_e: 0 },
  { id: "cp-753", name: "753", night_only: 0, day_on: 1, night_on: 1, gender: "all", female: "allowed", priority: 1, mandatory: 1, day_n: 2, day_e: 2, night_n: 1, night_e: 1 },
  { id: "cp-91", name: "91", night_only: 0, day_on: 1, night_on: 1, gender: "all", female: "preferred", priority: 1, mandatory: 1, day_n: 2, day_e: 1, night_n: 1, night_e: 1 },
  { id: "cp-91bis", name: "91 BIS", night_only: 0, day_on: 1, night_on: 1, gender: "all", female: "allowed", priority: 2, mandatory: 1, day_n: 1, day_e: 1, night_n: 1, night_e: 0 },
  { id: "cp-78", name: "78", night_only: 0, day_on: 1, night_on: 1, gender: "all", female: "allowed", priority: 2, mandatory: 1, day_n: 2, day_e: 1, night_n: 1, night_e: 1 },
  { id: "cp-77", name: "77", night_only: 0, day_on: 1, night_on: 1, gender: "all", female: "allowed", priority: 2, mandatory: 1, day_n: 1, day_e: 1, night_n: 0, night_e: 1 },
  { id: "cp-21", name: "21", night_only: 1, day_on: 0, night_on: 1, gender: "male", female: "not_allowed", priority: 1, mandatory: 1, day_n: 0, day_e: 0, night_n: 1, night_e: 1 },
  { id: "cp-20", name: "20", night_only: 0, day_on: 1, night_on: 1, gender: "all", female: "allowed", priority: 3, mandatory: 1, day_n: 1, day_e: 1, night_n: 1, night_e: 0 },
  { id: "cp-55", name: "55", night_only: 0, day_on: 1, night_on: 1, gender: "all", female: "allowed", priority: 2, mandatory: 1, day_n: 2, day_e: 1, night_n: 1, night_e: 1 },
  { id: "cp-17", name: "17", night_only: 0, day_on: 1, night_on: 1, gender: "all", female: "allowed", priority: 3, mandatory: 1, day_n: 1, day_e: 1, night_n: 1, night_e: 0 },
  { id: "cp-53", name: "53", night_only: 0, day_on: 1, night_on: 1, gender: "all", female: "allowed", priority: 3, mandatory: 0, day_n: 1, day_e: 1, night_n: 0, night_e: 1 },
];

const posts = [];
for (const cp of checkpoints) {
  if (cp.day_n > 0) posts.push({ id: `post-${cp.id}-day-narc`, checkpoint_id: cp.id, specialty: "narcotics", required: cp.day_n, shift: "day", gender: "all" });
  if (cp.day_e > 0) posts.push({ id: `post-${cp.id}-day-expl`, checkpoint_id: cp.id, specialty: "explosives", required: cp.day_e, shift: "day", gender: "all" });
  if (cp.night_n > 0) posts.push({ id: `post-${cp.id}-night-narc`, checkpoint_id: cp.id, specialty: "narcotics", required: cp.night_n, shift: "night", gender: "male" });
  if (cp.night_e > 0) posts.push({ id: `post-${cp.id}-night-expl`, checkpoint_id: cp.id, specialty: "explosives", required: cp.night_e, shift: "night", gender: "male" });
}

const specialties = [
  ...Array.from({ length: 37 }, () => "narcotics"),
  ...Array.from({ length: 30 }, () => "explosives"),
];

const femaleCount = 8;
const maleCount = 67 - femaleCount;
const support = [
  { id: "agt-brigade-1", first: "Abdellah", last: "El Mansouri", mle: "23001", fonction: "chef_brigadier", gender: "male", grade: "Commissaire", section_id: null },
  { id: "agt-materiel-1", first: "Abderrahim", last: "Kabbaj", mle: "23002", fonction: "chef_materiel", gender: "male", grade: "Brigadier chef", section_id: null },
  { id: "agt-tech-1", first: "Youssef", last: "Laaroussi", mle: "23003", fonction: "assistant_technique", gender: "male", grade: "Gardien de la paix", section_id: null },
  { id: "agt-vet-1", first: "Mohamed", last: "Erraoui", mle: "23004", fonction: "aide_soignant_veterinaire", gender: "male", grade: "Gardien de la paix", section_id: null },
  { id: "agt-vet-2", first: "Ilyas", last: "Benali", mle: "23005", fonction: "aide_soignant_veterinaire", gender: "male", grade: "Gardien de la paix", section_id: null },
  { id: "agt-vet-3", first: "Sara", last: "El Yamani", mle: "23006", fonction: "aide_soignant_veterinaire", gender: "female", grade: "Gardien de la paix", section_id: null },
  { id: "agt-vet-4", first: "Hajar", last: "Naciri", mle: "23007", fonction: "aide_soignant_veterinaire", gender: "female", grade: "Gardien de la paix", section_id: null },
  { id: "agt-sec-1", first: "Nadia", last: "Tazi", mle: "23008", fonction: "secretaire", gender: "female", grade: "Gardien de la paix", section_id: null },
  { id: "agt-sec-2", first: "Salma", last: "Bennis", mle: "23009", fonction: "secretaire", gender: "female", grade: "Gardien de la paix", section_id: null },
];
const reservedNames = new Set([
  ...chefs.map((c) => `${c.first}|${c.last}`),
  ...support.map((s) => `${s.first}|${s.last}`),
]);
const malePairs = uniquePairs(MALE_FIRST, LAST, maleCount, reservedNames);
const femalePairs = uniquePairs(FEMALE_FIRST, LAST, femaleCount, reservedNames);

const dogs = DOG_NAMES.map((name, index) => {
  const specialty = specialties[index];
  const female = index >= 45;
  return {
    id: `dog-${String(index + 1).padStart(3, "0")}`,
    name,
    gender: female ? "female" : "male",
    specialty,
    breed: BREEDS[index % BREEDS.length],
    date_of_birth: `${2018 + (index % 6)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
    training_level: index % 5 === 0 ? "advanced" : "operational",
  };
});

const sectionCycle = ["sec-1", "sec-1", "sec-2", "sec-2", "sec-3"];
const cynos = [];
for (let i = 0; i < maleCount; i += 1) {
  const dog = dogs[i];
  cynos.push({
    id: `agt-cyno-${String(i + 1).padStart(3, "0")}`,
    ...malePairs[i],
    mle: String(21001 + i),
    gender: "male",
    section_id: sectionCycle[i % sectionCycle.length],
    dog_id: dog.id,
    grade: CYNO_GRADES[i % CYNO_GRADES.length],
  });
}
for (let i = 0; i < femaleCount; i += 1) {
  const dog = dogs[maleCount + i];
  cynos.push({
    id: `agt-cyno-${String(maleCount + i + 1).padStart(3, "0")}`,
    ...femalePairs[i],
    mle: String(22001 + i),
    gender: "female",
    section_id: null,
    dog_id: dog.id,
    grade: CYNO_GRADES[i % CYNO_GRADES.length],
  });
}

db.run("BEGIN");
try {
  insert(db, "users", { id: "usr-admin-seed", email: "karim@cynoplanning.local", password_hash: seedHash, role: "admin", created_at: NOW, updated_at: NOW });
  insert(db, "users", { id: "usr-admin-1", email: "admin@cynoplanning.local", password_hash: testHash, role: "admin", created_at: NOW, updated_at: NOW });
  insert(db, "users", { id: "usr-user-1", email: "operateur@cynoplanning.local", password_hash: testHash, role: "user", created_at: NOW, updated_at: NOW });
  insert(db, "users", { id: "usr-user-2", email: "secretariat@cynoplanning.local", password_hash: testHash, role: "user", created_at: NOW, updated_at: NOW });

  for (const chef of chefs) {
    insert(db, "sections", {
      id: chef.section_id,
      name: sections.find((s) => s.id === chef.section_id).name,
      shift_type: sections.find((s) => s.id === chef.section_id).shift_type,
      active: 1,
      commander_full_name: `${chef.first} ${chef.last}`,
      commander_grade: chef.grade,
      commander_mle: chef.mle,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  for (const dog of dogs) {
    insert(db, "dogs", {
      id: dog.id,
      name: dog.name,
      gender: dog.gender,
      specialty: dog.specialty,
      status: "available",
      active: 1,
      photo_url: null,
      breed: dog.breed,
      microchip_number: `MA-67-${dog.id.slice(-3)}-${dog.name.toUpperCase()}`,
      date_of_birth: dog.date_of_birth,
      training_level: dog.training_level,
      veterinary_notes: null,
      observations: null,
      assignment_date: "2024-01-15",
      vaccination_info: "Rappel 2026-03",
      health_status: "bon",
      created_at: NOW,
      updated_at: NOW,
    });
  }

  const allAgents = [
    ...chefs.map((c, index) => ({
      ...c,
      fonction: "chef_de_section",
      is_section_chief: 1,
      dog_id: null,
      gender: "male",
      birth: `197${6 + index}-0${index + 3}-12`,
    })),
    ...cynos.map((c, index) => ({
      ...c,
      fonction: "cynotechnicien",
      is_section_chief: 0,
      birth: `${1978 + (index % 18)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
    })),
    ...support.map((s, index) => ({
      ...s,
      is_section_chief: 0,
      dog_id: null,
      birth: `${1980 + (index % 12)}-${String((index % 12) + 1).padStart(2, "0")}-08`,
    })),
  ];

  allAgents.forEach((agent, index) => {
    insert(db, "agents", {
      id: agent.id,
      first_name: agent.first,
      last_name: agent.last,
      professional_number: agent.mle,
      grade: agent.grade,
      gender: agent.gender,
      fonction: agent.fonction,
      marital_status: MARITAL[index % MARITAL.length],
      date_naissance: agent.birth,
      origine: ORIGINES[index % ORIGINES.length],
      section_id: agent.section_id,
      dog_id: agent.dog_id ?? null,
      is_section_chief: agent.is_section_chief,
      active: 1,
      phone: `0661${String(300000 + index).slice(-6)}`,
      address: `Avenue Hassan II, ${ORIGINES[index % ORIGINES.length]}`,
      observations: null,
      photo_url: null,
      created_at: NOW,
      updated_at: NOW,
    });
  });

  for (const cp of checkpoints) {
    insert(db, "checkpoints", {
      id: cp.id,
      name: cp.name,
      active: 1,
      night_only: cp.night_only,
      allowed_gender: cp.gender,
      operating_days: "[1,2,3,4,5,6,7]",
      day_shift_enabled: cp.day_on,
      night_shift_enabled: cp.night_on,
      female_policy: cp.female,
      priority: cp.priority,
      mandatory: cp.mandatory,
      day_explosives: cp.day_e,
      day_narcotics: cp.day_n,
      night_explosives: cp.night_e,
      night_narcotics: cp.night_n,
      required_drugs: cp.day_n + cp.night_n,
      required_explosives: cp.day_e + cp.night_e,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  for (const post of posts) {
    insert(db, "checkpoint_posts", {
      id: post.id,
      checkpoint_id: post.checkpoint_id,
      specialty_required: post.specialty,
      required_agents: post.required,
      active: 1,
      shift: post.shift,
      dog_required: 1,
      allowed_gender: post.gender,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  const exclusions = [
    { id: "excl-01", agent_id: "agt-cyno-004", dog_id: null, type: "sickness", start: "2026-08-30", end: "2026-09-04", notes: "Arrêt maladie — grippe" },
    { id: "excl-02", agent_id: "agt-cyno-018", dog_id: null, type: "annual_leave", start: "2026-08-20", end: "2026-09-03", notes: "Congé annuel" },
    { id: "excl-03", agent_id: "agt-cyno-031", dog_id: null, type: "training", start: "2026-08-25", end: null, notes: "Formation cynotechnique" },
    { id: "excl-04", agent_id: null, dog_id: "dog-012", type: "dog_sick", start: "2026-08-28", end: "2026-09-06", notes: "Boiterie — suivi vétérinaire" },
    { id: "excl-05", agent_id: null, dog_id: "dog-048", type: "female_dog_heat", start: "2026-08-26", end: "2026-09-08", notes: "Chaleurs" },
    { id: "excl-06", agent_id: "agt-cyno-052", dog_id: null, type: "mission", start: "2026-09-01", end: "2026-09-05", notes: "Mission à Tétouan" },
  ];
  for (const row of exclusions) {
    insert(db, "agent_exclusions", {
      id: row.id,
      agent_id: row.agent_id,
      dog_id: row.dog_id,
      exclusion_type: row.type,
      start_date: row.start,
      end_date: row.end,
      notes: row.notes,
      active: 1,
      is_deleted: 0,
      created_at: NOW,
      updated_at: NOW,
    });
  }

  insert(db, "agent_administrative_history", {
    id: "hist-01",
    agent_id: "agt-cyno-018",
    event_type: "conge",
    start_date: "2026-08-20",
    end_date: "2026-09-03",
    reason: "Congé annuel",
    observation: null,
    reference: "CA-2026-018",
    source_type: "conge",
    source_id: "excl-02",
    created_by: "usr-admin-1",
    created_at: NOW,
    updated_at: NOW,
  });

  const dayNarcPosts = posts.filter((p) => p.shift === "day" && p.specialty === "narcotics");
  const dayExplPosts = posts.filter((p) => p.shift === "day" && p.specialty === "explosives");
  const nightNarcPosts = posts.filter((p) => p.shift === "night" && p.specialty === "narcotics");
  const nightExplPosts = posts.filter((p) => p.shift === "night" && p.specialty === "explosives");
  const dogById = Object.fromEntries(dogs.map((d) => [d.id, d]));
  const historyDates = ["2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"];
  let hist = 0;
  for (const date of historyDates) {
    for (const cyno of cynos) {
      if (cyno.gender === "female") continue;
      const spec = dogById[cyno.dog_id].specialty;
      const night = cyno.section_id === "sec-3";
      const pool = night
        ? spec === "narcotics" ? nightNarcPosts : nightExplPosts
        : spec === "narcotics" ? dayNarcPosts : dayExplPosts;
      if (pool.length === 0) continue;
      if (hist % 3 === 0) {
        insert(db, "rotation_history", {
          id: `rh-${String(hist + 1).padStart(4, "0")}`,
          agent_id: cyno.id,
          checkpoint_post_id: pool[hist % pool.length].id,
          planning_date: date,
          is_hq_reserve: 0,
          is_off_duty: 0,
          created_at: NOW,
        });
      }
      hist += 1;
    }
  }

  insert(db, "operational_cases", {
    id: "case-01",
    case_date: "2026-08-18",
    case_number: "OP-2026-0001",
    agent_id: "agt-cyno-001",
    dog_id: "dog-001",
    checkpoint_id: "cp-753",
    specialty: "narcotics",
    location: "Point 753",
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
    observations: "Saisie de test — données fictives",
    is_deleted: 0,
    created_at: NOW,
    updated_at: NOW,
  });

  for (const [id, name] of MIGRATION_IDS) {
    insert(db, "schema_migrations", { id, name, applied_at: NOW, success: 1 });
  }

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

const uniqueness = queryAll(
  db,
  `SELECT
    (SELECT COUNT(*) FROM agents) - (SELECT COUNT(DISTINCT id) FROM agents) AS dup_agent_ids,
    (SELECT COUNT(*) FROM agents) - (SELECT COUNT(DISTINCT professional_number) FROM agents) AS dup_matricules,
    (SELECT COUNT(*) FROM dogs) - (SELECT COUNT(DISTINCT id) FROM dogs) AS dup_dog_ids,
    (SELECT COUNT(*) FROM dogs) - (SELECT COUNT(DISTINCT name) FROM dogs) AS dup_dog_names,
    (SELECT COUNT(*) FROM dogs WHERE id NOT IN (SELECT dog_id FROM agents WHERE dog_id IS NOT NULL)) AS unpaired_dogs,
    (SELECT COUNT(*) FROM agents WHERE fonction = 'cynotechnicien' AND dog_id IS NULL) AS cynos_without_dog,
    (SELECT COUNT(*) FROM agents WHERE fonction != 'cynotechnicien' AND dog_id IS NOT NULL) AS non_cyno_with_dog,
    (SELECT COUNT(*) FROM agents WHERE fonction = 'cynotechnicien' AND gender = 'female' AND section_id IS NOT NULL) AS female_cynos_in_section,
    (SELECT COUNT(*) FROM agents WHERE is_section_chief = 1) AS section_chiefs,
    (SELECT COUNT(*) FROM agents) - (SELECT COUNT(DISTINCT first_name || ' ' || last_name) FROM agents) AS dup_full_names
  `,
)[0];
if (
  uniqueness.dup_agent_ids ||
  uniqueness.dup_matricules ||
  uniqueness.dup_dog_ids ||
  uniqueness.dup_dog_names ||
  uniqueness.unpaired_dogs ||
  uniqueness.cynos_without_dog ||
  uniqueness.non_cyno_with_dog ||
  uniqueness.female_cynos_in_section ||
  uniqueness.dup_full_names ||
  uniqueness.section_chiefs !== 3
) {
  db.close();
  throw new Error(`uniqueness / relationship check failed: ${JSON.stringify(uniqueness)}`);
}

const tables = queryAll(
  db,
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
).map((row) => row.name);
const counts = {};
for (const table of tables) {
  counts[table] = queryAll(db, `SELECT COUNT(*) AS n FROM "${table}"`)[0].n;
}
const breakdown = {
  dogs: queryAll(db, `SELECT COUNT(*) AS n FROM dogs`)[0].n,
  explosivesDogs: queryAll(db, `SELECT COUNT(*) AS n FROM dogs WHERE specialty = 'explosives'`)[0].n,
  narcoticsDogs: queryAll(db, `SELECT COUNT(*) AS n FROM dogs WHERE specialty = 'narcotics'`)[0].n,
  cynotechniciens: queryAll(db, `SELECT COUNT(*) AS n FROM agents WHERE fonction = 'cynotechnicien'`)[0].n,
  chefsDeSection: queryAll(db, `SELECT COUNT(*) AS n FROM agents WHERE fonction = 'chef_de_section'`)[0].n,
  chefBrigade: queryAll(db, `SELECT COUNT(*) AS n FROM agents WHERE fonction = 'chef_brigadier'`)[0].n,
  chefMateriel: queryAll(db, `SELECT COUNT(*) AS n FROM agents WHERE fonction = 'chef_materiel'`)[0].n,
  assistantsTechniques: queryAll(db, `SELECT COUNT(*) AS n FROM agents WHERE fonction = 'assistant_technique'`)[0].n,
  aidesSoignants: queryAll(db, `SELECT COUNT(*) AS n FROM agents WHERE fonction = 'aide_soignant_veterinaire'`)[0].n,
  secretaires: queryAll(db, `SELECT COUNT(*) AS n FROM agents WHERE fonction = 'secretaire'`)[0].n,
  sections: queryAll(db, `SELECT COUNT(*) AS n FROM sections`)[0].n,
  controlPoints: queryAll(db, `SELECT COUNT(*) AS n FROM checkpoints`)[0].n,
  pairedDogs: queryAll(db, `SELECT COUNT(*) AS n FROM agents WHERE dog_id IS NOT NULL`)[0].n,
  femaleCynosWithoutSection: queryAll(
    db,
    `SELECT COUNT(*) AS n FROM agents WHERE fonction = 'cynotechnicien' AND gender = 'female' AND section_id IS NULL`,
  )[0].n,
};

const exported = Buffer.from(db.export());
db.close();
writeFileSync(OUT, exported);

const report = {
  path: OUT,
  bytes: statSync(OUT).size,
  integrity: integrity.integrity_check,
  foreignKeyViolations: fkViolations.length,
  breakdown,
  tables,
  counts,
  logins: {
    adminSeed: { email: "karim@cynoplanning.local", password: SEED_PASSWORD },
    admin: { email: "admin@cynoplanning.local", password: TEST_PASSWORD },
    user1: { email: "operateur@cynoplanning.local", password: TEST_PASSWORD },
    user2: { email: "secretariat@cynoplanning.local", password: TEST_PASSWORD },
  },
};

writeFileSync(join(dirname(OUT), "cynoplanning_67chiens.summary.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
