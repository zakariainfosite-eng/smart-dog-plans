-- Backfill any missing names from code, then drop code
UPDATE public.checkpoints SET name = code WHERE name IS NULL OR name = '';
ALTER TABLE public.checkpoints DROP COLUMN IF EXISTS code;
CREATE UNIQUE INDEX IF NOT EXISTS checkpoints_name_unique ON public.checkpoints (name);