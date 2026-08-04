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

function compute(sectionId, agents, exclusions, day) {
  const members = agents.filter((a) => a.section_id === sectionId);
  const memberIds = new Set(members.map((a) => a.id));
  let available = 0;
  let unavailable = 0;
  for (const agent of members) {
    const excluded = exclusions.some(
      (e) =>
        e.agent_id === agent.id &&
        AGENT_LEVEL.has(e.exclusion_type) &&
        (e.active === 1 || e.active === true) &&
        e.start_date <= day &&
        day <= e.end_date,
    );
    if (excluded) unavailable += 1;
    else available += 1;
  }
  const activeExclusions = exclusions.filter(
    (e) =>
      e.agent_id &&
      memberIds.has(e.agent_id) &&
      AGENT_LEVEL.has(e.exclusion_type) &&
      (e.active === 1 || e.active === true) &&
      e.start_date <= day &&
      day <= e.end_date,
  ).length;
  return {
    assigned: members.length,
    available,
    unavailable,
    activeExclusions,
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
      .prepare("SELECT id, section_id, first_name, last_name, active FROM agents")
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
      if (stats.available + stats.unavailable !== stats.assigned) {
        throw new Error(`${section.name}: available+unavailable != assigned`);
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
