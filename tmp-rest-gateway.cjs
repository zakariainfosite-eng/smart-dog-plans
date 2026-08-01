"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/rest-gateway.ts
var rest_gateway_exports = {};
__export(rest_gateway_exports, {
  executeRestQuery: () => executeRestQuery
});
module.exports = __toCommonJS(rest_gateway_exports);
var import_node_crypto = require("node:crypto");
var ALLOWED_TABLES = /* @__PURE__ */ new Set([
  "sections",
  "dogs",
  "agents",
  "checkpoints",
  "checkpoint_posts",
  "agent_exclusions",
  "planning",
  "planning_assignments",
  "rotation_history",
  "operational_cases",
  "operational_case_attachments",
  "application_settings",
  "users"
]);
var BOOLEAN_COLUMNS = /* @__PURE__ */ new Set([
  "active",
  "is_section_chief",
  "night_only",
  "day_shift_enabled",
  "night_shift_enabled",
  "dog_required",
  "validated",
  "is_hq_reserve",
  "is_off_duty",
  "is_deleted"
]);
function assertTable(table) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Table not allowed: ${table}`);
  }
}
function assertColumn(column) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(column)) {
    throw new Error(`Invalid column: ${column}`);
  }
}
function toJsValue(table, column, value) {
  if (value == null) return null;
  if (BOOLEAN_COLUMNS.has(column)) {
    if (typeof value === "boolean") return value;
    return Number(value) === 1;
  }
  if (table === "checkpoints" && column === "operating_days" && typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (table === "application_settings" && column === "value" && typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
function fromJsValue(column, value) {
  if (value == null) return null;
  if (BOOLEAN_COLUMNS.has(column)) {
    return value ? 1 : 0;
  }
  if (column === "operating_days" || column === "value") {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }
  return value;
}
function splitTopLevel(input) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
function parseSelect(select, table) {
  if (!select || select.trim() === "" || select.trim() === "*") {
    return { columns: ["*"], embeds: [], star: true };
  }
  const parts = splitTopLevel(select);
  const columns = [];
  const embeds = [];
  let star = false;
  for (const part of parts) {
    if (part === "*") {
      star = true;
      columns.push("*");
      continue;
    }
    const embedMatch = part.match(/^([a-z_][a-z0-9_]*)\s*:\s*([a-z_][a-z0-9_]*)\s*\((.*)\)$/i);
    if (embedMatch) {
      const alias = embedMatch[1];
      const target = embedMatch[2];
      const inner = embedMatch[3];
      const innerCols = splitTopLevel(inner).filter((c) => c && c !== "*");
      const cols = innerCols.length > 0 ? innerCols : ["*"];
      if (target.endsWith("_id")) {
        assertColumn(target);
        const relatedTable = inferRelatedTable(table, target, alias);
        embeds.push({
          alias,
          relatedTable,
          fkColumn: target,
          cardinality: "one",
          columns: cols
        });
      } else if (ALLOWED_TABLES.has(target)) {
        const fk = inferFkToParent(table, target, alias);
        embeds.push({
          alias,
          relatedTable: target,
          fkColumn: fk.column,
          cardinality: fk.cardinality,
          columns: cols
        });
      } else {
        assertColumn(target);
        embeds.push({
          alias,
          relatedTable: inferRelatedTable(table, target, alias),
          fkColumn: target,
          cardinality: "one",
          columns: cols
        });
      }
      continue;
    }
    const shortEmbed = part.match(/^([a-z_][a-z0-9_]*)\s*\((.*)\)$/i);
    if (shortEmbed) {
      const related = shortEmbed[1];
      const inner = shortEmbed[2];
      const innerCols = splitTopLevel(inner).filter((c) => c && c !== "*");
      const cols = innerCols.length > 0 ? innerCols : ["*"];
      if (!ALLOWED_TABLES.has(related)) {
        throw new Error(`Unknown embed table: ${related}`);
      }
      const fk = inferFkToParent(table, related, related);
      embeds.push({
        alias: related,
        relatedTable: related,
        fkColumn: fk.column,
        cardinality: fk.cardinality,
        columns: cols
      });
      continue;
    }
    assertColumn(part);
    columns.push(part);
  }
  if (columns.length === 0) columns.push("*");
  return { columns, embeds, star };
}
function inferRelatedTable(parent, fkColumn, alias) {
  if (fkColumn === "dog_id") return "dogs";
  if (fkColumn === "agent_id") return "agents";
  if (fkColumn === "section_id") return "sections";
  if (fkColumn === "checkpoint_id") return "checkpoints";
  if (fkColumn === "checkpoint_post_id") return "checkpoint_posts";
  if (fkColumn === "planning_id") return "planning";
  if (fkColumn === "case_id") return "operational_cases";
  if (ALLOWED_TABLES.has(alias)) return alias;
  if (ALLOWED_TABLES.has(`${alias}s`)) return `${alias}s`;
  throw new Error(`Cannot infer related table for ${parent}.${fkColumn} (alias=${alias})`);
}
function inferFkToParent(parent, related, alias) {
  if (related === "operational_case_attachments" && parent === "operational_cases") {
    return { column: "case_id", cardinality: "many" };
  }
  if (related === "checkpoint_posts" && parent === "checkpoints") {
    return { column: "checkpoint_id", cardinality: "many" };
  }
  if (related === "agents" && (parent === "operational_cases" || parent === "planning_assignments")) {
    return { column: "agent_id", cardinality: "one" };
  }
  if (related === "sections" && parent === "agents") {
    return { column: "section_id", cardinality: "one" };
  }
  if (related === "dogs" && parent === "agents") {
    return { column: "dog_id", cardinality: "one" };
  }
  if (related === "checkpoints") {
    return { column: "checkpoint_id", cardinality: "one" };
  }
  const guess = `${alias}_id`;
  return { column: guess, cardinality: "one" };
}
function buildWhere(filters) {
  if (!filters || filters.length === 0) return { sql: "", params: [] };
  const parts = [];
  const params = [];
  for (const filter of filters) {
    assertColumn(filter.column);
    switch (filter.type) {
      case "eq":
        parts.push(`${filter.column} = ?`);
        params.push(fromJsValue(filter.column, filter.value));
        break;
      case "neq":
        parts.push(`${filter.column} != ?`);
        params.push(fromJsValue(filter.column, filter.value));
        break;
      case "lte":
        parts.push(`${filter.column} <= ?`);
        params.push(filter.value);
        break;
      case "gte":
        parts.push(`${filter.column} >= ?`);
        params.push(filter.value);
        break;
      case "lt":
        parts.push(`${filter.column} < ?`);
        params.push(filter.value);
        break;
      case "gt":
        parts.push(`${filter.column} > ?`);
        params.push(filter.value);
        break;
      case "is":
        if (filter.value === null) parts.push(`${filter.column} IS NULL`);
        else {
          parts.push(`${filter.column} IS ?`);
          params.push(fromJsValue(filter.column, filter.value));
        }
        break;
      case "in": {
        const values = Array.isArray(filter.value) ? filter.value : [];
        if (values.length === 0) {
          parts.push("1 = 0");
        } else {
          parts.push(`${filter.column} IN (${values.map(() => "?").join(",")})`);
          params.push(...values.map((v) => fromJsValue(filter.column, v)));
        }
        break;
      }
      case "not":
        if (filter.notType === "is" && filter.value === null) {
          parts.push(`${filter.column} IS NOT NULL`);
        } else if (filter.notType === "eq") {
          parts.push(`${filter.column} != ?`);
          params.push(fromJsValue(filter.column, filter.value));
        } else if (filter.notType === "in") {
          const values = Array.isArray(filter.value) ? filter.value : [];
          if (values.length === 0) {
            parts.push("1 = 1");
          } else {
            parts.push(`${filter.column} NOT IN (${values.map(() => "?").join(",")})`);
            params.push(...values.map((v) => fromJsValue(filter.column, v)));
          }
        } else {
          throw new Error(`Unsupported not filter: ${filter.notType}`);
        }
        break;
      default:
        throw new Error(`Unsupported filter: ${filter.type}`);
    }
  }
  return { sql: ` WHERE ${parts.join(" AND ")}`, params };
}
function mapRow(table, row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = toJsValue(table, key, value);
  }
  return out;
}
function attachEmbeds(db, table, rows, embeds) {
  for (const embed of embeds) {
    assertTable(embed.relatedTable);
    if (embed.cardinality === "one") {
      const ids = [
        ...new Set(
          rows.map((row) => row[embed.fkColumn]).filter((id) => id != null).map(String)
        )
      ];
      const byId = /* @__PURE__ */ new Map();
      if (ids.length > 0) {
        const cols = embed.columns.includes("*") || embed.columns.length === 0 ? "*" : embed.columns.map((c) => {
          assertColumn(c);
          return c;
        }).join(", ");
        const related = db.prepare(
          `SELECT ${cols} FROM ${embed.relatedTable} WHERE id IN (${ids.map(() => "?").join(",")})`
        ).all(...ids);
        for (const rel of related) {
          byId.set(String(rel.id), mapRow(embed.relatedTable, rel));
        }
      }
      for (const row of rows) {
        const fk = row[embed.fkColumn];
        row[embed.alias] = fk == null ? null : byId.get(String(fk)) ?? null;
      }
    } else {
      const parentIds = rows.map((row) => String(row.id));
      const byParent = /* @__PURE__ */ new Map();
      if (parentIds.length > 0) {
        const cols = embed.columns.includes("*") || embed.columns.length === 0 ? "*" : embed.columns.map((c) => {
          assertColumn(c);
          return c;
        }).join(", ");
        const related = db.prepare(
          `SELECT ${cols} FROM ${embed.relatedTable} WHERE ${embed.fkColumn} IN (${parentIds.map(() => "?").join(",")})`
        ).all(...parentIds);
        for (const rel of related) {
          const mapped = mapRow(embed.relatedTable, rel);
          const key = String(rel[embed.fkColumn]);
          const list = byParent.get(key) ?? [];
          list.push(mapped);
          byParent.set(key, list);
        }
      }
      for (const row of rows) {
        row[embed.alias] = byParent.get(String(row.id)) ?? [];
      }
    }
  }
}
function selectColumnsSql(columns) {
  if (columns.includes("*")) return "*";
  return columns.map((c) => {
    assertColumn(c);
    return c;
  }).join(", ");
}
function executeRestQuery(db, request) {
  try {
    assertTable(request.table);
    const where = buildWhere(request.filters);
    if (request.action === "select") {
      const parsed = parseSelect(request.select, request.table);
      let count = null;
      if (request.count === "exact" || request.head) {
        const countRow = db.prepare(`SELECT COUNT(*) AS c FROM ${request.table}${where.sql}`).get(...where.params);
        count = Number(countRow.c);
        if (request.head) {
          return { data: null, error: null, count };
        }
      }
      let sql = `SELECT ${selectColumnsSql(parsed.columns)} FROM ${request.table}${where.sql}`;
      if (request.order && request.order.length > 0) {
        const orderSql = request.order.map((o) => {
          assertColumn(o.column);
          return `${o.column} ${o.ascending ? "ASC" : "DESC"}`;
        }).join(", ");
        sql += ` ORDER BY ${orderSql}`;
      }
      if (request.limit != null) sql += ` LIMIT ${Number(request.limit)}`;
      if (request.offset != null) sql += ` OFFSET ${Number(request.offset)}`;
      const rawRows = db.prepare(sql).all(...where.params);
      const rows = rawRows.map((row) => mapRow(request.table, row));
      attachEmbeds(db, request.table, rows, parsed.embeds);
      if (request.single || request.maybeSingle) {
        if (rows.length === 0) {
          if (request.maybeSingle) return { data: null, error: null, count };
          return {
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
            count
          };
        }
        if (rows.length > 1 && request.single) {
          return {
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
            count
          };
        }
        return { data: rows[0], error: null, count };
      }
      return { data: rows, error: null, count };
    }
    if (request.action === "insert") {
      const rows = Array.isArray(request.payload) ? request.payload : request.payload ? [request.payload] : [];
      if (rows.length === 0) return { data: [], error: null, count: 0 };
      const inserted = [];
      const run = db.transaction(() => {
        for (const row of rows) {
          const data = { ...row };
          if (data.id == null) data.id = (0, import_node_crypto.randomUUID)();
          const keys = Object.keys(data);
          keys.forEach(assertColumn);
          const placeholders = keys.map(() => "?").join(", ");
          const values = keys.map((k) => fromJsValue(k, data[k]));
          db.prepare(
            `INSERT INTO ${request.table} (${keys.join(", ")}) VALUES (${placeholders})`
          ).run(...values);
          const saved = db.prepare(`SELECT * FROM ${request.table} WHERE id = ?`).get(String(data.id));
          inserted.push(mapRow(request.table, saved));
        }
      });
      run();
      if (request.single) {
        return { data: inserted[0] ?? null, error: null, count: inserted.length };
      }
      return { data: inserted, error: null, count: inserted.length };
    }
    if (request.action === "update") {
      const payload = request.payload ?? {};
      const keys = Object.keys(payload);
      if (keys.length === 0) {
        return { data: null, error: { message: "No update payload" }, count: null };
      }
      keys.forEach(assertColumn);
      const sets = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => fromJsValue(k, payload[k]));
      const result = db.prepare(`UPDATE ${request.table} SET ${sets}${where.sql}`).run(...values, ...where.params);
      if (request.single || request.maybeSingle) {
        const row = db.prepare(`SELECT * FROM ${request.table}${where.sql} LIMIT 1`).get(...where.params);
        return {
          data: row ? mapRow(request.table, row) : null,
          error: null,
          count: result.changes
        };
      }
      const rows = db.prepare(`SELECT * FROM ${request.table}${where.sql}`).all(...where.params);
      return {
        data: rows.map((row) => mapRow(request.table, row)),
        error: null,
        count: result.changes
      };
    }
    if (request.action === "delete") {
      const result = db.prepare(`DELETE FROM ${request.table}${where.sql}`).run(...where.params);
      return { data: null, error: null, count: result.changes };
    }
    return { data: null, error: { message: `Unsupported action: ${request.action}` }, count: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : String(error) },
      count: null
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  executeRestQuery
});
