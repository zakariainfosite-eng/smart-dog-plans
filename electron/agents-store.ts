import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type CreateAgentInput = {
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: "male" | "female";
  section_id: string | null;
  dog_id: string | null;
  phone: string | null;
  address: string | null;
  observations: string | null;
  active: boolean;
  photo_url?: string | null;
};

export type UpdateAgentInput = CreateAgentInput;

type AgentRowDb = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: "male" | "female";
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

export type AgentRecord = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: "male" | "female";
  section_id: string | null;
  dog_id: string | null;
  is_section_chief: boolean;
  active: boolean;
  phone: string | null;
  address: string | null;
  observations: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  sections: { id: string; name: string } | null;
  dogs: { id: string; name: string; specialty: string; status: string } | null;
};

const AGENT_SELECT = `
  SELECT
    a.id,
    a.first_name,
    a.last_name,
    a.professional_number,
    a.grade,
    a.gender,
    a.section_id,
    a.dog_id,
    a.is_section_chief,
    a.active,
    a.phone,
    a.address,
    a.observations,
    a.photo_url,
    a.created_at,
    a.updated_at,
    s.id AS section_id_join,
    s.name AS section_name,
    d.id AS dog_id_join,
    d.name AS dog_name,
    d.specialty AS dog_specialty,
    d.status AS dog_status
  FROM agents a
  LEFT JOIN sections s ON s.id = a.section_id
  LEFT JOIN dogs d ON d.id = a.dog_id
`;

function nowIso(): string {
  return new Date().toISOString();
}

function mapAgentRow(row: AgentRowDb): AgentRecord {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    professional_number: row.professional_number,
    grade: row.grade,
    gender: row.gender,
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
    sections:
      row.section_id_join && row.section_name
        ? { id: row.section_id_join, name: row.section_name }
        : null,
    dogs:
      row.dog_id_join && row.dog_name
        ? {
            id: row.dog_id_join,
            name: row.dog_name,
            specialty: row.dog_specialty ?? "",
            status: row.dog_status ?? "",
          }
        : null,
  };
}

function mapAgentRecord(record: AgentRecord): AgentRecord {
  return record;
}

function rethrowConstraint(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed: agents.professional_number")) {
    throw new Error("duplicate key value violates unique constraint \"agents_professional_number_key\"");
  }
  if (message.includes("UNIQUE constraint failed: agents.dog_id")) {
    throw new Error("duplicate key value violates unique constraint \"agents_dog_id_key\"");
  }
  throw error instanceof Error ? error : new Error(message);
}

export function getAgents(db: Database.Database): AgentRecord[] {
  const rows = db
    .prepare(`${AGENT_SELECT} ORDER BY datetime(a.created_at) DESC`)
    .all() as AgentRowDb[];
  return rows.map(mapAgentRow);
}

export function getAgent(db: Database.Database, id: string): AgentRecord | null {
  const row = db.prepare(`${AGENT_SELECT} WHERE a.id = ?`).get(id) as AgentRowDb | undefined;
  return row ? mapAgentRow(row) : null;
}

export function createAgent(db: Database.Database, input: CreateAgentInput): AgentRecord {
  const id = randomUUID();
  const timestamp = nowIso();
  const sectionId = input.gender === "female" ? null : input.section_id;

  try {
    db.prepare(
      `INSERT INTO agents (
        id, first_name, last_name, professional_number, grade, gender, section_id, dog_id,
        is_section_chief, active, phone, address, observations, photo_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.first_name,
      input.last_name,
      input.professional_number,
      input.grade,
      input.gender,
      sectionId,
      input.dog_id,
      input.active ? 1 : 0,
      input.phone,
      input.address,
      input.observations,
      input.photo_url ?? null,
      timestamp,
      timestamp,
    );
  } catch (error) {
    rethrowConstraint(error);
  }

  const created = getAgent(db, id);
  if (!created) {
    throw new Error(`Agent not found after create: ${id}`);
  }
  return mapAgentRecord(created);
}

export function updateAgent(db: Database.Database, id: string, input: UpdateAgentInput): AgentRecord {
  const timestamp = nowIso();
  const sectionId = input.gender === "female" ? null : input.section_id;

  try {
    const result = db
      .prepare(
        `UPDATE agents SET
          first_name = ?,
          last_name = ?,
          professional_number = ?,
          grade = ?,
          gender = ?,
          section_id = ?,
          dog_id = ?,
          active = ?,
          phone = ?,
          address = ?,
          observations = ?,
          photo_url = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        input.first_name,
        input.last_name,
        input.professional_number,
        input.grade,
        input.gender,
        sectionId,
        input.dog_id,
        input.active ? 1 : 0,
        input.phone,
        input.address,
        input.observations,
        input.photo_url ?? null,
        timestamp,
        id,
      );

    if (result.changes === 0) {
      throw new Error(`Agent not found: ${id}`);
    }
  } catch (error) {
    rethrowConstraint(error);
  }

  const updated = getAgent(db, id);
  if (!updated) {
    throw new Error(`Agent not found: ${id}`);
  }
  return mapAgentRecord(updated);
}

export function deleteAgent(db: Database.Database, id: string): void {
  const result = db.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
  if (result.changes === 0) {
    throw new Error(`Agent not found: ${id}`);
  }
}
