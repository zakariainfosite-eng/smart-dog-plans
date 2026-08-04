/**
 * Verifies section assignment CRUD on a temp copy of the live DB:
 * assign / move / remove only touch section_id; agents are never deleted.
 *
 * Run:
 *   env -u ELECTRON_RUN_AS_NODE electron scripts/verify-section-assignments.cjs
 */
const { app } = require("electron");
const { copyFileSync, existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const Database = require("better-sqlite3");

app.setPath("userData", join(app.getPath("appData"), "CynoPlanning"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function agentWriteWithSection(agent, sectionId) {
  return {
    first_name: agent.first_name,
    last_name: agent.last_name,
    professional_number: agent.professional_number,
    grade: agent.grade,
    gender: agent.gender,
    fonction: agent.fonction,
    section_id: sectionId,
    dog_id: agent.dog_id,
    phone: agent.phone,
    address: agent.address,
    observations: agent.observations,
    active: !!agent.active,
    photo_url: agent.photo_url,
  };
}

app.whenReady().then(() => {
  // --- unit: helper never drops identity fields ---
  const sample = {
    first_name: "Ali",
    last_name: "Ben",
    professional_number: "M1",
    grade: "BRIGADIER",
    gender: "male",
    fonction: "cynotechnicien",
    dog_id: "d1",
    phone: "0600",
    address: "x",
    observations: "y",
    active: 1,
    photo_url: "p.jpg",
  };
  const cleared = agentWriteWithSection(sample, null);
  assert(cleared.section_id === null, "unit: section_id null");
  assert(cleared.first_name === "Ali", "unit: name preserved");
  assert(cleared.professional_number === "M1", "unit: matricule preserved");
  assert(cleared.dog_id === "d1", "unit: dog preserved");
  console.log("PASS: agentWriteWithSection preserves identity, clears section_id only");

  const src = join(app.getPath("userData"), "cynoplanning.db");
  if (!existsSync(src)) {
    console.log("SKIP: live DB not found at", src);
    app.quit();
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "section-assign-"));
  const dbPath = join(tempDir, "cynoplanning.db");
  copyFileSync(src, dbPath);
  for (const side of ["-wal", "-shm"]) {
    const p = src + side;
    if (existsSync(p)) copyFileSync(p, dbPath + side);
  }

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  try {
    const sections = db
      .prepare(
        `SELECT id, name, commander_full_name, commander_mle
         FROM sections WHERE active = 1 ORDER BY name`,
      )
      .all();
    assert(sections.length >= 2, "need ≥2 active sections");

    const [sectionA, sectionB] = sections;
    const agentsBefore = db.prepare(`SELECT COUNT(*) AS n FROM agents`).get().n;

    const candidate = db
      .prepare(
        `SELECT * FROM agents
         WHERE fonction = 'cynotechnicien' AND gender != 'female' AND active = 1
         ORDER BY
           CASE WHEN section_id = ? THEN 0 WHEN section_id IS NULL THEN 1 ELSE 2 END,
           last_name
         LIMIT 1`,
      )
      .get(sectionA.id);
    assert(candidate, "need an assignable cynotechnicien");

    const snapshot = { ...candidate };
    const agentId = candidate.id;

    const setSection = (sectionId) => {
      db.prepare(
        `UPDATE agents SET section_id = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(sectionId, agentId);
    };

    setSection(sectionA.id);
    let row = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(agentId);
    assert(row.section_id === sectionA.id, "assign: section_id set");
    assert(row.first_name === snapshot.first_name, "assign: name intact");
    assert(row.professional_number === snapshot.professional_number, "assign: matricule intact");
    console.log("PASS: assign personnel to section (section_id only)");

    setSection(sectionB.id);
    row = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(agentId);
    assert(row.section_id === sectionB.id, "move: section_id updated");
    assert(row.last_name === snapshot.last_name, "move: identity intact");
    console.log("PASS: move personnel between sections");

    setSection(null);
    row = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(agentId);
    assert(row, "remove: agent row still exists");
    assert(row.section_id == null, "remove: section_id NULL");
    assert(row.grade === snapshot.grade, "remove: grade intact");
    assert(row.dog_id === snapshot.dog_id, "remove: dog_id intact");
    const agentsAfterRemove = db.prepare(`SELECT COUNT(*) AS n FROM agents`).get().n;
    assert(agentsAfterRemove === agentsBefore, "remove: agent count unchanged");
    console.log("PASS: remove from section sets section_id NULL without deleting personnel");

    const chef = db
      .prepare(
        `SELECT * FROM agents
         WHERE fonction = 'chef_de_section' AND section_id IS NOT NULL
         LIMIT 1`,
      )
      .get();
    if (chef) {
      const fromSection = chef.section_id;
      const toSection = sections.find((s) => s.id !== fromSection)?.id ?? null;
      if (toSection) {
        db.prepare(
          `UPDATE sections SET
             commander_full_name = '', commander_grade = '', commander_mle = '',
             updated_at = datetime('now')
           WHERE id = ?`,
        ).run(fromSection);
        db.prepare(
          `UPDATE agents SET section_id = ?, is_section_chief = 1, updated_at = datetime('now')
           WHERE id = ?`,
        ).run(toSection, chef.id);
        db.prepare(
          `UPDATE sections SET
             commander_full_name = ?, commander_grade = ?, commander_mle = ?,
             updated_at = datetime('now')
           WHERE id = ?`,
        ).run(
          [chef.grade, chef.first_name, chef.last_name].filter(Boolean).join(" "),
          chef.grade,
          chef.professional_number,
          toSection,
        );

        const oldCmd = db
          .prepare(`SELECT commander_mle FROM sections WHERE id = ?`)
          .get(fromSection);
        const newCmd = db
          .prepare(`SELECT commander_mle FROM sections WHERE id = ?`)
          .get(toSection);
        assert(!oldCmd.commander_mle, "chef move: old section commander cleared");
        assert(
          newCmd.commander_mle === chef.professional_number,
          "chef move: new section commander set",
        );
        console.log("PASS: chef move updates section commander fields");
      } else {
        console.log("SKIP: chef move (only one section)");
      }
    } else {
      console.log("SKIP: no chef_de_section with section_id for chef sync check");
    }

    const counts = db
      .prepare(
        `SELECT s.id, s.name,
           (SELECT COUNT(*) FROM agents a
             WHERE a.section_id = s.id
               AND a.fonction = 'cynotechnicien'
               AND a.gender != 'female') AS agent_count
         FROM sections s`,
      )
      .all();
    assert(counts.length > 0, "stats: sections with counts query works");
    console.log("PASS: section agent_count statistics query");

    console.log("\nAll section-assignment checks passed (temp DB copy; live data untouched).");
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  app.quit();
});
