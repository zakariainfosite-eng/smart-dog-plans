-- Dog profile fields + photo storage (mirrors agent profile support).

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
  DROP CONSTRAINT IF EXISTS dogs_observations_length_check;

ALTER TABLE public.dogs
  ADD CONSTRAINT dogs_observations_length_check
  CHECK (observations IS NULL OR char_length(observations) <= 500);

ALTER TABLE public.dogs
  DROP CONSTRAINT IF EXISTS dogs_veterinary_notes_length_check;

ALTER TABLE public.dogs
  ADD CONSTRAINT dogs_veterinary_notes_length_check
  CHECK (veterinary_notes IS NULL OR char_length(veterinary_notes) <= 1000);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dog-photos',
  'dog-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read dog photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload dog photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update dog photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete dog photos" ON storage.objects;

CREATE POLICY "Public read dog photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'dog-photos');

CREATE POLICY "Authenticated upload dog photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dog-photos');

CREATE POLICY "Authenticated update dog photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'dog-photos');

CREATE POLICY "Authenticated delete dog photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dog-photos');
