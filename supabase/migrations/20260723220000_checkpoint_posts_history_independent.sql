-- Allow multiple checkpoint_posts per (shift, specialty) when archived.
-- Only one ACTIVE post per slot; inactive rows preserve historical staffing snapshots.

DROP INDEX IF EXISTS idx_checkpoint_posts_checkpoint_shift_specialty;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoint_posts_active_shift_specialty
  ON public.checkpoint_posts (checkpoint_id, shift, specialty_required)
  WHERE active = true;

COMMENT ON INDEX idx_checkpoint_posts_active_shift_specialty IS
  'One active requirement per shift+specialty; inactive rows kept for planning history.';
