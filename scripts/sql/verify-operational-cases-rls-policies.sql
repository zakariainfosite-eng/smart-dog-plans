-- Inspect RLS status and policies for operational case edit/create flows.

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('operational_cases', 'operational_case_attachments')
UNION ALL
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage' AND c.relname = 'objects';

SELECT schemaname, tablename, policyname, cmd, roles::text
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('operational_cases', 'operational_case_attachments'))
   OR (schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%case attachment%')
ORDER BY schemaname, tablename, cmd, policyname;

SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'operational-case-attachments';
