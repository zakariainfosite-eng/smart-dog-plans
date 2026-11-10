/**
 * Canonical checkpoint column lists for CRUD pages.
 * The planning engine loads checkpoints with nested checkpoint_posts — see CHECKPOINT_PLANNING_SELECT.
 */
export const CHECKPOINT_COLUMNS =
  "id, name, active, night_only, allowed_gender, female_policy, priority, operating_days, day_shift_enabled, night_shift_enabled, day_explosives, day_narcotics, night_explosives, night_narcotics, required_drugs, required_explosives, created_at, updated_at" as const;

/** Checkpoints + active specialty posts — source of truth for the planning engine. */
export const CHECKPOINT_PLANNING_SELECT =
  "id, name, active, night_only, allowed_gender, female_policy, priority, operating_days, day_shift_enabled, night_shift_enabled, day_explosives, day_narcotics, night_explosives, night_narcotics, posts:checkpoint_posts(id, shift, specialty_required, required_agents, active, allowed_gender, dog_required)" as const;

export const CHECKPOINT_WITH_POSTS_SELECT =
  `${CHECKPOINT_COLUMNS}, posts:checkpoint_posts(*)` as const;
