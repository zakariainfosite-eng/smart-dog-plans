-- Operational cases RLS: ensure authenticated users can CRUD cases, attachments,
-- and storage files. Without storage.objects policies, editing a case with new
-- attachments fails with: "new row violates row-level security policy".

-- ---------------------------------------------------------------------------
-- public.operational_cases
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_cases TO authenticated;
GRANT ALL ON public.operational_cases TO service_role;

ALTER TABLE public.operational_cases ENABLE ROW LEVEL SECURITY;

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

-- ---------------------------------------------------------------------------
-- public.operational_case_attachments
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_case_attachments TO authenticated;
GRANT ALL ON public.operational_case_attachments TO service_role;

ALTER TABLE public.operational_case_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view operational_case_attachments"
  ON public.operational_case_attachments;
DROP POLICY IF EXISTS "Authenticated can create operational_case_attachments"
  ON public.operational_case_attachments;
DROP POLICY IF EXISTS "Authenticated can update operational_case_attachments"
  ON public.operational_case_attachments;
DROP POLICY IF EXISTS "Authenticated can delete operational_case_attachments"
  ON public.operational_case_attachments;

CREATE POLICY "Authenticated can view operational_case_attachments"
  ON public.operational_case_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create operational_case_attachments"
  ON public.operational_case_attachments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update operational_case_attachments"
  ON public.operational_case_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete operational_case_attachments"
  ON public.operational_case_attachments FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- storage.objects (operational-case-attachments bucket)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('operational-case-attachments', 'operational-case-attachments', false, 10485760)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit;

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
