/**
 * Verify dog operational status is derived from active exclusions.
 *
 * Flow against a disposable temp exclusion (rolled back):
 * 1) Create En chaleur → status female_dog_heat
 * 2) Change to Malade → status dog_sick
 * 3) Delete → status available
 *
 * Usage:
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/verify-dog-status-from-exclusions.cjs
 */
const { app } = require("electron");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");

app.setName("CynoPlanning");
app.setPath("userData", join(app.getPath("appData"), "CynoPlanning"));

const PRIORITY = {
  female_dog_heat: 0,
  dog_sick: 1,
  dog_injured: 2,
  dog_vet_visit: 3,
  dog_training: 4,
  dog_temporary_retirement: 5,
  dog_other: 6,
};

const DOG_TYPES = new Set(Object.keys(PRIORITY));

function isActive(row, day) {
  return row.active === 1 || row.active === true
    ? row.start_date <= day && day <= row.end_date
    : false;
}

function derive(dogId, rows, day) {
  const active = rows.filter(
    (r) => r.dog_id === dogId && DOG_TYPES.has(r.exclusion_type) && isActive(r, day),
  );
  if (active.length === 0) return "available";
  active.sort(
    (a, b) => (PRIORITY[a.exclusion_type] ?? 100) - (PRIORITY[b.exclusion_type] ?? 100),
  );
  return active[0].exclusion_type;
}

app.whenReady().then(() => {
  try {
    const Database = require("better-sqlite3");
    const dbPath = join(app.getPath("userData"), "cynoplanning.db");
    const db = new Database(dbPath);
    const day = new Date().toISOString().slice(0, 10);

    const dog = db
      .prepare("SELECT id, name, status AS stored_status FROM dogs ORDER BY name LIMIT 1")
      .get();
    if (!dog) throw new Error("No dogs in database");

    const agent = db
      .prepare("SELECT id FROM agents WHERE dog_id = ? LIMIT 1")
      .get(dog.id);

    const results = [];
    const assertEq = (name, actual, expected) => {
      const ok = actual === expected;
      results.push({ name, ok, actual, expected });
      if (!ok) throw new Error(`${name}: expected ${expected}, got ${actual}`);
      console.log("OK", name, "→", actual);
    };

    // Pure unit checks (no DB mutation)
    assertEq(
      "create-heat",
      derive(dog.id, [
        {
          dog_id: dog.id,
          exclusion_type: "female_dog_heat",
          active: 1,
          start_date: day,
          end_date: day,
        },
      ], day),
      "female_dog_heat",
    );
    assertEq(
      "change-to-sick",
      derive(dog.id, [
        {
          dog_id: dog.id,
          exclusion_type: "dog_sick",
          active: 1,
          start_date: day,
          end_date: day,
        },
      ], day),
      "dog_sick",
    );
    assertEq("delete-exclusion", derive(dog.id, [], day), "available");
    assertEq(
      "priority-heat-over-sick",
      derive(dog.id, [
        {
          dog_id: dog.id,
          exclusion_type: "dog_sick",
          active: 1,
          start_date: day,
          end_date: day,
        },
        {
          dog_id: dog.id,
          exclusion_type: "female_dog_heat",
          active: 1,
          start_date: day,
          end_date: day,
        },
      ], day),
      "female_dog_heat",
    );
    assertEq(
      "disabled-exclusion",
      derive(dog.id, [
        {
          dog_id: dog.id,
          exclusion_type: "dog_sick",
          active: 0,
          start_date: day,
          end_date: day,
        },
      ], day),
      "available",
    );

    // Live DB round-trip inside a rolled-back transaction
    const exclId = randomUUID();
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO agent_exclusions (
          id, agent_id, dog_id, exclusion_type, start_date, end_date, notes, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        exclId,
        agent?.id ?? null,
        dog.id,
        "female_dog_heat",
        day,
        day,
        "verify-dog-status temp",
        now,
        now,
      );

      let rows = db
        .prepare(
          `SELECT dog_id, exclusion_type, start_date, end_date, active
           FROM agent_exclusions WHERE dog_id = ?`,
        )
        .all(dog.id);
      assertEq("db-create-heat", derive(dog.id, rows, day), "female_dog_heat");

      db.prepare(`UPDATE agent_exclusions SET exclusion_type = 'dog_sick' WHERE id = ?`).run(
        exclId,
      );
      rows = db
        .prepare(
          `SELECT dog_id, exclusion_type, start_date, end_date, active
           FROM agent_exclusions WHERE dog_id = ?`,
        )
        .all(dog.id);
      assertEq("db-change-sick", derive(dog.id, rows, day), "dog_sick");

      db.prepare(`DELETE FROM agent_exclusions WHERE id = ?`).run(exclId);
      rows = db
        .prepare(
          `SELECT dog_id, exclusion_type, start_date, end_date, active
           FROM agent_exclusions WHERE dog_id = ?`,
        )
        .all(dog.id);
      // May still have other real exclusions for this dog — only assert temp is gone
      const tempGone = !rows.some(
        (r) => r.exclusion_type === "dog_sick" && r.start_date === day && r.end_date === day,
      );
      if (!tempGone) throw new Error("temp exclusion still present after delete");
      console.log("OK", "db-delete-temp");

      // Force rollback so live data is untouched
      throw new Error("ROLLBACK_OK");
    });

    try {
      tx();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "ROLLBACK_OK") throw error;
    }

    // Live snapshot: dogs with active exclusions today
    const live = db
      .prepare(
        `SELECT d.id, d.name, d.status AS stored_status, e.exclusion_type, e.start_date, e.end_date, e.active
         FROM dogs d
         LEFT JOIN agent_exclusions e
           ON e.dog_id = d.id
          AND e.active = 1
          AND e.start_date <= ?
          AND e.end_date >= ?
         ORDER BY d.name`,
      )
      .all(day, day);

    const byDog = new Map();
    for (const row of live) {
      const entry = byDog.get(row.id) ?? {
        id: row.id,
        name: row.name,
        stored_status: row.stored_status,
        exclusions: [],
      };
      if (row.exclusion_type) {
        entry.exclusions.push({
          dog_id: row.id,
          exclusion_type: row.exclusion_type,
          start_date: row.start_date,
          end_date: row.end_date,
          active: row.active,
        });
      }
      byDog.set(row.id, entry);
    }

    const samples = [...byDog.values()]
      .filter((d) => d.exclusions.length > 0)
      .slice(0, 8)
      .map((d) => ({
        name: d.name,
        stored_status: d.stored_status,
        computed_status: derive(d.id, d.exclusions, day),
      }));

    console.log(
      JSON.stringify(
        {
          dogSample: dog.name,
          day,
          unitAndDbChecks: results.length,
          dogsWithActiveExclusions: samples,
        },
        null,
        2,
      ),
    );

    db.close();
    app.exit(0);
  } catch (error) {
    console.error("VERIFY_FAILED", error instanceof Error ? error.message : error);
    app.exit(1);
  }
});
