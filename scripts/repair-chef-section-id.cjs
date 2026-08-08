/**
 * One-shot repair for Chefs whose section_id was cleared by the old
 * syncSectionChiefLink (when an Adjoint in the same section was saved).
 *
 * SAFE: creates a timestamped .bak copy first. Does NOT delete userData.
 * Quit CynoPlanning before running.
 *
 * Usage:
 *   env -u ELECTRON_RUN_AS_NODE electron scripts/repair-chef-section-id.cjs
 *
 * Optional:
 *   CHEF_ID=<uuid> SECTION_ID=<uuid>  — repair a specific pair
 */
const { app } = require("electron");
const { copyFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const Database = require("better-sqlite3");

function fail(message) {
  console.error("FAIL", message);
  process.exit(1);
}

// Open the real CynoPlanning DB path without taking the app singleton name.
const liveDb = join(
  app.getPath("home"),
  "Library/Application Support/CynoPlanning/cynoplanning.db",
);
app.setName("CynoPlanningRepairChefSection");
app.setPath("userData", join(app.getPath("temp"), `cyno-repair-chef-${Date.now()}`));

app.whenReady().then(() => {
  const dbPath = liveDb;
  if (!existsSync(dbPath)) fail(`DB missing: ${dbPath}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${dbPath}.pre-chef-section-repair.${stamp}.bak`;
  copyFileSync(dbPath, bak);
  for (const side of ["-wal", "-shm"]) {
    if (existsSync(dbPath + side)) copyFileSync(dbPath + side, bak + side);
  }
  console.log("Backup:", bak);

  const db = new Database(dbPath);
  try {
    const chefId = process.env.CHEF_ID || null;
    const sectionId = process.env.SECTION_ID || null;

    let repairs = [];
    if (chefId && sectionId) {
      repairs = [{ chefId, sectionId }];
    } else {
      // Heuristic: permanent Chef with NULL section_id, and exactly one Adjoint
      // in a section whose commander_mle matches that Adjoint (corrupt interim write).
      const orphanChefs = db
        .prepare(
          `SELECT id, first_name, last_name, professional_number, grade
           FROM agents
           WHERE fonction = 'chef_de_section' AND section_id IS NULL AND active = 1`,
        )
        .all();

      for (const chef of orphanChefs) {
        const hit = db
          .prepare(
            `SELECT s.id AS section_id, s.name, a.id AS adjoint_id, a.professional_number
             FROM sections s
             JOIN agents a ON a.section_id = s.id
              AND a.fonction = 'chef_de_section_pi'
              AND a.active = 1
             WHERE s.commander_mle = a.professional_number
               AND NOT EXISTS (
                 SELECT 1 FROM agents c
                 WHERE c.fonction = 'chef_de_section'
                   AND c.section_id = s.id
                   AND c.active = 1
               )
             LIMIT 1`,
          )
          .get();
        if (hit) {
          repairs.push({
            chefId: chef.id,
            sectionId: hit.section_id,
            chefName: `${chef.first_name} ${chef.last_name}`,
            sectionName: hit.name,
            adjointId: hit.adjoint_id,
            chefMle: chef.professional_number,
            chefGrade: chef.grade,
          });
        }
      }
    }

    if (repairs.length === 0) {
      console.log("No orphan Chef/Adjoint pairs found — nothing to repair.");
      db.close();
      app.exit(0);
      return;
    }

    const run = db.transaction(() => {
      for (const row of repairs) {
        const chef =
          row.chefMle != null
            ? row
            : {
                ...row,
                ...db
                  .prepare(
                    `SELECT first_name || ' ' || last_name AS chefName,
                            professional_number AS chefMle, grade AS chefGrade
                     FROM agents WHERE id = ?`,
                  )
                  .get(row.chefId),
              };

        db.prepare(
          `UPDATE agents
           SET section_id = ?, is_section_chief = 1, updated_at = datetime('now')
           WHERE id = ? AND fonction = 'chef_de_section'`,
        ).run(row.sectionId, row.chefId);

        db.prepare(
          `UPDATE agents
           SET is_section_chief = 0, updated_at = datetime('now')
           WHERE section_id = ?
             AND fonction = 'chef_de_section_pi'`,
        ).run(row.sectionId);

        const name = db
          .prepare(`SELECT first_name, last_name, grade, professional_number FROM agents WHERE id = ?`)
          .get(row.chefId);
        const fullName = [name.first_name, name.last_name].filter(Boolean).join(" ");
        db.prepare(
          `UPDATE sections SET
             commander_full_name = ?,
             commander_grade = ?,
             commander_mle = ?,
             updated_at = datetime('now')
           WHERE id = ?`,
        ).run(fullName, name.grade, name.professional_number, row.sectionId);

        console.log(
          `Repaired: ${fullName} → section ${row.sectionId} (commander restored, Adjoint is_section_chief cleared)`,
        );
      }
    });
    run();

    db.close();
    console.log(`Done. Repaired ${repairs.length} Chef(s). Restart CynoPlanning.`);
    app.exit(0);
  } catch (error) {
    db.close();
    fail(error instanceof Error ? error.stack || error.message : String(error));
  }
});
