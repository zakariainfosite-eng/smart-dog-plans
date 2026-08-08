import { randomId } from "@/lib/random-id";
import type { SqlExecutor } from "./sql-executor";
import type {
  Checkpoint,
  CheckpointAllowedGender,
  CheckpointPost,
  CheckpointWithPosts,
  CreateCheckpointInput,
  UpdateCheckpointInput,
} from "./types";

type Shift = "day" | "night";
type CheckpointSpecialty = "narcotics" | "explosives";

type CheckpointRowDb = {
  id: string;
  name: string;
  active: number;
  night_only: number;
  allowed_gender: CheckpointAllowedGender;
  operating_days: string;
  day_shift_enabled: number;
  night_shift_enabled: number;
  female_policy: "allowed" | "preferred" | "not_allowed";
  priority: number;
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
  allowed_gender: CheckpointAllowedGender;
  created_at: string;
  updated_at: string;
};

type PostRow = {
  id: string;
  shift: Shift;
  specialty_required: CheckpointSpecialty | string;
  required_agents: number;
  active: boolean | number;
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

function femalePolicyToAllowedGender(
  policy: CreateCheckpointInput["female_policy"],
): CheckpointAllowedGender {
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
    operating_days: JSON.stringify(config.operating_days),
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
    required_drugs: Math.max(dayNarcotics, nightNarcotics),
    required_explosives: Math.max(dayExplosives, nightExplosives),
    allowed_gender: femalePolicyToAllowedGender(config.female_policy),
  };
}

