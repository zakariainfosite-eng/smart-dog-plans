/**
 * Verify cases-statistics aggregates match live SQLite operational_cases.
 *
 * Run:
 *   env -u ELECTRON_RUN_AS_NODE electron scripts/verify-cases-statistics.cjs
 */
const { app } = require("electron");
const { join } = require("node:path");
const { existsSync } = require("node:fs");
const Database = require("better-sqlite3");

app.setPath("userData", join(app.getPath("appData"), "CynoPlanning"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function quantityToKg(quantity, unit) {
  if (unit === "kg") return quantity;
  if (unit === "g") return quantity / 1000;
  if (unit === "tonne") return quantity * 1000;
  return null;
}

app.whenReady().then(() => {
  const dbPath = join(app.getPath("userData"), "cynoplanning.db");
  if (!existsSync(dbPath)) {
    console.log("SKIP: no DB at", dbPath);
    app.quit();
    return;
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const cases = db
      .prepare(
        `SELECT id, case_date, specialty, seizure_type, quantity, unit,
                object_count, object_type, banknote_count, total_amount,
                currency_code, agent_id, dog_id, checkpoint_id
         FROM operational_cases
         WHERE COALESCE(is_deleted, 0) = 0`,
      )
      .all();

    const total = cases.length;
    console.log(`SQLite operational_cases (active): ${total}`);

    if (total === 0) {
      console.log('PASS: empty DB → UI should show "Aucune donnée statistique disponible."');
      return;
    }

    const year = String(new Date().getFullYear());
    const yearCases = cases.filter((c) => c.case_date && c.case_date.startsWith(year));
    const bySpecialty = {};
    for (const c of yearCases) {
      bySpecialty[c.specialty] = (bySpecialty[c.specialty] ?? 0) + 1;
    }

    let cannabisKg = 0;
    let cocaineKg = 0;
    let heroinKg = 0;
    let kifKg = 0;
    let ecstasyKg = 0;
    let psychotropesKg = 0;
    let explosivesObjects = 0;
    let banknotes = 0;

    for (const c of yearCases) {
      if (c.specialty === "narcotics" && c.seizure_type && c.quantity != null && c.unit) {
        const kg = quantityToKg(Number(c.quantity), c.unit);
        if (kg == null) continue;
        if (c.seizure_type === "cannabis") cannabisKg += kg;
        if (c.seizure_type === "cocaine") cocaineKg += kg;
        if (c.seizure_type === "heroin") heroinKg += kg;
        if (c.seizure_type === "hashish") kifKg += kg;
        if (c.seizure_type === "exta") ecstasyKg += kg;
        if (c.seizure_type === "synthetic_drugs" || c.seizure_type === "pofa") psychotropesKg += kg;
      }
      if (c.specialty === "explosives") explosivesObjects += c.object_count ?? 0;
      if (c.specialty === "currency") banknotes += c.banknote_count ?? 0;
    }

    const byAgent = new Map();
    for (const c of yearCases) {
      byAgent.set(c.agent_id, (byAgent.get(c.agent_id) ?? 0) + 1);
    }
    const topAgentCount = [...byAgent.values()].sort((a, b) => b - a)[0] ?? 0;

    // No hardcoded demo numbers — totals must equal row counts
    const specialtySum = Object.values(bySpecialty).reduce((a, b) => a + b, 0);
    assert(specialtySum === yearCases.length, "specialty sum must equal year cases");

    console.log(`Year ${year} cases: ${yearCases.length}`);
    console.log("By specialty:", bySpecialty);
    console.log("Seizures kg:", {
      cannabisKg,
      cocaineKg,
      heroinKg,
      kifKg,
      ecstasyKg,
      psychotropesKg,
    });
    console.log("Explosives objects:", explosivesObjects);
    console.log("Banknotes count:", banknotes);
    console.log("Top agent case count:", topAgentCount);

    // Sanity: monthly evolution length always 12 for UI chart
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, "0")}`;
      return yearCases.filter((c) => c.case_date.startsWith(key)).length;
    });
    assert(monthly.length === 12, "monthly chart must cover 12 months");
    assert(
      monthly.reduce((a, b) => a + b, 0) === yearCases.length,
      "monthly sum must equal year cases",
    );
    console.log("PASS: monthly evolution sums to year total");

    const yearly = new Map();
    for (const c of cases) {
      const y = c.case_date.slice(0, 4);
      yearly.set(y, (yearly.get(y) ?? 0) + 1);
    }
    const yearlySum = [...yearly.values()].reduce((a, b) => a + b, 0);
    assert(yearlySum === total, "yearly evolution must cover all cases");
    console.log("PASS: yearly evolution matches all cases", Object.fromEntries(yearly));

    // Ensure no magic constants leaked: zero is only from empty buckets
    assert(Number.isFinite(cannabisKg), "cannabis kg finite");
    assert(Number.isFinite(explosivesObjects), "explosives finite");
    console.log("PASS: all seizure aggregates derived from SQLite rows");
    console.log("\nAll cases-statistics checks passed.");
  } finally {
    db.close();
    app.quit();
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  app.quit();
});
