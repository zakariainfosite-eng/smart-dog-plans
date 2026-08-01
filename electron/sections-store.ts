import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

type ShiftType = "day" | "night";

export type CreateSectionInput = {
  name: string;
  shift_type: ShiftType;
  active: boolean;
  commander_full_name: string;
  commander_grade: string;
  commander_mle: string;
};

export type UpdateSectionInput = CreateSectionInput;

type Section = {
  id: string;
  name: string;
  shift_type: ShiftType;
  active: boolean;
  commander_full_name: string;
  commander_grade: string;
  commander_mle: string;
  created_at: string;
  updated_at: string;
};

type SectionWithAgentCount = Section & { agent_count: number };

type SectionRow = {
  id: string;
  name: string;
  shift_type: "day" | "night";
  active: number;
  commander_full_name: string;
  commander_grade: string;
  commander_mle: string;
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function mapSection(row: SectionRow): Section {
  return {
    id: row.id,
    name: row.name,
    shift_type: row.shift_type,
    active: row.active === 1,
    commander_full_name: row.commander_full_name,
    commander_grade: row.commander_grade,
    commander_mle: row.commander_mle,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function agentCountsBySection(db: Database.Database): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT section_id, COUNT(*) AS count
       FROM agents
       WHERE section_id IS NOT NULL
         AND lower(gender) != 'female'
       GROUP BY section_id`,
    )
    .all() as Array<{ section_id: string; count: number }>;

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.section_id, row.count);
  }
  return counts;
}

export function getSections(db: Database.Database): SectionWithAgentCount[] {
  const rows = db
    .prepare(`SELECT * FROM sections ORDER BY datetime(created_at) DESC`)
    .all() as SectionRow[];
  const counts = agentCountsBySection(db);

  return rows.map((row) => ({
    ...mapSection(row),
    agent_count: counts.get(row.id) ?? 0,
  }));
}

export function createSection(db: Database.Database, input: CreateSectionInput): Section {
  const id = randomUUID();
  const timestamp = nowIso();

  db.prepare(
    `INSERT INTO sections (
       id, name, shift_type, active,
       commander_full_name, commander_grade, commander_mle,
       created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.shift_type,
    input.active ? 1 : 0,
    input.commander_full_name,
    input.commander_grade,
    input.commander_mle,
    timestamp,
    timestamp,
  );

  return {
    id,
    name: input.name,
    shift_type: input.shift_type,
    active: input.active,
    commander_full_name: input.commander_full_name,
    commander_grade: input.commander_grade,
    commander_mle: input.commander_mle,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function updateSection(db: Database.Database, id: string, input: UpdateSectionInput): Section {
  const timestamp = nowIso();
  const result = db
    .prepare(
      `UPDATE sections
       SET name = ?, shift_type = ?, active = ?,
           commander_full_name = ?, commander_grade = ?, commander_mle = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name,
      input.shift_type,
      input.active ? 1 : 0,
      input.commander_full_name,
      input.commander_grade,
      input.commander_mle,
      timestamp,
      id,
    );

  if (result.changes === 0) {
    throw new Error(`Section not found: ${id}`);
  }

  const row = db.prepare(`SELECT * FROM sections WHERE id = ?`).get(id) as SectionRow | undefined;
  if (!row) {
    throw new Error(`Section not found: ${id}`);
  }

  return mapSection(row);
}

export function deleteSection(db: Database.Database, id: string): void {
  const result = db.prepare(`DELETE FROM sections WHERE id = ?`).run(id);
  if (result.changes === 0) {
    throw new Error(`Section not found: ${id}`);
  }
}