function mapCheckpoint(row: CheckpointRowDb): Checkpoint {
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

function mapPost(row: CheckpointPostRowDb): CheckpointPost {
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

async function postHasPlanningHistory(db: SqlExecutor, postId: string): Promise<boolean> {
  const rotation = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM rotation_history WHERE checkpoint_post_id = ?`,
    [postId],
  );
  const planning = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM planning_assignments WHERE checkpoint_post_id = ?`,
    [postId],
  );
  return Number(rotation?.count ?? 0) > 0 || Number(planning?.count ?? 0) > 0;
}

async function deactivateCheckpointPost(db: SqlExecutor, postId: string): Promise<void> {
  await db.run(`UPDATE checkpoint_posts SET active = 0, updated_at = ? WHERE id = ?`, [nowIso(), postId]);
}

async function deleteCheckpointPostIfUnused(db: SqlExecutor, postId: string): Promise<void> {
  if (await postHasPlanningHistory(db, postId)) {
    await deactivateCheckpointPost(db, postId);
    return;
  }
  await db.run(`DELETE FROM checkpoint_posts WHERE id = ?`, [postId]);
}

function isOperationalSpecialty(value: string): value is CheckpointSpecialty {
  return value === "narcotics" || value === "explosives";
}

async function insertActivePost(
  db: SqlExecutor,
  checkpointId: string,
  specialty: CheckpointSpecialty,
  payload: {
    required_agents: number;
    active: boolean;
    allowed_gender: CheckpointAllowedGender;
    dog_required: boolean;
    shift: Shift;
  },
): Promise<void> {
  const timestamp = nowIso();
  await db.run(
    `INSERT INTO checkpoint_posts (
      id, checkpoint_id, specialty_required, required_agents, active, shift, dog_required,
      allowed_gender, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomId(),
      checkpointId,
      specialty,
      payload.required_agents,
      payload.active ? 1 : 0,
      payload.shift,
      payload.dog_required ? 1 : 0,
      payload.allowed_gender,
      timestamp,
      timestamp,
    ],
  );
}

async function updateActivePost(
  db: SqlExecutor,
  postId: string,
  payload: {
    required_agents: number;
    active: boolean;
    allowed_gender: CheckpointAllowedGender;
    dog_required: boolean;
    shift: Shift;
  },
): Promise<void> {
  await db.run(
    `UPDATE checkpoint_posts
     SET required_agents = ?, active = ?, allowed_gender = ?, dog_required = ?, shift = ?, updated_at = ?
     WHERE id = ?`,
    [
      payload.required_agents,
      payload.active ? 1 : 0,
      payload.allowed_gender,
      payload.dog_required ? 1 : 0,
      payload.shift,
      nowIso(),
      postId,
    ],
  );
}

async function syncSlot(
  db: SqlExecutor,
  checkpointId: string,
  shift: Shift,
  specialty: CheckpointSpecialty,
  requiredAgents: number,
  allowedGender: CheckpointAllowedGender,
  slotPosts: PostRow[],
): Promise<void> {
  const payload = {
    required_agents: requiredAgents,
    active: true as const,
    allowed_gender: allowedGender,
    dog_required: true,
    shift,
  };
  const activePosts = slotPosts.filter((post) => Boolean(post.active));
  if (requiredAgents === 0) {
    for (const post of activePosts) await deactivateCheckpointPost(db, post.id);
    return;
  }
  const activePost = activePosts[0];
  if (activePost) {
    const staffingChanged = activePost.required_agents !== requiredAgents;
    if (staffingChanged && (await postHasPlanningHistory(db, activePost.id))) {
      await deactivateCheckpointPost(db, activePost.id);
      await insertActivePost(db, checkpointId, specialty, payload);
    } else {
      await updateActivePost(db, activePost.id, payload);
    }
    for (const extra of activePosts.slice(1)) await deactivateCheckpointPost(db, extra.id);
    return;
  }
  const reusable = slotPosts.find((post) => !post.active);
  if (reusable && !(await postHasPlanningHistory(db, reusable.id))) {
    await updateActivePost(db, reusable.id, payload);
    return;
  }
  await insertActivePost(db, checkpointId, specialty, payload);
}

async function syncCheckpointPostsFromConfig(
  db: SqlExecutor,
  checkpointId: string,
  config: CreateCheckpointInput,
): Promise<void> {
  const existing = await db.query<PostRow>(
    `SELECT id, shift, specialty_required, required_agents, active FROM checkpoint_posts WHERE checkpoint_id = ?`,
    [checkpointId],
  );
  const allowedGender = config.female_policy === "not_allowed" ? "male" : "all";
  for (const post of existing) {
    if (!isOperationalSpecialty(String(post.specialty_required))) {
      await deleteCheckpointPostIfUnused(db, post.id);
    }
  }
  const operationalPosts = existing.filter((post) => isOperationalSpecialty(String(post.specialty_required)));
  for (const shift of SHIFTS) {
    const shiftEnabled = shift === "day" ? config.day_shift_enabled : config.night_shift_enabled;
    const counts = shift === "day" ? config.day : config.night;
    for (const specialty of SPECIALTIES) {
      const requiredAgents = shiftEnabled ? counts[SPECIALTY_COUNT_KEY[specialty]] : 0;
      const slotPosts = operationalPosts.filter(
        (post) => post.shift === shift && post.specialty_required === specialty,
      );
      await syncSlot(db, checkpointId, shift, specialty, requiredAgents, allowedGender, slotPosts);
    }
  }
}

function rethrowConstraint(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed: checkpoints.name")) {
    throw new Error('duplicate key value violates unique constraint "checkpoints_name_unique"');
  }
  throw error instanceof Error ? error : new Error(message);
}

export async function getCheckpoints(db: SqlExecutor): Promise<CheckpointWithPosts[]> {
  const rows = await db.query<CheckpointRowDb>(`SELECT * FROM checkpoints ORDER BY name COLLATE NOCASE`);
  const posts = await db.query<CheckpointPostRowDb>(`SELECT * FROM checkpoint_posts`);
  const grouped = new Map<string, CheckpointPost[]>();
  for (const row of posts) {
    const list = grouped.get(row.checkpoint_id) ?? [];
    list.push(mapPost(row));
    grouped.set(row.checkpoint_id, list);
  }
  return rows.map((row) => ({ ...mapCheckpoint(row), posts: grouped.get(row.id) ?? [] }));
}

export async function getCheckpoint(db: SqlExecutor, id: string): Promise<CheckpointWithPosts | null> {
  const row = await db.get<CheckpointRowDb>(`SELECT * FROM checkpoints WHERE id = ?`, [id]);
  if (!row) return null;
  const posts = await db.query<CheckpointPostRowDb>(
    `SELECT * FROM checkpoint_posts WHERE checkpoint_id = ?`,
    [id],
  );
  return { ...mapCheckpoint(row), posts: posts.map(mapPost) };
}

export async function createCheckpoint(db: SqlExecutor, input: CreateCheckpointInput): Promise<Checkpoint> {
  const id = randomId();
  const timestamp = nowIso();
  const payload = configToRowPayload(input);
  try {
    await db.transaction(async () => {
      await db.run(
        `INSERT INTO checkpoints (
          id, name, active, night_only, allowed_gender, operating_days, day_shift_enabled,
          night_shift_enabled, female_policy, priority, mandatory, day_explosives, day_narcotics,
          night_explosives, night_narcotics, required_drugs, required_explosives, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, payload.name, payload.active, payload.night_only, payload.allowed_gender, payload.operating_days,
          payload.day_shift_enabled, payload.night_shift_enabled, payload.female_policy, payload.priority,
          payload.mandatory, payload.day_explosives, payload.day_narcotics, payload.night_explosives,
          payload.night_narcotics, payload.required_drugs, payload.required_explosives, timestamp, timestamp,
        ],
      );
      await syncCheckpointPostsFromConfig(db, id, input);
    });
  } catch (error) {
    rethrowConstraint(error);
  }
  const created = await getCheckpoint(db, id);
  if (!created) throw new Error(`Checkpoint not found after create: ${id}`);
  const { posts: _posts, ...checkpoint } = created;
  return checkpoint;
}

