-- Fix dog photo uploads: add missing storage.objects RLS policies for dog-photos bucket.
-- Safe to run multiple times.

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'dog-photos';

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
