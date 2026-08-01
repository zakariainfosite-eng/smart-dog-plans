SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id = 'dog-photos';

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname ILIKE '%dog%'
ORDER BY cmd;
