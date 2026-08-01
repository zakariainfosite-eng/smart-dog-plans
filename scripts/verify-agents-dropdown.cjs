/**
 * Verify Cynotechnician dropdown data paths against CynoPlanning SQLite.
 * Usage: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/verify-agents-dropdown.cjs
 */
const { join } = require("node:path");
const { homedir } = require("node:os");
const Database = require("better-sqlite3");
const { buildSync } = require("esbuild");

const dbPath = join(homedir(), "Library/Application Support/CynoPlanning/cynoplanning.db");
const outFile = join("/tmp", "rest-gateway-verify.cjs");

buildSync({
  entryPoints: [join(__dirname, "../electron/rest-gateway.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: outFile,
  external: ["better-sqlite3"],
  logLevel: "silent",
});

const { executeRestQuery } = require(outFile);

async function main() {
  const db = new Database(dbPath, { readonly: true, timeout: 3000 });

  const rawCount = db.prepare("SELECT COUNT(*) AS c FROM agents").get().c;
  const activeCount = db.prepare("SELECT COUNT(*) AS c FROM agents WHERE active = 1").get().c;

  const getAgentsStyle = db
    .prepare(
      `SELECT a.id, a.first_name, a.last_name, a.professional_number, a.active, a.section_id
       FROM agents a
       ORDER BY datetime(a.created_at) DESC`,
    )
    .all()
    .map((row) => ({
      ...row,
      active: Number(row.active) === 1,
    }));

  const activeViaStore = getAgentsStyle.filter((r) => r.active);

  const exclusionsAgents = executeRestQuery(db, {
    table: "agents",
    action: "select",
    select: "id, first_name, last_name, professional_number, active, section_id",
    filters: [],
    order: [{ column: "last_name", ascending: true }],
  });

  const operationalAgents = executeRestQuery(db, {
    table: "agents",
    action: "select",
    select:
      "id, first_name, last_name, professional_number, photo_url, dog_id, dogs:dog_id(id, name, specialty, photo_url)",
    filters: [{ type: "eq", column: "active", value: true }],
    order: [{ column: "last_name", ascending: true }],
  });

  const exclusionsList = executeRestQuery(db, {
    table: "agent_exclusions",
    action: "select",
    select:
      "*, agent:agents(id, first_name, last_name, professional_number, section_id, dog:dogs(id, name))",
    filters: [],
    order: [{ column: "start_date", ascending: false }],
  });

  const planningPosts = executeRestQuery(db, {
    table: "checkpoints",
    action: "select",
    select:
      "id, name, active, posts:checkpoint_posts(id, shift, specialty_required, required_agents, active)",
    filters: [{ type: "eq", column: "active", value: true }],
    order: [{ column: "name", ascending: true }],
  });

  const totalPosts = (planningPosts.data ?? []).reduce(
    (sum, row) => sum + (row.posts?.length ?? 0),
    0,
  );

  const sample = (operationalAgents.data ?? [])[0] ?? {};
  const fieldsOk = ["id", "first_name", "last_name", "active", "section_id"].every((k) =>
    k === "active" || k === "section_id"
      ? k in ((exclusionsAgents.data ?? [])[0] ?? {})
      : Boolean(((exclusionsAgents.data ?? [])[0] ?? {})[k]),
  );

  const report = {
    dbPath,
    rawCount,
    activeCount,
    getAgentsActive: activeViaStore.length,
    exclusionsDropdown: {
      error: exclusionsAgents.error,
      count: exclusionsAgents.data?.length ?? 0,
      fieldsOk,
      sample: (exclusionsAgents.data ?? [])[0] ?? null,
    },
    operationalDropdown: {
      error: operationalAgents.error,
      count: operationalAgents.data?.length ?? 0,
      hasDogsEmbed: Boolean(sample.dogs),
      sampleKeys: Object.keys(sample),
    },
    exclusionsListNestedEmbed: {
      error: exclusionsList.error,
      count: exclusionsList.data?.length ?? 0,
      agentPresent: Boolean(exclusionsList.data?.[0]?.agent),
      dogPresent: Boolean(exclusionsList.data?.[0]?.agent?.dog),
    },
    dailyPlanningPostsEmbed: {
      error: planningPosts.error,
      checkpoints: planningPosts.data?.length ?? 0,
      totalPosts,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.getAgentsActive === activeCount &&
    report.exclusionsDropdown.count === rawCount &&
    report.operationalDropdown.count === activeCount &&
    !report.exclusionsListNestedEmbed.error &&
    report.dailyPlanningPostsEmbed.totalPosts > 0;

  db.close();
  if (!ok) {
    console.error("[verify] FAILED");
    process.exit(1);
  }
  console.log(
    `[verify] OK — ${activeCount} active cynotechnicians available for dropdowns; posts embed=${totalPosts}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
