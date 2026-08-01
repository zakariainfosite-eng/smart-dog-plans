-- Reload PostgREST schema cache so new columns are visible to the API.
NOTIFY pgrst, 'reload schema';
