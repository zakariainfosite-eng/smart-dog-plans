-- Checkpoint operational configuration: per-checkpoint planning parameters.
-- All planning rules are driven from these columns (no hardcoded checkpoint logic).

CREATE TYPE public.checkpoint_female_policy AS ENUM ('allowed', 'preferred', 'not_allowed');
CREATE TYPE public.planning_priority AS ENUM ('high', 'medium', 'low');

-- Currency detection teams on checkpoints (dogs table keeps narcotics/explosives only).
ALTER TYPE public.dog_specialty ADD VALUE IF NOT EXISTS 'currency';

ALTER TABLE public.checkpoints
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS operating_days SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  ADD COLUMN IF NOT EXISTS day_shift_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS night_shift_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS female_policy public.checkpoint_female_policy NOT NULL DEFAULT 'allowed',
  ADD COLUMN IF NOT EXISTS planning_priority public.planning_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS special_rules TEXT,
  ADD COLUMN IF NOT EXISTS day_explosives INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_narcotics INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_currency INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_explosives INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_narcotics INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_currency INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS explosives_dog_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS narcotics_dog_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS currency_dog_required BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoints_code_unique
  ON public.checkpoints (code)
  WHERE code IS NOT NULL AND code <> '';

ALTER TABLE public.checkpoint_posts
  ADD COLUMN IF NOT EXISTS shift public.shift_type NOT NULL DEFAULT 'day',
  ADD COLUMN IF NOT EXISTS dog_required BOOLEAN NOT NULL DEFAULT true;

-- Drop legacy unique (checkpoint_id, specialty_required) — requirements are shift-specific now.
ALTER TABLE public.checkpoint_posts
  DROP CONSTRAINT IF EXISTS checkpoint_posts_checkpoint_id_specialty_required_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoint_posts_checkpoint_shift_specialty
  ON public.checkpoint_posts (checkpoint_id, shift, specialty_required);

-- Backfill operational config from legacy columns.
UPDATE public.checkpoints c
SET
  code = COALESCE(NULLIF(TRIM(c.code), ''), c.name),
  day_shift_enabled = NOT c.night_only,
  night_shift_enabled = true,
  day_narcotics = CASE WHEN c.night_only THEN 0 ELSE GREATEST(c.required_drugs, 0) END,
  day_explosives = CASE WHEN c.night_only THEN 0 ELSE GREATEST(c.required_explosives, 0) END,
  day_currency = CASE WHEN c.night_only THEN 0 ELSE GREATEST(c.required_currency, 0) END,
  night_narcotics = GREATEST(c.required_drugs, 0),
  night_explosives = GREATEST(c.required_explosives, 0),
  night_currency = GREATEST(c.required_currency, 0),
  female_policy = CASE
    WHEN c.allowed_gender = 'male' THEN 'not_allowed'::public.checkpoint_female_policy
    WHEN c.allowed_gender = 'female' THEN 'preferred'::public.checkpoint_female_policy
    ELSE 'allowed'::public.checkpoint_female_policy
  END,
  currency_dog_required = false,
  explosives_dog_required = true,
  narcotics_dog_required = true;

-- Assign shift on existing posts from legacy night_only + counts.
UPDATE public.checkpoint_posts cp
SET
  shift = CASE WHEN c.night_only THEN 'night'::public.shift_type ELSE 'day'::public.shift_type END,
  dog_required = CASE WHEN cp.specialty_required = 'currency' THEN false ELSE true END
FROM public.checkpoints c
WHERE cp.checkpoint_id = c.id;

COMMENT ON COLUMN public.checkpoints.operating_days IS 'ISO weekday numbers 1=Mon … 7=Sun';
COMMENT ON COLUMN public.checkpoints.female_policy IS 'Female agent policy: allowed, preferred, or not_allowed';
COMMENT ON COLUMN public.checkpoints.special_rules IS 'Optional administrator notes (Ramadan, seasonal, etc.)';
