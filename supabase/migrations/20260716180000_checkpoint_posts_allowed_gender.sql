-- Per-requirement gender restriction (independent per specialty line).
-- Stored values: 'all' (ANY), 'male' (MALE), 'female' (FEMALE).
-- Uses TEXT to match checkpoints.allowed_gender on Lovable-hosted databases.

ALTER TABLE public.checkpoint_posts
  ADD COLUMN IF NOT EXISTS allowed_gender TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.checkpoint_posts
  DROP CONSTRAINT IF EXISTS checkpoint_posts_allowed_gender_check;

ALTER TABLE public.checkpoint_posts
  ADD CONSTRAINT checkpoint_posts_allowed_gender_check
  CHECK (allowed_gender IN ('all', 'male', 'female'));

-- Backfill from parent checkpoint when still at default.
UPDATE public.checkpoint_posts cp
SET allowed_gender = c.allowed_gender
FROM public.checkpoints c
WHERE cp.checkpoint_id = c.id
  AND cp.allowed_gender = 'all'
  AND c.allowed_gender IS NOT NULL
  AND c.allowed_gender <> 'all';
