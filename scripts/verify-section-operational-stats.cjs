/**
 * Verify section operational stats against live SQLite.
 *
 * Usage:
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/verify-section-operational-stats.cjs
 */
const { app } = require("electron");
const { join } = require("node:path");

app.setName("CynoPlanning");
app.setPath("userData", join(app.getPath("appData"), "CynoPlanning"));

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

const AGENT_PRIORITY = {
  suspension: 0,
  sickness: 1,
  administrative_leave: 2,
  annual_leave: 3,
  special_leave: 4,
  absence: 5,
  mission: 6,
  training: 7,
  other: 8,
};

const DOG_PRIORITY = {
  female_dog_heat: 0,
  dog_sick: 1,
  dog_injured: 2,
  dog_vet_visit: 3,
  dog_training: 4,
  dog_temporary_retirement: 5,
  dog_other: 6,
};

function isActive(e, day) {
  return (
    (e.active === 1 || e.active === true) &&
    e.start_date <= day &&
    day <= e.end_date
  );
}

function pickTop(types) {
  const agentTypes = types.filter((t) => AGENT_LEVEL.has(t));
  if (agentTypes.length > 0) {
    return [...agentTypes].sort(
      (a, b) => (AGENT_PRIORITY[a] ?? 100) - (AGENT_PRIORITY[b] ?? 100),
    )[0];
  }
  const dogTypes = types.filter((t) => t in DOG_PRIORITY || String(t).startsWith("dog_") || t === "female_dog_heat");
  if (dogTypes.length === 0) return null;
  return [...dogTypes].sort(
    (a, b) => (DOG_PRIORITY[a] ?? 100) - (DOG_PRIORITY[b] ?? 100),
  )[0];
}

function bucket(type) {
  if (type === "sickness") return "sickness";
  if (type === "annual_leave" || type === "special_leave" || type === "administrative_leave") {
    return "leave";
  }
  if (type === "training") return "training";
  if (type === "mission") return "mission";
  if (type === "absence") return "absence";
  if (type === "dog_sick") return "dog_sick";
  if (type === "female_dog_heat") return "female_dog_heat";
  if (type === "dog_temporary_retirement") return "dog_temporary_retirement";
  return "other";
}

function compute(sectionId, agents, exclusions, day) {
  const members = agents.filter((a) => a.section_id === sectionId);
  const byReason = {
    sickness: 0,
    leave: 0,
    training: 0,
    mission: 0,
    absence: 0,
    dog_sick: 0,
    female_dog_heat: 0,
    dog_temporary_retirement: 0,
    other: 0,
  };
  let available = 0;
  let activeExclusions = 0;

  for (const agent of members) {
    const types = exclusions
      .filter((e) => {
        if (!isActive(e, day)) return false;
        if (e.agent_id === agent.id) return true;
        if (agent.dog_id && e.dog_id === agent.dog_id) return true;
        return false;
      })
      .map((e) => e.exclusion_type);
    const top = pickTop(types);
    if (!top) {
      available += 1;
      continue;
    }
    activeExclusions += 1;
    byReason[bucket(top)] += 1;
  }

  return {
    assigned: members.length,
    available,
    activeExclusions,
    byReason,
  };
}

app.whenReady().then(() => {
  try {
    const Database = require("better-sqlite3");
    const dbPath = join(app.getPath("userData"), "cynoplanning.db");
    const db = new Database(dbPath, { readonly: true });
    const day = new Date().toISOString().slice(0, 10);

    const sections = db.prepare("SELECT id, name FROM sections ORDER BY name").all();
    const agents = db
      .prepare("SELECT id, section_id, dog_id, first_name, last_name, active FROM agents")
      .all();
    const exclusions = db
      .prepare(
        `SELECT agent_id, dog_id, exclusion_type, start_date, end_date, active
         FROM agent_exclusions
         WHERE IFNULL(is_deleted, 0) = 0`,
      )
      .all();

    const report = sections.map((section) => {
      const stats = compute(section.id, agents, exclusions, day);
      const reasonSum = Object.values(stats.byReason).reduce((a, b) => a + b, 0);
      if (stats.available + reasonSum !== stats.assigned) {
        throw new Error(
          `${section.name}: available+reasons (${stats.available}+${reasonSum}) != assigned (${stats.assigned})`,
        );
      }
      if (reasonSum !== stats.activeExclusions) {
        throw new Error(`${section.name}: reasonSum != activeExclusions`);
      }
      return { name: section.name, ...stats };
    });

    console.log(JSON.stringify({ day, dbPath, sections: report }, null, 2));
    db.close();
    app.exit(0);
  } catch (error) {
    console.error("VERIFY_FAILED", error instanceof Error ? error.message : error);
    app.exit(1);
  }
});
