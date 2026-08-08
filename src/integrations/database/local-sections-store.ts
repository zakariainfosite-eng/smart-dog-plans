import { randomId } from "@/lib/random-id";
import type { SqlExecutor } from "./sql-executor";
import type { CreateSectionInput, Section, SectionWithAgentCount, UpdateSectionInput } from "./types";

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
  return [chef.first_name, chef.last_name]
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

async function agentCountsBySection(db: SqlExecutor): Promise<Map<string, number>> {
  const rows = await db.query<{ section_id: string; count: number }>(
    `SELECT section_id, COUNT(*) AS count
     FROM agents
     WHERE section_id IS NOT NULL
       AND lower(gender) != 'female'
       AND COALESCE(fonction, 'cynotechnicien') = 'cynotechnicien'
     GROUP BY section_id`,
  );
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.section_id, Number(row.count));
  return counts;
}

async function chefsBySection(db: SqlExecutor): Promise<Map<string, SectionChefRow>> {
  const rows = await db.query<SectionChefRow>(
    `SELECT section_id, first_name, last_name, grade, professional_number
     FROM agents
     WHERE section_id IS NOT NULL
       AND fonction = 'chef_de_section'
     ORDER BY datetime(updated_at) DESC`,
  );
  const map = new Map<string, SectionChefRow>();
  for (const row of rows) {
    if (!map.has(row.section_id)) map.set(row.section_id, row);
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

export async function getSections(db: SqlExecutor): Promise<SectionWithAgentCount[]> {
  const rows = await db.query<SectionRow>(`SELECT * FROM sections ORDER BY datetime(created_at) DESC`);
  const counts = await agentCountsBySection(db);
  const chefs = await chefsBySection(db);
  return rows.map((row) => {
    const section = applyChefToSection(mapSection(row), chefs.get(row.id));
    return { ...section, agent_count: counts.get(row.id) ?? 0 };
  });
}

export async function createSection(db: SqlExecutor, input: CreateSectionInput): Promise<Section> {
  const id = randomId();
  const timestamp = nowIso();
  await db.run(
    `INSERT INTO sections (
       id, name, shift_type, active,
       commander_full_name, commander_grade, commander_mle,
       created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.shift_type,
      input.active ? 1 : 0,
      input.commander_full_name,
      input.commander_grade,
      input.commander_mle,
      timestamp,
      timestamp,
    ],
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

export async function updateSection(
  db: SqlExecutor,
  id: string,
  input: UpdateSectionInput,
): Promise<Section> {
  const timestamp = nowIso();
  const linkedChef = (await chefsBySection(db)).get(id);
  const commanderFullName = linkedChef ? formatChefDisplayName(linkedChef) : input.commander_full_name;
  const commanderGrade = linkedChef ? linkedChef.grade : input.commander_grade;
  const commanderMle = linkedChef ? linkedChef.professional_number : input.commander_mle;

  const result = await db.run(
    `UPDATE sections
     SET name = ?, shift_type = ?, active = ?,
         commander_full_name = ?, commander_grade = ?, commander_mle = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      input.shift_type,
      input.active ? 1 : 0,
      commanderFullName,
      commanderGrade,
      commanderMle,
      timestamp,
      id,
    ],
  );
  if (result.changes === 0) throw new Error(`Section not found: ${id}`);

  const row = await db.get<SectionRow>(`SELECT * FROM sections WHERE id = ?`, [id]);
  if (!row) throw new Error(`Section not found: ${id}`);
  return applyChefToSection(mapSection(row), linkedChef);
}

export async function deleteSection(db: SqlExecutor, id: string): Promise<void> {
  await db.transaction(async () => {
    await db.run(
      `UPDATE agents
       SET is_section_chief = 0,
           section_id = NULL,
           updated_at = ?
       WHERE section_id = ?
         AND fonction IN ('chef_de_section', 'chef_de_section_pi')`,
      [nowIso(), id],
    );
    const result = await db.run(`DELETE FROM sections WHERE id = ?`, [id]);
    if (result.changes === 0) throw new Error(`Section not found: ${id}`);
  });
}
