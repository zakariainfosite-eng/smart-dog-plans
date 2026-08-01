SELECT t.typname AS enum_name, e.enumlabel AS value
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('checkpoint_allowed_gender')
ORDER BY t.typname, e.enumsortorder;
