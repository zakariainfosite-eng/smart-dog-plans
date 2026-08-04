import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  isChefDeSectionFonction,
  isCynotechnicienFonction,
  normalizePersonnelFonction,
  parsePersonnelFonctionStrict,
  type PersonnelFonction,
} from "../src/lib/personnel-fonction";

export type { PersonnelFonction };

export type MaritalStatus = "single" | "married" | "divorced" | "widowed";

export type CreateAgentInput = {
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: "male" | "female";
  fonction: PersonnelFonction;
  marital_status: MaritalStatus;
  section_id: string | null;
  dog_id: string | null;
  phone: string | null;
  address: string | null;
  observations: string | null;
  active: boolean;
  photo_url?: string | null;
};

/**
 * Updates may omit marital_status (preserve previous), pass null (legacy / Non renseignée),
 * or set an explicit value. Form create/edit always sends a required enum value.
 */
export type UpdateAgentInput = Omit<CreateAgentInput, "marital_status"> & {
  marital_status?: MaritalStatus | null;
};

type AgentRowDb = {
  id: string;
  first_name: string;
  last_name: string;
  professional_number: string;
  grade: string;
  gender: "male" | "female";
  fonction: PersonnelFonction;
  marital_status: string | null;
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
  fonction: PersonnelFonction;
  marital_status: MaritalStatus | null;
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

const VALID_MARITAL_STATUSES = new Set<string>([
  "single",
  "married",
  "divorced",
  "widowed",
]);

const AGENT_SELECT = `
  SELECT
    a.id,
    a.first_name,
    a.last_name,
    a.professional_number,
    a.grade,
    a.gender,
    COALESCE(a.fonction, 'cynotechnicien') AS fonction,
    a.marital_status,
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

function normalizeMaritalStatus(value: string | null | undefined): MaritalStatus | null {
  if (value && VALID_MARITAL_STATUSES.has(value)) return value as MaritalStatus;
  return null;
}

function requireMaritalStatus(value: string | null | undefined): MaritalStatus {
  const normalized = normalizeMaritalStatus(value);
  if (!normalized) {
    throw new Error(
      `Agent marital_status is required and must be one of: ${[...VALID_MARITAL_STATUSES].join(", ")}`,
    );
  }
  return normalized;
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveAssignmentFields(input: CreateAgentInput): {
  fonction: PersonnelFonction;
  sectionId: string | null;
  dogId: string | null;
  isSectionChief: number;
} {
  // Never silently coerce a missing/invalid write payload to cynotechnicien —
  // that hid persistence bugs when the UI selected another role.
  // Accepts canonical keys and known aliases (chef_brigade → chef_brigadier, …).
  const fonction = parsePersonnelFonctionStrict(input.fonction);
  const isCyno = isCynotechnicienFonction(fonction);
  const isChief = isChefDeSectionFonction(fonction);
  return {
    fonction,
    sectionId: isCyno
      ? input.gender !== "female"
        ? input.section_id
        : null
      : isChief
        ? input.section_id
        : null,
    dogId: isCyno ? input.dog_id : null,
    isSectionChief: isChief && input.section_id ? 1 : 0,
  };
}

function formatCommanderFullName(input: CreateAgentInput): string {
  return [input.grade, input.first_name, input.last_name]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function clearSectionCommander(db: Database.Database, sectionId: string): void {
  db.prepare(
    `UPDATE sections SET
       commander_full_name = '',
       commander_grade = '',
       commander_mle = '',
       updated_at = ?
     WHERE id = ?`,
  ).run(nowIso(), sectionId);
}

function writeSectionCommander(
  db: Database.Database,
  sectionId: string,
  input: CreateAgentInput,
): void {
  db.prepare(
    `UPDATE sections SET
       commander_full_name = ?,
       commander_grade = ?,
       commander_mle = ?,
       updated_at = ?
     WHERE id = ?`,
  ).run(
    formatCommanderFullName(input),
    input.grade,
    input.professional_number,
    nowIso(),
    sectionId,
  );
}

/**
 * Keep sections.commander_* in sync with the unique Chef de section per section.
 * Replacing a chef demotes the previous one and clears their section link.
 */
function syncSectionChiefLink(
  db: Database.Database,
  agentId: string,
  input: CreateAgentInput,
  previous: { section_id: string | null; fonction: string } | null,
): ReturnType<typeof resolveAssignmentFields> {
  const resolved = resolveAssignmentFields(input);
  const isChief = isChefDeSectionFonction(resolved.fonction);
  const previousWasChief = isChefDeSectionFonction(previous?.fonction);

  if (previousWasChief && previous?.section_id) {
    const leaving =
      !isChief || previous.section_id !== resolved.sectionId;
    if (leaving) {
      clearSectionCommander(db, previous.section_id);
    }
  }

  if (isChief && resolved.sectionId) {
    db.prepare(
      `UPDATE agents
       SET is_section_chief = 0,
           section_id = NULL,
           updated_at = ?
       WHERE fonction IN ('chef_de_section', 'chef_de_section_pi')
         AND section_id = ?
         AND id != ?`,
    ).run(nowIso(), resolved.sectionId, agentId);

    writeSectionCommander(db, resolved.sectionId, input);
  }

  return resolved;
}

function mapAgentRow(row: AgentRowDb): AgentRecord {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    professional_number: row.professional_number,
    grade: row.grade,
    gender: row.gender,
    // Read path: map legacy aliases; unknown → cynotechnicien (compatibility).
    fonction: normalizePersonnelFonction(row.fonction),
    marital_status: normalizeMaritalStatus(row.marital_status),
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
  const maritalStatus = requireMaritalStatus(input.marital_status);

  try {
    const run = db.transaction(() => {
      const { fonction, sectionId, dogId, isSectionChief } = syncSectionChiefLink(
        db,
        id,
        input,
        null,
      );

      db.prepare(
        `INSERT INTO agents (
          id, first_name, last_name, professional_number, grade, gender, fonction, marital_status,
          section_id, dog_id, is_section_chief, active, phone, address, observations, photo_url,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.first_name,
        input.last_name,
        input.professional_number,
        input.grade,
        input.gender,
        fonction,
        maritalStatus,
        sectionId,
        dogId,
        isSectionChief,
        input.active ? 1 : 0,
        input.phone,
        input.address,
        input.observations,
        input.photo_url ?? null,
        timestamp,
        timestamp,
      );
    });
    run();
  } catch (error) {
    rethrowConstraint(error);
  }

  const created = getAgent(db, id);
  if (!created) {
    throw new Error(`Agent not found after create: ${id}`);
  }
  if (created.marital_status !== maritalStatus) {
    throw new Error(
      `Agent marital_status was not persisted on create (expected ${maritalStatus}, got ${String(created.marital_status)}). Restart Electron so the main process loads the latest agents-store.`,
    );
  }
  return mapAgentRecord(created);
}

