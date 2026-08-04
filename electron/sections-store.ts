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

type SectionChefRow = {
  section_id: string;
  first_name: string;
  last_name: string;
  grade: string;
  professional_number: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function formatChefDisplayName(chef: SectionChefRow): string {
  return [chef.grade, chef.first_name, chef.last_name]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
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

/** Count only male Cynotechniciens — never Chef de section or support roles. */
function agentCountsBySection(db: Database.Database): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT section_id, COUNT(*) AS count
       FROM agents
       WHERE section_id IS NOT NULL
         AND lower(gender) != 'female'
         AND COALESCE(fonction, 'cynotechnicien') = 'cynotechnicien'
       GROUP BY section_id`,
    )
    .all() as Array<{ section_id: string; count: number }>;

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.section_id, row.count);
  }
  return counts;
}

/** Resolve the unique Chef de section linked via agents.fonction (source of truth). */
function chefsBySection(db: Database.Database): Map<string, SectionChefRow> {
  const rows = db
    .prepare(
      `SELECT section_id, first_name, last_name, grade, professional_number
       FROM agents
       WHERE section_id IS NOT NULL
         AND fonction IN ('chef_de_section', 'chef_de_section_pi')
       ORDER BY datetime(updated_at) DESC`,
    )
    .all() as SectionChefRow[];

  const map = new Map<string, SectionChefRow>();
  for (const row of rows) {
    if (!map.has(row.section_id)) {
      map.set(row.section_id, row);
    }
  }
  return map;
}

function applyChefToSection(section: Section, chef: SectionChefRow | undefined): Section {
  if (!chef) return section;
  return {
    ...section,
    commander_full_name: formatChefDisplayName(chef),
    commander_grade: chef.grade,
    commander_mle: chef.professional_number,
  };
}

export function getSections(db: Database.Database): SectionWithAgentCount[] {
  const rows = db
    .prepare(`SELECT * FROM sections ORDER BY datetime(created_at) DESC`)
    .all() as SectionRow[];
  const counts = agentCountsBySection(db);
  const chefs = chefsBySection(db);

  return rows.map((row) => {
    const section = applyChefToSection(mapSection(row), chefs.get(row.id));
    return {
      ...section,
      agent_count: counts.get(row.id) ?? 0,
    };
  });
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
  // Preserve commander_* when a linked Chef de section owns them.
  const linkedChef = chefsBySection(db).get(id);
  const commanderFullName = linkedChef
    ? formatChefDisplayName(linkedChef)
    : input.commander_full_name;
  const commanderGrade = linkedChef ? linkedChef.grade : input.commander_grade;
  const commanderMle = linkedChef ? linkedChef.professional_number : input.commander_mle;

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
      commanderFullName,
      commanderGrade,
      commanderMle,
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

  return applyChefToSection(mapSection(row), linkedChef);
}

export function deleteSection(db: Database.Database, id: string): void {
  const run = db.transaction(() => {
    db.prepare(
      `UPDATE agents
       SET is_section_chief = 0,
           section_id = NULL,
           updated_at = ?
       WHERE section_id = ?
         AND fonction IN ('chef_de_section', 'chef_de_section_pi')`,
    ).run(nowIso(), id);

    const result = db.prepare(`DELETE FROM sections WHERE id = ?`).run(id);
    if (result.changes === 0) {
      throw new Error(`Section not found: ${id}`);
    }
  });
  run();
}
