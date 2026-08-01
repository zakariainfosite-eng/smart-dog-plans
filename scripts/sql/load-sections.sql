SELECT id, name
FROM public.sections
WHERE active = true
ORDER BY name
LIMIT 3;
