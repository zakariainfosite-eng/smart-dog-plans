-- Apply specialty-specific operational case fields.

ALTER TYPE public.seizure_type ADD VALUE IF NOT EXISTS 'exta';
ALTER TYPE public.seizure_type ADD VALUE IF NOT EXISTS 'pofa';
ALTER TYPE public.seizure_unit ADD VALUE IF NOT EXISTS 'tonne';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'explosive_object_type') THEN
    CREATE TYPE public.explosive_object_type AS ENUM (
      'firearm', 'bladed_weapon', 'grenade', 'homemade_explosive',
      'ammunition', 'detonator', 'explosive_material', 'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'threat_level') THEN
    CREATE TYPE public.threat_level AS ENUM ('low', 'medium', 'high');
  END IF;
END $$;

ALTER TABLE public.operational_cases
  ALTER COLUMN quantity DROP NOT NULL,
  ALTER COLUMN unit DROP NOT NULL,
  ALTER COLUMN seizure_type DROP NOT NULL;

ALTER TABLE public.operational_cases
  ADD COLUMN IF NOT EXISTS object_type public.explosive_object_type,
  ADD COLUMN IF NOT EXISTS object_count INTEGER,
  ADD COLUMN IF NOT EXISTS threat_level public.threat_level,
  ADD COLUMN IF NOT EXISTS currency_code TEXT,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS banknote_count INTEGER,
  ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE public.operational_cases DROP CONSTRAINT IF EXISTS operational_cases_specialty_fields_check;
ALTER TABLE public.operational_cases
  ADD CONSTRAINT operational_cases_specialty_fields_check CHECK (
    (specialty = 'narcotics' AND seizure_type IS NOT NULL AND quantity IS NOT NULL AND unit IS NOT NULL
      AND object_type IS NULL AND object_count IS NULL AND threat_level IS NULL
      AND currency_code IS NULL AND total_amount IS NULL AND banknote_count IS NULL AND country IS NULL)
    OR
    (specialty = 'explosives' AND object_type IS NOT NULL AND object_count IS NOT NULL
      AND seizure_type IS NULL AND quantity IS NULL AND unit IS NULL
      AND currency_code IS NULL AND total_amount IS NULL AND banknote_count IS NULL AND country IS NULL)
    OR
    (specialty = 'currency' AND currency_code IS NOT NULL AND total_amount IS NOT NULL
      AND banknote_count IS NOT NULL AND country IS NOT NULL
      AND seizure_type IS NULL AND quantity IS NULL AND unit IS NULL
      AND object_type IS NULL AND object_count IS NULL AND threat_level IS NULL)
  );
