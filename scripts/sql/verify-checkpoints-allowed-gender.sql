SELECT column_name, udt_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'checkpoints' AND column_name = 'allowed_gender';
