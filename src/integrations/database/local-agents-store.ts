import {
  isChefDeSectionFonction,
  isCynotechnicienFonction,
  isPrimaryChefDeSectionFonction,
  normalizePersonnelFonction,
  parsePersonnelFonctionStrict,
  type PersonnelFonction,
} from "@/lib/personnel-fonction";
import { normalizeAgentBirthDate, validateAgentBirthDate } from "@/lib/agent-birth-date";
import { randomId } from "@/lib/random-id";
import type { SqlExecutor } from "./sql-executor";
import type { Agent, AgentRow, AgentWriteInput, MaritalStatus } from "./types";

type AgentRowDb = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: "male" | "female";
  fonction: PersonnelFonction;
  marital_status: string | null;
  date_naissance: string | null;
  origine: string | null;
  section_id: string | null;
  dog_id: string | null;
  is_section_chief: number;
  active: number;
  phone: string | null;
  address: string | null;
  observations: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  section_id_join: string | null;
  section_name: string | null;
  dog_id_join: string | null;
  dog_name: string | null;
  dog_specialty: string | null;
  dog_status: string | null;
};

const VALID_MARITAL_STATUSES = new Set<string>(["single", "married", "divorced", "widowed"]);

const AGENT_SELECT = `
  SELECT
    a.id, a.first_name, a.last_name, a.professional_number, a.grade, a.gender,
    COALESCE(a.fonction, 'cynotechnicien') AS fonction,
    a.marital_status, a.date_naissance, a.origine, a.section_id, a.dog_id, a.is_section_chief,
    a.active, a.phone, a.address, a.observations, a.photo_url, a.created_at, a.updated_at,
    s.id AS section_id_join, s.name AS section_name,
    d.id AS dog_id_join, d.name AS dog_name, d.specialty AS dog_specialty, d.status AS dog_status
  FROM agents a
  LEFT JOIN sections s ON s.id = a.section_id
  LEFT JOIN dogs d ON d.id = a.dog_id
`;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeMaritalStatus(value: string | null | undefined): MaritalStatus | null {
  if (value && VALID_MARITAL_STATUSES.has(value)) return value as MaritalStatus;
  return null;
}

function parseMaritalStatusWrite(value: string | null | undefined): MaritalStatus | null {
  if (!value?.trim()) return null;
  const normalized = normalizeMaritalStatus(value);
  if (!normalized) {
    throw new Error(
      `Agent marital_status must be one of: ${[...VALID_MARITAL_STATUSES].join(", ")}`,
    );
  }
  return normalized;
}

function requireBirthDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const code = validateAgentBirthDate(value);
  if (code) throw new Error(`Agent date_naissance is invalid (${code})`);
  return normalizeAgentBirthDate(value);
}

function resolveAssignmentFields(input: AgentWriteInput) {
  const fonction = parsePersonnelFonctionStrict(input.fonction);
  const isCyno = isCynotechnicienFonction(fonction);
  const isChief = isChefDeSectionFonction(fonction);
  const isPrimaryChef = isPrimaryChefDeSectionFonction(fonction);
  return {
    fonction,
    sectionId: isCyno ? (input.gender !== "female" ? input.section_id : null) : isChief ? input.section_id : null,
    dogId: isCyno ? input.dog_id : null,
    isSectionChief: isPrimaryChef && input.section_id ? 1 : 0,
  };
}

function formatCommanderFullName(input: AgentWriteInput): string {
  return [input.first_name, input.last_name].map((part) => part.trim()).filter(Boolean).join(" ");
}

async function clearSectionCommander(db: SqlExecutor, sectionId: string): Promise<void> {
  await db.run(
    `UPDATE sections SET commander_full_name = '', commander_grade = '', commander_mle = '', updated_at = ? WHERE id = ?`,
    [nowIso(), sectionId],
  );
}

async function writeSectionCommander(db: SqlExecutor, sectionId: string, input: AgentWriteInput): Promise<void> {
  await db.run(
    `UPDATE sections SET commander_full_name = ?, commander_grade = ?, commander_mle = ?, updated_at = ? WHERE id = ?`,
    [formatCommanderFullName(input), input.grade, input.professional_number, nowIso(), sectionId],
  );
}

async function syncSectionChiefLink(
  db: SqlExecutor,
  input: AgentWriteInput,
  previous: { section_id: string | null; fonction: string } | null,
) {
  const resolved = resolveAssignmentFields(input);
  const isPrimaryChef = isPrimaryChefDeSectionFonction(resolved.fonction);
  const previousWasPrimaryChef = isPrimaryChefDeSectionFonction(previous?.fonction);
  if (previousWasPrimaryChef && previous?.section_id) {
    const leaving = !isPrimaryChef || previous.section_id !== resolved.sectionId;
    if (leaving) await clearSectionCommander(db, previous.section_id);
  }
  if (isPrimaryChef && resolved.sectionId) {
    await writeSectionCommander(db, resolved.sectionId, input);
  }
  return resolved;
}

