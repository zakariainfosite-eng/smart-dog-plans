-- Staffing requirements per specialization on checkpoints
ALTER TABLE public.checkpoints
  ADD COLUMN IF NOT EXISTS required_explosives integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_drugs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_currency integer NOT NULL DEFAULT 0;

ALTER TABLE public.checkpoints
  DROP CONSTRAINT IF EXISTS checkpoints_required_explosives_nonneg;
ALTER TABLE public.checkpoints
  ADD CONSTRAINT checkpoints_required_explosives_nonneg CHECK (required_explosives >= 0);

ALTER TABLE public.checkpoints
  DROP CONSTRAINT IF EXISTS checkpoints_required_drugs_nonneg;
ALTER TABLE public.checkpoints
  ADD CONSTRAINT checkpoints_required_drugs_nonneg CHECK (required_drugs >= 0);

ALTER TABLE public.checkpoints
  DROP CONSTRAINT IF EXISTS checkpoints_required_currency_nonneg;
ALTER TABLE public.checkpoints
  ADD CONSTRAINT checkpoints_required_currency_nonneg CHECK (required_currency >= 0);

ALTER TABLE public.checkpoints
  DROP COLUMN IF EXISTS total_required_staff;

ALTER TABLE public.checkpoints
  ADD COLUMN total_required_staff integer GENERATED ALWAYS AS (
    required_explosives + required_drugs + required_currency
  ) STORED;

-- Backfill from existing checkpoint_posts (narcotics → drugs; currency starts at 0)
UPDATE public.checkpoints c
SET
  required_explosives = COALESCE((
    SELECT SUM(cp.required_agents)::integer
    FROM public.checkpoint_posts cp
    WHERE cp.checkpoint_id = c.id
      AND cp.specialty_required = 'explosives'
      AND cp.active = true
  ), 0),
  required_drugs = COALESCE((
    SELECT SUM(cp.required_agents)::integer
    FROM public.checkpoint_posts cp
    WHERE cp.checkpoint_id = c.id
      AND cp.specialty_required = 'narcotics'
      AND cp.active = true
  ), 0),
  required_currency = 0;
