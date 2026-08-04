import type { DbClient } from "@/integrations/database/client";
import type { Database } from "@/integrations/database/schema-types";
import type { CheckpointOperationalConfig, CheckpointSpecialty, Shift } from "@/lib/checkpoints/operational-config";
import { DEFAULT_CHECKPOINT_PRIORITY, getShiftCounts, isShiftEnabled } from "@/lib/checkpoints/operational-config";

type AllowedGender = Database["public"]["Enums"]["checkpoint_allowed_gender"];

type PostRow = {
  id: string;
  shift: Shift;
  specialty_required: CheckpointSpecialty | string;
  required_agents: number;
  active: boolean;
};

type PostLike = {
  id: string;
  shift: Shift;
  specialty_required: CheckpointSpecialty;
  required_agents: number;
  active: boolean;
  allowed_gender?: AllowedGender;
  dog_required?: boolean;
};

const SPECIALTIES: CheckpointSpecialty[] = ["narcotics", "explosives"];
const SHIFTS: Shift[] = ["day", "night"];

const SPECIALTY_COUNT_KEY: Record<CheckpointSpecialty, "narcotics" | "explosives"> = {
  narcotics: "narcotics",
  explosives: "explosives",
};

/** Prefer active posts when deduplicating for the planning engine. */
export function dedupePostsBySpecialty<T extends PostLike>(posts: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const post of posts) {
    const key = `${post.shift}:${post.specialty_required}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, post);
      continue;
    }
    const preferActive = post.active && !current.active;
    const keepCurrentActive = !post.active && current.active;
    const prefer =
      preferActive ? post : keepCurrentActive ? current : post.required_agents > current.required_agents ? post : current;
    byKey.set(key, prefer);
  }
  return Array.from(byKey.values());
}

async function postHasPlanningHistory(
  db: DbClient,
  postId: string,
): Promise<boolean> {
  const { count: rhCount, error: rhErr } = await db
    .from("rotation_history")
    .select("id", { count: "exact", head: true })
    .eq("checkpoint_post_id", postId);
  if (rhErr) throw rhErr;

  const { count: paCount, error: paErr } = await db
    .from("planning_assignments")
    .select("id", { count: "exact", head: true })
    .eq("checkpoint_post_id", postId);
  if (paErr) throw paErr;

  return (rhCount ?? 0) > 0 || (paCount ?? 0) > 0;
}

async function deactivateCheckpointPost(
  db: DbClient,
  postId: string,
): Promise<void> {
  const { error } = await db
    .from("checkpoint_posts")
    .update({ active: false })
    .eq("id", postId);
  if (error) throw error;
}

async function deleteCheckpointPostIfUnused(
  db: DbClient,
  postId: string,
): Promise<void> {
  if (await postHasPlanningHistory(db, postId)) {
    await deactivateCheckpointPost(db, postId);
    return;
  }
  const { error } = await db.from("checkpoint_posts").delete().eq("id", postId);
  if (error) throw error;
}

function isOperationalSpecialty(value: string): value is CheckpointSpecialty {
  return value === "narcotics" || value === "explosives";
}

async function insertActivePost(
  db: DbClient,
  checkpointId: string,
  specialty: CheckpointSpecialty,
  payload: {
    required_agents: number;
    active: boolean;
    allowed_gender: AllowedGender;
    dog_required: boolean;
    shift: Shift;
  },
): Promise<void> {
  const { error } = await db.from("checkpoint_posts").insert({
    checkpoint_id: checkpointId,
    specialty_required: specialty,
    ...payload,
  });
  if (error) throw error;
}

async function updateActivePost(
  db: DbClient,
  postId: string,
  payload: {
    required_agents: number;
    active: boolean;
    allowed_gender: AllowedGender;
    dog_required: boolean;
    shift: Shift;
  },
): Promise<void> {
  const { error } = await db.from("checkpoint_posts").update(payload).eq("id", postId);
  if (error) throw error;
}

/**
 * Sync one (shift, specialty) slot.
 * Historical posts are never deleted or repointed — they are deactivated and preserved.
 */
async function syncSlot(
  db: DbClient,
  checkpointId: string,
  shift: Shift,
  specialty: CheckpointSpecialty,
  requiredAgents: number,
  allowedGender: AllowedGender,
  slotPosts: PostRow[],
): Promise<void> {
  const payload = {
    required_agents: requiredAgents,
    active: true as const,
    allowed_gender: allowedGender,
    dog_required: true,
    shift,
  };

  const activePosts = slotPosts.filter((p: any) => p.active);

  if (requiredAgents === 0) {
    for (const post of activePosts) {
      await deactivateCheckpointPost(db, post.id);
    }
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

    for (const extra of activePosts.slice(1)) {
      await deactivateCheckpointPost(db, extra.id);
    }
    return;
  }

  const reusable = slotPosts.find((p: any) => !p.active);
  if (reusable && !(await postHasPlanningHistory(db, reusable.id))) {
    await updateActivePost(db, reusable.id, payload);
    return;
  }

  await insertActivePost(db, checkpointId, specialty, payload);
}

function allowedGenderFromConfig(
  config: CheckpointOperationalConfig,
): AllowedGender {
  if (config.female_policy === "not_allowed") return "male";
  // "preferred" uses soft female preference in the planning engine — not a hard gate.
  return "all";
}

/**
 * Synchronize checkpoint_posts from the checkpoint operational configuration.
 * Planning history remains immutable — posts referenced by history are archived, not deleted.
 */
export async function syncCheckpointPostsFromConfig(
  db: DbClient,
  checkpointId: string,
  config: CheckpointOperationalConfig,
): Promise<void> {
  const { data: existing, error: loadError } = await db
    .from("checkpoint_posts")
    .select("id, shift, specialty_required, required_agents, active")
    .eq("checkpoint_id", checkpointId);
  if (loadError) throw loadError;

  const allPosts = existing ?? [];
  const allowedGender = allowedGenderFromConfig(config);

  for (const post of allPosts) {
    if (!isOperationalSpecialty(post.specialty_required)) {
      await deleteCheckpointPostIfUnused(db, post.id);
    }
  }

  const operationalPosts = allPosts.filter((p: any) =>
    isOperationalSpecialty(p.specialty_required),
  ) as PostRow[];

  for (const shift of SHIFTS) {
    const shiftEnabled = isShiftEnabled(config, shift);
    const counts = getShiftCounts(config, shift);

    for (const specialty of SPECIALTIES) {
      const requiredAgents = shiftEnabled ? counts[SPECIALTY_COUNT_KEY[specialty]] : 0;
      const slotPosts = operationalPosts.filter(
        (p) => p.shift === shift && p.specialty_required === specialty,
      );

      await syncSlot(
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

/** @deprecated Use syncCheckpointPostsFromConfig */
export type StaffingCounts = {
  required_drugs: number;
  required_explosives: number;
};

/** @deprecated Use syncCheckpointPostsFromConfig */
export async function syncCheckpointPosts(
  db: DbClient,
  checkpointId: string,
  staffing: StaffingCounts,
): Promise<void> {
  await syncCheckpointPostsFromConfig(db, checkpointId, {
    name: "",
    active: true,
    operating_days: [1, 2, 3, 4, 5, 6, 7],
    day_shift_enabled: true,
    night_shift_enabled: false,
    day: {
      narcotics: staffing.required_drugs,
      explosives: staffing.required_explosives,
    },
    night: { narcotics: 0, explosives: 0 },
    female_policy: "allowed",
    priority: DEFAULT_CHECKPOINT_PRIORITY,
    mandatory: true,
  });
}
