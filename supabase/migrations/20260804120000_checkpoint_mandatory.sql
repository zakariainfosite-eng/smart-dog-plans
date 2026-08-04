-- Mandatory vs Optional checkpoint flag (independent of priority).
-- Default YES (true) so existing checkpoints remain must-cover.
ALTER TABLE public.checkpoints
  ADD COLUMN IF NOT EXISTS mandatory boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.checkpoints.mandatory IS
  'Independent of priority. true = Mandatory (must cover); false = Optional (may remain empty without breaking Smart Rotation).';
