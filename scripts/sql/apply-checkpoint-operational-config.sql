-- =============================================================================
-- Checkpoint schema full sync (idempotent) — manual apply for Lovable / SQL Editor
-- Same content as supabase/migrations/20260723210000_checkpoint_schema_full_sync.sql
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.checkpoint_allowed_gender AS ENUM ('all', 'male', 'female');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.checkpoint_female_policy AS ENUM ('allowed', 'preferred', 'not_allowed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.checkpoints
  ADD COLUMN IF NOT EXISTS allowed_gender public.checkpoint_allowed_gender NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS operating_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  ADD COLUMN IF NOT EXISTS day_shift_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS night_shift_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS female_policy public.checkpoint_female_policy NOT NULL DEFAULT 'allowed',
  ADD COLUMN IF NOT EXISTS day_explosives integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_narcotics integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_explosives integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_narcotics integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_drugs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_explosives integer NOT NULL DEFAULT 0;

ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_day_explosives_nonneg;
ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_day_explosives_nonneg CHECK (day_explosives >= 0);
ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_day_narcotics_nonneg;
ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_day_narcotics_nonneg CHECK (day_narcotics >= 0);
ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_night_explosives_nonneg;
ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_night_explosives_nonneg CHECK (night_explosives >= 0);
ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_night_narcotics_nonneg;
ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_night_narcotics_nonneg CHECK (night_narcotics >= 0);
ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_required_drugs_nonneg;
ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_required_drugs_nonneg CHECK (required_drugs >= 0);
ALTER TABLE public.checkpoints DROP CONSTRAINT IF EXISTS checkpoints_required_explosives_nonneg;
ALTER TABLE public.checkpoints ADD CONSTRAINT checkpoints_required_explosives_nonneg CHECK (required_explosives >= 0);

ALTER TABLE public.checkpoint_posts
  ADD COLUMN IF NOT EXISTS shift public.shift_type NOT NULL DEFAULT 'day',
  ADD COLUMN IF NOT EXISTS dog_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allowed_gender text NOT NULL DEFAULT 'all';

ALTER TABLE public.checkpoint_posts DROP CONSTRAINT IF EXISTS checkpoint_posts_allowed_gender_check;
ALTER TABLE public.checkpoint_posts
  ADD CONSTRAINT checkpoint_posts_allowed_gender_check
  CHECK (allowed_gender IN ('all', 'male', 'female'));

ALTER TABLE public.checkpoint_posts
  DROP CONSTRAINT IF EXISTS checkpoint_posts_checkpoint_id_specialty_required_key;

DROP INDEX IF EXISTS idx_checkpoint_posts_checkpoint_shift_specialty;
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoint_posts_checkpoint_shift_specialty
  ON public.checkpoint_posts (checkpoint_id, shift, specialty_required);

DELETE FROM public.checkpoint_posts WHERE specialty_required::text = 'currency';

UPDATE public.checkpoints c
SET
  day_shift_enabled = NOT COALESCE(c.night_only, false),
  night_shift_enabled = COALESCE(c.night_shift_enabled, true),
  day_narcotics = CASE WHEN COALESCE(c.night_only, false) THEN 0 ELSE GREATEST(COALESCE(c.required_drugs, 0), 0) END,
  day_explosives = CASE WHEN COALESCE(c.night_only, false) THEN 0 ELSE GREATEST(COALESCE(c.required_explosives, 0), 0) END,
  night_narcotics = GREATEST(COALESCE(c.required_drugs, 0), 0),
  night_explosives = GREATEST(COALESCE(c.required_explosives, 0), 0)
WHERE c.day_explosives = 0 AND c.day_narcotics = 0 AND c.night_explosives = 0 AND c.night_narcotics = 0
  AND (COALESCE(c.required_drugs, 0) > 0 OR COALESCE(c.required_explosives, 0) > 0);

UPDATE public.checkpoints c
SET female_policy = CASE
  WHEN c.allowed_gender::text = 'male' THEN 'not_allowed'::public.checkpoint_female_policy
  WHEN c.allowed_gender::text = 'female' THEN 'preferred'::public.checkpoint_female_policy
  ELSE 'allowed'::public.checkpoint_female_policy
END
WHERE c.female_policy = 'allowed'::public.checkpoint_female_policy
  AND c.allowed_gender::text IN ('male', 'female');

UPDATE public.checkpoints c
SET
  required_drugs = GREATEST(c.day_narcotics, c.night_narcotics),
  required_explosives = GREATEST(c.day_explosives, c.night_explosives),
  night_only = (NOT c.day_shift_enabled AND c.night_shift_enabled),
  allowed_gender = CASE c.female_policy
    WHEN 'not_allowed'::public.checkpoint_female_policy THEN 'male'::public.checkpoint_allowed_gender
    WHEN 'preferred'::public.checkpoint_female_policy THEN 'female'::public.checkpoint_allowed_gender
    ELSE 'all'::public.checkpoint_allowed_gender
  END;

UPDATE public.checkpoint_posts cp
SET shift = CASE WHEN COALESCE(c.night_only, false) THEN 'night'::public.shift_type ELSE 'day'::public.shift_type END,
    dog_required = true
FROM public.checkpoints c
WHERE cp.checkpoint_id = c.id;

UPDATE public.checkpoint_posts cp
SET allowed_gender = c.allowed_gender::text
FROM public.checkpoints c
WHERE cp.checkpoint_id = c.id;

ALTER TABLE public.checkpoints
  DROP COLUMN IF EXISTS code,
  DROP COLUMN IF EXISTS planning_priority,
  DROP COLUMN IF EXISTS special_rules,
  DROP COLUMN IF EXISTS day_currency,
  DROP COLUMN IF EXISTS night_currency,
  DROP COLUMN IF EXISTS currency_dog_required,
  DROP COLUMN IF EXISTS explosives_dog_required,
  DROP COLUMN IF EXISTS narcotics_dog_required,
  DROP COLUMN IF EXISTS required_currency;

DROP INDEX IF EXISTS idx_checkpoints_code_unique;

ALTER TABLE public.checkpoints DROP COLUMN IF EXISTS total_required_staff;
ALTER TABLE public.checkpoints
  ADD COLUMN total_required_staff integer GENERATED ALWAYS AS (
    COALESCE(required_drugs, 0) + COALESCE(required_explosives, 0)
  ) STORED;

NOTIFY pgrst, 'reload schema';
