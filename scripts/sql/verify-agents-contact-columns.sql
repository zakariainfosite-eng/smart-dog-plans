SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'agents'
  AND column_name IN ('phone', 'address', 'observations', 'photo_url')
ORDER BY column_name;
