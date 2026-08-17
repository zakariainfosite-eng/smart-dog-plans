/**
 * Verify dashboard personnel KPI counts against the live CynoPlanning SQLite DB.
 * Mirrors src/lib/dashboard/compute-dashboard-personnel-stats.ts
 * (fonctionnaires total, specialty split, active handlers, sans chien, current exclusions).
 *
 * Usage: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/verify-dashboard-stats.cjs
 */
const { join } = require("node:path");
const { homedir } = require("node:os");
const Database = require("better-sqlite3");

const dbPath = join(homedir(), "Library/Application Support/CynoPlanning/cynoplanning.db");

const ADMIN_FONCTIONS = new Set([
  "chef_brigadier",
  "chef_brigadier_pi",
  "chef_secretariat",
  "secretaire",
  "assistant_technique",
  "chef_de_section",
  "chef_de_section_pi",
  "chef_materiel",
  "aide_soignant_veterinaire",
  "chef_brigade",
  "chef_brigade_pi",
]);

const AGENT_LEVEL = new Set([
  "absence",
  "sickness",
  "annual_leave",
  "special_leave",
  "administrative_leave",
  "mission",
  "training",
  "suspension",
  "other",
]);

const DOG_LEVEL = new Set([
  "dog_sick",
  "female_dog_heat",
  "dog_injured",
  "dog_temporary_retirement",
  "dog_vet_visit",
  "dog_training",
  "dog_other",
]);

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isCynotechnicien(fonction) {
  const value = String(fonction ?? "").trim();
  if (!value) return true;
  return !ADMIN_FONCTIONS.has(value);
}

function specialtyOf(raw) {
  if (raw === "explosives") return "explosives";
  if (raw === "narcotics" || raw === "currency") return "narcotics";
  return null;
}

function main() {
  const db = new Database(dbPath, { readonly: true, timeout: 3000 });
  const today = todayISO();

  const agents = db
    .prepare(
      `SELECT
         a.id,
         a.active,
         COALESCE(NULLIF(trim(a.fonction), ''), 'cynotechnicien') AS fonction,
         a.dog_id,
         d.specialty AS dog_specialty
       FROM agents a
       LEFT JOIN dogs d ON d.id = a.dog_id`,
    )
    .all();

  const exclusionColumns = db.prepare(`PRAGMA table_info(agent_exclusions)`).all().map((c) => c.name);
  const hasSoftDelete = exclusionColumns.includes("is_deleted");

  const exclusions = db
    .prepare(
      `SELECT agent_id, dog_id, exclusion_type, start_date, end_date, active
       FROM agent_exclusions
       WHERE active = 1
         AND start_date <= ?
         AND end_date >= ?
         ${hasSoftDelete ? "AND is_deleted = 0" : ""}`,
    )
    .all(today, today);

  const agentExcluded = new Set();
  const dogExcluded = new Set();
  for (const row of exclusions) {
    if (row.agent_id && AGENT_LEVEL.has(row.exclusion_type)) agentExcluded.add(row.agent_id);
    if (row.dog_id && DOG_LEVEL.has(row.exclusion_type)) dogExcluded.add(row.dog_id);
  }

  const bySpecialty = { narcotics: 0, explosives: 0 };
  const excludedBySpecialty = { narcotics: 0, explosives: 0 };
  let withoutDog = 0;
  let activeCynotechniciens = 0;
  let expiredStillFlagged = 0;

  for (const agent of agents) {
    if (!isCynotechnicien(agent.fonction)) continue;
    const hasDog = Boolean(agent.dog_id);
    if (!hasDog) withoutDog += 1;
    const specialty = specialtyOf(agent.dog_specialty);
    if (specialty) bySpecialty[specialty] += 1;

    const excluded = agentExcluded.has(agent.id) || (agent.dog_id && dogExcluded.has(agent.dog_id));
    if (agent.active !== 1) continue;
    if (excluded) {
      if (specialty) excludedBySpecialty[specialty] += 1;
    } else {
      activeCynotechniciens += 1;
    }
  }

  expiredStillFlagged = db
    .prepare(
      `SELECT COUNT(*) AS c FROM agent_exclusions
       WHERE active = 1 AND end_date < ?
       ${hasSoftDelete ? "AND is_deleted = 0" : ""}`,
    )
    .get(today).c;

  const report = {
    dbPath,
    today,
    dashboardCounts: {
      totalFonctionnaires: agents.length,
      cynotechniciensBySpecialty: bySpecialty,
      activeCynotechniciens,
      cynotechniciensWithoutDog: withoutDog,
      excludedCynotechniciensBySpecialty: excludedBySpecialty,
    },
    sanity: {
      administrative: agents.filter((a) => !isCynotechnicien(a.fonction)).length,
      cynotechniciens: agents.filter((a) => isCynotechnicien(a.fonction)).length,
      currentExclusionsLoaded: exclusions.length,
      expiredExclusionsStillActiveFlag: expiredStillFlagged,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  db.close();

  const personnel = report.dashboardCounts;
  const specialtySum = personnel.cynotechniciensBySpecialty.narcotics + personnel.cynotechniciensBySpecialty.explosives;
  if (specialtySum + personnel.cynotechniciensWithoutDog > report.sanity.cynotechniciens) {
    console.error("[verify-dashboard] FAILED — specialty + sans chien exceeds cynotechniciens");
    process.exit(1);
  }

  console.log(
    `[verify-dashboard] OK — total=${personnel.totalFonctionnaires} cyno=${report.sanity.cynotechniciens} admin=${report.sanity.administrative} stup=${personnel.cynotechniciensBySpecialty.narcotics} expl=${personnel.cynotechniciensBySpecialty.explosives} actifs=${personnel.activeCynotechniciens} sansChien=${personnel.cynotechniciensWithoutDog} exclusStup=${personnel.excludedCynotechniciensBySpecialty.narcotics} exclusExpl=${personnel.excludedCynotechniciensBySpecialty.explosives} expiredFlagged=${expiredStillFlagged}`,
  );
}

main();
