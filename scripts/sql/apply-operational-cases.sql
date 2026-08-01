-- Apply operational_cases table and enums.
-- Safe to run multiple times on Lovable-hosted databases.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operational_case_specialty') THEN
    CREATE TYPE public.operational_case_specialty AS ENUM ('narcotics', 'explosives', 'currency');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seizure_type') THEN
    CREATE TYPE public.seizure_type AS ENUM (
      'cannabis', 'cocaine', 'heroin', 'synthetic_drugs', 'hashish',
      'explosives', 'counterfeit_currency', 'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seizure_unit') THEN
    CREATE TYPE public.seizure_unit AS ENUM ('kg', 'g', 'units', 'pieces', 'liters', 'banknotes');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.operational_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_date DATE NOT NULL,
  case_number TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  dog_id UUID REFERENCES public.dogs(id) ON DELETE SET NULL,
  specialty public.operational_case_specialty NOT NULL,
  location TEXT NOT NULL,
  seizure_type public.seizure_type NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit public.seizure_unit NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT operational_cases_case_number_unique UNIQUE (case_number),
  CONSTRAINT operational_cases_notes_length_check
    CHECK (notes IS NULL OR char_length(notes) <= 1000)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_cases TO authenticated;
GRANT ALL ON public.operational_cases TO service_role;

ALTER TABLE public.operational_cases ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_operational_cases_updated_at ON public.operational_cases;
CREATE TRIGGER trg_operational_cases_updated_at
  BEFORE UPDATE ON public.operational_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_operational_cases_agent ON public.operational_cases(agent_id);
CREATE INDEX IF NOT EXISTS idx_operational_cases_date ON public.operational_cases(case_date DESC);
CREATE INDEX IF NOT EXISTS idx_operational_cases_specialty ON public.operational_cases(specialty);
CREATE INDEX IF NOT EXISTS idx_operational_cases_seizure_type ON public.operational_cases(seizure_type);

DROP POLICY IF EXISTS "Authenticated can view operational_cases" ON public.operational_cases;
DROP POLICY IF EXISTS "Authenticated can create operational_cases" ON public.operational_cases;
DROP POLICY IF EXISTS "Authenticated can update operational_cases" ON public.operational_cases;
DROP POLICY IF EXISTS "Authenticated can delete operational_cases" ON public.operational_cases;

CREATE POLICY "Authenticated can view operational_cases"
  ON public.operational_cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create operational_cases"
  ON public.operational_cases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update operational_cases"
  ON public.operational_cases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete operational_cases"
  ON public.operational_cases FOR DELETE TO authenticated USING (true);
