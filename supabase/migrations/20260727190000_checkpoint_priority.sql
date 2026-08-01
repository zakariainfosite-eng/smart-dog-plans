-- Checkpoint planning priority (1=Critical … 4=Low).
-- Ascending order is used by the planning engine assignment order.

ALTER TABLE public.checkpoints
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 3
  CONSTRAINT checkpoints_priority_check CHECK (priority IN (1, 2, 3, 4));

COMMENT ON COLUMN public.checkpoints.priority IS
  'Planning assignment priority: 1=Critical, 2=High, 3=Normal, 4=Low';

CREATE INDEX IF NOT EXISTS idx_checkpoints_priority ON public.checkpoints (priority);
