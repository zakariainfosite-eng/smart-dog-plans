-- Apply agent contact fields (phone, address, observations).
-- Safe to run multiple times on Lovable-hosted databases.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS observations TEXT;

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_observations_length_check;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_observations_length_check
  CHECK (observations IS NULL OR char_length(observations) <= 500);
