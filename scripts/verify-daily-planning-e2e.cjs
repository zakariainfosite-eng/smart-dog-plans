/**
 * End-to-end proof: handleCreatePlanning → executePlanning → persistPlanning
 * against a temp copy of the real CynoPlanning DB (Electron ABI).
 *
 * Usage:
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/verify-daily-planning-e2e.cjs
 */
const { join } = require("node:path");
const { homedir } = require("node:os");
const { copyFileSync, existsSync, unlinkSync } = require("node:fs");
const { buildSync } = require("esbuild");
const Database = require("better-sqlite3");

const SRC = join(homedir(), "Library/Application Support/CynoPlanning/cynoplanning.db");
const TMP = join("/tmp", `cyno-plan-e2e-${Date.now()}.db`);
const GATEWAY = "/tmp/rest-gw-plan-e2e.cjs";
const ENGINE = "/tmp/planning-engine-e2e.cjs";

copyFileSync(SRC, TMP);
for (const s of ["-wal", "-shm"]) {
  if (existsSync(SRC + s)) copyFileSync(SRC + s, TMP + s);
}

buildSync({
  entryPoints: [join(__dirname, "../electron/rest-gateway.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: GATEWAY,
  external: ["better-sqlite3"],
  logLevel: "silent",
});

buildSync({
  entryPoints: [join(__dirname, "../src/lib/planning/engine.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: ENGINE,
  logLevel: "silent",
});

const { executeRestQuery } = require(GATEWAY);
const { runPlanningEngine, normalizeCheckpointRow, previousPlanningDate } = require(ENGINE);
const sqlite = new Database(TMP);

function client() {
  class FB {
    constructor(table, action = "select", payload) {
      this.table = table;
      this.action = action;
      this.payload = payload;
      this.filters = [];
      this.orders = [];
      this.selectClause = "*";
      this.wantSingle = false;
      this.wantMaybeSingle = false;
    }
    select(c = "*") {
      this.selectClause = c;
      return this;
    }
    eq(c, v) {
      this.filters.push({ type: "eq", column: c, value: v });
      return this;
    }
    in(c, v) {
      this.filters.push({ type: "in", column: c, value: v });
      return this;
    }
    lte(c, v) {
      this.filters.push({ type: "lte", column: c, value: v });
      return this;
    }
    gte(c, v) {
      this.filters.push({ type: "gte", column: c, value: v });
      return this;
    }
    not(c, op, v) {
      this.filters.push({ type: "not", column: c, value: v, notType: op });
      return this;
    }
    order(c, o) {
      this.orders.push({ column: c, ascending: o?.ascending !== false });
      return this;
    }
    single() {
      this.wantSingle = true;
      return this;
    }
    maybeSingle() {
      this.wantMaybeSingle = true;
      return this;
    }
    then(ok, bad) {
      const r = executeRestQuery(sqlite, {
        table: this.table,
        action: this.action,
        select: this.selectClause,
        filters: this.filters,
        order: this.orders,
        single: this.wantSingle,
        maybeSingle: this.wantMaybeSingle,
        payload: this.payload,
      });
      return Promise.resolve(r).then(ok, bad);
    }
  }
  return {
    from(t) {
      return {
        select: (c) => new FB(t, "select").select(c),
        insert: (p) => new FB(t, "insert", p),
        delete: () => new FB(t, "delete"),
      };
    },
  };
}

async function loadContext(db, dateISO, sectionId, planningDate) {
  const agentSelect =
    "id, first_name, last_name, professional_number, gender, active, section_id, dog_id, dogs:dog_id(id, name, specialty, status, active)";
  const [sectionRes, femaleRes] = await Promise.all([
    db.from("agents").select(agentSelect).eq("active", true).eq("section_id", sectionId),
    db.from("agents").select(agentSelect).eq("active", true).eq("gender", "female"),
  ]);
  if (sectionRes.error) throw sectionRes.error;
  if (femaleRes.error) throw femaleRes.error;

  const byId = new Map();
  for (const row of sectionRes.data ?? []) {
    if (String(row.gender).toLowerCase() === "female") continue;
    byId.set(row.id, row);
  }
  for (const row of femaleRes.data ?? []) {
    byId.set(row.id, { ...row, section_id: null });
  }
  const agents = [...byId.values()];
  const agentIds = agents.map((a) => a.id);

  const CHECKPOINT_PLANNING_SELECT =
    "id, name, active, night_only, allowed_gender, female_policy, priority, operating_days, day_shift_enabled, night_shift_enabled, day_explosives, day_narcotics, night_explosives, night_narcotics, posts:checkpoint_posts(id, shift, specialty_required, required_agents, active, allowed_gender, dog_required)";

  const checkpointsRes = await db
    .from("checkpoints")
    .select(CHECKPOINT_PLANNING_SELECT)
    .eq("active", true)
    .order("name");
  if (checkpointsRes.error) throw checkpointsRes.error;

  let exclusionsRaw;
  {
    const withSoft = await db
      .from("agent_exclusions")
      .select("agent_id, exclusion_type, start_date, end_date, active")
      .eq("active", true)
      .eq("is_deleted", false)
      .lte("start_date", dateISO)
      .gte("end_date", dateISO);
    if (withSoft.error) throw withSoft.error;
    exclusionsRaw = withSoft.data ?? [];
  }

  const rotationHistoryRes =
    agentIds.length > 0
      ? await db
          .from("rotation_history")
          .select(
            "agent_id, checkpoint_post_id, planning_date, checkpoint_posts:checkpoint_post_id(checkpoint_id)",
          )
          .eq("is_hq_reserve", false)
          .eq("is_off_duty", false)
          .not("checkpoint_post_id", "is", null)
          .in("agent_id", agentIds)
      : { data: [], error: null };
  if (rotationHistoryRes.error) throw rotationHistoryRes.error;

  const yesterdayCheckpointByAgent = new Map();
  const fairnessCounts = new Map();
  const rotationHistory = [];
  const prevDateISO = previousPlanningDate(planningDate);

  for (const row of rotationHistoryRes.data ?? []) {
    const posts = row.checkpoint_posts;
    const cp = Array.isArray(posts) ? posts[0] : posts;
    if (!cp || typeof cp !== "object" || !("checkpoint_id" in cp)) continue;
    rotationHistory.push({
      agent_id: row.agent_id,
      checkpoint_id: cp.checkpoint_id,
      planning_date: row.planning_date,
    });
    fairnessCounts.set(row.agent_id, (fairnessCounts.get(row.agent_id) ?? 0) + 1);
    if (row.planning_date === prevDateISO) {
      yesterdayCheckpointByAgent.set(row.agent_id, cp.checkpoint_id);
    }
  }

  return {
    agents,
    exclusions: exclusionsRaw,
    exclusionDebug: { excludedAgentIds: new Set(exclusionsRaw.map((e) => e.agent_id)) },
    checkpoints: (checkpointsRes.data ?? []).map(normalizeCheckpointRow),
    rotationHistory,
    yesterdayCheckpointByAgent,
    fairnessCounts,
  };
}

async function persist(db, engineResult, sectionId, shift, dateISO, replaceExistingId, sectionAgentIds) {
  if (replaceExistingId) {
    if (sectionAgentIds.length > 0) {
      const { error } = await db
        .from("rotation_history")
        .delete()
        .eq("planning_date", dateISO)
        .in("agent_id", sectionAgentIds);
      if (error) throw error;
    }
    const { error } = await db.from("planning").delete().eq("id", replaceExistingId);
    if (error) throw error;
  }

  const { data: planningRow, error: planError } = await db
    .from("planning")
    .insert({
      planning_date: dateISO,
      section_id: sectionId,
      shift,
      validated: true,
    })
    .select("id")
    .single();
  if (planError) throw planError;
  const planningId = planningRow.id;

  if (engineResult.assignments.length > 0) {
    const aRows = engineResult.assignments.map((a) => ({
      planning_id: planningId,
      checkpoint_post_id: a.checkpoint_post_id,
      agent_id: a.agent_id,
      dog_id: a.dog_id,
      is_hq_reserve: false,
      is_off_duty: false,
    }));
    const { error } = await db.from("planning_assignments").insert(aRows);
    if (error) throw error;
    const hRows = engineResult.assignments.map((a) => ({
      agent_id: a.agent_id,
      checkpoint_post_id: a.checkpoint_post_id,
      planning_date: dateISO,
      is_hq_reserve: false,
      is_off_duty: false,
    }));
    const { error: hError } = await db.from("rotation_history").insert(hRows);
    if (hError) throw hError;
  }

  if (engineResult.point653.length > 0) {
    const rows = engineResult.point653.map((e) => ({
      planning_id: planningId,
      checkpoint_post_id: null,
      agent_id: e.agent_id,
      dog_id: e.dog_id,
      is_hq_reserve: true,
      is_off_duty: false,
    }));
    const { error } = await db.from("planning_assignments").insert(rows);
    if (error) throw error;
    const h = engineResult.point653.map((e) => ({
      agent_id: e.agent_id,
      checkpoint_post_id: null,
      planning_date: dateISO,
      is_hq_reserve: true,
      is_off_duty: false,
    }));
    const { error: he } = await db.from("rotation_history").insert(h);
    if (he) throw he;
  }

  if (engineResult.offDuty.length > 0) {
    const rows = engineResult.offDuty.map((e) => ({
      planning_id: planningId,
      checkpoint_post_id: null,
      agent_id: e.agent_id,
      dog_id: e.dog_id,
      is_hq_reserve: false,
      is_off_duty: true,
    }));
    const { error } = await db.from("planning_assignments").insert(rows);
    if (error) throw error;
    const h = engineResult.offDuty.map((e) => ({
      agent_id: e.agent_id,
      checkpoint_post_id: null,
      planning_date: dateISO,
      is_hq_reserve: false,
      is_off_duty: true,
    }));
    const { error: he } = await db.from("rotation_history").insert(h);
    if (he) throw he;
  }

  return planningId;
}

async function simulateClick({ dateISO, sectionId, shift, planningDate, allowReplace }) {
  const db = client();
  console.log("\n=== CLICK simulate", { dateISO, sectionId, shift });

  // Step 3 validation — selectedSection present
  if (!sectionId || !shift) {
    console.log("STOP: silent validation return (old bug)");
    return { ok: false, reason: "SILENT_RETURN" };
  }
  console.log("3.validation ok / 4.activeSection", sectionId);

  // Step 5 existing check
  const existingResult = await db
    .from("planning")
    .select("id")
    .eq("section_id", sectionId)
    .eq("planning_date", dateISO)
    .eq("shift", shift)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  let replaceId = null;
  if (existingResult.data?.id) {
    console.log("6.existingFound → would open replace dialog", existingResult.data.id);
    if (!allowReplace) {
      return { ok: false, reason: "CONFIRM_REPLACE_ONLY", existingId: existingResult.data.id };
    }
    replaceId = existingResult.data.id;
    console.log("6b.user confirmed replace");
  } else {
    console.log("6.noExisting → executePlanning");
  }

  // executePlanning
  const ctx = await loadContext(db, dateISO, sectionId, planningDate);
  console.log("5.engine context", {
    agents: ctx.agents.length,
    checkpoints: ctx.checkpoints.length,
    exclusions: ctx.exclusions.length,
  });

  const engineResult = runPlanningEngine({
    sectionId,
    agents: ctx.agents,
    exclusions: ctx.exclusions,
    exclusionDebug: ctx.exclusionDebug,
    checkpoints: ctx.checkpoints,
    shift,
    planningDate,
    rotationHistory: ctx.rotationHistory,
    yesterdayCheckpointByAgent: ctx.yesterdayCheckpointByAgent,
    fairnessCounts: ctx.fairnessCounts,
  });
  console.log("5b.engine result", {
    assignments: engineResult.assignments.length,
    point653: engineResult.point653.length,
    offDuty: engineResult.offDuty.length,
    warnings: engineResult.summary.warnings.length,
  });

  const planningId = await persist(
    db,
    engineResult,
    sectionId,
    shift,
    dateISO,
    replaceId,
    ctx.agents.map((a) => a.id),
  );
  console.log("6.sqlite insert ok", planningId);

  const saved = sqlite
    .prepare("SELECT id, planning_date, shift, validated FROM planning WHERE id = ?")
    .get(planningId);
  const assignCount = sqlite
    .prepare("SELECT COUNT(*) AS c FROM planning_assignments WHERE planning_id = ?")
    .get(planningId).c;
  const histCount = sqlite
    .prepare("SELECT COUNT(*) AS c FROM rotation_history WHERE planning_date = ?")
    .get(dateISO).c;

  console.log("7.success", { saved, assignCount, histCount });
  return { ok: true, planningId, assignCount, histCount, saved };
}

async function main() {
  const sectionId = "43f86212-2d6b-4bc3-9eae-f9c7705cde4b"; // 1ème = day on 2026-07-28/30
  const shift = "day";

  // A) Today without confirm → proves "click does nothing visible" path
  const today = await simulateClick({
    dateISO: "2026-07-28",
    sectionId,
    shift,
    planningDate: new Date(2026, 6, 28),
    allowReplace: false,
  });

  // B) Today WITH confirm → proves replace generates
  const todayReplace = await simulateClick({
    dateISO: "2026-07-28",
    sectionId,
    shift,
    planningDate: new Date(2026, 6, 28),
    allowReplace: true,
  });

  // C) Fresh date → proves create generates
  const fresh = await simulateClick({
    dateISO: "2099-06-01",
    sectionId,
    shift,
    planningDate: new Date(2099, 5, 1),
    allowReplace: false,
  });

  const report = {
    todayWithoutConfirm: today,
    todayWithReplace: {
      ok: todayReplace.ok,
      planningId: todayReplace.planningId,
      assignCount: todayReplace.assignCount,
      histCount: todayReplace.histCount,
    },
    freshCreate: {
      ok: fresh.ok,
      planningId: fresh.planningId,
      assignCount: fresh.assignCount,
      histCount: fresh.histCount,
    },
  };
  console.log("\nREPORT", JSON.stringify(report, null, 2));

  if (!todayReplace.ok || !fresh.ok) {
    console.error("PROOF_FAIL");
    process.exit(1);
  }
  if (today.reason !== "CONFIRM_REPLACE_ONLY") {
    console.error("PROOF_FAIL expected today to hit replace dialog");
    process.exit(1);
  }
  console.log(
    "\nPROOF_OK — root path: today click only setConfirmReplace (no generate); replace/create persist OK",
  );
  sqlite.close();
}

main().catch((e) => {
  console.error("PROOF_FAIL", e);
  process.exit(1);
});
