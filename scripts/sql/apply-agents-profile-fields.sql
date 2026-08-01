-- Apply all agent profile fields (phone, address, observations, photo_url).
-- Safe to run multiple times on Lovable-hosted databases.
-- Also creates the agent-photos storage bucket for profile pictures.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS observations TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_observations_length_check;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_observations_length_check
  CHECK (observations IS NULL OR char_length(observations) <= 500);

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

NOTIFY pgrst, 'reload schema';
