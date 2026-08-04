import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type CreateCheckpointInput = {
  name: string;
  active: boolean;
  operating_days: number[];
  day_shift_enabled: boolean;
  night_shift_enabled: boolean;
  day: { explosives: number; narcotics: number };
  night: { explosives: number; narcotics: number };
  female_policy: "allowed" | "preferred" | "not_allowed";
  priority: 1 | 2 | 3 | 4;
  /** true = Mandatory (YES), false = Optional (NO). Default true. */
  mandatory: boolean;
};

export type UpdateCheckpointInput = CreateCheckpointInput;

type Shift = "day" | "night";
type CheckpointSpecialty = "narcotics" | "explosives";
type AllowedGender = "all" | "male" | "female";

type CheckpointRowDb = {
  id: string;
  name: string;
  active: number;
  night_only: number;
  allowed_gender: AllowedGender;
  operating_days: string;
  day_shift_enabled: number;
  night_shift_enabled: number;
  female_policy: "allowed" | "preferred" | "not_allowed";
  priority: number;
  /** 1 = YES, 0 = NO. May be undefined on pre-migration rows. */
  mandatory?: number;
  day_explosives: number;
  day_narcotics: number;
  night_explosives: number;
  night_narcotics: number;
  required_drugs: number;
  required_explosives: number;
  created_at: string;
  updated_at: string;
};

type CheckpointPostRowDb = {
  id: string;
  checkpoint_id: string;
  specialty_required: "narcotics" | "explosives" | "currency";
  required_agents: number;
  active: number;
  shift: Shift;
  dog_required: number;
  allowed_gender: AllowedGender;
  created_at: string;
  updated_at: string;
};

export type CheckpointPostRecord = {
  id: string;
  checkpoint_id: string;
  specialty_required: "narcotics" | "explosives" | "currency";
  required_agents: number;
  active: boolean;
  shift: Shift;
  dog_required: boolean;
  allowed_gender: AllowedGender;
  created_at: string;
  updated_at: string;
};

export type CheckpointRecord = {
  id: string;
  name: string;
  active: boolean;
  night_only: boolean;
  allowed_gender: AllowedGender;
  operating_days: number[];
  day_shift_enabled: boolean;
  night_shift_enabled: boolean;
  female_policy: "allowed" | "preferred" | "not_allowed";
  priority: 1 | 2 | 3 | 4;
  /** true = Mandatory (YES), false = Optional (NO). */
  mandatory: boolean;
  day_explosives: number;
  day_narcotics: number;
  night_explosives: number;
  night_narcotics: number;
  required_drugs: number;
  required_explosives: number;
  created_at: string;
  updated_at: string;
};

export type CheckpointWithPostsRecord = CheckpointRecord & {
  posts: CheckpointPostRecord[];
};

const SPECIALTIES: CheckpointSpecialty[] = ["narcotics", "explosives"];
const SHIFTS: Shift[] = ["day", "night"];

const SPECIALTY_COUNT_KEY: Record<CheckpointSpecialty, "narcotics" | "explosives"> = {
  narcotics: "narcotics",
  explosives: "explosives",
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseOperatingDays(value: string | null | undefined): number[] {
  if (!value?.trim()) return [1, 2, 3, 4, 5, 6, 7];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const valid = parsed
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
      return valid.length ? [...new Set(valid)].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7];
    }
  } catch {
    // fall through
  }
  return [1, 2, 3, 4, 5, 6, 7];
}

function operatingDaysToText(days: number[]): string {
  return JSON.stringify(days);
}

function femalePolicyToAllowedGender(
  policy: CreateCheckpointInput["female_policy"],
): AllowedGender {
  if (policy === "not_allowed") return "male";
  if (policy === "preferred") return "female";
  return "all";
}

function configToRowPayload(config: CreateCheckpointInput) {
  const dayNarcotics = config.day_shift_enabled ? config.day.narcotics : 0;
  const nightNarcotics = config.night_shift_enabled ? config.night.narcotics : 0;
  const dayExplosives = config.day_shift_enabled ? config.day.explosives : 0;
  const nightExplosives = config.night_shift_enabled ? config.night.explosives : 0;

  return {
    name: config.name.trim(),
    active: config.active ? 1 : 0,
    operating_days: operatingDaysToText(config.operating_days),
    day_shift_enabled: config.day_shift_enabled ? 1 : 0,
    night_shift_enabled: config.night_shift_enabled ? 1 : 0,
    day_explosives: config.day.explosives,
    day_narcotics: config.day.narcotics,
    night_explosives: config.night.explosives,
    night_narcotics: config.night.narcotics,
    female_policy: config.female_policy,
    priority: config.priority,
    mandatory: config.mandatory === false ? 0 : 1,
    night_only: !config.day_shift_enabled && config.night_shift_enabled ? 1 : 0,
    // Enabled shifts only — ignore residual counts on disabled shifts.
    required_drugs: Math.max(dayNarcotics, nightNarcotics),
    required_explosives: Math.max(dayExplosives, nightExplosives),
    allowed_gender: femalePolicyToAllowedGender(config.female_policy),
  };
}

