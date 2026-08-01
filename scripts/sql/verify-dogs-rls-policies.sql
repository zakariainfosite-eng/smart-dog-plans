-- Inspect RLS status and policies for dog create/edit related tables.

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage' AND c.relname = 'objects'
UNION ALL
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('dogs', 'agents');

SELECT schemaname, tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('dogs', 'agents'))
   OR (schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%dog%')
ORDER BY schemaname, tablename, policyname;

SELECT id, name, public FROM storage.buckets WHERE id IN ('dog-photos', 'agent-photos');
