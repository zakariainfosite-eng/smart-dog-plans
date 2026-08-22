import { randomId } from "@/lib/random-id";
import type { SqlExecutor } from "./sql-executor";
import type { CreateDogInput, Dog, DogRow, UpdateDogInput } from "./types";

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
  agent_professional_number: string | null;
  agent_grade: string | null;
  section_id_join: string | null;
  section_name: string | null;
};

const DOG_SELECT = `
  SELECT
    d.id, d.name, d.gender, d.specialty, d.status, d.active, d.photo_url, d.breed,
    d.microchip_number, d.date_of_birth, d.training_level, d.veterinary_notes, d.observations,
    d.assignment_date, d.vaccination_info, d.health_status, d.created_at, d.updated_at,
    a.id AS agent_id_join, a.first_name AS agent_first_name, a.last_name AS agent_last_name,
    a.professional_number AS agent_professional_number, a.grade AS agent_grade,
    s.id AS section_id_join, s.name AS section_name
  FROM dogs d
  LEFT JOIN agents a ON a.dog_id = d.id
  LEFT JOIN sections s ON s.id = a.section_id
`;

function nowIso(): string {
  return new Date().toISOString();
}

function mapDogRow(row: DogRowDb): DogRow {
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
            professional_number: row.agent_professional_number,
            grade: row.agent_grade,
            section: row.section_id_join && row.section_name ? { id: row.section_id_join, name: row.section_name } : null,
          }
        : null,
  };
}

function toDog(record: DogRow): Dog {
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

async function syncAgentAssignment(
  db: SqlExecutor,
  dogId: string,
  agentId: string | null | undefined,
  previousAgentId: string | null | undefined,
): Promise<void> {
  const nextAgentId = agentId ?? null;
  const prevAgentId = previousAgentId ?? null;
  if (nextAgentId === prevAgentId) return;
  await db.run(`UPDATE agents SET dog_id = NULL, updated_at = ? WHERE dog_id = ?`, [nowIso(), dogId]);
  if (nextAgentId) {
    await db.run(`UPDATE agents SET dog_id = NULL, updated_at = ? WHERE dog_id = ? AND id != ?`, [
      nowIso(),
      dogId,
      nextAgentId,
    ]);
    const result = await db.run(`UPDATE agents SET dog_id = ?, updated_at = ? WHERE id = ?`, [
      dogId,
      nowIso(),
      nextAgentId,
    ]);
    if (result.changes === 0) throw new Error(`Agent not found: ${nextAgentId}`);
  }
}

export async function getDogs(db: SqlExecutor): Promise<DogRow[]> {
  const rows = await db.query<DogRowDb>(`${DOG_SELECT} ORDER BY datetime(d.created_at) DESC`);
  return rows.map(mapDogRow);
}

export async function getDog(db: SqlExecutor, id: string): Promise<DogRow | null> {
  const row = await db.get<DogRowDb>(`${DOG_SELECT} WHERE d.id = ?`, [id]);
  return row ? mapDogRow(row) : null;
}

export async function createDog(db: SqlExecutor, input: CreateDogInput): Promise<Dog> {
  const id = randomId();
  const timestamp = nowIso();
  const { agent_id, photo_url, ...payload } = input;
  try {
    await db.transaction(async () => {
      await db.run(
        `INSERT INTO dogs (
          id, name, gender, specialty, status, active, photo_url, breed, microchip_number,
          date_of_birth, training_level, veterinary_notes, observations, assignment_date,
          vaccination_info, health_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, payload.name, payload.gender, payload.specialty, payload.status, payload.active ? 1 : 0,
          photo_url ?? null, payload.breed, payload.microchip_number, payload.date_of_birth,
          payload.training_level, payload.veterinary_notes, payload.observations, payload.assignment_date,
          payload.vaccination_info, payload.health_status, timestamp, timestamp,
        ],
      );
      if (agent_id) await syncAgentAssignment(db, id, agent_id, null);
    });
  } catch (error) {
    rethrowConstraint(error);
  }
  const created = await getDog(db, id);
  if (!created) throw new Error(`Dog not found after create: ${id}`);
  return toDog(created);
}

export async function updateDog(db: SqlExecutor, id: string, input: UpdateDogInput): Promise<Dog> {
  const timestamp = nowIso();
  const { agent_id, previous_agent_id, photo_url, ...payload } = input;
  const existing = await getDog(db, id);
  if (!existing) throw new Error(`Dog not found: ${id}`);
  const nextPhotoUrl = photo_url === undefined ? existing.photo_url : photo_url;
  try {
    await db.transaction(async () => {
      const result = await db.run(
        `UPDATE dogs SET
          name = ?, gender = ?, specialty = ?, status = ?, active = ?, photo_url = ?, breed = ?,
          microchip_number = ?, date_of_birth = ?, training_level = ?, veterinary_notes = ?,
          observations = ?, assignment_date = ?, vaccination_info = ?, health_status = ?, updated_at = ?
        WHERE id = ?`,
        [
          payload.name, payload.gender, payload.specialty, payload.status, payload.active ? 1 : 0,
          nextPhotoUrl, payload.breed, payload.microchip_number, payload.date_of_birth,
          payload.training_level, payload.veterinary_notes, payload.observations, payload.assignment_date,
          payload.vaccination_info, payload.health_status, timestamp, id,
        ],
      );
      if (result.changes === 0) throw new Error(`Dog not found: ${id}`);
      if (agent_id !== undefined || previous_agent_id !== undefined) {
        await syncAgentAssignment(db, id, agent_id ?? null, previous_agent_id ?? null);
      }
    });
  } catch (error) {
    rethrowConstraint(error);
  }
  const updated = await getDog(db, id);
  if (!updated) throw new Error(`Dog not found: ${id}`);
  return toDog(updated);
}

export async function deleteDog(db: SqlExecutor, id: string): Promise<void> {
  const result = await db.run(`DELETE FROM dogs WHERE id = ?`, [id]);
  if (result.changes === 0) throw new Error(`Dog not found: ${id}`);
}
