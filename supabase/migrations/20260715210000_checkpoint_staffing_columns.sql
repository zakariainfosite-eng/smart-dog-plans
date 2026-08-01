-- Phase 1: Official checkpoint staffing requirements
-- Adds required_drugs, required_explosives, required_currency to public.checkpoints.
-- These columns are the authoritative staffing source for the daily planning engine.
--
-- Apply via: supabase db push  OR  Lovable Cloud migrations  OR  Supabase SQL editor.

-- 1. Staffing columns (integer, NOT NULL, default 0)
ALTER TABLE public.checkpoints
  ADD COLUMN IF NOT EXISTS required_drugs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_explosives integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_currency integer NOT NULL DEFAULT 0;

ALTER TABLE public.checkpoints
  DROP CONSTRAINT IF EXISTS checkpoints_required_drugs_nonneg;
ALTER TABLE public.checkpoints
  ADD CONSTRAINT checkpoints_required_drugs_nonneg CHECK (required_drugs >= 0);

ALTER TABLE public.checkpoints
  DROP CONSTRAINT IF EXISTS checkpoints_required_explosives_nonneg;
ALTER TABLE public.checkpoints
  ADD CONSTRAINT checkpoints_required_explosives_nonneg CHECK (required_explosives >= 0);

ALTER TABLE public.checkpoints
  DROP CONSTRAINT IF EXISTS checkpoints_required_currency_nonneg;
ALTER TABLE public.checkpoints
  ADD CONSTRAINT checkpoints_required_currency_nonneg CHECK (required_currency >= 0);

-- Generated total for reporting (idempotent: drop/recreate if needed)
ALTER TABLE public.checkpoints
  DROP COLUMN IF EXISTS total_required_staff;

ALTER TABLE public.checkpoints
  ADD COLUMN total_required_staff integer GENERATED ALWAYS AS (
    required_drugs + required_explosives + required_currency
  ) STORED;

-- Backfill from checkpoint_posts where columns are still zero
UPDATE public.checkpoints c
SET
  required_explosives = CASE
    WHEN c.required_explosives = 0 THEN COALESCE((
      SELECT SUM(cp.required_agents)::integer
      FROM public.checkpoint_posts cp
      WHERE cp.checkpoint_id = c.id
        AND cp.specialty_required = 'explosives'
        AND cp.active = true
    ), 0)
    ELSE c.required_explosives
  END,
  required_drugs = CASE
    WHEN c.required_drugs = 0 THEN COALESCE((
      SELECT SUM(cp.required_agents)::integer
      FROM public.checkpoint_posts cp
      WHERE cp.checkpoint_id = c.id
        AND cp.specialty_required = 'narcotics'
        AND cp.active = true
    ), 0)
    ELSE c.required_drugs
  END
WHERE c.required_drugs = 0 OR c.required_explosives = 0;
