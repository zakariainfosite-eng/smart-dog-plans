-- Agent profile photos: optional URL column + public storage bucket.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-photos',
  'agent-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read agent photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload agent photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update agent photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete agent photos" ON storage.objects;

CREATE POLICY "Public read agent photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'agent-photos');

CREATE POLICY "Authenticated upload agent photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-photos');

CREATE POLICY "Authenticated update agent photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agent-photos');

CREATE POLICY "Authenticated delete agent photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agent-photos');
