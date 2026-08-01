-- Section commander identity stored on the section record (attendance sheet header).

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS commander_full_name TEXT;

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS commander_grade TEXT;

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS commander_mle TEXT;

UPDATE public.sections
SET
  commander_full_name = COALESCE(commander_full_name, ''),
  commander_grade = COALESCE(commander_grade, ''),
  commander_mle = COALESCE(commander_mle, '')
WHERE
  commander_full_name IS NULL
  OR commander_grade IS NULL
  OR commander_mle IS NULL;

ALTER TABLE public.sections
  ALTER COLUMN commander_full_name SET DEFAULT '',
  ALTER COLUMN commander_grade SET DEFAULT '',
  ALTER COLUMN commander_mle SET DEFAULT '';

ALTER TABLE public.sections
  ALTER COLUMN commander_full_name SET NOT NULL,
  ALTER COLUMN commander_grade SET NOT NULL,
  ALTER COLUMN commander_mle SET NOT NULL;

COMMENT ON COLUMN public.sections.commander_full_name IS 'Chef de section — full name for official documents.';
COMMENT ON COLUMN public.sections.commander_grade IS 'Chef de section — grade.';
COMMENT ON COLUMN public.sections.commander_mle IS 'Chef de section — matricule (MLE).';

NOTIFY pgrst, 'reload schema';
