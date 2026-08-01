-- Idempotent: add checkpoint_posts.allowed_gender on remote DB.
-- Values: 'all' (ANY), 'male' (MALE), 'female' (FEMALE).

ALTER TABLE public.checkpoint_posts
  ADD COLUMN IF NOT EXISTS allowed_gender TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.checkpoint_posts
  DROP CONSTRAINT IF EXISTS checkpoint_posts_allowed_gender_check;

ALTER TABLE public.checkpoint_posts
  ADD CONSTRAINT checkpoint_posts_allowed_gender_check
  CHECK (allowed_gender IN ('all', 'male', 'female'));

UPDATE public.checkpoint_posts cp
SET allowed_gender = c.allowed_gender
FROM public.checkpoints c
WHERE cp.checkpoint_id = c.id
  AND cp.allowed_gender = 'all'
  AND c.allowed_gender IS NOT NULL
  AND c.allowed_gender <> 'all';
