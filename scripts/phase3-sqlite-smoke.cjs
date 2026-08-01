/**
 * Phase 3 smoke test runner (Electron — native better-sqlite3 ABI).
 */
const { app } = require("electron");
const path = require("node:path");
const { join } = path;

app.setName("CynoPlanning");
app.setPath("userData", join(app.getPath("appData"), "CynoPlanning"));

app.whenReady().then(async () => {
  try {
    const Database = require("better-sqlite3");
    const dbPath = join(app.getPath("userData"), "cynoplanning.db");
    const db = new Database(dbPath);

    const esbuild = require("esbuild");
    const outfile = join(__dirname, "../tmp-rest-gateway.cjs");
    await esbuild.build({
      entryPoints: [join(__dirname, "../electron/rest-gateway.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile,
      external: ["better-sqlite3"],
    });
    const { executeRestQuery } = require(outfile);

    const results = [];
    function check(name, fn) {
      try {
        fn();
        results.push({ name, ok: true });
        console.log("OK", name);
      } catch (e) {
        results.push({ name, ok: false, error: e.message });
        console.error("FAIL", name, e.message);
      }
    }

    check("agents", () => {
      const r = executeRestQuery(db, { table: "agents", action: "select", select: "*" });
      if (r.error) throw new Error(r.error.message);
      if ((r.data || []).length !== 34) throw new Error("count " + (r.data || []).length);
    });
    check("dogs", () => {
      const r = executeRestQuery(db, { table: "dogs", action: "select", select: "*" });
      if (r.error) throw new Error(r.error.message);
      if ((r.data || []).length !== 33) throw new Error("count " + (r.data || []).length);
    });
    check("checkpoints+posts", () => {
      const r = executeRestQuery(db, {
        table: "checkpoints",
        action: "select",
        select: "id, name, posts:checkpoint_posts(id, shift, specialty_required)",
        filters: [{ type: "eq", column: "active", value: true }],
      });
      if (r.error) throw new Error(r.error.message);
      if (!Array.isArray(r.data) || !r.data.length) throw new Error("empty");
      if (!Array.isArray(r.data[0].posts)) throw new Error("no posts embed");
    });
    check("planning", () => {
      const r = executeRestQuery(db, { table: "planning", action: "select", select: "id" });
      if (r.error) throw new Error(r.error.message);
      if ((r.data || []).length !== 22) throw new Error("count");
    });
    check("assignments", () => {
      const r = executeRestQuery(db, {
        table: "planning_assignments",
        action: "select",
        select: "id",
      });
      if (r.error) throw new Error(r.error.message);
      if ((r.data || []).length !== 310) throw new Error("count");
    });
    check("rotation_history", () => {
      const r = executeRestQuery(db, { table: "rotation_history", action: "select", select: "id" });
      if (r.error) throw new Error(r.error.message);
      if ((r.data || []).length !== 314) throw new Error("count");
    });
    check("exclusions", () => {
      const r = executeRestQuery(db, { table: "agent_exclusions", action: "select", select: "*" });
      if (r.error) throw new Error(r.error.message);
      if ((r.data || []).length !== 2) throw new Error("count");
    });
    check("operational_cases embeds", () => {
      const r = executeRestQuery(db, {
        table: "operational_cases",
        action: "select",
        select:
          "*, agent:agents(id, first_name), dog:dog_id(id, name), checkpoint:checkpoint_id(id, name), attachments:operational_case_attachments(id)",
      });
      if (r.error) throw new Error(r.error.message);
      if ((r.data || []).length !== 1) throw new Error("count");
      if (!("agent" in r.data[0]) || !("attachments" in r.data[0])) throw new Error("embeds");
    });
    check("users table for local auth", () => {
      const row = db.prepare("SELECT COUNT(*) AS c FROM users").get();
      console.log("  users count=", row.c);
    });

    db.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(failed ? "SMOKE_FAILED" : "ALL_SCREEN_CHECKS_PASSED");
    app.exit(failed ? 1 : 0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
