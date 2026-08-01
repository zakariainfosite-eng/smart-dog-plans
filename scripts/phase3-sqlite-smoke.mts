/**
 * Phase 3 smoke test: verify SQLite REST gateway covers each screen's data needs.
 */
import Database from "better-sqlite3";
import { join } from "node:path";
import { homedir } from "node:os";
import { executeRestQuery } from "../electron/rest-gateway.ts";

const dbPath = join(homedir(), "Library/Application Support/CynoPlanning/cynoplanning.db");
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const checks: Array<{ name: string; run: () => void }> = [];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

checks.push({
  name: "Dashboard counts",
  run: () => {
    for (const table of ["agents", "dogs", "checkpoints", "planning"] as const) {
      const r = executeRestQuery(db, {
        table,
        action: "select",
        select: "id",
        filters: table === "planning" ? [] : [{ type: "eq", column: "active", value: true }],
        count: "exact",
        head: true,
      });
      assert(!r.error, r.error?.message ?? "");
      assert((r.count ?? 0) >= 0, "count");
      console.log(`  ${table}: ${r.count}`);
    }
  },
});

checks.push({
  name: "Agents list",
  run: () => {
    const r = executeRestQuery(db, { table: "agents", action: "select", select: "*" });
    assert(!r.error, r.error?.message ?? "");
    assert(Array.isArray(r.data) && (r.data as unknown[]).length === 34, `agents=${(r.data as unknown[])?.length}`);
  },
});

checks.push({
  name: "Dogs list",
  run: () => {
    const r = executeRestQuery(db, { table: "dogs", action: "select", select: "*" });
    assert(!r.error, r.error?.message ?? "");
    const n = (r.data as unknown[]).length;
    assert(n === 33 || n === 34, `dogs=${n}`);
  },
});

checks.push({
  name: "Checkpoints + posts (planning select)",
  run: () => {
    const r = executeRestQuery(db, {
      table: "checkpoints",
      action: "select",
      select:
        "id, name, active, posts:checkpoint_posts(id, shift, specialty_required, required_agents, active, allowed_gender, dog_required)",
      filters: [{ type: "eq", column: "active", value: true }],
      order: [{ column: "name", ascending: true }],
    });
    assert(!r.error, r.error?.message ?? "");
    const rows = r.data as Array<{ posts?: unknown[] }>;
    assert(rows.length > 0, "checkpoints empty");
    assert(Array.isArray(rows[0]?.posts), "posts embed missing");
    console.log(`  checkpoints=${rows.length} first.posts=${rows[0]?.posts?.length ?? 0}`);
  },
});

checks.push({
  name: "Planning + assignments + rotation_history",
  run: () => {
    const p = executeRestQuery(db, { table: "planning", action: "select", select: "*" });
    const a = executeRestQuery(db, { table: "planning_assignments", action: "select", select: "id" });
    const h = executeRestQuery(db, { table: "rotation_history", action: "select", select: "id" });
    assert(!p.error && !a.error && !h.error, "planning tables");
    assert((p.data as unknown[]).length === 22, "planning");
    assert((a.data as unknown[]).length === 310, "assignments");
    assert((h.data as unknown[]).length === 314, "history");
  },
});

checks.push({
  name: "Exclusions",
  run: () => {
    const r = executeRestQuery(db, { table: "agent_exclusions", action: "select", select: "*" });
    assert(!r.error, r.error?.message ?? "");
    assert((r.data as unknown[]).length === 2, "exclusions");
  },
});

checks.push({
  name: "Operational cases + attachments embed",
  run: () => {
    const r = executeRestQuery(db, {
      table: "operational_cases",
      action: "select",
      select:
        "*, agent:agents(id, first_name, last_name, professional_number, photo_url), dog:dog_id(id, name, photo_url, specialty), checkpoint:checkpoint_id(id, name), attachments:operational_case_attachments(id, file_name, storage_path, file_size, mime_type, created_at)",
    });
    assert(!r.error, r.error?.message ?? "");
    assert((r.data as unknown[]).length === 1, "cases");
    const row = (r.data as Array<Record<string, unknown>>)[0]!;
    assert("agent" in row && "attachments" in row, "case embeds");
    console.log(`  case_number=${row.case_number} attachments=${(row.attachments as unknown[])?.length}`);
  },
});

checks.push({
  name: "Settings table readable",
  run: () => {
    const r = executeRestQuery(db, { table: "application_settings", action: "select", select: "*" });
    assert(!r.error, r.error?.message ?? "");
  },
});

checks.push({
  name: "Insert/update/delete roundtrip (rollback via delete)",
  run: () => {
    const id = "00000000-0000-4000-8000-000000000099";
    const ins = executeRestQuery(db, {
      table: "application_settings",
      action: "insert",
      payload: { id, key: `__smoke_${Date.now()}`, value: { ok: true }, description: "smoke" },
      single: true,
    });
    assert(!ins.error, ins.error?.message ?? "insert");
    const upd = executeRestQuery(db, {
      table: "application_settings",
      action: "update",
      payload: { description: "smoke-updated" },
      filters: [{ type: "eq", column: "id", value: id }],
    });
    assert(!upd.error, upd.error?.message ?? "update");
    const del = executeRestQuery(db, {
      table: "application_settings",
      action: "delete",
      filters: [{ type: "eq", column: "id", value: id }],
    });
    assert(!del.error, del.error?.message ?? "delete");
  },
});

let failed = 0;
for (const check of checks) {
  try {
    console.log(`✓ ${check.name}`);
    check.run();
  } catch (error) {
    failed += 1;
    console.error(`✗ ${check.name}:`, error instanceof Error ? error.message : error);
  }
}

db.close();
if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll Phase 3 SQLite screen data checks passed.");
