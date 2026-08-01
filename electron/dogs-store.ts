import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type CreateDogInput = {
  name: string;
  gender: "male" | "female";
  specialty: "narcotics" | "explosives" | "currency";
  status: "available" | "sick" | "heat";
  active: boolean;
  breed: string | null;
  microchip_number: string | null;
  date_of_birth: string | null;
  training_level: string | null;
  veterinary_notes: string | null;
  observations: string | null;
  assignment_date: string | null;
  vaccination_info: string | null;
  health_status: string | null;
  photo_url?: string | null;
  agent_id?: string | null;
};

export type UpdateDogInput = CreateDogInput & {
  previous_agent_id?: string | null;
};

type DogRowDb = {
  id: string;
  name: string;
  gender: "male" | "female";
  specialty: "narcotics" | "explosives" | "currency";
  status: "available" | "sick" | "heat";
  active: number;
  photo_url: string | null;
  breed: string | null;
  microchip_number: string | null;
  date_of_birth: string | null;
  training_level: string | null;
  veterinary_notes: string | null;
  observations: string | null;
  assignment_date: string | null;
  vaccination_info: string | null;
  health_status: string | null;
  created_at: string;
  updated_at: string;
  agent_id_join: string | null;
  agent_first_name: string | null;
  agent_last_name: string | null;
  section_id_join: string | null;
  section_name: string | null;
};

export type DogRecord = {
  id: string;
  name: string;
  gender: "male" | "female";
  specialty: "narcotics" | "explosives" | "currency";
  status: "available" | "sick" | "heat";
  active: boolean;
  photo_url: string | null;
  breed: string | null;
  microchip_number: string | null;
  date_of_birth: string | null;
  training_level: string | null;
  veterinary_notes: string | null;
  observations: string | null;
  assignment_date: string | null;
  vaccination_info: string | null;
  health_status: string | null;
  created_at: string;
  updated_at: string;
  agent: {
    id: string;
    first_name: string;
    last_name: string;
    section: { id: string; name: string } | null;
  } | null;
};

const DOG_SELECT = `
  SELECT
    d.id,
    d.name,
    d.gender,
    d.specialty,
    d.status,
    d.active,
    d.photo_url,
    d.breed,
    d.microchip_number,
    d.date_of_birth,
    d.training_level,
    d.veterinary_notes,
    d.observations,
    d.assignment_date,
    d.vaccination_info,
    d.health_status,
    d.created_at,
    d.updated_at,
    a.id AS agent_id_join,
    a.first_name AS agent_first_name,
    a.last_name AS agent_last_name,
    s.id AS section_id_join,
    s.name AS section_name
  FROM dogs d
  LEFT JOIN agents a ON a.dog_id = d.id
  LEFT JOIN sections s ON s.id = a.section_id
`;

function nowIso(): string {
  return new Date().toISOString();
}

function mapDogRow(row: DogRowDb): DogRecord {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    specialty: row.specialty,
    status: row.status,
    active: row.active === 1,
    photo_url: row.photo_url,
    breed: row.breed,
    microchip_number: row.microchip_number,
    date_of_birth: row.date_of_birth,
    training_level: row.training_level,
    veterinary_notes: row.veterinary_notes,
    observations: row.observations,
    assignment_date: row.assignment_date,
    vaccination_info: row.vaccination_info,
    health_status: row.health_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    agent:
      row.agent_id_join && row.agent_first_name && row.agent_last_name
        ? {
            id: row.agent_id_join,
            first_name: row.agent_first_name,
            last_name: row.agent_last_name,
            section:
              row.section_id_join && row.section_name
                ? { id: row.section_id_join, name: row.section_name }
                : null,
          }
        : null,
  };
}

function toDog(record: DogRecord) {
  const { agent: _agent, ...dog } = record;
  return dog;
}

function rethrowConstraint(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed: agents.dog_id")) {
    throw new Error('duplicate key value violates unique constraint "agents_dog_id_key"');
  }
  throw error instanceof Error ? error : new Error(message);
}

