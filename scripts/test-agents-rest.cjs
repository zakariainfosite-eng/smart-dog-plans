const Database = require("better-sqlite3");
const { join } = require("path");
const { homedir } = require("os");
const { executeRestQuery } = require("/tmp/rest-gateway.cjs");

const dbPath = join(homedir(), "Library/Application Support/CynoPlanning/cynoplanning.db");
console.log("dbPath", dbPath);
const db = new Database(dbPath, { readonly: true, timeout: 3000 });
const requests = [
  {
    name: "exclusions-agents",
    req: {
      table: "agents",
      action: "select",
      select: "id, first_name, last_name, professional_number, active, section_id",
      filters: [],
      order: [{ column: "last_name", ascending: true }],
    },
  },
  {
    name: "operational-agents",
    req: {
      table: "agents",
      action: "select",
      select:
        "id, first_name, last_name, professional_number, photo_url, dog_id, dogs:dog_id(id, name, specialty, photo_url)",
      filters: [{ type: "eq", column: "active", value: true }],
      order: [{ column: "last_name", ascending: true }],
    },
  },
  {
    name: "exclusions-list-embed",
    req: {
      table: "agent_exclusions",
      action: "select",
      select:
        "*, agent:agents(id, first_name, last_name, professional_number, section_id, dog:dogs(id, name))",
      filters: [],
      order: [{ column: "start_date", ascending: false }],
    },
  },
  {
    name: "planning-context-agents",
    req: {
      table: "agents",
      action: "select",
      select:
        "id, first_name, last_name, professional_number, gender, active, section_id, dog_id, dogs:dog_id(id, name, specialty, status, active)",
      filters: [{ type: "eq", column: "active", value: true }],
      order: [],
    },
  },
];

for (const { name, req } of requests) {
  try {
    const result = executeRestQuery(db, req);
    const data = result.data;
    const len = Array.isArray(data) ? data.length : data == null ? 0 : 1;
    console.log("\n===", name, "===");
    console.log("error=", result.error);
    console.log("count=", len);
    if (Array.isArray(data) && data[0]) {
      console.log("keys=", Object.keys(data[0]));
      console.log("sample=", JSON.stringify(data[0]).slice(0, 500));
      if ("active" in data[0]) console.log("active type/value", typeof data[0].active, data[0].active);
    }
  } catch (e) {
    console.log("\n===", name, "THREW ===");
    console.log(String((e && e.stack) || e));
  }
}
db.close();