export async function updateCheckpoint(
  db: SqlExecutor,
  id: string,
  input: UpdateCheckpointInput,
): Promise<Checkpoint> {
  const timestamp = nowIso();
  const payload = configToRowPayload(input);
  try {
    await db.transaction(async () => {
      const result = await db.run(
        `UPDATE checkpoints SET
          name = ?, active = ?, night_only = ?, allowed_gender = ?, operating_days = ?,
          day_shift_enabled = ?, night_shift_enabled = ?, female_policy = ?, priority = ?, mandatory = ?,
          day_explosives = ?, day_narcotics = ?, night_explosives = ?, night_narcotics = ?,
          required_drugs = ?, required_explosives = ?, updated_at = ?
        WHERE id = ?`,
        [
          payload.name, payload.active, payload.night_only, payload.allowed_gender, payload.operating_days,
          payload.day_shift_enabled, payload.night_shift_enabled, payload.female_policy, payload.priority,
          payload.mandatory, payload.day_explosives, payload.day_narcotics, payload.night_explosives,
          payload.night_narcotics, payload.required_drugs, payload.required_explosives, timestamp, id,
        ],
      );
      if (result.changes === 0) throw new Error(`Checkpoint not found: ${id}`);
      await syncCheckpointPostsFromConfig(db, id, input);
    });
  } catch (error) {
    rethrowConstraint(error);
  }
  const updated = await getCheckpoint(db, id);
  if (!updated) throw new Error(`Checkpoint not found: ${id}`);
  const { posts: _posts, ...checkpoint } = updated;
  return checkpoint;
}

export async function deleteCheckpoint(db: SqlExecutor, id: string): Promise<void> {
  const checkpoint = await getCheckpoint(db, id);
  if (!checkpoint) throw new Error(`Checkpoint not found: ${id}`);
  const postIds = checkpoint.posts.map((post) => post.id);
  if (postIds.length > 0) {
    const placeholders = postIds.map(() => "?").join(", ");
    const row = await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM rotation_history WHERE checkpoint_post_id IN (${placeholders})`,
      postIds,
    );
    if (Number(row?.count ?? 0) > 0) throw new Error("CHECKPOINT_HISTORY_EXISTS");
  }
  const result = await db.run(`DELETE FROM checkpoints WHERE id = ?`, [id]);
  if (result.changes === 0) throw new Error(`Checkpoint not found: ${id}`);
}