export function updateAgent(db: Database.Database, id: string, input: UpdateAgentInput): AgentRecord {
  const timestamp = nowIso();
  const previous = getAgent(db, id);
  if (!previous) {
    throw new Error(`Agent not found: ${id}`);
  }

  // Form always sends a value. If a caller omits the field (undefined), preserve
  // the previous value — never silently clear Situation familiale on unrelated updates.
  // Explicit null / "" keeps legacy « Non renseignée » (section reassignment).
  const maritalStatus =
    input.marital_status === undefined
      ? previous.marital_status
      : input.marital_status == null || input.marital_status === ""
        ? null
        : requireMaritalStatus(input.marital_status);

  try {
    const run = db.transaction(() => {
      const { fonction, sectionId, dogId, isSectionChief } = syncSectionChiefLink(
        db,
        id,
        input,
        { section_id: previous.section_id, fonction: previous.fonction },
      );

      const result = db
        .prepare(
          `UPDATE agents SET
            first_name = ?,
            last_name = ?,
            professional_number = ?,
            grade = ?,
            gender = ?,
            fonction = ?,
            marital_status = ?,
            section_id = ?,
            dog_id = ?,
            is_section_chief = ?,
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
          fonction,
          maritalStatus,
          sectionId,
          dogId,
          isSectionChief,
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
    });
    run();
  } catch (error) {
    rethrowConstraint(error);
  }

  const updated = getAgent(db, id);
  if (!updated) {
    throw new Error(`Agent not found: ${id}`);
  }
  if (updated.marital_status !== maritalStatus) {
    throw new Error(
      `Agent marital_status was not persisted on update (expected ${String(maritalStatus)}, got ${String(updated.marital_status)}). Restart Electron so the main process loads the latest agents-store.`,
    );
  }
  return mapAgentRecord(updated);
}

export function deleteAgent(db: Database.Database, id: string): void {
  const previous = getAgent(db, id);
  if (!previous) {
    throw new Error(`Agent not found: ${id}`);
  }

  const run = db.transaction(() => {
    if (isChefDeSectionFonction(previous.fonction) && previous.section_id) {
      clearSectionCommander(db, previous.section_id);
    }
    db.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
  });
  run();
}
