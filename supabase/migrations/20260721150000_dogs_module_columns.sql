-- Dogs module: add all profile columns required by the application.
-- Idempotent — only adds columns that are not already present.

ALTER TABLE public.dogs
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS breed TEXT,
  ADD COLUMN IF NOT EXISTS microchip_number TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS training_level TEXT,
  ADD COLUMN IF NOT EXISTS veterinary_notes TEXT,
  ADD COLUMN IF NOT EXISTS observations TEXT,
  ADD COLUMN IF NOT EXISTS assignment_date DATE,
  ADD COLUMN IF NOT EXISTS vaccination_info TEXT,
  ADD COLUMN IF NOT EXISTS health_status TEXT;

ALTER TABLE public.dogs
  DROP CONSTRAINT IF EXISTS dogs_age_range_check;

ALTER TABLE public.dogs
  DROP COLUMN IF EXISTS age;

ALTER TABLE public.dogs
  DROP CONSTRAINT IF EXISTS dogs_observations_length_check;

ALTER TABLE public.dogs
  ADD CONSTRAINT dogs_observations_length_check
  CHECK (observations IS NULL OR char_length(observations) <= 500);

ALTER TABLE public.dogs
  DROP CONSTRAINT IF EXISTS dogs_veterinary_notes_length_check;

ALTER TABLE public.dogs
  ADD CONSTRAINT dogs_veterinary_notes_length_check
  CHECK (veterinary_notes IS NULL OR char_length(veterinary_notes) <= 1000);

NOTIFY pgrst, 'reload schema';
