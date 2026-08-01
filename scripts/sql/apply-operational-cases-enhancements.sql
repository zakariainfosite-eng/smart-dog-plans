-- Apply operational cases enhancements (checkpoint, observations, attachments).
-- Safe to run multiple times on Lovable-hosted databases.

ALTER TABLE public.operational_cases
  ADD COLUMN IF NOT EXISTS checkpoint_id UUID REFERENCES public.checkpoints(id) ON DELETE SET NULL;

ALTER TABLE public.operational_cases
  ALTER COLUMN location DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'operational_cases' AND column_name = 'notes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'operational_cases' AND column_name = 'observations'
  ) THEN
    ALTER TABLE public.operational_cases RENAME COLUMN notes TO observations;
  END IF;
END $$;

ALTER TABLE public.operational_cases ADD COLUMN IF NOT EXISTS observations TEXT;

ALTER TABLE public.operational_cases DROP CONSTRAINT IF EXISTS operational_cases_notes_length_check;
ALTER TABLE public.operational_cases DROP CONSTRAINT IF EXISTS operational_cases_observations_length_check;
ALTER TABLE public.operational_cases
  ADD CONSTRAINT operational_cases_observations_length_check
  CHECK (observations IS NULL OR char_length(observations) <= 1000);

CREATE INDEX IF NOT EXISTS idx_operational_cases_checkpoint ON public.operational_cases(checkpoint_id);

CREATE TABLE IF NOT EXISTS public.operational_case_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.operational_cases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_case_attachments TO authenticated;
GRANT ALL ON public.operational_case_attachments TO service_role;
ALTER TABLE public.operational_case_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_operational_case_attachments_case ON public.operational_case_attachments(case_id);

DROP POLICY IF EXISTS "Authenticated can view operational_case_attachments" ON public.operational_case_attachments;
DROP POLICY IF EXISTS "Authenticated can create operational_case_attachments" ON public.operational_case_attachments;
DROP POLICY IF EXISTS "Authenticated can delete operational_case_attachments" ON public.operational_case_attachments;

CREATE POLICY "Authenticated can view operational_case_attachments"
  ON public.operational_case_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create operational_case_attachments"
  ON public.operational_case_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete operational_case_attachments"
  ON public.operational_case_attachments FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can update operational_case_attachments"
  ON public.operational_case_attachments;
CREATE POLICY "Authenticated can update operational_case_attachments"
  ON public.operational_case_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('operational-case-attachments', 'operational-case-attachments', false, 10485760)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Authenticated upload case attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read case attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update case attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete case attachments" ON storage.objects;

CREATE POLICY "Authenticated upload case attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'operational-case-attachments');
CREATE POLICY "Authenticated read case attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'operational-case-attachments');
CREATE POLICY "Authenticated update case attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'operational-case-attachments')
  WITH CHECK (bucket_id = 'operational-case-attachments');
CREATE POLICY "Authenticated delete case attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'operational-case-attachments');
