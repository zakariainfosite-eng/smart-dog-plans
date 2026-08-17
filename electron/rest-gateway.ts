/**
 * Allowlisted PostgREST-like query gateway over better-sqlite3.
 * Used by the renderer SQLite client so existing db.from(...) call sites
 * keep working after Phase 3 without UI/business-logic changes.
 */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { applyUnassignIfWithoutHandlerExclusionSync } from "../src/integrations/database/unassign-dog-handler";

export type FilterOp = "eq" | "neq" | "in" | "lte" | "gte" | "gt" | "lt" | "is" | "not" | "ilike";

export type QueryFilter = {
  type: FilterOp;
  column: string;
  value?: unknown;
  /** For type "not": nested op, e.g. { type:'is', column, value:null } via notColumn/notValue */
  notType?: "is" | "eq" | "in";
};

export type QueryOrder = { column: string; ascending: boolean };

export type RestQueryRequest = {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  select?: string;
  filters?: QueryFilter[];
  order?: QueryOrder[];
  limit?: number;
  offset?: number;
  single?: boolean;
  maybeSingle?: boolean;
  count?: "exact";
  head?: boolean;
  payload?: Record<string, unknown> | Record<string, unknown>[];
};

export type RestQueryResult = {
  data: any;
  error: { message: string; code?: string } | null;
  count: number | null;
};

const ALLOWED_TABLES = new Set([
  "sections",
  "dogs",
  "agents",
  "checkpoints",
  "checkpoint_posts",
  "agent_exclusions",
  "exclusion_notifications",
  "planning",
  "planning_assignments",
  "rotation_history",
  "operational_cases",
  "operational_case_attachments",
  "application_settings",
  "role_documents",
  "document_reference_sequences",
  "users",
]);

/** Parent table → embed alias → how to resolve related rows. */
type EmbedSpec = {
  alias: string;
  /** Related table name */
  relatedTable: string;
  /** Column on parent that holds the FK (many-to-one) OR column on child (one-to-many) */
  fkColumn: string;
  /** many-to-one nests object; one-to-many nests array */
  cardinality: "one" | "many";
  /** Scalar columns to select from the related table (never nested embed snippets). */
  columns: string[];
  /** Nested embeds relative to the related table. */
  embeds: EmbedSpec[];
};

const BOOLEAN_COLUMNS = new Set([
  "active",
  "is_section_chief",
  "night_only",
  "day_shift_enabled",
  "night_shift_enabled",
  "dog_required",
  "validated",
  "is_hq_reserve",
  "is_off_duty",
  "is_deleted",
  "is_read",
]);

