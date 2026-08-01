-- Allow archived checkpoint_posts for immutable planning history.
-- Run after checkpoint schema sync migration.

DROP INDEX IF EXISTS idx_checkpoint_posts_checkpoint_shift_specialty;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoint_posts_active_shift_specialty
  ON public.checkpoint_posts (checkpoint_id, shift, specialty_required)
  WHERE active = true;

NOTIFY pgrst, 'reload schema';