function mapAgentRow(row: AgentRowDb): AgentRow {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    professional_number: row.professional_number,
    grade: row.grade,
    gender: row.gender,
    fonction: normalizePersonnelFonction(row.fonction),
    marital_status: normalizeMaritalStatus(row.marital_status),
    date_naissance: normalizeAgentBirthDate(row.date_naissance),
    origine: row.origine,
    section_id: row.section_id,
    dog_id: row.dog_id,
    is_section_chief: row.is_section_chief === 1,
    active: row.active === 1,
    phone: row.phone,
    address: row.address,
    observations: row.observations,
    photo_url: row.photo_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sections: row.section_id_join && row.section_name ? { id: row.section_id_join, name: row.section_name } : null,
    dogs:
      row.dog_id_join && row.dog_name
        ? { id: row.dog_id_join, name: row.dog_name, specialty: row.dog_specialty ?? "", status: row.dog_status ?? "" }
        : null,
  };
}

function toAgent(row: AgentRow): Agent {
  const { sections: _s, dogs: _d, ...agent } = row;
  return agent;
}

function rethrowConstraint(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed: agents.professional_number")) {
    throw new Error('duplicate key value violates unique constraint "agents_professional_number_key"');
  }
  if (message.includes("UNIQUE constraint failed: agents.dog_id")) {
    throw new Error('duplicate key value violates unique constraint "agents_dog_id_key"');
  }
  throw error instanceof Error ? error : new Error(message);
}

export async function getAgents(db: SqlExecutor): Promise<AgentRow[]> {
  const rows = await db.query<AgentRowDb>(`${AGENT_SELECT} ORDER BY datetime(a.created_at) DESC`);
  return rows.map(mapAgentRow);
}

export async function getAgent(db: SqlExecutor, id: string): Promise<AgentRow | null> {
  const row = await db.get<AgentRowDb>(`${AGENT_SELECT} WHERE a.id = ?`, [id]);
  return row ? mapAgentRow(row) : null;
}

export async function createAgent(db: SqlExecutor, input: AgentWriteInput): Promise<Agent> {
  const id = randomId();
  const timestamp = nowIso();
  const maritalStatus = parseMaritalStatusWrite(input.marital_status);
  const birthDate = requireBirthDate(input.date_naissance);
  try {
    await db.transaction(async () => {
      const { fonction, sectionId, dogId, isSectionChief } = await syncSectionChiefLink(db, input, null);
      await db.run(
        `INSERT INTO agents (
          id, first_name, last_name, professional_number, grade, gender, fonction, marital_status,
          date_naissance, origine, section_id, dog_id, is_section_chief, active, phone, address, observations,
          photo_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, input.first_name, input.last_name, input.professional_number, input.grade, input.gender,
          fonction, maritalStatus, birthDate, input.origine?.trim() || null, sectionId, dogId, isSectionChief, input.active ? 1 : 0,
          input.phone, input.address, input.observations, input.photo_url ?? null, timestamp, timestamp,
        ],
      );
    });
  } catch (error) {
    rethrowConstraint(error);
  }
  const created = await getAgent(db, id);
  if (!created) throw new Error(`Agent not found after create: ${id}`);
  return toAgent(created);
}

export async function updateAgent(db: SqlExecutor, id: string, input: AgentWriteInput): Promise<Agent> {
  const timestamp = nowIso();
  const previous = await getAgent(db, id);
  if (!previous) throw new Error(`Agent not found: ${id}`);
  const maritalStatus =
    input.marital_status === undefined
      ? previous.marital_status
      : parseMaritalStatusWrite(input.marital_status as string | null | undefined);
  const birthDate =
    input.date_naissance === undefined
      ? previous.date_naissance
      : requireBirthDate(input.date_naissance);
  const origine =
    input.origine === undefined ? previous.origine : input.origine?.trim() || null;
  try {
    await db.transaction(async () => {
      const { fonction, sectionId, dogId, isSectionChief } = await syncSectionChiefLink(db, input, {
        section_id: previous.section_id,
        fonction: previous.fonction,
      });
      const result = await db.run(
        `UPDATE agents SET
          first_name = ?, last_name = ?, professional_number = ?, grade = ?, gender = ?, fonction = ?,
          marital_status = ?, date_naissance = ?, origine = ?, section_id = ?, dog_id = ?, is_section_chief = ?,
          active = ?, phone = ?, address = ?, observations = ?, photo_url = ?, updated_at = ?
        WHERE id = ?`,
        [
          input.first_name, input.last_name, input.professional_number, input.grade, input.gender, fonction,
          maritalStatus, birthDate, origine, sectionId, dogId, isSectionChief, input.active ? 1 : 0,
          input.phone, input.address, input.observations, input.photo_url ?? null, timestamp, id,
        ],
      );
      if (result.changes === 0) throw new Error(`Agent not found: ${id}`);
    });
  } catch (error) {
    rethrowConstraint(error);
  }
  const updated = await getAgent(db, id);
  if (!updated) throw new Error(`Agent not found: ${id}`);
  return toAgent(updated);
}

export async function deleteAgent(db: SqlExecutor, id: string): Promise<void> {
  const previous = await getAgent(db, id);
  if (!previous) throw new Error(`Agent not found: ${id}`);
  await db.transaction(async () => {
    if (isPrimaryChefDeSectionFonction(previous.fonction) && previous.section_id) {
      await clearSectionCommander(db, previous.section_id);
    }
    await db.run(`DELETE FROM agents WHERE id = ?`, [id]);
  });
}
