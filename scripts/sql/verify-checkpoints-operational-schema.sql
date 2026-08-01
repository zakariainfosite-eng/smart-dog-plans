-- Verify checkpoints + checkpoint_posts schema matches the application.
-- Expected columns derived from:
--   src/integrations/supabase/types.ts
--   src/integrations/supabase/checkpoint-columns.ts
--   src/lib/checkpoints/operational-config.ts

WITH expected_checkpoints AS (
  SELECT unnest(ARRAY[
    'id', 'name', 'active', 'night_only', 'allowed_gender', 'female_policy',
    'operating_days', 'day_shift_enabled', 'night_shift_enabled',
    'day_explosives', 'day_narcotics', 'night_explosives', 'night_narcotics',
    'required_drugs', 'required_explosives', 'total_required_staff',
    'created_at', 'updated_at'
  ]) AS column_name
),
expected_posts AS (
  SELECT unnest(ARRAY[
    'id', 'checkpoint_id', 'specialty_required', 'required_agents', 'active',
    'shift', 'dog_required', 'allowed_gender', 'created_at', 'updated_at'
  ]) AS column_name
),
actual_checkpoints AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'checkpoints'
),
actual_posts AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'checkpoint_posts'
)
SELECT 'checkpoints' AS table_name, e.column_name, 'MISSING' AS status
FROM expected_checkpoints e
LEFT JOIN actual_checkpoints a ON a.column_name = e.column_name
WHERE a.column_name IS NULL
UNION ALL
SELECT 'checkpoint_posts', e.column_name, 'MISSING'
FROM expected_posts e
LEFT JOIN actual_posts a ON a.column_name = e.column_name
WHERE a.column_name IS NULL
UNION ALL
SELECT 'checkpoints', a.column_name, 'UNEXPECTED (app does not use)'
FROM actual_checkpoints a
LEFT JOIN expected_checkpoints e ON e.column_name = a.column_name
WHERE e.column_name IS NULL
  AND a.column_name NOT IN ('code', 'planning_priority', 'special_rules', 'day_currency', 'night_currency', 'required_currency')
ORDER BY table_name, column_name;

-- Quick type check for operational columns
SELECT column_name, data_type, udt_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'checkpoints'
  AND column_name IN (
    'day_explosives', 'day_narcotics', 'night_explosives', 'night_narcotics',
    'operating_days', 'day_shift_enabled', 'night_shift_enabled', 'female_policy'
  )
ORDER BY column_name;
