-- Simplify checkpoint operational config: two specialties only, remove code/priority/special rules/currency.

-- Remove currency posts (stupéfiants covers drugs + banknotes).
DELETE FROM public.checkpoint_posts WHERE specialty_required = 'currency';

-- Drop removed checkpoint columns.
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

-- Legacy staffing columns: narcotics + explosives only.
UPDATE public.checkpoints c
SET
  required_drugs = GREATEST(c.day_narcotics, c.night_narcotics),
  required_explosives = GREATEST(c.day_explosives, c.night_explosives);

COMMENT ON COLUMN public.checkpoints.day_narcotics IS 'Morning shift — stupéfiants teams (drugs + banknotes)';
COMMENT ON COLUMN public.checkpoints.night_narcotics IS 'Night shift — stupéfiants teams (drugs + banknotes)';
