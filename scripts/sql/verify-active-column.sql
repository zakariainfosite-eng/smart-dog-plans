SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'agent_exclusions'
  AND column_name = 'active';