function assertTable(table: string): void {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Table not allowed: ${table}`);
  }
}

function assertColumn(column: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(column)) {
    throw new Error(`Invalid column: ${column}`);
  }
}

function toJsValue(table: string, column: string, value: unknown): unknown {
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

function fromJsValue(column: string, value: unknown): unknown {
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

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
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

function parseSelectFragment(
  select: string,
  table: string,
): { columns: string[]; embeds: EmbedSpec[]; star: boolean } {
  if (!select || select.trim() === "" || select.trim() === "*") {
    return { columns: ["*"], embeds: [], star: true };
  }

  const parts = splitTopLevel(select);
  const columns: string[] = [];
  const embeds: EmbedSpec[] = [];
  let star = false;

  for (const part of parts) {
    if (part === "*") {
      star = true;
      columns.push("*");
      continue;
    }

    // Alias embed, optionally with PostgREST FK hint: agent:agents!agents_dog_id_fkey(...)
    const embedMatch = part.match(
      /^([a-z_][a-z0-9_]*)\s*:\s*([a-z_][a-z0-9_]*)(?:![a-z_][a-z0-9_]*)?\s*\(([\s\S]*)\)$/i,
    );
    if (embedMatch) {
      const alias = embedMatch[1]!;
      const target = embedMatch[2]!;
      const inner = embedMatch[3]!;
      const nested = parseSelectFragment(inner, ALLOWED_TABLES.has(target) ? target : inferRelatedTable(table, target, alias));

      if (target.endsWith("_id")) {
        assertColumn(target);
        const relatedTable = inferRelatedTable(table, target, alias);
        embeds.push({
          alias,
          relatedTable,
          fkColumn: target,
          cardinality: "one",
          columns: nested.columns,
          embeds: nested.embeds,
        });
      } else if (ALLOWED_TABLES.has(target)) {
        const fk = inferFkToParent(table, target, alias);
        embeds.push({
          alias,
          relatedTable: target,
          fkColumn: fk.column,
          cardinality: fk.cardinality,
          columns: nested.columns,
          embeds: nested.embeds,
        });
      } else {
        assertColumn(target);
        const relatedTable = inferRelatedTable(table, target, alias);
        embeds.push({
          alias,
          relatedTable,
          fkColumn: target,
          cardinality: "one",
          columns: nested.columns,
          embeds: nested.embeds,
        });
      }
      continue;
    }

    // Shorthand embed: sections(name) / dogs(specialty)
    const shortEmbed = part.match(/^([a-z_][a-z0-9_]*)\s*\(([\s\S]*)\)$/i);
    if (shortEmbed) {
      const related = shortEmbed[1]!;
      const inner = shortEmbed[2]!;
      if (!ALLOWED_TABLES.has(related)) {
        throw new Error(`Unknown embed table: ${related}`);
      }
      const nested = parseSelectFragment(inner, related);
      const fk = inferFkToParent(table, related, related);
      embeds.push({
        alias: related,
        relatedTable: related,
        fkColumn: fk.column,
        cardinality: fk.cardinality,
        columns: nested.columns,
        embeds: nested.embeds,
      });
      continue;
    }

    assertColumn(part);
    columns.push(part);
  }

  if (columns.length === 0 && embeds.length > 0) {
    // Embed-only fragment still needs a selectable base; star keeps row identity.
    columns.push("*");
    star = true;
  } else if (columns.length === 0) {
    columns.push("*");
    star = true;
  }
  return { columns, embeds, star };
}

function parseSelect(select: string | undefined, table: string): {
  columns: string[];
  embeds: EmbedSpec[];
  star: boolean;
} {
  const parsed = parseSelectFragment(select ?? "*", table);
  // Parent rows must expose FK columns used by many-to-one embeds (e.g. dog_id, section_id).
  if (!parsed.star) {
    for (const embed of parsed.embeds) {
      if (embed.cardinality === "one" && !parsed.columns.includes(embed.fkColumn)) {
        assertColumn(embed.fkColumn);
        parsed.columns.push(embed.fkColumn);
      }
    }
  }
  return parsed;
}

function relatedSelectSql(embed: EmbedSpec): string {
  if (embed.columns.includes("*") || embed.columns.length === 0) {
    return "*";
  }
  const cols = new Set(embed.columns);
  // one-to-many rows must include the FK so we can group by parent id
  if (embed.cardinality === "many") {
    cols.add(embed.fkColumn);
  }
  // nested many-to-one embeds need their FK on this related row
  for (const nested of embed.embeds) {
    if (nested.cardinality === "one") {
      cols.add(nested.fkColumn);
    }
  }
  // always keep id for nested lookups / identity
  cols.add("id");
  return [...cols]
    .map((c) => {
      assertColumn(c);
      return c;
    })
    .join(", ");
}

function inferRelatedTable(parent: string, fkColumn: string, alias: string): string {
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

function inferFkToParent(
  parent: string,
  related: string,
  alias: string,
): { column: string; cardinality: "one" | "many" } {
  // Child table pointing back to parent → one-to-many
  if (related === "operational_case_attachments" && parent === "operational_cases") {
    return { column: "case_id", cardinality: "many" };
  }
  if (related === "checkpoint_posts" && parent === "checkpoints") {
    return { column: "checkpoint_id", cardinality: "many" };
  }
  if (related === "agents" && (parent === "operational_cases" || parent === "planning_assignments")) {
    return { column: "agent_id", cardinality: "one" };
  }
  // dogs ← agents.dog_id (reverse FK; one handler per dog in practice, array for gateway)
  if (related === "agents" && parent === "dogs") {
    return { column: "dog_id", cardinality: "many" };
  }
  // Parent.section_id → sections (agents, planning, …). Alias is often "sections", not "section".
  if (related === "sections") {
    return { column: "section_id", cardinality: "one" };
  }
  if (related === "dogs" && parent === "agents") {
    return { column: "dog_id", cardinality: "one" };
  }
  if (related === "checkpoints") {
    return { column: "checkpoint_id", cardinality: "one" };
  }
  // Default many-to-one from parent.alias_id
  const guess = `${alias}_id`;
  return { column: guess, cardinality: "one" };
}

function buildWhere(
  filters: QueryFilter[] | undefined,
): { sql: string; params: unknown[] } {
  if (!filters || filters.length === 0) return { sql: "", params: [] };
  const parts: string[] = [];
  const params: unknown[] = [];

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
      case "ilike":
        parts.push(`${filter.column} LIKE ? COLLATE NOCASE`);
        params.push(String(filter.value ?? ""));
        break;
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
        throw new Error(`Unsupported filter: ${(filter as QueryFilter).type}`);
    }
  }

  return { sql: ` WHERE ${parts.join(" AND ")}`, params };
}

function mapRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = toJsValue(table, key, value);
  }
  return out;
}

function attachEmbeds(
  db: Database.Database,
  table: string,
  rows: Record<string, unknown>[],
  embeds: EmbedSpec[],
): void {
  for (const embed of embeds) {
    assertTable(embed.relatedTable);
    if (embed.cardinality === "one") {
      const ids = [
        ...new Set(
          rows
            .map((row) => row[embed.fkColumn])
            .filter((id) => id != null)
            .map(String),
        ),
      ];
      const byId = new Map<string, Record<string, unknown>>();
      if (ids.length > 0) {
        const cols = relatedSelectSql(embed);
        const related = db
          .prepare(
            `SELECT ${cols} FROM ${embed.relatedTable} WHERE id IN (${ids.map(() => "?").join(",")})`,
          )
          .all(...ids) as Record<string, unknown>[];
        const mapped = related.map((rel) => mapRow(embed.relatedTable, rel));
        if (embed.embeds.length > 0) {
          attachEmbeds(db, embed.relatedTable, mapped, embed.embeds);
        }
        for (const rel of mapped) {
          byId.set(String(rel.id), rel);
        }
      }
      for (const row of rows) {
        const fk = row[embed.fkColumn];
        row[embed.alias] = fk == null ? null : (byId.get(String(fk)) ?? null);
      }
    } else {
      // one-to-many: child.fkColumn = parent.id
      const parentIds = rows.map((row) => String(row.id));
      const byParent = new Map<string, Record<string, unknown>[]>();
      if (parentIds.length > 0) {
        const cols = relatedSelectSql(embed);
        const related = db
          .prepare(
            `SELECT ${cols} FROM ${embed.relatedTable} WHERE ${embed.fkColumn} IN (${parentIds.map(() => "?").join(",")})`,
          )
          .all(...parentIds) as Record<string, unknown>[];
        const mapped = related.map((rel) => mapRow(embed.relatedTable, rel));
        if (embed.embeds.length > 0) {
          attachEmbeds(db, embed.relatedTable, mapped, embed.embeds);
        }
        for (const rel of mapped) {
          const key = String(rel[embed.fkColumn]);
          const list = byParent.get(key) ?? [];
          list.push(rel);
          byParent.set(key, list);
        }
      }
      for (const row of rows) {
        row[embed.alias] = byParent.get(String(row.id)) ?? [];
      }
    }
  }
}

function selectColumnsSql(columns: string[]): string {
  if (columns.includes("*")) return "*";
  return columns
    .map((c) => {
      assertColumn(c);
      return c;
    })
    .join(", ");
}

export function executeRestQuery(db: Database.Database, request: RestQueryRequest): RestQueryResult {
  try {
    assertTable(request.table);
    const where = buildWhere(request.filters);

    if (request.action === "select") {
      const parsed = parseSelect(request.select, request.table);
      let count: number | null = null;

      if (request.count === "exact" || request.head) {
        const countRow = db
          .prepare(`SELECT COUNT(*) AS c FROM ${request.table}${where.sql}`)
          .get(...where.params) as { c: number };
        count = Number(countRow.c);
        if (request.head) {
          return { data: null, error: null, count };
        }
      }

      let sql = `SELECT ${selectColumnsSql(parsed.columns)} FROM ${request.table}${where.sql}`;
      if (request.order && request.order.length > 0) {
        const orderSql = request.order
          .map((o) => {
            assertColumn(o.column);
            return `${o.column} ${o.ascending ? "ASC" : "DESC"}`;
          })
          .join(", ");
        sql += ` ORDER BY ${orderSql}`;
      }
      if (request.limit != null) sql += ` LIMIT ${Number(request.limit)}`;
      if (request.offset != null) sql += ` OFFSET ${Number(request.offset)}`;

      const rawRows = db.prepare(sql).all(...where.params) as Record<string, unknown>[];
      const rows = rawRows.map((row) => mapRow(request.table, row));
      attachEmbeds(db, request.table, rows, parsed.embeds);

      if (request.single || request.maybeSingle) {
        if (rows.length === 0) {
          if (request.maybeSingle) return { data: null, error: null, count };
          return {
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
            count,
          };
        }
        if (rows.length > 1 && request.single) {
          return {
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
            count,
          };
        }
        return { data: rows[0], error: null, count };
      }

      return { data: rows, error: null, count };
    }

    if (request.action === "insert") {
      const rows = Array.isArray(request.payload)
        ? request.payload
        : request.payload
          ? [request.payload]
          : [];
      if (rows.length === 0) return { data: [], error: null, count: 0 };

      const inserted: Record<string, unknown>[] = [];
      const run = db.transaction(() => {
        for (const row of rows) {
          const data = { ...row };
          if (data.id == null) data.id = randomUUID();
          const keys = Object.keys(data);
          keys.forEach(assertColumn);
          const placeholders = keys.map(() => "?").join(", ");
          const values = keys.map((k) => fromJsValue(k, data[k]));
          db.prepare(
            `INSERT INTO ${request.table} (${keys.join(", ")}) VALUES (${placeholders})`,
          ).run(...values);
          const saved = db
            .prepare(`SELECT * FROM ${request.table} WHERE id = ?`)
            .get(String(data.id)) as Record<string, unknown>;
          if (request.table === "agent_exclusions" && saved) {
            applyUnassignIfWithoutHandlerExclusionSync(saved, (sql, params) => {
              const info = db.prepare(sql).run(...params);
              return { changes: info.changes };
            });
          }
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
      const payload = (request.payload ?? {}) as Record<string, unknown>;
      const keys = Object.keys(payload);
      if (keys.length === 0) {
        return { data: null, error: { message: "No update payload" }, count: null };
      }
      keys.forEach(assertColumn);
      const sets = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => fromJsValue(k, payload[k]));
      const applyUpdate = db.transaction(() => {
        const result = db
          .prepare(`UPDATE ${request.table} SET ${sets}${where.sql}`)
          .run(...values, ...where.params);
        const rows = db
          .prepare(`SELECT * FROM ${request.table}${where.sql}`)
          .all(...where.params) as Record<string, unknown>[];
        if (request.table === "agent_exclusions") {
          for (const row of rows) {
            applyUnassignIfWithoutHandlerExclusionSync(row, (sql, params) => {
              const info = db.prepare(sql).run(...params);
              return { changes: info.changes };
            });
          }
        }
        return { result, rows };
      });
      const updated = applyUpdate();

      if (request.single || request.maybeSingle) {
        const row = updated.rows[0];
        return {
          data: row ? mapRow(request.table, row) : null,
          error: null,
          count: updated.result.changes,
        };
      }
      return {
        data: updated.rows.map((row) => mapRow(request.table, row)),
        error: null,
        count: updated.result.changes,
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
      count: null,
    };
  }
}
