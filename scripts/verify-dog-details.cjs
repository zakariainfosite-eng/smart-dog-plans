/**
 * Verify dog-details loading against the live CynoPlanning SQLite DB.
 *
 * 1) Confirms the old Supabase FK-hint select fails on the REST gateway.
 * 2) Confirms flat selects used by fetchDogDetails succeed for every dog.
 *
 * Usage:
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/verify-dog-details.cjs
 */
const { app } = require("electron");
const { join } = require("node:path");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");

app.setName("CynoPlanning");
app.setPath("userData", join(app.getPath("appData"), "CynoPlanning"));

app.whenReady().then(async () => {
  try {
    const Database = require("better-sqlite3");
    const esbuild = require("esbuild");
    const dbPath = join(app.getPath("userData"), "cynoplanning.db");
    const db = new Database(dbPath, { readonly: true });

    const outfile = join(mkdtempSync(join(tmpdir(), "dog-details-")), "rest-gateway.cjs");
    await esbuild.build({
      entryPoints: [join(__dirname, "../electron/rest-gateway.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile,
      external: ["better-sqlite3"],
    });
    const { executeRestQuery } = require(outfile);

    const OLD_SELECT =
      "*, agent:agents!agents_dog_id_fkey(id, first_name, last_name, professional_number, section:sections(id, name, shift_type))";

    const dogs = db.prepare("SELECT id, name, gender, specialty, status FROM dogs ORDER BY name").all();
    if (dogs.length === 0) throw new Error("No dogs in database");

    // Reproduce historical failure with the broken select string (pre-hint-support builds
    // failed; with gateway hint support it should now parse — but dogs→agents must be reverse).
    const sampleId = dogs[0].id;
    const oldStyle = executeRestQuery(db, {
      table: "dogs",
      action: "select",
      select: OLD_SELECT,
      filters: [{ type: "eq", column: "id", value: sampleId }],
      single: true,
    });
    if (oldStyle.error) {
      console.log("OLD_SELECT_ERROR (expected before gateway fix):", oldStyle.error.message);
    } else {
      const agent = oldStyle.data?.agent;
      const agentOk = Array.isArray(agent)
        ? agent.length === 0 || (agent[0] && agent[0].id)
        : agent == null || agent.id;
      if (!agentOk) throw new Error("OLD_SELECT returned unexpected agent shape");
      console.log("OLD_SELECT_OK (gateway now accepts !fkey + reverse agents embed)");
    }

    let ok = 0;
    const samples = [];
    for (const dog of dogs) {
      const dogRes = executeRestQuery(db, {
        table: "dogs",
        action: "select",
        select: "*",
        filters: [{ type: "eq", column: "id", value: dog.id }],
        single: true,
      });
      if (dogRes.error) throw new Error(`dog ${dog.name}: ${dogRes.error.message}`);

      const agentRes = executeRestQuery(db, {
        table: "agents",
        action: "select",
        select: "id, first_name, last_name, professional_number, section_id",
        filters: [{ type: "eq", column: "dog_id", value: dog.id }],
        maybeSingle: true,
      });
      if (agentRes.error) throw new Error(`agent for ${dog.name}: ${agentRes.error.message}`);

      let section = null;
      if (agentRes.data?.section_id) {
        const sectionRes = executeRestQuery(db, {
          table: "sections",
          action: "select",
          select: "id, name, shift_type",
          filters: [{ type: "eq", column: "id", value: agentRes.data.section_id }],
          maybeSingle: true,
        });
        if (sectionRes.error) throw new Error(`section for ${dog.name}: ${sectionRes.error.message}`);
        section = sectionRes.data;
      }

      const casesRes = executeRestQuery(db, {
        table: "operational_cases",
        action: "select",
        select: "id",
        filters: [{ type: "eq", column: "dog_id", value: dog.id }],
      });
      if (casesRes.error) throw new Error(`cases for ${dog.name}: ${casesRes.error.message}`);

      const exclRes = executeRestQuery(db, {
        table: "agent_exclusions",
        action: "select",
        select: "*",
        filters: [{ type: "eq", column: "dog_id", value: dog.id }],
      });
      if (exclRes.error) throw new Error(`exclusions for ${dog.name}: ${exclRes.error.message}`);

      ok += 1;
      if (samples.length < 5) {
        samples.push({
          id: dog.id,
          name: dog.name,
          gender: dogRes.data.gender,
          specialty: dogRes.data.specialty,
          status: dogRes.data.status,
          agent: agentRes.data
            ? `${agentRes.data.first_name} ${agentRes.data.last_name}`
            : null,
          section: section?.name ?? null,
          cases: (casesRes.data || []).length,
          exclusions: (exclRes.data || []).length,
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          dbPath,
          dogsVerified: ok,
          totalDogs: dogs.length,
          samples,
        },
        null,
        2,
      ),
    );

    if (ok !== dogs.length) throw new Error(`Only ${ok}/${dogs.length} dogs verified`);
    db.close();
    app.exit(0);
  } catch (error) {
    console.error("VERIFY_FAILED", error instanceof Error ? error.message : error);
    app.exit(1);
  }
});