function mapCheckpoint(row: CheckpointRowDb): CheckpointRecord {
  return {
    id: row.id,
    name: row.name,
    active: row.active === 1,
    night_only: row.night_only === 1,
    allowed_gender: row.allowed_gender,
    operating_days: parseOperatingDays(row.operating_days),
    day_shift_enabled: row.day_shift_enabled === 1,
    night_shift_enabled: row.night_shift_enabled === 1,
    female_policy: row.female_policy,
    priority: ([1, 2, 3, 4].includes(row.priority) ? row.priority : 3) as 1 | 2 | 3 | 4,
    // Missing column (pre-migration) → treat as mandatory YES.
    mandatory: row.mandatory === 0 ? false : true,
    day_explosives: row.day_explosives,
    day_narcotics: row.day_narcotics,
    night_explosives: row.night_explosives,
    night_narcotics: row.night_narcotics,
    required_drugs: row.required_drugs,
    required_explosives: row.required_explosives,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPost(row: CheckpointPostRowDb): CheckpointPostRecord {
  return {
    id: row.id,
    checkpoint_id: row.checkpoint_id,
    specialty_required: row.specialty_required,
    required_agents: row.required_agents,
    active: row.active === 1,
    shift: row.shift,
    dog_required: row.dog_required === 1,
    allowed_gender: row.allowed_gender,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getPostsByCheckpointId(db: Database.Database): Map<string, CheckpointPostRecord[]> {
  const rows = db.prepare(`SELECT * FROM checkpoint_posts`).all() as CheckpointPostRowDb[];
  const grouped = new Map<string, CheckpointPostRecord[]>();
  for (const row of rows) {
    const post = mapPost(row);
    const list = grouped.get(row.checkpoint_id) ?? [];
    list.push(post);
    grouped.set(row.checkpoint_id, list);
  }
  return grouped;
}

function attachPosts(
  checkpoint: CheckpointRecord,
  postsByCheckpoint: Map<string, CheckpointPostRecord[]>,
): CheckpointWithPostsRecord {
  return {
    ...checkpoint,
    posts: postsByCheckpoint.get(checkpoint.id) ?? [],
  };
}

function rethrowConstraint(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed: checkpoints.name")) {
    throw new Error('duplicate key value violates unique constraint "checkpoints_name_unique"');
  }
  throw error instanceof Error ? error : new Error(message);
}

function postHasPlanningHistory(db: Database.Database, postId: string): boolean {
  const rotation = db
    .prepare(`SELECT COUNT(*) AS count FROM rotation_history WHERE checkpoint_post_id = ?`)
    .get(postId) as { count: number };
  const planning = db
    .prepare(`SELECT COUNT(*) AS count FROM planning_assignments WHERE checkpoint_post_id = ?`)
    .get(postId) as { count: number };
  return rotation.count > 0 || planning.count > 0;
}

function deactivateCheckpointPost(db: Database.Database, postId: string): void {
  db.prepare(`UPDATE checkpoint_posts SET active = 0, updated_at = ? WHERE id = ?`).run(
    nowIso(),
    postId,
  );
}

function deleteCheckpointPostIfUnused(db: Database.Database, postId: string): void {
  if (postHasPlanningHistory(db, postId)) {
    deactivateCheckpointPost(db, postId);
    return;
  }
  db.prepare(`DELETE FROM checkpoint_posts WHERE id = ?`).run(postId);
}

function isOperationalSpecialty(value: string): value is CheckpointSpecialty {
  return value === "narcotics" || value === "explosives";
}

function isShiftEnabled(config: CreateCheckpointInput, shift: Shift): boolean {
  return shift === "day" ? config.day_shift_enabled : config.night_shift_enabled;
}

function getShiftCounts(config: CreateCheckpointInput, shift: Shift) {
  return shift === "day" ? config.day : config.night;
}

function allowedGenderFromConfig(config: CreateCheckpointInput): AllowedGender {
  if (config.female_policy === "not_allowed") return "male";
  return "all";
}

type PostRow = {
  id: string;
  shift: Shift;
  specialty_required: CheckpointSpecialty | string;
  required_agents: number;
  active: boolean;
};

function insertActivePost(
  db: Database.Database,
  checkpointId: string,
  specialty: CheckpointSpecialty,
  payload: {
    required_agents: number;
    active: boolean;
    allowed_gender: AllowedGender;
    dog_required: boolean;
    shift: Shift;
  },
): void {
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO checkpoint_posts (
      id, checkpoint_id, specialty_required, required_agents, active, shift, dog_required,
      allowed_gender, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    checkpointId,
    specialty,
    payload.required_agents,
    payload.active ? 1 : 0,
    payload.shift,
    payload.dog_required ? 1 : 0,
    payload.allowed_gender,
    timestamp,
    timestamp,
  );
}

function updateActivePost(
  db: Database.Database,
  postId: string,
  payload: {
    required_agents: number;
    active: boolean;
    allowed_gender: AllowedGender;
    dog_required: boolean;
    shift: Shift;
  },
): void {
  db.prepare(
    `UPDATE checkpoint_posts
     SET required_agents = ?, active = ?, allowed_gender = ?, dog_required = ?, shift = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    payload.required_agents,
    payload.active ? 1 : 0,
    payload.allowed_gender,
    payload.dog_required ? 1 : 0,
    payload.shift,
    nowIso(),
    postId,
  );
}

function syncSlot(
  db: Database.Database,
  checkpointId: string,
  shift: Shift,
  specialty: CheckpointSpecialty,
  requiredAgents: number,
  allowedGender: AllowedGender,
  slotPosts: PostRow[],
): void {
  const payload = {
    required_agents: requiredAgents,
    active: true as const,
    allowed_gender: allowedGender,
    dog_required: true,
    shift,
  };

  const activePosts = slotPosts.filter((post) => post.active);

  if (requiredAgents === 0) {
    for (const post of activePosts) {
      deactivateCheckpointPost(db, post.id);
    }
    return;
  }

  const activePost = activePosts[0];

  if (activePost) {
    const staffingChanged = activePost.required_agents !== requiredAgents;

    if (staffingChanged && postHasPlanningHistory(db, activePost.id)) {
      deactivateCheckpointPost(db, activePost.id);
      insertActivePost(db, checkpointId, specialty, payload);
    } else {
      updateActivePost(db, activePost.id, payload);
    }

    for (const extra of activePosts.slice(1)) {
      deactivateCheckpointPost(db, extra.id);
    }
    return;
  }

  const reusable = slotPosts.find((post) => !post.active);
  if (reusable && !postHasPlanningHistory(db, reusable.id)) {
    updateActivePost(db, reusable.id, payload);
    return;
  }

  insertActivePost(db, checkpointId, specialty, payload);
}

function syncCheckpointPostsFromConfig(
  db: Database.Database,
  checkpointId: string,
  config: CreateCheckpointInput,
): void {
  const existing = db
    .prepare(
      `SELECT id, shift, specialty_required, required_agents, active
       FROM checkpoint_posts
       WHERE checkpoint_id = ?`,
    )
    .all(checkpointId) as PostRow[];

  const allowedGender = allowedGenderFromConfig(config);

  for (const post of existing) {
    if (!isOperationalSpecialty(post.specialty_required)) {
      deleteCheckpointPostIfUnused(db, post.id);
    }
  }

  const operationalPosts = existing.filter((post) =>
    isOperationalSpecialty(post.specialty_required),
  );

  for (const shift of SHIFTS) {
    const shiftEnabled = isShiftEnabled(config, shift);
    const counts = getShiftCounts(config, shift);

    for (const specialty of SPECIALTIES) {
      const requiredAgents = shiftEnabled ? counts[SPECIALTY_COUNT_KEY[specialty]] : 0;
      const slotPosts = operationalPosts.filter(
        (post) => post.shift === shift && post.specialty_required === specialty,
      );

      syncSlot(
        db,
        checkpointId,
        shift,
        specialty,
        requiredAgents,
        allowedGender,
        slotPosts,
      );
    }
  }
}

export function getCheckpoints(db: Database.Database): CheckpointWithPostsRecord[] {
  const rows = db
    .prepare(`SELECT * FROM checkpoints ORDER BY name COLLATE NOCASE`)
    .all() as CheckpointRowDb[];
  const postsByCheckpoint = getPostsByCheckpointId(db);
  return rows.map((row) => attachPosts(mapCheckpoint(row), postsByCheckpoint));
}

export function getCheckpoint(db: Database.Database, id: string): CheckpointWithPostsRecord | null {
  const row = db.prepare(`SELECT * FROM checkpoints WHERE id = ?`).get(id) as
    | CheckpointRowDb
    | undefined;
  if (!row) return null;
  const posts = db
    .prepare(`SELECT * FROM checkpoint_posts WHERE checkpoint_id = ?`)
    .all(id) as CheckpointPostRowDb[];
  return {
    ...mapCheckpoint(row),
    posts: posts.map(mapPost),
  };
}

export function createCheckpoint(
  db: Database.Database,
  input: CreateCheckpointInput,
): CheckpointRecord {
  const id = randomUUID();
  const timestamp = nowIso();
  const payload = configToRowPayload(input);

  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO checkpoints (
        id, name, active, night_only, allowed_gender, operating_days, day_shift_enabled,
        night_shift_enabled, female_policy, priority, mandatory, day_explosives, day_narcotics, night_explosives,
        night_narcotics, required_drugs, required_explosives, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      payload.name,
      payload.active,
      payload.night_only,
      payload.allowed_gender,
      payload.operating_days,
      payload.day_shift_enabled,
      payload.night_shift_enabled,
      payload.female_policy,
      payload.priority,
      payload.mandatory,
      payload.day_explosives,
      payload.day_narcotics,
      payload.night_explosives,
      payload.night_narcotics,
      payload.required_drugs,
      payload.required_explosives,
      timestamp,
      timestamp,
    );

    syncCheckpointPostsFromConfig(db, id, input);
  });

  try {
    transaction();
  } catch (error) {
    rethrowConstraint(error);
  }

  const created = getCheckpoint(db, id);
  if (!created) {
    throw new Error(`Checkpoint not found after create: ${id}`);
  }
  const { posts: _posts, ...checkpoint } = created;
  return checkpoint;
}

export function updateCheckpoint(
  db: Database.Database,
  id: string,
  input: UpdateCheckpointInput,
): CheckpointRecord {
  const timestamp = nowIso();
  const payload = configToRowPayload(input);

  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE checkpoints SET
          name = ?,
          active = ?,
          night_only = ?,
          allowed_gender = ?,
          operating_days = ?,
          day_shift_enabled = ?,
          night_shift_enabled = ?,
          female_policy = ?,
          priority = ?,
          mandatory = ?,
          day_explosives = ?,
          day_narcotics = ?,
          night_explosives = ?,
          night_narcotics = ?,
          required_drugs = ?,
          required_explosives = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        payload.name,
        payload.active,
        payload.night_only,
        payload.allowed_gender,
        payload.operating_days,
        payload.day_shift_enabled,
        payload.night_shift_enabled,
        payload.female_policy,
        payload.priority,
        payload.mandatory,
        payload.day_explosives,
        payload.day_narcotics,
        payload.night_explosives,
        payload.night_narcotics,
        payload.required_drugs,
        payload.required_explosives,
        timestamp,
        id,
      );

    if (result.changes === 0) {
      throw new Error(`Checkpoint not found: ${id}`);
    }

    syncCheckpointPostsFromConfig(db, id, input);
  });

  try {
    transaction();
  } catch (error) {
    rethrowConstraint(error);
  }

  const updated = getCheckpoint(db, id);
  if (!updated) {
    throw new Error(`Checkpoint not found: ${id}`);
  }
  const { posts: _posts, ...checkpoint } = updated;
  return checkpoint;
}

export function deleteCheckpoint(db: Database.Database, id: string): void {
  const checkpoint = getCheckpoint(db, id);
  if (!checkpoint) {
    throw new Error(`Checkpoint not found: ${id}`);
  }

  const postIds = checkpoint.posts.map((post) => post.id);
  if (postIds.length > 0) {
    const placeholders = postIds.map(() => "?").join(", ");
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM rotation_history WHERE checkpoint_post_id IN (${placeholders})`,
      )
      .get(...postIds) as { count: number };
    if (row.count > 0) {
      throw new Error("CHECKPOINT_HISTORY_EXISTS");
    }
  }

  const result = db.prepare(`DELETE FROM checkpoints WHERE id = ?`).run(id);
  if (result.changes === 0) {
    throw new Error(`Checkpoint not found: ${id}`);
  }
}
