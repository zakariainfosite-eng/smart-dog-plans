-- Per-checkpoint handler gender eligibility for the planning engine.
CREATE TYPE public.checkpoint_allowed_gender AS ENUM ('all', 'male', 'female');

ALTER TABLE public.checkpoints
  ADD COLUMN IF NOT EXISTS allowed_gender public.checkpoint_allowed_gender NOT NULL DEFAULT 'all';
