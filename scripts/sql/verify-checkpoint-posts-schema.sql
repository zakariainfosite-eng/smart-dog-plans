SELECT column_name, data_type, udt_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'checkpoint_posts'
ORDER BY ordinal_position;