function syncAgentAssignment(
  db: Database.Database,
  dogId: string,
  agentId: string | null | undefined,
  previousAgentId: string | null | undefined,
): void {
  const nextAgentId = agentId ?? null;
  const prevAgentId = previousAgentId ?? null;

  if (nextAgentId === prevAgentId) return;

  db.prepare(`UPDATE agents SET dog_id = NULL, updated_at = ? WHERE dog_id = ?`).run(
    nowIso(),
    dogId,
  );

  if (nextAgentId) {
    db.prepare(`UPDATE agents SET dog_id = NULL, updated_at = ? WHERE dog_id = ? AND id != ?`).run(
      nowIso(),
      dogId,
      nextAgentId,
    );
    const result = db
      .prepare(`UPDATE agents SET dog_id = ?, updated_at = ? WHERE id = ?`)
      .run(dogId, nowIso(), nextAgentId);
    if (result.changes === 0) {
      throw new Error(`Agent not found: ${nextAgentId}`);
    }
  }
}

export function getDogs(db: Database.Database): DogRecord[] {
  const rows = db
    .prepare(`${DOG_SELECT} ORDER BY datetime(d.created_at) DESC`)
    .all() as DogRowDb[];
  return rows.map(mapDogRow);
}

export function getDog(db: Database.Database, id: string): DogRecord | null {
  const row = db.prepare(`${DOG_SELECT} WHERE d.id = ?`).get(id) as DogRowDb | undefined;
  return row ? mapDogRow(row) : null;
}

export function createDog(db: Database.Database, input: CreateDogInput): DogRecord {
  const id = randomUUID();
  const timestamp = nowIso();
  const { agent_id, photo_url, ...payload } = input;

  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO dogs (
        id, name, gender, specialty, status, active, photo_url, breed, microchip_number,
        date_of_birth, training_level, veterinary_notes, observations, assignment_date,
        vaccination_info, health_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      payload.name,
      payload.gender,
      payload.specialty,
      payload.status,
      payload.active ? 1 : 0,
      photo_url ?? null,
      payload.breed,
      payload.microchip_number,
      payload.date_of_birth,
      payload.training_level,
      payload.veterinary_notes,
      payload.observations,
      payload.assignment_date,
      payload.vaccination_info,
      payload.health_status,
      timestamp,
      timestamp,
    );

    if (agent_id) {
      syncAgentAssignment(db, id, agent_id, null);
    }
  });

  try {
    transaction();
  } catch (error) {
    rethrowConstraint(error);
  }

  const created = getDog(db, id);
  if (!created) {
    throw new Error(`Dog not found after create: ${id}`);
  }
  return created;
}

export function updateDog(db: Database.Database, id: string, input: UpdateDogInput): DogRecord {
  const timestamp = nowIso();
  const { agent_id, previous_agent_id, photo_url, ...payload } = input;
  const existing = getDog(db, id);
  if (!existing) {
    throw new Error(`Dog not found: ${id}`);
  }
  const nextPhotoUrl = photo_url === undefined ? existing.photo_url : photo_url;

  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE dogs SET
          name = ?,
          gender = ?,
          specialty = ?,
          status = ?,
          active = ?,
          photo_url = ?,
          breed = ?,
          microchip_number = ?,
          date_of_birth = ?,
          training_level = ?,
          veterinary_notes = ?,
          observations = ?,
          assignment_date = ?,
          vaccination_info = ?,
          health_status = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        payload.name,
        payload.gender,
        payload.specialty,
        payload.status,
        payload.active ? 1 : 0,
        nextPhotoUrl,
        payload.breed,
        payload.microchip_number,
        payload.date_of_birth,
        payload.training_level,
        payload.veterinary_notes,
        payload.observations,
        payload.assignment_date,
        payload.vaccination_info,
        payload.health_status,
        timestamp,
        id,
      );

    if (result.changes === 0) {
      throw new Error(`Dog not found: ${id}`);
    }

    if (agent_id !== undefined || previous_agent_id !== undefined) {
      syncAgentAssignment(db, id, agent_id ?? null, previous_agent_id ?? null);
    }
  });

  try {
    transaction();
  } catch (error) {
    rethrowConstraint(error);
  }

  const updated = getDog(db, id);
  if (!updated) {
    throw new Error(`Dog not found: ${id}`);
  }
  return updated;
}

export function deleteDog(db: Database.Database, id: string): void {
  const result = db.prepare(`DELETE FROM dogs WHERE id = ?`).run(id);
  if (result.changes === 0) {
    throw new Error(`Dog not found: ${id}`);
  }
}

export { toDog };
